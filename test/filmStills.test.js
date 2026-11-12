import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createFilmStills, extractFilmStill, dominantSwatches } from "../server/film-stills.js";
import { createLooksLibrary } from "../server/looks-library.js";
import { createSharedLooks } from "../server/looks-shared.js";
import { filmStillPalette, filmStillColors, filmStillGradePatch, filmStillGradePrompt, filmStillGradeReferences } from "../src/filmStillGrade.js";
import { lookSnapshot, lookNodeData } from "../src/looks.js";
import { prepareLookTransfer } from "../src/lookTransfer.js";

const swatches = Array.from({ length: 13 }, (_, i) => [20 + i * 15, 190 - i * 10, 40 + i * 12]);
export async function filmSheet({ palette = true, textured = false } = {}) {
  const w = 1000, h = 1000, pixels = Buffer.alloc(w * h * 3, 255);
  const paint = (x, y, color) => { const at = (y * w + x) * 3; pixels[at] = color[0]; pixels[at + 1] = color[1]; pixels[at + 2] = color[2]; };
  for (let y = 8; y < (palette ? 558 : 992); y++) for (let x = 8; x < 992; x++) paint(x, y, swatches[Math.min(12, Math.floor(x / 77))]);
  if (palette) for (let i = 0; i < 13; i++) for (let y = 568; y < 992; y++) for (let x = 8 + i * 76; x < 80 + i * 76; x++) paint(x, y, textured && y < 750 ? [20, 30, 40] : swatches[i]);
  return sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "film-stills-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const catalog = path.join(root, "Looks"), directory = path.join(root, "data"), assetDirectory = path.join(root, "uploads", "looks");
  await mkdir(path.join(catalog, "FilmColorStills"), { recursive: true });
  await mkdir(path.join(catalog, "images"));
  await writeFile(path.join(catalog, "catalog.json"), JSON.stringify({ version: 1, styles: [{ id: "plain", name: "Plain", category: "Other", tags: [], examples: [], prompt: "Simple" }], details: {}, categories: ["Other"], assets: {} }));
  const bytes = await filmSheet();
  await writeFile(path.join(catalog, "FilmColorStills", "Cinema.png"), bytes);
  await writeFile(path.join(catalog, "FilmColorStills", "No Palette.jpg"), await filmSheet({ palette: false }));
  const options = { directory, assetDirectory, thumbnailDirectory: path.join(root, "thumbs"), readAsset: url => readFile(path.join(root, url)) };
  return { root, catalog, directory, assetDirectory, bytes, options, films: createFilmStills({ directory, catalogDirectory: async () => catalog }) };
}

