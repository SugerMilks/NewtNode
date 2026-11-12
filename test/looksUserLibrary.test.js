import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import sharp from "sharp";
import express from "express";
import { createLooksLibrary } from "../server/looks-library.js";
import { createLooksUserLibrary } from "../server/looks-user-library.js";
import { registerLooksRoutes } from "../server/routes/looks.js";
import { lookNodeData } from "../src/looks.js";
import { looksApi } from "../src/api/newtApi.js";
import { lookStyleBlocks, compileLookStyle } from "../src/createLookStyle.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "newt-user-looks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const red = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#d43a34" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#345ad4" } }).png().toBuffer();
  const calls = [];
  const options = { directory: path.join(root, "data"), assetDirectory: path.join(root, "assets"), thumbnailDirectory: path.join(root, "cache"),
    readAsset: async url => {
      if (url === "/uploads/red.png") return red;
      if (url === "/uploads/blue.png") return blue;
      if (/^\/uploads\/looks\/[a-f0-9]{64}\.png$/.test(url)) return readFile(path.join(root, "assets", path.basename(url)));
      throw Error("Unknown managed image");
    },
    analyzeLook: async request => { calls.push(request); return { referenceCount: request.images.length, stylePrompt: "Painted texture with dimensional lighting.", signatureFeature: "A strong silhouette beneath generous negative space." }; }
  };
  const body = { id: `user-look-${randomUUID()}`, name: "Paint study", category: "Illustration", tags: ["Texture", "Texture"], prompt: "Hand-painted dimensional shadows.",
    examples: [{ id: "red", localUrl: "/uploads/red.png", fileName: "red.png" }, { id: "blue", localUrl: "/uploads/blue.png", fileName: "blue.png" }] };
  return { root, options, body, calls, red, blue, library: createLooksLibrary(options) };
}

test("custom Looks save locally, reopen, search and feed Style/Mood Board without paid analysis", async t => {
  const f = await fixture(t), { look } = await f.library.createCustom(f.body);
  assert.equal(look.custom, true); assert.deepEqual(look.tags, ["Texture"]);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.library.search({ source: "custom", q: "paint texture" })).total, 1);
  const reopened = createLooksLibrary(f.options);
  assert.deepEqual(await reopened.detail(f.body.id), look);
  await reopened.setFavorite(look.id, true);
  assert.equal((await reopened.search({ source: "custom", starred: "true" })).total, 1);
  const style = await reopened.createStyle({ id: look.id, prompt: look.prompt });
  const data = lookNodeData("style", style.look);
  assert.equal(data.stylePreset, "None"); assert.equal(data.gradePreset, "Custom");
  assert.equal(data.customPalettePreviewUrl, look.examples[0].localUrl);
  assert.equal(data.libraryStyle.prompt, f.body.prompt);
  assert.deepEqual(style.look.gradeColors, [{ r: 212, g: 58, b: 52, percent: 100 }]);
  await assert.rejects(reopened.createStyle({ id: look.id, prompt: " " }), /style description/);
  const mood = await reopened.importLook({ id: look.id, prompt: look.prompt });
  assert.equal(lookNodeData("transfer", mood.look).transferImages.length, 2);
  assert.deepEqual(await f.options.readAsset(look.examples[1].localUrl), f.blue);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.library.createCustom(f.body), { look }, "Retries are idempotent");
  assert.equal((await f.library.userLibrary()).customCount, 1);
  await assert.rejects(f.library.createCustom({ ...f.body, name: "Changed" }), /already been saved/);
});

test("explicit extraction analyzes every reference; save and later use reuse the written result", async t => {
  const f = await fixture(t);
  const analysis = await f.library.analyzeCustom({ ...f.body, prompt: "" });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].images.length, 2);
  assert.deepEqual(f.calls[0].images.map(item => item.bytes), [f.red, f.blue]);
  assert.match(analysis.prompt, /^Defining visual feature:/);
  const { look } = await f.library.createCustom({ ...f.body, prompt: analysis.prompt });
  assert.equal((await f.library.createStyle({ id: look.id, prompt: look.prompt })).look.prompt, analysis.prompt);
  assert.equal(f.calls.length, 1);
});

