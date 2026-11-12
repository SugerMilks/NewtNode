import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, rm, symlink, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import express from "express";
import { createLooksLibrary } from "../server/looks-library.js";
import { openCompactStyleFinder } from "../server/looks-catalog.js";
import { registerLooksRoutes } from "../server/routes/looks.js";
import { selectLooksPage, portableLookPrompt, libraryLookPrompt, lookSnapshot, lookNodeData } from "../src/looks.js";
import { looksApi } from "../src/api/newtApi.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "newt-looks-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const catalog = path.join(root, "source", "Looks");
  const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#dcaa22" } }).png().toBuffer();
  const blob = `${createHash("sha256").update(bytes).digest("hex")}.png`, key = "img/reference.html";
  const imageFile = path.join(catalog, "images", blob.slice(0, 2), blob);
  await mkdir(path.dirname(imageFile), { recursive: true }); await writeFile(imageFile, bytes);
  const style = { id: "look-a", name: "Golden painted light", category: "Painters", tags: ["Warm", "Textured"], prompt: "Layered brushwork with luminous warm highlights. --sref 123", examples: [{ id: "a", url: `/api/style-library/stylefinder-image?file=${encodeURIComponent(key)}`, fileName: "example.png" }], sourceUrl: "https://midlibrary.io/library/look-a" };
  const manifest = { version: 1, styles: [style, { ...style, id: "look-b", name: "Silver", category: "Photographers", tags: ["Monochrome"] }], details: {}, categories: ["Painters", "Photographers"], assets: { [key]: blob } };
  await writeFile(path.join(catalog, "catalog.json"), JSON.stringify(manifest));
  const options = { directory: path.join(root, "data"), assetDirectory: path.join(root, "uploads", "looks"), thumbnailDirectory: path.join(root, "cache") };
  return { root, catalog, bytes, blob, key, imageFile, manifest, style, options, library: createLooksLibrary(options) };
}

async function combinedFixture(t) {
  const f = await fixture(t);
  f.options.readAsset = async () => f.bytes;
  f.library = createLooksLibrary(f.options);
  f.catalog = (await f.library.configure(f.catalog)).directory;
  const body = { id: `user-look-${randomUUID()}`, name: "Local print study", category: "Illustration", tags: ["Textured"], prompt: "Luminous layered brushwork.",
    examples: [{ localUrl: "/uploads/reference.png", fileName: "reference.png" }] };
  f.local = (await f.library.createCustom(body)).look;
  await mkdir(path.join(f.root, "shared"));
  f.sharedDirectory = (await f.library.configureShared(path.join(f.root, "shared"))).directory;
  f.shared = (await f.library.createCustom({ ...body, id: `user-look-${randomUUID()}`, name: "Shared lens study", category: "Cinema", destination: "shared", sharedDirectory: f.sharedDirectory })).look;
  return f;
}

test("All Looks searches every library and unions categories without changing specific source views", async t => {
  const f = await combinedFixture(t);
  const all = await f.library.search({ source: "all" });
  assert.deepEqual(all.styles.map(look => look.id), ["look-a", "look-b", f.local.id, f.shared.id]);
  assert.equal(all.total, 4); assert.equal(all.indexed, 4); assert.deepEqual(all.warnings, []);
  assert.deepEqual(all.categories, ["Cinema", "Illustration", "Painters", "Photographers"]);
  for (const [q, ids] of [["local print", [f.local.id]], ["shared lens", [f.shared.id]], ["golden", ["look-a"]], ["luminous textured", ["look-a", f.local.id, f.shared.id]]]) {
    const page = await f.library.search({ source: "all", q });
    assert.deepEqual(page.styles.map(look => look.id), ids);
    assert.equal(page.indexed, 4); assert.deepEqual(page.categories, all.categories);
  }
  assert.equal((await f.library.search({ source: "all", category: "Illustration" })).styles[0].id, f.local.id);
  assert.equal((await f.library.search({ source: "all", category: "Cinema" })).styles[0].id, f.shared.id);
  assert.equal((await f.library.search({ source: "all", category: "Textured" })).total, 3);
  assert.equal((await f.library.search({ source: "catalog" })).total, 2);
  assert.equal((await f.library.search()).total, 2, "Legacy API calls remain catalog-only");
  assert.equal((await f.library.search({ source: "custom" })).total, 1);
  assert.equal((await f.library.search({ source: "shared" })).total, 1);
  assert.equal((await f.library.search({ source: "all", q: "no-match-here" })).total, 0);
  assert.equal((await f.library.detail(f.local.id)).id, f.local.id);
  assert.equal((await f.library.detail(f.shared.id)).id, f.shared.id);
});