test("clean extraction keeps ten original swatches, removes the palette and skips ordinary images", async () => {
  const result = await extractFilmStill(await filmSheet());
  assert.equal(result.swatchCount, 13); assert.equal(result.palette.colors.length, 10);
  const supplied = swatches.map(rgb => `#${rgb.map(n => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase());
  assert.ok(result.palette.colors.every(color => supplied.includes(color)));
  const meta = await sharp(result.bytes).metadata();
  assert.equal(meta.width, 980); assert.equal(meta.height, 546); assert.equal(meta.format, "png");
  assert.equal(await extractFilmStill(await filmSheet({ palette: false })), null);
  assert.equal(await extractFilmStill(await filmSheet({ textured: true })), null);
  const jpeg = await sharp(await filmSheet()).jpeg({ quality: 90 }).toBuffer();
  assert.equal((await extractFilmStill(jpeg)).palette.colors.length, 10);
});

test("prominence ranking uses the still and never substitutes new palette colors", () => {
  const pixels = Buffer.from(swatches.slice(3).flatMap(color => Array.from({ length: 20 }, () => color).flat()));
  const result = dominantSwatches(pixels, swatches);
  assert.deepEqual(result, swatches.slice(3).map(rgb => `#${rgb.map(n => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase()));
});

test("index caches clean derivatives, leaves originals unchanged, and rejects stale or unsafe images", async t => {
  const f = await fixture(t), index = await f.films.index();
  assert.equal(index.looks.length, 1); assert.equal(index.skipped, 1);
  const look = index.looks[0], image = await f.films.image(look.id, look.examples[0].id);
  assert.deepEqual(await readFile(path.join(f.catalog, "FilmColorStills", "Cinema.png")), f.bytes);
  assert.deepEqual(await f.films.index(), index);
  assert.equal(image.example.filmStillPalette.colors.length, 10);
  await writeFile(path.join(f.directory, "film-stills", `${image.example.id}.png`), "damaged cache");
  assert.deepEqual((await f.films.image(look.id, image.example.id)).bytes, image.bytes, "Damaged derivatives rebuild locally from untouched originals");
  await assert.rejects(f.films.image(look.id, "wrong-version"), /changed/);
  await assert.rejects(f.films.image("../../secret"), /no longer available/);
  await symlink(path.join(f.catalog, "FilmColorStills", "Cinema.png"), path.join(f.catalog, "FilmColorStills", "Escape.png"));
  assert.equal((await f.films.index()).looks.length, 1);
  await rm(path.join(f.catalog, "FilmColorStills"), { recursive: true });
  assert.equal((await f.films.index()).looks.length, 0);
});

test("Film Stills participate in All Looks, search, favorites, collections and portable grade transfer without AI", async t => {
  const f = await fixture(t), library = createLooksLibrary({ ...f.options, analyzeLook: async () => { throw Error("Unexpected paid call"); } });
  await library.configure(f.catalog);
  const all = await library.search({ source: "all" });
  assert.equal(all.total, 2); assert.deepEqual(all.categories, ["Film Stills", "Other"]);
  const look = all.styles[1];
  assert.equal((await library.search({ source: "film-stills", q: "Cinema" })).total, 1);
  assert.equal((await library.search({ source: "catalog" })).total, 1);
  await library.setFavorite(look.id, true);
  assert.equal((await library.search({ source: "all", starred: "true" })).styles[0].id, look.id);
  const { collection } = await library.createCollection("Movie Grades");
  await library.updateCollection(collection.id, { action: "add", ids: [look.id] });
  assert.equal((await library.search({ collection: collection.id })).styles[0].id, look.id);
  const entries = await prepareLookTransfer({ look, prompt: look.prompt, selected: { grade: true } }, { import: body => library.importLook(body) }, () => { throw Error("Must not resample"); });
  const data = lookNodeData("grade", entries[0].value);
  assert.equal(data.customPaletteColors.length, 10);
  assert.deepEqual(data.filmStillGrade.colors, look.examples[0].filmStillPalette.colors);
  assert.equal(data.libraryStyle, undefined); assert.equal(data.libraryGrade.prompt, "");
  assert.match(data.customPalettePreviewUrl, /^\/uploads\/looks\//);
  await rm(f.catalog, { recursive: true });
  assert.ok((await f.options.readAsset(data.customPalettePreviewUrl)).length);
  assert.deepEqual(lookSnapshot(data.libraryGrade).examples[0].filmStillPalette.colors, data.filmStillGrade.colors);
});

test("readable Film Still names preserve cached assets, legacy IDs, favorites and filename search", async t => {
  const f = await fixture(t), file = "2 28.png";
  await writeFile(path.join(f.catalog, "FilmColorStills", file), f.bytes);
  const oldId = `film-still-${createHash("sha256").update(file).digest("hex").slice(0, 32)}`;
  const library = createLooksLibrary({ ...f.options, analyzeLook: async () => { throw Error("Naming must not call AI"); } });
  await library.configure(f.catalog);
  const page = await library.search({ source: "all", q: "2 28" });
  assert.equal(page.total, 1);
  const look = page.styles[0];
  assert.equal(look.id, oldId);
  assert.doesNotMatch(look.name, /\d/);
  assert.equal(look.searchName, "2 28");
  assert.equal((await library.search({ source: "all", q: look.name })).styles.some(item => item.id === oldId), true);
  await library.setFavorite(oldId, true);
  const { collection } = await library.createCollection("Film Names");
  await library.updateCollection(collection.id, { action: "add", ids: [oldId] });
  const manifestPath = path.join(f.directory, "film-stills", "index.json"), cacheBefore = await readFile(manifestPath);
  const reopened = createLooksLibrary(f.options);
  assert.equal((await reopened.search({ source: "all", starred: "true" })).styles[0].name, look.name);
  assert.equal((await reopened.search({ collection: collection.id })).styles[0].id, oldId);
  const imported = await reopened.importLook({ id: oldId, prompt: look.prompt });
  assert.equal(imported.look.name, look.name);
  assert.deepEqual(imported.look.examples[0].filmStillPalette, look.examples[0].filmStillPalette);
  assert.deepEqual(await readFile(path.join(f.catalog, "FilmColorStills", file)), f.bytes);
  assert.deepEqual(await readFile(manifestPath), cacheBefore, "Renaming display titles does not rebuild or mutate cached image data");
});

test("image swaps atomically replace clean reference and all colors, and deselected grades send no image", () => {
  const palette = { version: 1, colors: Array.from({ length: 10 }, (_, i) => `#${(i * 1000 + 100).toString(16).padStart(6, "0")}`) };
  const other = { version: 1, colors: palette.colors.map(hex => `#${(parseInt(hex.slice(1), 16) + 2).toString(16).padStart(6, "0")}`) };
  const first = filmStillGradePatch({ localUrl: "/uploads/one.png", filmStillPalette: palette });
  const next = { ...first, ...filmStillGradePatch({ localUrl: "/uploads/two.png", filmStillPalette: other }) };
  const prompt = filmStillGradePrompt(next);
  assert.ok(other.colors.every(hex => prompt.includes(hex.toUpperCase())));
  assert.equal(filmStillGradeReferences([{ source: { type: "style", data: next } }])[0].url, "/uploads/two.png");
  assert.equal(filmStillGradePrompt({ ...next, gradePreset: "None" }), "");
  assert.equal(filmStillGradePrompt({ ...next, customPalettePreviewUrl: "/uploads/other.png" }), "");
  assert.equal(filmStillPalette({ ...palette, colors: palette.colors.slice(0, 9) }), null);
  assert.equal(filmStillGradePatch({ localUrl: "https://evil.test/x.png", filmStillPalette: palette }), null);
  assert.equal(filmStillColors(palette).length, 10);
});

test("shared version-1 packages retain per-image hand-picked palettes and clean bytes", async t => {
  const f = await fixture(t), library = createLooksLibrary(f.options);
  await library.configure(f.catalog);
  const look = (await library.search({ source: "film-stills" })).styles[0];
  const sharedFolder = path.join(f.root, "Shared"); await mkdir(sharedFolder);
  await library.configureShared(sharedFolder);
  const { looks } = await library.shareLooks({ ids: [look.id], sharedDirectory: sharedFolder });
  const other = createSharedLooks({ directory: path.join(f.root, "peer"), assetDirectory: path.join(f.root, "peer-assets") });
  await other.configure(sharedFolder);
  const materialized = await other.materialize(looks[0].id);
  assert.equal(materialized.name, look.name);
  assert.deepEqual(materialized.examples[0].filmStillPalette, look.examples[0].filmStillPalette);
  assert.deepEqual(materialized.colours.map(color => color.hex), look.examples[0].filmStillPalette.colors);
  const record = JSON.parse(await readFile(path.join(sharedFolder, looks[0].id, "look.json"), "utf8"));
  assert.equal(record.version, 1); assert.ok(!JSON.stringify(record).includes(f.root));
  const reused = await library.createStyle({ id: looks[0].id, prompt: look.prompt, sharedDirectory: sharedFolder });
  assert.deepEqual(reused.look.gradeColors.map(color => color.hex), look.examples[0].filmStillPalette.colors);
});

test("the inspected peer can read shared Film Stills and their ten-color fallback palette", { skip: !process.env.UPSTREAM_LOOKS_ROOT }, async t => {
  const f = await fixture(t), library = createLooksLibrary(f.options);
  await library.configure(f.catalog);
  const look = (await library.search({ source: "film-stills" })).styles[0];
  const sharedFolder = path.join(f.root, "Shared"); await mkdir(sharedFolder);
  await library.configureShared(sharedFolder);
  const { looks } = await library.shareLooks({ ids: [look.id], sharedDirectory: sharedFolder });
  const upstream = await import(pathToFileURL(path.join(process.env.UPSTREAM_LOOKS_ROOT, "server/lookbook-storage.js")));
  const peer = upstream.createLookbookStorage({ directory: path.join(f.root, "peer"), cacheDirectory: path.join(f.root, "peer-cache") });
  await peer.configure({ directory: "", looksDirectory: sharedFolder, copyLocal: false });
  const read = await peer.get(looks[0].id);
  assert.deepEqual(read.colours.map(color => color.hex), look.examples[0].filmStillPalette.colors);
  const bytes = await readFile(await peer.ensureAsset(read.examples[0].localUrl));
  assert.deepEqual(bytes, (await f.films.image(look.id)).bytes);
});