test("invalid images and incomplete forms fail before analysis or saved entries", async t => {
  const f = await fixture(t);
  for (const examples of [[], Array(9).fill(f.body.examples[0]), [{ localUrl: "https://example.com/image.png" }], [{ localUrl: "/uploads/../secret.png" }], [{ url: "/uploads/red.png" }]]) {
    await assert.rejects(f.library.analyzeCustom({ ...f.body, examples }));
    await assert.rejects(f.library.createCustom({ ...f.body, examples }));
  }
  for (const change of [{ name: "" }, { id: "look-a" }, { prompt: " " }, { category: "" }, { tags: Array(17).fill("x") }]) await assert.rejects(f.library.createCustom({ ...f.body, ...change }));
  const bad = createLooksLibrary({ ...f.options, readAsset: async () => Buffer.from("<svg></svg>") });
  await assert.rejects(bad.analyzeCustom(f.body));
  assert.equal(f.calls.length, 0); assert.equal((await f.library.userLibrary()).customCount, 0);
});

test("collections persist membership, deduplicate, and remove without deleting original images", async t => {
  const f = await fixture(t), { look } = await f.library.createCustom(f.body);
  const { collection } = await f.library.createCollection("Client options");
  await f.library.updateCollection(collection.id, { ids: [look.id, look.id], action: "add" });
  assert.equal((await f.library.search({ collection: collection.id })).total, 1);
  await assert.rejects(f.library.updateCollection(collection.id, { ids: ["missing"], action: "add" }));
  assert.deepEqual((await createLooksLibrary(f.options).userLibrary()).collections[0].ids, [look.id]);
  await assert.rejects(f.library.createCollection("CLIENT OPTIONS"), /already exists/);
  await f.library.updateCollection(collection.id, { ids: [look.id], action: "remove" });
  assert.equal((await f.library.search({ collection: collection.id })).total, 0);
  await f.library.updateCollection(collection.id, { ids: [look.id], action: "add" });
  await f.library.removeCollection(collection.id);
  assert.equal((await f.library.userLibrary()).collections.length, 0);
  assert.equal((await f.library.detail(look.id)).name, look.name);
  const other = await f.library.createCollection("Keep files");
  await f.library.updateCollection(other.collection.id, { ids: [look.id], action: "add" });
  await f.library.removeCustom(look.id);
  assert.equal((await f.library.userLibrary()).customCount, 0);
  assert.equal((await f.library.search({ collection: other.collection.id })).total, 0);
  assert.equal((await readdir(f.options.assetDirectory)).length, 2, "Canvas references remain valid after removing a look");
  assert.deepEqual(await f.options.readAsset(look.examples[0].localUrl), f.red);
  await assert.rejects(f.library.removeCustom("look-a"), /Only your own/);
});

test("concurrent library writes preserve both entries and corrupt data is never overwritten", async t => {
  const f = await fixture(t), store = createLooksUserLibrary(f.options.directory);
  await Promise.all([f.library.createCustom(f.body), f.library.createCustom({ ...f.body, id: `user-look-${randomUUID()}`, name: "Second" })]);
  assert.equal((await store.read()).looks.length, 2);
  const filename = path.join(f.options.directory, "user-library.json");
  await writeFile(filename, "broken");
  await assert.rejects(store.createCollection("Safe"), /No saved looks were changed/);
  assert.equal(await readFile(filename, "utf8"), "broken");
  const malformed = JSON.stringify({ version: 1, looks: [], collections: [{ id: "collection-a", name: "Broken", ids: null }] });
  await writeFile(filename, malformed);
  await assert.rejects(store.createCollection("Safe"), /No saved looks were changed/);
  assert.equal(await readFile(filename, "utf8"), malformed);
});

