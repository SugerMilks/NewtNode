import path from "node:path";
import { compileLookStyle, lookStyleBlocks, lookCategories, validLookStyleBlocks, validLookPalette } from "../src/createLookStyle.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, realpath, stat } from "node:fs/promises";
import sharp from "sharp";
import { createCompactStyleFinderReader } from "./looks-catalog.js";
import { lookSnapshot, selectLooksPage, portableLookPrompt } from "../src/looks.js";
import { dominantPaletteFromPixels } from "../src/palettePixels.js";
import { createLooksUserLibrary, isUserLookId } from "./looks-user-library.js";
import { createSharedLooks, isSharedLookId } from "./looks-shared.js";
import { createFilmStills, isFilmStillId } from "./film-stills.js";
import { filmStillColors } from "../src/filmStillGrade.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validId = value => typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const maxImageBytes = 32 * 1024 * 1024;

export function createLooksLibrary({ directory, assetDirectory, thumbnailDirectory, analyzeLook, readAsset }) {
  const settingsFile = path.join(directory, "settings.json"), favoritesFile = path.join(directory, "favorites.json");
  const userLibrary = createLooksUserLibrary(directory);
  const shared = createSharedLooks({ directory, assetDirectory });
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
  const films = createFilmStills({ directory, catalogDirectory: async () => (await settings()).directory });
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
    if (query.source === "all" && !query.collection) {
      const filters = { ...query, favorites: query.starred === "true" ? await favorites() : undefined };
      const sources = [], warnings = [];
      const addLooks = looks => sources.push(page => ({ ...selectLooksPage(looks, page), categories: [...new Set(looks.map(look => look.category).filter(Boolean))].sort() }));
      try {
        if ((await settings()).directory) {
          const source = await catalog();
          sources.push(page => source.search(page));
        }
      } catch { warnings.push("The main catalog is unavailable. Reconnect its folder to include it in All Looks."); }
      try { addLooks((await films.index()).looks); }
      catch { warnings.push("Film Stills is unavailable. Check its folder and refresh."); }
      try { addLooks((await userLibrary.read()).looks); }
      catch { warnings.push("My Looks could not be read. Your saved library has not been changed."); }
      try { if ((await shared.state()).directory) addLooks(await shared.list()); }
      catch { warnings.push("Shared User Looks is unavailable or still syncing. Check its folder and refresh to include it in All Looks."); }

      // Page across source boundaries without returning the full catalog to the browser.
      // Each reader is pinned to this request's snapshot, keeping counts and offsets consistent.
      const { offset, limit } = selectLooksPage([], filters);
      const result = { styles: [], total: 0, indexed: 0, offset, limit, categories: [], ready: true, warnings };
      const categories = new Set();
      let skip = offset;
      for (const source of sources) {
        const counts = source({ ...filters, offset: 0, limit: 1 });
        result.total += counts.total;
        result.indexed += counts.indexed;
        for (const category of counts.categories) categories.add(category);
        if (skip >= counts.total) { skip -= counts.total; continue; }
        if (result.styles.length < limit) {
          result.styles.push(...source({ ...filters, offset: skip, limit: limit - result.styles.length }).styles);
        }
        skip = 0;
      }
      result.categories = [...categories].sort();
      return result;
    }
    if (query.source === "film-stills") {
      const { looks } = await films.index();
      return { ...selectLooksPage(looks, { ...query, favorites: query.starred === "true" ? await favorites() : undefined }), categories: ["Film Stills"], ready: true };
    }
    if (query.source === "shared") {
      const looks = await shared.list();
      return { ...selectLooksPage(looks, { ...query, favorites: query.starred === "true" ? await favorites() : undefined }), categories: [...new Set(looks.map(look => look.category))].sort(), ready: true };
    }
    if (query.source === "custom" || query.collection) {
      const data = await userLibrary.read();
      let looks = data.looks;
      if (query.collection) {
        const collection = data.collections.find(item => item.id === query.collection);
        if (!collection) fail("Choose an existing collection.", 404);
        looks = [];
        let source;
        for (const id of collection.ids) {
          if (isUserLookId(id)) { const look = data.looks.find(item => item.id === id); if (look) looks.push(look); }
          else if (isSharedLookId(id)) { try { looks.push(await shared.detail(id)); } catch (e) { if (e.status !== 404) throw e; } }
          else if (isFilmStillId(id)) { try { looks.push(await films.detail(id)); } catch (e) { if (e.status !== 404) throw e; } }
          else {
            source ||= await catalog();
            try { looks.push(source.detail(id).style); } catch (error) { if (error.status !== 404) throw error; }
          }
        }
      }
      return { ...selectLooksPage(looks, { ...query, favorites: query.starred === "true" ? await favorites() : undefined }), ready: true };
    }
    const source = await catalog();
    return source.search({ ...query, favorites: query.starred === "true" ? await favorites() : undefined });
  }
  async function detail(id) {
    if (!validId(id)) fail("Choose a look from the catalog.");
    if (isUserLookId(id)) return userLibrary.detail(id);
    if (isSharedLookId(id)) return shared.detail(id);
    if (isFilmStillId(id)) return films.detail(id);
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
  async function prepareLook({ id, prompt, sharedDirectory }) {
    if (!validId(id) || typeof prompt !== "string" || prompt.length > 12000) fail("Choose a look with a description of at most 12,000 characters.");
    if (isUserLookId(id)) return prepareUploadedLook({ ...await userLibrary.detail(id), prompt });
    if (isSharedLookId(id)) return prepareUploadedLook({ ...await shared.materialize(id, sharedDirectory), prompt });
    if (isFilmStillId(id)) {
      const { bytes, look, example } = await films.image(id);
      const name = `${example.id}.png`;
      await mkdir(assetDirectory, { recursive: true });
      const target = path.join(assetDirectory, name);
      try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; if (digest(await readFile(target)) !== example.id) fail("A saved Film Still is damaged.", 409); }
      const managed = { ...example, localUrl: `/uploads/looks/${name}` };
      return { look: lookSnapshot({ ...look, prompt, examples: [managed] }), images: [{ bytes, name, example: managed }] };
    }
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
    const saved = isUserLookId(body.id) || isSharedLookId(body.id);
    if (saved && !portableLookPrompt(body.prompt)) fail("Add a style description before creating the Style node.");
    if (!saved && !analyzeLook) fail("Restart NewtNode to activate multi-image style analysis.", 503);
    const { look, images } = await prepareLook(body);
    let gradeColors = filmStillColors(look.examples[0].filmStillPalette);
    if (!gradeColors.length) {
      const pixels = await sharp(images[0].bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 220, height: 220, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").ensureAlpha().raw().toBuffer();
      gradeColors = dominantPaletteFromPixels(pixels);
    }
    if (!gradeColors.length) fail("The first look image has no visible colors for Custom Grade.");
    if (saved) return { look: { ...look, gradeColors } };
    const analysis = await analyzeLook({ look, images });
    return { look: { ...lookSnapshot({ ...look, styleAnalysis: analysis }), gradeColors } };
  }
  async function prepareUploadedLook(body) {
    if (!readAsset) fail("Restart NewtNode to activate Create Look.", 503);
    const limit = body.styleBoardVersion === 1 ? 6 : 8, byteLimit = body.styleBoardVersion === 1 ? 16 * 1024 * 1024 : maxImageBytes;
    if (!Array.isArray(body.examples) || body.examples.length < 1 || body.examples.length > limit) fail(`Add between one and ${limit} reference images.`);
    const snapshot = lookSnapshot({ ...body, styleAnalysis: null });
    if (snapshot.examples.length !== body.examples.length) fail("Use local uploaded image references only.");
    const prepared = [];
    for (const example of snapshot.examples) {
      const bytes = await readAsset(example.localUrl);
      if (!Buffer.isBuffer(bytes) || bytes.length > byteLimit) fail(`Use reference images up to ${byteLimit / 1024 / 1024} MB each.`, 413);
      const metadata = await sharp(bytes, { limitInputPixels: 40000000, animated: false }).metadata();
      if (!["png", "jpeg", "webp", "heif"].includes(metadata.format) || metadata.pages > 1 || (metadata.format === "heif" && metadata.compression !== "av1")) fail("Use still PNG, JPEG, WebP or AVIF reference images.");
      const extension = metadata.format === "jpeg" ? "jpg" : metadata.format === "heif" ? "avif" : metadata.format;
      const name = `${digest(bytes)}.${extension}`;
      prepared.push({ bytes, name, example: { ...example, id: name, localUrl: `/uploads/looks/${name}`, mimeType: `image/${metadata.format === "heif" ? "avif" : metadata.format}` } });
    }
    await mkdir(assetDirectory, { recursive: true });
    for (const { bytes, name } of prepared) {
      try { await writeFile(path.join(assetDirectory, name), bytes, { flag: "wx", mode: 0o600 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; if (digest(await readFile(path.join(assetDirectory, name))) !== digest(bytes)) fail("A saved look reference is damaged.", 409); }
    }
    return { look: { ...snapshot, examples: prepared.map(item => item.example) }, images: prepared };
  }
  function validateCreatedLook(body) {
    if (!isUserLookId(body.id) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) fail("Add a look name of at most 120 characters.");
    if (typeof body.prompt !== "string" || !portableLookPrompt(body.prompt) || body.prompt.length > 12000) fail("Add a style description of at most 12,000 characters.");
    if (typeof body.category !== "string" || !body.category.trim() || body.category.length > 80) fail("Add a category of at most 80 characters.");
    if (!Array.isArray(body.tags) || body.tags.length > 16 || body.tags.some(tag => typeof tag !== "string" || tag.length > 80)) fail("Use up to 16 short tags.");
  }
  async function createCustom(body) {
    validateCreatedLook(body);
    let metadata = {};
    if (body.styleBoardVersion !== undefined) {
      if (body.styleBoardVersion !== 1 || !validLookStyleBlocks(body.styleBlocks) || !validLookPalette(body.palette) || typeof body.notes !== "string" || body.notes.length > 2000) fail("The Look style board is incomplete. Your references have been preserved.");
      const compiled = compileLookStyle(body.styleBlocks), hasSections = body.styleBlocks.some(block => block.text.trim());
      if (hasSections && compiled.length < 80) fail("Include at least one style section with 80 characters of direction before saving.");
      if (body.prompt !== (hasSections ? compiled : body.notes.trim())) fail("The Look prompt does not match its current style board.");
      metadata = { styleBoardVersion: 1, styleBlocks: lookStyleBlocks(body.styleBlocks), notes: body.notes.trim(), colours: body.palette.map(color => ({ name: color.name, hex: color.hex, percent: null })) };
      if (!Array.isArray(body.examples) || body.examples.length > 6) fail("Choose up to six reference images for a new Look.");
    }
    if (body.destination && !["local", "shared"].includes(body.destination)) fail("Choose a Look destination.");
    const { look, images } = await prepareUploadedLook(body);
    if (body.destination === "shared") {
      if (typeof body.sharedDirectory !== "string") fail("Choose a Shared User Looks folder first.");
      return { look: await shared.add({ ...look, ...metadata, category: body.category, tags: body.tags }, images, body.sharedDirectory) };
    }
    return { look: await userLibrary.create({ ...look, ...metadata, custom: true, category: body.category.trim(), tags: [...new Set(body.tags.map(tag => tag.trim()).filter(Boolean))] }) };
  }
  async function analyzeCustom(body) {
    if (!analyzeLook) fail("Restart NewtNode to activate style analysis.", 503);
    if (typeof body.prompt !== "string" || body.prompt.length > 12000) fail("Keep the description within 12,000 characters.");
    if (body.styleBoardVersion !== undefined && (body.styleBoardVersion !== 1 || !Array.isArray(body.examples) || body.examples.length > 6 || body.prompt.length > 2000)) fail("Choose up to six reference images and a short description of at most 2,000 characters.");
    if (body.categories !== undefined && (!Array.isArray(body.categories) || body.categories.length > 40 || body.categories.some(value => typeof value !== "string" || value.length > 80))) fail("Use up to 40 catalog categories.");
    const { look, images } = await prepareUploadedLook(body);
    if (body.styleBoardVersion === 1) {
      const analysis = await analyzeLook({ look, images, purpose: "create-look", categories: lookCategories(body.categories || []) });
      return { ...analysis, styleBlocks: lookStyleBlocks(analysis.visualStyle) };
    }
    return { prompt: lookSnapshot({ ...look, styleAnalysis: await analyzeLook({ look, images }) }).prompt };
  }
  async function updateCollection(id, body) {
    if (body.action === "add") {
      if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500 || !body.ids.every(validId)) fail("Select up to 500 looks.");
      const data = await userLibrary.read(), ownIds = new Set(data.looks.map(look => look.id));
      let source;
      for (const lookId of new Set(body.ids)) {
        if (isUserLookId(lookId)) { if (!ownIds.has(lookId)) fail("This saved look is no longer available.", 404); }
        else if (isSharedLookId(lookId)) await shared.detail(lookId);
        else if (isFilmStillId(lookId)) await films.detail(lookId);
        else { source ||= await catalog(); source.detail(lookId); }
      }
    }
    return userLibrary.updateCollection(id, body);
  }
  async function shareLooks({ ids, sharedDirectory }) {
    if (typeof sharedDirectory !== "string" || !Array.isArray(ids) || !ids.length || ids.length > 50 || !ids.every(validId)) fail("Select between one and 50 looks to share.");
    const saved = [];
    for (const id of new Set(ids)) {
      try {
        const source = await detail(id);
        if (isSharedLookId(id)) { if (source.sharedDirectory !== sharedDirectory) fail("The shared folder changed. Refresh before sharing.", 409); saved.push(source); continue; }
        const { look, images } = await prepareLook({ id, prompt: lookSnapshot(source).prompt });
        saved.push(await shared.add({ ...source, ...look }, images, sharedDirectory));
      } catch (error) { if (saved.length) error.message = `${saved.length} look(s) shared. ${error.message} Remaining looks were not shared; existing local looks are unchanged.`; throw error; }
    }
    return { looks: saved };
  }
  return { status, configure, search, detail, setFavorite, asset, importLook, createStyle, filmImage: films.image,
    sharedState: () => shared.state(), configureShared: value => shared.configure(value), shareLooks,
    sharedImage: (id, file, index) => shared.image(id, file, index),
    removeShared: async (id, expected) => { const result = await shared.remove(id, expected); await setFavorite(id, false); return result; },
    userLibrary: () => userLibrary.summary(), createCustom, analyzeCustom,
    removeCustom: async id => { const result = await userLibrary.remove(id); await setFavorite(id, false); return result; },
    createCollection: name => userLibrary.createCollection(name), updateCollection, removeCollection: id => userLibrary.removeCollection(id) };
}
