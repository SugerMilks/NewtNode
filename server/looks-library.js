import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, realpath, stat } from "node:fs/promises";
import sharp from "sharp";
import { createCompactStyleFinderReader } from "./looks-catalog.js";
import { lookSnapshot } from "../src/looks.js";
import { dominantPaletteFromPixels } from "../src/palettePixels.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validId = value => typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const maxImageBytes = 32 * 1024 * 1024;

export function createLooksLibrary({ directory, assetDirectory, thumbnailDirectory, analyzeLook }) {
  const settingsFile = path.join(directory, "settings.json"), favoritesFile = path.join(directory, "favorites.json");
  const readCatalog = createCompactStyleFinderReader({ shared: true });
  let queue = Promise.resolve();
  const exclusive = action => { const next = queue.then(action); queue = next.catch(() => {}); return next; };
  async function read(file, fallback) {
    try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
  }
  async function save(file, value) {
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  }
  const settings = () => read(settingsFile, { directory: "" });
  const favorites = async () => (await read(favoritesFile, [])).filter(validId);
  async function catalog() {
    const config = await settings();
    if (!config.directory) fail("Choose your Looks folder to connect a catalog.", 503);
    try { return await readCatalog(config.directory); }
    catch { fail("The Looks folder is unavailable or its catalog is invalid. Reconnect it; existing canvas looks are preserved.", 503); }
  }
  async function status() {
    const config = await settings();
    let info = { ready: false, indexed: 0, categories: [], message: "" };
    if (config.directory) {
      try { const page = (await catalog()).search({ limit: 1 }); info = { ...info, ready: true, indexed: page.indexed, categories: page.categories }; }
      catch (error) { info.message = error.message; }
    }
    return { ...config, ...info, favorites: await favorites() };
  }
  async function configure(value) {
    if (typeof value !== "string" || !path.isAbsolute(value) || value.length > 4096 || value.includes("\0")) fail("Choose an absolute local Looks folder path.");
    let root;
    for (const candidate of [value, path.join(value, "Looks")]) {
      try { root = await realpath(candidate); await readCatalog(root); if (!(await stat(path.join(root, "images"))).isDirectory()) throw Error("Missing images"); break; }
      catch { root = null; }
    }
    if (!root) fail("This folder does not contain a valid Looks catalog.json and images folder. Your previous connection is unchanged.");
    await exclusive(() => save(settingsFile, { directory: root }));
    return status();
  }
  async function search(query = {}) {
    const source = await catalog();
    return source.search({ ...query, favorites: query.starred === "true" ? await favorites() : undefined });
  }
  async function detail(id) {
    if (!validId(id)) fail("Choose a look from the catalog.");
    return (await catalog()).detail(id).style;
  }
  const setFavorite = (id, selected) => exclusive(async () => {
    if (!validId(id) || typeof selected !== "boolean") fail("Choose a look and a favorite state.");
    if (selected) await detail(id);
    const ids = new Set(await favorites());
    if (selected) ids.add(id); else ids.delete(id);
    if (ids.size > 5000) fail("Use at most 5,000 favorite looks.");
    await save(favoritesFile, [...ids]);
    return { favorites: [...ids] };
  });
  async function readImage(source, key, version) {
    const asset = await source.asset(key, version), info = await stat(asset.filename);
    if (info.size > maxImageBytes) fail("This look image exceeds 32 MB.", 413);
    const bytes = await readFile(asset.filename);
    if (digest(bytes) !== path.basename(asset.filename).split(".")[0]) fail("This catalog image is incomplete or changed. Restore it from the catalog source.", 409);
    return { ...asset, bytes };
  }
  const thumbnails = new Map();
  async function asset(key, version, thumbnail = false) {
    const source = await catalog(), original = await source.asset(key, version);
    if (!thumbnail) { if ((await stat(original.filename)).size > maxImageBytes) fail("Look image is too large.", 413); return original; }
    const name = `${path.basename(original.filename)}.webp`, filename = path.join(thumbnailDirectory, name);
    // Check the source on every request so a disconnected catalog never serves stale entries.
    try { await stat(filename); return { filename, mimeType: "image/webp" }; } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (!thumbnails.has(name)) {
      const pending = (async () => {
        const { bytes } = await readImage(source, key, version);
        const preview = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).rotate().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        await mkdir(thumbnailDirectory, { recursive: true });
        await writeFile(filename, preview, { flag: "wx", mode: 0o600 }).catch(e => { if (e.code !== "EEXIST") throw e; });
      })();
      thumbnails.set(name, pending);
      pending.finally(() => thumbnails.delete(name)).catch(() => {});
    }
    await thumbnails.get(name);
    return { filename, mimeType: "image/webp" };
  }
  async function prepareLook({ id, prompt }) {
    if (!validId(id) || typeof prompt !== "string" || prompt.length > 12000) fail("Choose a look with a description of at most 12,000 characters.");
    // Pin one catalog for the whole import if another window changes the source folder.
    const source = await catalog(), look = source.detail(id).style;
    const prepared = [];
    for (const image of look.examples.slice(0, 8)) {
      const url = new URL(image.url, "http://localhost");
      const { bytes, filename, mimeType } = await readImage(source, url.searchParams.get("file"), url.searchParams.get("v") || undefined);
      const metadata = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).metadata();
      if (!["png", "jpeg", "webp"].includes(metadata.format) || metadata.pages > 1) fail("Use still PNG, JPEG or WebP look examples.");
      const name = path.basename(filename);
      prepared.push({ bytes, name, example: { id: image.id, localUrl: `/uploads/looks/${name}`, fileName: image.fileName || name, mimeType } });
    }
    if (!prepared.length) fail("This look has no available local examples.");
    await mkdir(assetDirectory, { recursive: true });
    for (const { bytes, name } of prepared) {
      const target = path.join(assetDirectory, name);
      try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; if (digest(await readFile(target)) !== digest(bytes)) fail("A saved look reference is damaged. No canvas look was added.", 409); }
    }
    return { look: lookSnapshot({ ...look, prompt, styleAnalysis: null, examples: prepared.map(item => item.example) }), images: prepared };
  }
  async function importLook(body) {
    const { look } = await prepareLook(body);
    return { look };
  }
  async function createStyle(body) {
    if (!analyzeLook) fail("Restart NewtNode to activate multi-image style analysis.", 503);
    const { look, images } = await prepareLook(body);
    const pixels = await sharp(images[0].bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 220, height: 220, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").ensureAlpha().raw().toBuffer();
    const gradeColors = dominantPaletteFromPixels(pixels);
    if (!gradeColors.length) fail("The first look image has no visible colors for Custom Grade.");
    const analysis = await analyzeLook({ look, images });
    return { look: { ...lookSnapshot({ ...look, styleAnalysis: analysis }), gradeColors } };
  }
  return { status, configure, search, detail, setFavorite, asset, importLook, createStyle };
}
