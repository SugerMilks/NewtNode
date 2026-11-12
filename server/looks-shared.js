// Compatible with kungfukoi/Newt_Node's version-1 Shared User Looks folders.
// Catalogs and local originals stay untouched; only explicit shared actions write here.
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir, realpath, stat, lstat, rm, rmdir } from "node:fs/promises";
import sharp from "sharp";
import { writeJsonAtomic } from "./json-store.js";
import { filmStillPalette } from "../src/filmStillGrade.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const isSharedLookId = value => typeof value === "string" && /^look-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const blobPattern = /^([a-f0-9]{64})\.(png|jpg|webp|avif)$/;
const maxBytes = 16 * 1024 * 1024;
const formats = { png: ["png", "image/png"], jpeg: ["jpg", "image/jpeg"], webp: ["webp", "image/webp"], heif: ["avif", "image/avif"] };
const clean = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export async function sharedLookImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes) fail("Shared Looks support images up to 16 MB each.", 413);
  const info = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).metadata();
  const format = formats[info.format];
  if (!format || info.pages > 1 || (info.format === "heif" && info.compression !== "av1")) fail("Shared Looks support still PNG, JPEG, WebP and AVIF images.");
  return { hash: digest(bytes), storedName: `${digest(bytes)}.${format[0]}`, mimeType: format[1], size: bytes.length };
}