test("new HTTP routes support create, analysis, collections and delete with origin protection", async t => {
  const f = await fixture(t), app = express(); app.use(express.json()); registerLooksRoutes(app, f.options);
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, method = "POST") => fetch(base + url, { method, headers: { "Content-Type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
  assert.equal((await request("/api/looks/custom", f.body)).status, 200);
  assert.equal(f.calls.length, 0);
  const collection = (await (await request("/api/looks/collections", { name: "Test" })).json()).collection;
  assert.equal((await request(`/api/looks/collections/${collection.id}`, { ids: [f.body.id], action: "add" })).status, 200);
  assert.equal((await (await fetch(base + `/api/looks/catalog?collection=${collection.id}`)).json()).total, 1);
  assert.equal((await request("/api/looks/custom/analyze", f.body)).status, 200);
  assert.equal(f.calls.length, 1);
  assert.equal((await fetch(base + "/api/looks/custom", { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "application/json" }, body: JSON.stringify(f.body) })).status, 403);
  assert.equal((await request(`/api/looks/custom/${f.body.id}`, null, "DELETE")).status, 200);
  assert.equal((await (await fetch(base + "/api/looks/library")).json()).customCount, 0);
  assert.equal((await request(`/api/looks/collections/${collection.id}`, null, "DELETE")).status, 200);
});

test("old backends block custom Look work before uploads or analysis submissions", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, routes: { looksLibrary: true, looksStyleAnalysis: true } }));
  for (const run of [() => looksApi.library(), () => looksApi.create({}), () => looksApi.analyze({}), () => looksApi.createCollection("Test"), () => looksApi.search({ source: "custom" }), () => looksApi.search({ collection: "collection-test" })]) {
    await assert.rejects(run(), /Restart NewtNode.*custom Looks/);
  }
  assert.equal(mock.mock.callCount(), 6);
  assert.ok(mock.mock.calls.every(call => call.arguments[0] === "/api/health"));
});

test("created style boards retain sections, priorities, notes and separate palettes across local saves", async t => {
  const f = await fixture(t);
  const blocks = lookStyleBlocks({ medium: "Hand-painted dimensional surfaces with sculpted highlights and flowing marks. Keep forms tactile and their silhouettes sharply readable.", lighting: "Soft shadows." });
  blocks[0].weight = "absolute"; blocks[1].enabled = false;
  const body = { ...f.body, styleBoardVersion: 1, styleBlocks: blocks, notes: "My summary", palette: [{ name: "Reference", hex: "#334455" }], prompt: compileLookStyle(blocks) };
  const { look } = await f.library.createCustom(body);
  const reopened = await createLooksLibrary(f.options).detail(look.id);
  assert.deepEqual(reopened.styleBlocks, blocks); assert.equal(reopened.notes, "My summary");
  assert.equal(reopened.colours[0].hex, "#334455"); assert.ok(!reopened.prompt.includes("#334455"));
  assert.ok(!reopened.prompt.includes("Soft shadows."));
  assert.deepEqual(await f.library.createCustom(body), { look });
  assert.equal((await f.library.createStyle({ id: look.id, prompt: look.prompt })).look.prompt, body.prompt);
  assert.equal(f.calls.length, 0);
  for (const patch of [{ styleBlocks: blocks.slice(0, 5) }, { palette: [{ name: "Bad", hex: "invalid" }] }, { notes: "a".repeat(2001) }, { prompt: "Out of date prompt" }, { examples: Array(7).fill(f.body.examples[0]) }]) await assert.rejects(f.library.createCustom({ ...body, ...patch }));
});

test("new style-board requests cannot reach a backend that would discard their settings", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, routes: { looksLibrary: true, looksWorkspaceTools: true, looksStyleAnalysis: true } }));
  for (const run of [looksApi.create, looksApi.analyze]) await assert.rejects(run({ styleBoardVersion: 1 }), /Restart NewtNode.*style board/);
  assert.equal(mock.mock.callCount(), 2);
});