test("All Looks favorites persist across sources, search, categories, reopening and unfavoriting", async t => {
  const f = await combinedFixture(t);
  for (const id of ["look-a", f.local.id, f.shared.id]) await f.library.setFavorite(id, true);
  const reopened = createLooksLibrary(f.options), filters = { source: "all", starred: "true" };
  assert.deepEqual((await reopened.search(filters)).styles.map(look => look.id), ["look-a", f.local.id, f.shared.id]);
  assert.equal((await reopened.search({ ...filters, q: "local" })).styles[0].id, f.local.id);
  assert.equal((await reopened.search({ ...filters, category: "Cinema" })).styles[0].id, f.shared.id);
  await reopened.setFavorite(f.local.id, false);
  assert.equal((await reopened.search(filters)).total, 2);
  assert.equal((await reopened.search({ ...filters, q: "local" })).total, 0);
  assert.equal((await reopened.search({ source: "all", q: "local" })).total, 1);
});

test("All Looks pagination crosses libraries without gaps or duplicates and keeps requests bounded", async t => {
  const f = await combinedFixture(t);
  f.manifest.styles = Array.from({ length: 110 }, (_, index) => ({ ...f.style, id: `catalog-${index}`, name: `Print ${index}` }));
  await writeFile(path.join(f.catalog, "catalog.json"), JSON.stringify(f.manifest));
  const first = await f.library.search({ source: "all", limit: 10000, offset: -10 });
  assert.equal(first.styles.length, 96); assert.equal(first.offset, 0); assert.equal(first.total, 112);
  const crossed = await f.library.search({ source: "all", offset: 109, limit: 2 });
  assert.deepEqual(crossed.styles.map(look => look.id), ["catalog-109", f.local.id]);
  const last = await f.library.search({ source: "all", offset: 111, limit: 2 });
  assert.deepEqual(last.styles.map(look => look.id), [f.shared.id]);
  assert.equal((await f.library.search({ source: "all", offset: 112 })).styles.length, 0);
  const ids = [];
  for (let offset = 0; offset < 112; offset += 48) ids.push(...(await f.library.search({ source: "all", offset, limit: 48 })).styles.map(look => look.id));
  assert.equal(ids.length, 112); assert.equal(new Set(ids).size, 112);
  assert.equal((await f.library.search({ source: "all", q: "luminous", category: "Illustration", offset: 0, limit: 1 })).styles[0].id, f.local.id);
});

test("All Looks works without a catalog and reports offline sources without losing favorites or connection settings", async t => {
  const f = await combinedFixture(t);
  for (const id of ["look-a", f.local.id, f.shared.id]) await f.library.setFavorite(id, true);
  const favoriteFile = path.join(f.options.directory, "favorites.json"), before = await readFile(favoriteFile);
  await rename(f.catalog, `${f.catalog}-offline`);
  await rename(f.sharedDirectory, `${f.sharedDirectory}-offline`);
  const partial = await f.library.search({ source: "all", starred: "true" });
  assert.deepEqual(partial.styles.map(look => look.id), [f.local.id]); assert.equal(partial.warnings.length, 2);
  assert.deepEqual(await readFile(favoriteFile), before);
  assert.equal((await f.library.status()).directory, f.catalog);
  assert.equal((await f.library.sharedState()).directory, f.sharedDirectory);
  await rename(`${f.catalog}-offline`, f.catalog); await rename(`${f.sharedDirectory}-offline`, f.sharedDirectory);
  assert.equal((await f.library.search({ source: "all", starred: "true" })).total, 3);
  await rm(path.join(f.options.directory, "settings.json")); await f.library.configureShared("");
  const localOnly = await f.library.search({ source: "all", starred: "true" });
  assert.equal(localOnly.total, 1); assert.deepEqual(localOnly.warnings, []);
});

test("All Looks preserves and reports a corrupt local library while other sources remain searchable", async t => {
  const f = await combinedFixture(t), filename = path.join(f.options.directory, "user-library.json");
  await writeFile(filename, "invalid library");
  const page = await f.library.search({ source: "all" });
  assert.equal(page.total, 3); assert.match(page.warnings[0], /My Looks could not be read/);
  assert.equal(await readFile(filename, "utf8"), "invalid library");
});

test("All Looks respects collection scope when supplied and works with an empty unconfigured library", async t => {
  const empty = await fixture(t);
  assert.equal((await empty.library.search({ source: "all" })).total, 0);
  assert.deepEqual((await empty.library.search({ source: "all" })).warnings, []);
  const f = await combinedFixture(t), { collection } = await f.library.createCollection("Selected references");
  await f.library.updateCollection(collection.id, { ids: [f.local.id, f.shared.id], action: "add" });
  assert.equal((await f.library.search({ source: "all", collection: collection.id })).total, 2);
});

