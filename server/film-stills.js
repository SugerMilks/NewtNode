import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, realpath, stat, lstat, unlink } from "node:fs/promises";
import sharp from "sharp";
import { writeJsonAtomic } from "./json-store.js";
import { filmStillPalette } from "../src/filmStillGrade.js";
import { filmStillDisplayName } from "./film-still-names.js";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
export const isFilmStillId = id => /^film-still-[a-f0-9]{32}$/.test(id || "");
const maxBytes = 32 * 1024 * 1024;
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const hex = rgb => `#${rgb.map(n => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const distance = (a, b) => a.reduce((sum, n, i) => sum + (n - b[i]) ** 2, 0);
function lab(rgb) {
  const [r, g, b] = rgb.map(n => { const v = n / 255; return v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92; });
  const f = v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const x = f((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
  const y = f(.2126729 * r + .7151522 * g + .072175 * b);
  const z = f((.0193339 * r + .119192 * g + .9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Rank supplied swatches by nearest perceptual color in the still; never invent new colors.
export function dominantSwatches(pixels, swatches) {
  const candidates = [...new Map(swatches.map(rgb => [hex(rgb), rgb])).values()];
  if (candidates.length < 10) return [];
  const colors = candidates.map(lab), counts = colors.map(() => 0);
  for (let i = 0; i < pixels.length; i += 3) {
    const color = lab([pixels[i], pixels[i + 1], pixels[i + 2]]);
    let closest = 0, best = Infinity;
    for (let j = 0; j < colors.length; j++) { const d = distance(color, colors[j]); if (d < best) { best = d; closest = j; } }
    counts[closest]++;
  }
  const chosen = new Set(counts.map((count, i) => ({ count, i })).sort((a, b) => b.count - a.count || a.i - b.i).slice(0, 10).map(item => item.i));
  return candidates.filter((_, i) => chosen.has(i)).map(hex);
}

export async function extractFilmStill(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes) return null;
  const pipeline = sharp(bytes, { limitInputPixels: 40000000, animated: false });
  const meta = await pipeline.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format) || meta.pages > 1) return null;
  const { data, info } = await pipeline.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w < 300 || h < 300) return null;
  const pixel = (x, y) => { const at = (Math.floor(y) * w + Math.floor(x)) * 3; return [data[at], data[at + 1], data[at + 2]]; };
  const white = (x, y) => pixel(x, y).every(v => v >= 253);
  const runs = (y, wantsWhite) => {
    const out = []; let start = null;
    for (let x = 0; x <= w; x++) {
      if (x < w && white(x, y) === wantsWhite) { if (start == null) start = x; }
      else if (start != null) { out.push([start, x]); start = null; }
    }
    return out;
  };
  const row = Math.floor(h * .8);
  const spans = runs(row, false).filter(([a, b]) => b - a > w * .02);
  if (spans.length < 10 || spans.length > 24) return null;
  const typical = median(spans.map(([a, b]) => b - a));
  if (spans.some(([a, b]) => Math.abs(b - a - typical) > typical * .2)) return null;
  const gaps = spans.slice(1).map(([a], i) => a - spans[i][1]);
  if (gaps.some(gap => gap < 1 || gap > w * .025)) return null;
  const left = spans[0][0], right = spans.at(-1)[1];
  if (left < 2 || left > w * .035 || w - right < 2 || w - right > w * .035) return null;
  const centers = spans.map(([a, b]) => Math.floor((a + b) / 2));
  const colors = centers.map(x => [0, 1, 2].map(channel => {
    const samples = [];
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) samples.push(pixel(x + dx, row + dy)[channel]);
    return median(samples);
  }));
  // All strips must be flat colors over substantial height, not similarly colored scene objects.
  for (let i = 0; i < spans.length; i++) for (const fraction of [.70, .76, .86, .92]) {
    for (const dx of [-.28, 0, .28]) if (distance(pixel(centers[i] + typical * dx, h * fraction), colors[i]) > 180) return null;
  }
  const whiteRow = y => {
    let total = 0;
    for (let x = left; x < right; x += 2) if (pixel(x, y).every(v => v >= 245)) total++;
    return total / Math.ceil((right - left) / 2) > .995;
  };
  let dividerBottom = -1;
  for (let y = Math.floor(h * .69); y > h * .3; y--) if (whiteRow(y)) { dividerBottom = y + 1; break; }
  if (dividerBottom < 0) return null;
  let dividerTop = dividerBottom - 1;
  while (dividerTop > 0 && whiteRow(dividerTop - 1)) dividerTop--;
  if (dividerBottom - dividerTop < 2 || dividerBottom - dividerTop > h * .035) return null;
  // Trim the top/side border at the center lines, retaining legitimate whites in the picture.
  let top = 0;
  while (top < h * .04 && whiteRow(top)) top++;
  if (top < 2 || top >= h * .04 || dividerTop - top < h * .25) return null;
  const crop = { left, top, width: right - left, height: dividerTop - top };
  // Remove the tiny rounded-corner margin without ever removing white objects inside the still.
  const inset = Math.max(1, Math.ceil(w * .002));
  crop.left += inset; crop.top += inset; crop.width -= inset * 2; crop.height -= inset * 2;
  const clean = sharp(data, { raw: { width: w, height: h, channels: 3 } }).extract(crop);
  const pixels = await clean.clone().resize({ width: 180, height: 180, fit: "inside" }).raw().toBuffer();
  const palette = { version: 1, colors: dominantSwatches(pixels, colors) };
  if (!filmStillPalette(palette)) return null;
  // Crop the oriented original at native resolution, not the analysis thumbnail.
  const oriented = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().toColourspace("srgb").removeAlpha().png().toBuffer({ resolveWithObject: true });
  const scaleX = oriented.info.width / w, scaleY = oriented.info.height / h;
  const nativeCrop = { left: Math.ceil(crop.left * scaleX), top: Math.ceil(crop.top * scaleY), width: Math.floor(crop.width * scaleX), height: Math.floor(crop.height * scaleY) };
  const still = await sharp(oriented.data).extract(nativeCrop).png().toBuffer();
  return { bytes: still, palette, crop: nativeCrop, swatchCount: colors.length };
}

export function createFilmStills({ directory, catalogDirectory }) {
  const cache = path.join(directory, "film-stills"), manifest = path.join(cache, "index.json");
  let pending;
  async function scan() {
    const configured = await catalogDirectory();
    if (!configured) return { looks: [], entries: [], skipped: 0 };
    const root = path.join(configured, "FilmColorStills");
    try { if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) fail("Film Stills cannot use a symbolic link."); }
    catch (error) { if (error.code === "ENOENT") return { looks: [], entries: [], skipped: 0 }; throw error; }
    const files = (await readdir(root, { withFileTypes: true })).filter(item => item.isFile() && /\.(jpe?g|png|webp)$/i.test(item.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (files.length > 5000) fail("Film Stills supports up to 5,000 source images.");
    let previous;
    try { previous = JSON.parse(await readFile(manifest, "utf8")); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    const old = new Map(previous?.root === root && previous.version === 2 && Array.isArray(previous.entries) ? previous.entries.map(item => [item.name, item]) : []);
    await mkdir(cache, { recursive: true });
    const entries = [];
    for (const file of files) {
      const filename = path.join(root, file.name);
      if (await realpath(filename) !== filename) continue;
      const stats = await stat(filename), prior = old.get(file.name);
      if (stats.size > maxBytes) { entries.push({ name: file.name, size: stats.size, mtime: stats.mtimeMs }); continue; }
      if (prior && prior.size === stats.size && prior.mtime === stats.mtimeMs && (!prior.hash || (filmStillPalette(prior.palette) && /^[a-f0-9]{64}$/.test(prior.hash) && await stat(path.join(cache, `${prior.hash}.png`)).catch(() => null)))) { entries.push(prior); continue; }
      let extracted;
      try { extracted = await extractFilmStill(await readFile(filename)); } catch { extracted = null; }
      const entry = { name: file.name, size: stats.size, mtime: stats.mtimeMs };
      if (extracted) {
        const hash = digest(extracted.bytes);
        await writeFile(path.join(cache, `${hash}.png`), extracted.bytes, { mode: 0o600 });
        Object.assign(entry, { hash, palette: extracted.palette, crop: extracted.crop, swatchCount: extracted.swatchCount });
      }
      entries.push(entry);
    }
    if (JSON.stringify(previous?.entries) !== JSON.stringify(entries) || previous?.root !== root || previous?.version !== 2) await writeJsonAtomic(manifest, { version: 2, root, entries }, { mode: 0o600 });
    const looks = entries.filter(item => item.hash).map(entry => {
      const id = `film-still-${digest(entry.name).slice(0, 32)}`, name = filmStillDisplayName(entry.name, entry.palette);
      return { id, name, searchName: path.parse(entry.name).name, category: "Film Stills", tags: ["Film Stills"], filmStill: true,
        prompt: "Film still reference for color grading, tonal balance and cinematic contrast. Preserve the new scene's subject, composition and natural material colors.",
        colours: entry.palette.colors.map(hex => ({ hex, name: "Hand-picked color" })),
        examples: [{ id: entry.hash, fileName: `${name}-still.png`, mimeType: "image/png", filmStillPalette: entry.palette,
          url: `/api/looks/film-stills/image?id=${id}&v=${entry.hash}` }] };
    });
    return { looks, entries, skipped: entries.length - looks.length };
  }
  function index() { if (!pending) pending = scan().finally(() => { pending = null; }); return pending; }
  async function detail(id) { const look = (await index()).looks.find(item => item.id === id); if (!look) fail("Film Still is no longer available.", 404); return look; }
  async function image(id, version, repaired = false) {
    const look = await detail(id), example = look.examples[0];
    if (version && version !== example.id) fail("This Film Still changed. Refresh Looks.");
    const bytes = await readFile(path.join(cache, `${example.id}.png`));
    if (digest(bytes) !== example.id) {
      if (repaired) fail("The cached Film Still could not be rebuilt. Check the source image.");
      await unlink(path.join(cache, `${example.id}.png`)).catch(error => { if (error.code !== "ENOENT") throw error; });
      return image(id, version, true);
    }
    return { bytes, mimeType: "image/png", example, look };
  }
  return { index, detail, image };
}