export function createSharedLooks({ directory, assetDirectory }) {
  const configFile = path.join(directory, "shared-folder.json");
  let queue = Promise.resolve();
  const serial = action => { const work = queue.then(action); queue = work.catch(() => {}); return work; };
  async function state() {
    try {
      const value = JSON.parse(await readFile(configFile, "utf8"));
      if (value.version !== 1 || typeof value.directory !== "string") throw Error();
      return { directory: value.directory };
    } catch (error) { if (error.code === "ENOENT") return { directory: "" }; fail("Shared Looks settings could not be read. No settings were changed.", 409); }
  }
  async function root(expected) {
    const { directory: configured } = await state();
    if (expected !== undefined && expected !== configured) fail("The Shared User Looks folder changed. Refresh before saving or deleting.", 409);
    if (!configured) fail("Choose a Shared User Looks folder first.", 503);
    try { if (await realpath(configured) !== configured || !(await stat(configured)).isDirectory()) throw Error(); }
    catch { fail("Shared User Looks is unavailable. Reconnect the shared drive; no local fallback was saved.", 503); }
    return configured;
  }
  async function safeFile(base, filename, limit) {
    if (await realpath(filename) !== filename || !filename.startsWith(base + path.sep)) fail("Unsafe shared Look path.", 400);
    const info = await stat(filename);
    if (!info.isFile() || info.size > limit) fail("Invalid or oversized shared Look file.", 413);
    return readFile(filename);
  }
  async function locations(base) {
    const found = new Map();
    for (const parent of [base, path.join(base, "looks")]) {
      try {
        if (await realpath(parent) !== parent) fail("Shared Looks cannot use nested symbolic links.");
        for (const entry of await readdir(parent, { withFileTypes: true })) {
          if (entry.isSymbolicLink() && isSharedLookId(entry.name)) fail("Shared Look records cannot be symbolic links.");
          if (entry.isDirectory() && isSharedLookId(entry.name) && !found.has(entry.name)) found.set(entry.name, parent);
        }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    if (found.size > 10000) fail("The shared folder contains too many Look records.", 413);
    return found;
  }
  async function record(base, parent, id) {
    const value = JSON.parse(await safeFile(base, path.join(parent, id, "look.json"), 1024 * 1024));
    if (value.version !== 1 || value.look?.id !== id || !/^[a-f0-9]{64}$/.test(value.hash) ||
      !Array.isArray(value.images) || !value.images.length || value.images.length > 6 ||
      typeof value.look.name !== "string" || value.look.name.length > 120 || typeof value.look.prompt !== "string" || value.look.prompt.length > 12000 ||
      !Array.isArray(value.look.tags) || value.look.tags.length > 40 || value.look.tags.some(tag => typeof tag !== "string" || tag.length > 80)) fail("Invalid shared Look record.", 409);
    const optionalText = (entry, key, limit) => entry[key] === undefined || (typeof entry[key] === "string" && entry[key].length <= limit);
    if (!Object.entries({ category: 80, catalogId: 80, notes: 4000, sourceUrl: 2048, sourceProvider: 80, sourceAuthor: 120, sourceAttribution: 200, sref: 300 })
      .every(([key, limit]) => optionalText(value.look, key, limit))) fail("Invalid shared Look metadata.", 409);
    const { colours, styleAnalysis, styleBlocks } = value.look;
    if (colours !== undefined && (!Array.isArray(colours) || colours.length > 20 || colours.some(color => !color ||
      typeof color.hex !== "string" || !/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(color.hex) || !optionalText(color, "name", 80) ||
      (color.percent != null && (typeof color.percent !== "number" || !Number.isFinite(color.percent) || color.percent < 0 || color.percent > 100))))) fail("Invalid shared Look palette.", 409);
    if (styleAnalysis != null && (typeof styleAnalysis !== "object" || Array.isArray(styleAnalysis) ||
      !Object.entries({ stylePrompt: 6000, signatureFeature: 1200, fingerprint: 64, model: 120, provider: 80, createdAt: 40 })
        .every(([key, limit]) => optionalText(styleAnalysis, key, limit)))) fail("Invalid shared Look analysis.", 409);
    if (styleBlocks !== undefined && (!Array.isArray(styleBlocks) || styleBlocks.length > 8 || styleBlocks.some(block => !block ||
      typeof block.id !== "string" || block.id.length > 80 || typeof block.text !== "string" || block.text.length > 600 ||
      typeof block.enabled !== "boolean" || !["absolute", "primary", "secondary", "advisory"].includes(block.weight)))) fail("Invalid shared Look style sections.", 409);
    for (const image of value.images) if (!image || !blobPattern.test(image.storedName) || image.hash !== image.storedName.split(".")[0] ||
      (image.filmStillPalette !== undefined && !filmStillPalette(image.filmStillPalette)) ||
      !optionalText(image, "fileName", 200) || !Object.values(formats).some(([, mime]) => mime === image.mimeType) ||
      !Number.isInteger(image.size) || image.size < 1 || image.size > maxBytes) fail("Invalid shared Look image record.", 409);
    if (digest(JSON.stringify({ look: value.look, images: value.images })) !== value.hash) fail("A shared Look is incomplete or changed. Wait for syncing to finish and refresh.", 409);
    return value;
  }
  async function deleted(parent, id) {
    try { await lstat(path.join(parent, id, "deleted.json")); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; }
  }
  function display(value, base) {
    return { ...value.look, category: clean(value.look.category, 80) || "Various", custom: true, shared: true, sharedDirectory: base,
      examples: value.images.map((image, index) => ({ id: image.storedName, fileName: clean(image.fileName, 200), mimeType: clean(image.mimeType, 80),
        ...(filmStillPalette(image.filmStillPalette) ? { filmStillPalette: filmStillPalette(image.filmStillPalette) } : {}),
        url: `/api/looks/shared/image?id=${encodeURIComponent(value.look.id)}&file=${image.storedName}&index=${index}` })) };
  }
  async function list() {
    const base = await root(), found = await locations(base), looks = [];
    for (const [id, parent] of found) {
      if (await deleted(parent, id)) continue;
      looks.push(display(await record(base, parent, id), base));
    }
    if (looks.length > 5000) fail("Shared User Looks is limited to 5,000 looks.");
    return looks.sort((a, b) => a.name.localeCompare(b.name));
  }
  async function find(id, expected) {
    if (!isSharedLookId(id)) fail("Invalid shared Look identity.");
    const base = await root(expected), parent = (await locations(base)).get(id);
    if (!parent || await deleted(parent, id)) fail("This shared Look is no longer available.", 404);
    return { base, parent, value: await record(base, parent, id) };
  }
  async function readImage({ base, parent, value }, file, index) {
    const entry = value.images[Number(index)];
    if (!entry || entry.storedName !== file) fail("This image is not part of the shared Look.", 404);
    const bytes = await safeFile(base, path.join(parent, value.look.id, "images", entry.storedName), maxBytes);
    if (digest(bytes) !== entry.hash || bytes.length !== entry.size) fail("A shared image is incomplete. Wait for syncing to finish and refresh.", 409);
    const checked = await sharedLookImage(bytes);
    if (checked.storedName !== entry.storedName || checked.mimeType !== entry.mimeType) fail("Shared image format does not match its record.", 409);
    return { bytes, mimeType: checked.mimeType, entry };
  }
  const image = async (id, file, index) => readImage(await find(id), file, index);
  async function materialize(id, expected) {
    const location = await find(id, expected), { base, value } = location, prepared = [];
    for (const [index, entry] of value.images.entries()) prepared.push(await readImage(location, entry.storedName, index));
    // Validate every reference before publishing any managed copy to the canvas.
    await mkdir(assetDirectory, { recursive: true });
    for (const { bytes, entry } of prepared) {
      const target = path.join(assetDirectory, entry.storedName);
      try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
      catch (e) { if (e.code !== "EEXIST") throw e; if (digest(await readFile(target)) !== entry.hash) fail("A local Look reference is damaged.", 409); }
    }
    return { ...display(value, base), examples: prepared.map(({ entry }) => ({ id: entry.storedName, localUrl: `/uploads/looks/${entry.storedName}`, fileName: entry.fileName, mimeType: entry.mimeType,
      ...(filmStillPalette(entry.filmStillPalette) ? { filmStillPalette: filmStillPalette(entry.filmStillPalette) } : {}) })) };
  }
  function configure(value) { return serial(async () => {
    if (typeof value !== "string" || value.length > 4096 || value.includes("\0")) fail("Choose a Shared User Looks folder.");
    let selected = value.trim();
    if (selected) {
      if (!path.isAbsolute(selected)) fail("Choose a mounted folder path, not a sharing web link.");
      selected = await realpath(selected);
      if (!(await stat(selected)).isDirectory()) fail("Choose an existing folder.");
      // Never mix user-created records into the large read-only catalog.
      if (await stat(path.join(selected, "catalog.json")).catch(e => { if (e.code !== "ENOENT") throw e; })) fail("Choose a separate Shared User Looks folder, not the main image catalog.");
      const probe = path.join(selected, `.newt-lookbook-${randomUUID()}.tmp`);
      try { await writeFile(probe, "", { flag: "wx" }); } finally { await rm(probe, { force: true }); }
      const found = await locations(selected);
      for (const [id, parent] of found) if (!await deleted(parent, id)) await record(selected, parent, id);
    }
    await writeJsonAtomic(configFile, { version: 1, directory: selected }, { mode: 0o600 });
    return state();
  }); }
  function add(source, images, expected) { return serial(async () => {
    const base = await root(expected);
    if (!images.length || images.length > 6) fail("Sharing supports one to six images per Look, matching your collaborator's version. Nothing was truncated.");
    if (typeof source.prompt !== "string" || !source.prompt.trim() || source.prompt.length > 6000) fail("Shared Look descriptions must contain 1-6,000 characters. Nothing was truncated.");
    const prepared = [];
    for (const item of images) prepared.push({ ...await sharedLookImage(item.bytes), fileName: clean(item.example.fileName, 200), buffer: item.bytes,
      ...(filmStillPalette(item.example.filmStillPalette) ? { filmStillPalette: filmStillPalette(item.example.filmStillPalette) } : {}) });
    const id = isSharedLookId(source.id) ? source.id : /^user-look-/.test(source.id) ? source.id.slice(5) : (() => {
      const hash = digest(JSON.stringify([source.id, source.prompt, prepared.map(item => item.hash)])).slice(0, 32);
      return `look-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
    })();
    if (!isSharedLookId(id)) fail("Invalid shared Look identity.");
    const look = { id, name: clean(source.name, 120), prompt: source.prompt, category: clean(source.category, 80) || "Various", catalogId: id,
      notes: clean(source.notes, 4000), sourceUrl: clean(source.sourceUrl, 2048), sourceProvider: clean(source.sourceProvider, 80) || "Newt", sourceAuthor: clean(source.sourceAuthor, 120), sourceAttribution: clean(source.sourceAttribution, 200),
      ...(Array.isArray(source.styleBlocks) ? { styleBlocks: source.styleBlocks } : {}), colours: Array.isArray(source.colours) ? source.colours : [],
      styleAnalysis: source.styleAnalysis?.stylePrompt === source.prompt ? source.styleAnalysis : { stylePrompt: source.prompt, fingerprint: digest(source.prompt), provider: "authored", model: "", version: 1 },
      sref: clean(source.sref, 300), tags: Array.isArray(source.tags) ? source.tags.slice(0, 40) : [], examples: [] };
    const metadata = prepared.map(({ buffer, ...entry }) => entry);
    const value = { version: 1, hash: digest(JSON.stringify({ look, images: metadata })), look, images: metadata };
    const found = await locations(base), parent = found.get(id);
    if (parent) {
      if (await deleted(parent, id)) fail("This shared Look was deleted. Save a new Look to share it again.", 409);
      if ((await record(base, parent, id)).hash !== value.hash) fail("This shared Look already exists with different contents. Save a new Look instead of overwriting it.", 409);
      return display(value, base);
    }
    if ((await list()).length >= 5000) fail("Shared User Looks is limited to 5,000 looks.");
    const temporary = path.join(base, `.${id}.${randomUUID()}.tmp`), target = path.join(base, id);
    await mkdir(path.join(temporary, "images"), { recursive: true });
    try {
      for (const item of prepared) await writeFile(path.join(temporary, "images", item.storedName), item.buffer, { mode: 0o644 });
      await writeFile(path.join(temporary, "look.json"), JSON.stringify(value, null, 2), { mode: 0o644 });
      try { await rename(temporary, target); }
      catch (error) { if (await deleted(base, id) || (await record(base, base, id)).hash !== value.hash) throw error; }
      return display(value, base);
    } finally {
      for (const item of prepared) await rm(path.join(temporary, "images", item.storedName), { force: true });
      await rm(path.join(temporary, "look.json"), { force: true });
      await rmdir(path.join(temporary, "images")).catch(e => { if (e.code !== "ENOENT") throw e; });
      await rmdir(temporary).catch(e => { if (e.code !== "ENOENT") throw e; });
    }
  }); }
  function remove(id, expected) { return serial(async () => {
    if (typeof expected !== "string") fail("Confirm the shared folder before deleting.");
    const { parent } = await find(id, expected);
    await writeJsonAtomic(path.join(parent, id, "deleted.json"), { version: 1, id, deletedAt: new Date().toISOString() }, { mode: 0o644 });
    return { removed: id };
  }); }
  return { state, configure, list, detail: async id => { const { base, value } = await find(id); return display(value, base); }, image, materialize, add, remove };
}