test("All Looks refuses a stale backend instead of silently returning only catalog favorites", async t => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async url => {
    requests.push(String(url));
    return new Response(JSON.stringify({ routes: { looksLibrary: true } }));
  });
  await assert.rejects(looksApi.search({ source: "all", starred: true }), /Restart NewtNode.*all libraries/);
  assert.equal(requests.length, 1); assert.match(requests[0], /\/api\/health$/);
});

test("catalog search is bounded and supports words, categories, favorites and pagination", () => {
  const styles = Array.from({ length: 110 }, (_, i) => ({ id: String(i), name: `Warm painting ${i}`, prompt: "Soft light", category: "Paint", tags: ["Texture"] }));
  assert.equal(selectLooksPage(styles, { q: "warm light", limit: 1000 }).styles.length, 96);
  assert.deepEqual(selectLooksPage(styles, { category: "Texture", favorites: ["2", "4"], offset: 1 }).styles.map(item => item.id), ["4"]);
  assert.equal(selectLooksPage(styles, { q: "unknown" }).total, 0);
});

test("snapshots strip provider switches and retain portable references, not live catalog URLs", () => {
  assert.equal(portableLookPrompt("Brush marks. --sref 123 --ar 16:9"), "Brush marks.");
  const snapshot = lookSnapshot({ id: "a", name: "Look", prompt: "Paint.", sourceUrl: "javascript:alert(1)", examples: [{ localUrl: "/uploads/looks/example.png", id: "a" }, { localUrl: "/api/style-library/image?file=secret" }] });
  assert.equal(snapshot.sourceUrl, ""); assert.equal(snapshot.examples.length, 1);
  const style = lookNodeData("style", snapshot);
  assert.match(libraryLookPrompt(style), /Visual treatment only/);
  assert.match(libraryLookPrompt(style), /Paint\./);
  assert.match(libraryLookPrompt(style), /Do not import the reference subjects/);
  assert.equal(lookNodeData("transfer", snapshot).locked, false);
  assert.throws(() => lookNodeData("imageModel", snapshot));
});

test("Text handoff copies the visible description verbatim without style processing or references", () => {
  const prompt = '  Painted highlights.\n\nKeep "NORTH STAR" and @Character. --ar 16:9\n';
  for (const origin of [{}, { custom: true }, { shared: true }]) {
    const look = { ...origin, name: "Painted Light", prompt, notes: "Not part of the text", sourceUrl: "https://midlibrary.io/library/look",
      styleAnalysis: { stylePrompt: "Not the current edited description", signatureFeature: "Do not substitute this" },
      examples: [{ localUrl: "/uploads/looks/example.png" }] };
    assert.deepEqual(lookNodeData("plainText", look), { title: "Painted Light", text: prompt });
    assert.equal(look.prompt, prompt);
  }
  assert.deepEqual(lookNodeData("plainText", { prompt }), { title: "Look description", text: prompt });
});

test("configure discovers Looks child, preserves invalid reconnect, and never changes source", async t => {
  const f = await fixture(t), before = await readFile(path.join(f.catalog, "catalog.json"));
  assert.equal((await f.library.status()).ready, false);
  assert.equal((await f.library.configure(path.dirname(f.catalog))).indexed, 2);
  await assert.rejects(f.library.configure("relative/path"), /absolute/);
  await assert.rejects(f.library.configure(f.root), /previous connection is unchanged/);
  assert.equal((await f.library.status()).directory, await realpath(f.catalog));
  await Promise.all([f.library.setFavorite("look-a", true), f.library.setFavorite("look-b", true)]);
  assert.equal((await f.library.search({ starred: "true" })).total, 2);
  await f.library.setFavorite("look-a", false);
  assert.deepEqual((await createLooksLibrary(f.options).status()).favorites, ["look-b"]);
  assert.deepEqual(await readFile(path.join(f.catalog, "catalog.json")), before);
  assert.deepEqual(await readFile(f.imageFile), f.bytes);
});

test("imports are deduplicated local copies and survive a missing original catalog", async t => {
  const f = await fixture(t); await f.library.configure(f.catalog);
  const { look } = await f.library.importLook({ id: "look-a", prompt: "Editable visual treatment. --sref 1" });
  assert.equal(look.prompt, "Editable visual treatment.");
  assert.equal(look.examples[0].localUrl, `/uploads/looks/${f.blob}`);
  await f.library.importLook({ id: "look-a", prompt: "Again" });
  assert.equal((await readdir(f.options.assetDirectory)).length, 1);
  const preview = await f.library.asset(f.key, f.blob, true);
  assert.equal((await sharp(preview.filename).metadata()).format, "webp");
  await rename(f.catalog, `${f.catalog}-offline`);
  assert.equal((await f.library.status()).ready, false);
  await assert.rejects(f.library.search(), /unavailable/);
  assert.deepEqual(await readFile(path.join(f.options.assetDirectory, f.blob)), f.bytes);
});

test("Create Style analyzes all catalog examples and seeds the first image grade; Mood Board stays local", async t => {
  const f = await fixture(t), calls = [];
  const library = createLooksLibrary({ ...f.options, analyzeLook: async request => { calls.push(request); return { stylePrompt: "New multi-image prompt", referenceCount: request.images.length }; } });
  await library.configure(f.catalog);
  await library.importLook({ id: "look-a", prompt: "Mood Board text" }); assert.equal(calls.length, 0);
  const { look } = await library.createStyle({ id: "look-a", prompt: "Style hint" });
  assert.equal(calls.length, 1); assert.equal(calls[0].images.length, f.style.examples.length);
  assert.deepEqual(calls[0].images[0].bytes, f.bytes); assert.equal(look.prompt, "New multi-image prompt");
  assert.equal(lookNodeData("style", look).customPalettePreviewUrl, look.examples[0].localUrl);
  assert.deepEqual(look.gradeColors, [{ r: 220, g: 170, b: 34, percent: 100 }]);
  await writeFile(f.imageFile, "broken");
  await assert.rejects(library.createStyle({ id: "look-a", prompt: "Style hint" }), /incomplete or changed/);
  assert.equal(calls.length, 1, "Validate every source before paid analysis");
});

test("catalog assets reject traversal, external URLs, stale versions and escaping symlinks", async t => {
  const f = await fixture(t); await f.library.configure(f.catalog);
  for (const key of ["../../secret.png", "img/../secret.png", "https://example.com/x.png", "img/unknown.png", "img/x\\y.png"]) await assert.rejects(f.library.asset(key));
  await assert.rejects(f.library.asset(f.key, "old-version"));
  const copied = path.join(f.root, "outside.png"); await writeFile(copied, f.bytes);
  await rm(f.imageFile); await symlink(copied, f.imageFile);
  await assert.rejects(f.library.asset(f.key), /Invalid compact/);
  await assert.rejects(f.library.importLook({ id: "look-a", prompt: "Paint" }));
});

test("corrupt images fail before a canvas snapshot is returned and catalog URLs cannot fetch remote media", async t => {
  const f = await fixture(t); await f.library.configure(f.catalog);
  await writeFile(f.imageFile, "incomplete");
  await assert.rejects(f.library.importLook({ id: "look-a", prompt: "Paint" }), /incomplete or changed/);
  const source = structuredClone(f.manifest);
  source.styles[0].examples.push({ url: "https://example.com/private.png" }, { localUrl: "/uploads/secret.png" });
  assert.equal(openCompactStyleFinder(f.catalog, source, { shared: true }).detail("look-a").style.examples.length, 1);
  source.assets["img/../../secret.png"] = f.blob;
  assert.throws(() => openCompactStyleFinder(f.catalog, source), /Invalid compact image/);
});

test("HTTP routes support real catalog, detail, favorite and import without generation calls", async t => {
  const f = await fixture(t), app = express(); app.use(express.json());
  registerLooksRoutes(app, f.options);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await (await post("/api/looks/folder", { directory: f.catalog })).json()).ready, true);
  const page = await (await fetch(base + "/api/looks/catalog?q=golden")).json();
  assert.equal(page.total, 1);
  const response = await fetch(base + page.styles[0].examples[0].url + "&thumbnail=1");
  assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /image\/webp/);
  assert.equal((await (await fetch(base + "/api/looks/catalog/look-a")).json()).look.name, f.style.name);
  assert.equal((await post("/api/looks/favorites/look-a", { selected: true })).status, 200);
  assert.equal((await post("/api/looks/import", { id: "look-a", prompt: "Soft paint" })).status, 200);
  assert.equal((await fetch(base + "/api/style-library/stylefinder-image?file=../../secret.png")).status, 400);
  assert.equal((await fetch(base + "/api/looks", { headers: { Origin: "https://unrelated.example" } })).status, 403);
  assert.equal((await fetch(base + "/api/looks", { headers: { Origin: "http://127.0.0.1:5176" } })).status, 200);
});
