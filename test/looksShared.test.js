import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, symlink, rm, realpath } from "node:fs/promises";
import sharp from "sharp";
import express from "express";
import { createLooksLibrary } from "../server/looks-library.js";
import { createSharedLooks, sharedLookImage } from "../server/looks-shared.js";
import { registerLooksRoutes } from "../server/routes/looks.js";
import { looksApi } from "../src/api/newtApi.js";
import { lookStyleBlocks, compileLookStyle } from "../src/createLookStyle.js";

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "newt-shared-looks-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shared = path.join(root, "Shared User Looks"); await mkdir(shared);
  const red = await sharp({ create: { width: 48, height: 32, channels: 4, background: "#d43a34" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 48, height: 32, channels: 4, background: "#345ad4" } }).png().toBuffer();
  const options = name => ({ directory: path.join(root, name), assetDirectory: path.join(root, name, "images"), thumbnailDirectory: path.join(root, name, "cache"),
    analyzeLook: () => { throw Error("No paid calls allowed"); }, readAsset: async url => {
      if (url === "/uploads/red.png") return red;
      if (url === "/uploads/blue.png") return blue;
      return readFile(path.join(root, name, "images", path.basename(url)));
    } });
  const a = createLooksLibrary(options("a")), b = createLooksLibrary(options("b"));
  const body = { id: `user-look-${randomUUID()}`, name: "Paint study", category: "Illustration", tags: ["Texture"],
    prompt: "Hand-painted dimensional shadows with layered surface detail, confident irregular contours and deliberate negative space.",
    examples: [{ id: "red", localUrl: "/uploads/red.png", fileName: "red.png" }, { id: "blue", localUrl: "/uploads/blue.png", fileName: "blue.png" }] };
  return { root, shared, red, blue, a, b, body, options };
}

test("two independent libraries share ordered images and descriptions without touching local looks or catalogs", async t => {
  const f = await fixture(t);
  const local = await f.a.createCustom(f.body);
  await f.a.configureShared(f.shared); await f.b.configureShared(f.shared);
  assert.equal((await f.b.search({ source: "shared" })).total, 0, "Connecting does not publish local looks");
  const result = await f.a.shareLooks({ ids: [local.look.id], sharedDirectory: f.shared });
  const id = result.looks[0].id;
  assert.equal(id, f.body.id.slice(5));
  assert.equal((await f.a.userLibrary()).customCount, 1);
  const recordText = await readFile(path.join(f.shared, id, "look.json"), "utf8");
  assert.equal(recordText.includes(f.root), false); assert.equal(recordText.includes("/uploads/"), false);
  const record = JSON.parse(recordText);
  assert.equal(record.version, 1); assert.deepEqual(record.images.map(item => item.fileName), ["red.png", "blue.png"]);
  const page = await f.b.search({ source: "shared", q: "paint texture" });
  assert.equal(page.total, 1);
  await f.b.setFavorite(id, true);
  assert.equal((await f.b.search({ source: "shared", starred: "true" })).total, 1);
  const collection = await f.b.createCollection("Shared choices");
  await f.b.updateCollection(collection.collection.id, { ids: [id], action: "add" });
  assert.equal((await f.b.search({ collection: collection.collection.id })).total, 1);
  const node = await f.b.createStyle({ id, prompt: f.body.prompt, sharedDirectory: f.shared });
  assert.equal(node.look.prompt, f.body.prompt);
  assert.deepEqual(await f.options("b").readAsset(node.look.examples[0].localUrl), f.red);
  assert.deepEqual(await f.options("b").readAsset(node.look.examples[1].localUrl), f.blue);
  assert.ok(node.look.gradeColors.length);
  await f.a.shareLooks({ ids: [local.look.id], sharedDirectory: f.shared });
  assert.equal((await f.b.search({ source: "shared" })).total, 1, "Repeated share is idempotent");
  assert.equal((await createLooksLibrary(f.options("a")).sharedState()).directory, f.shared);
  await f.a.configureShared("");
  assert.equal((await f.a.detail(local.look.id)).name, local.look.name);
});

test("direct shared creation, concurrent writers, legacy folder layout and deletion markers interoperate", async t => {
  const f = await fixture(t); await f.a.configureShared(f.shared); await f.b.configureShared(f.shared);
  const draft = { ...f.body, destination: "shared", sharedDirectory: f.shared };
  const [first, second] = await Promise.all([f.a.createCustom(draft), f.b.createCustom({ ...draft, id: `user-look-${randomUUID()}`, name: "Second" })]);
  assert.equal((await f.a.userLibrary()).customCount, 0);
  await mkdir(path.join(f.shared, "looks"));
  await rename(path.join(f.shared, first.look.id), path.join(f.shared, "looks", first.look.id));
  assert.equal((await f.a.search({ source: "shared" })).total, 2);
  const imported = await f.a.importLook({ id: second.look.id, prompt: f.body.prompt });
  await assert.rejects(f.a.removeShared(second.look.id, "/wrong/folder"), { status: 409 });
  await f.b.removeShared(second.look.id, f.shared);
  assert.equal((await f.a.search({ source: "shared" })).total, 1);
  assert.ok(JSON.parse(await readFile(path.join(f.shared, second.look.id, "deleted.json"))).deletedAt);
  assert.deepEqual(await f.options("a").readAsset(imported.look.examples[0].localUrl), f.red);
  assert.equal((await readdir(path.join(f.shared, second.look.id, "images"))).length, 2);
  await assert.rejects(f.b.createCustom({ ...draft, id: second.look.id.replace(/^look-/, "user-look-"), name: "Second" }), /deleted/);
});

test("sharing validates limits and offline folders, preserves conflicts, and never silently truncates", async t => {
  const f = await fixture(t); await f.a.configureShared(f.shared);
  const body = { ...f.body, destination: "shared", sharedDirectory: f.shared };
  await assert.rejects(f.a.createCustom({ ...body, examples: Array(7).fill(f.body.examples[0]) }), /one to six/);
  await assert.rejects(f.a.createCustom({ ...body, prompt: "a".repeat(6001) }), /6,000/);
  assert.equal((await f.a.search({ source: "shared" })).total, 0);
  const first = await f.a.createCustom(body);
  await assert.rejects(f.a.createCustom({ ...body, name: "Conflicting" }), { status: 409 });
  assert.equal((await f.a.detail(first.look.id)).name, f.body.name);
  await assert.rejects(f.a.configureShared("https://files.example/shared"), /mounted folder/);
  const catalog = path.join(f.root, "Catalog"); await mkdir(catalog); await writeFile(path.join(catalog, "catalog.json"), "{}");
  await assert.rejects(f.a.configureShared(catalog), /separate/);
  assert.equal((await f.a.sharedState()).directory, f.shared);
  await rename(f.shared, f.shared + "-offline");
  await assert.rejects(f.a.createCustom({ ...body, id: `user-look-${randomUUID()}` }), /unavailable/);
  assert.equal((await f.a.userLibrary()).customCount, 0);
  await f.a.configureShared("");
});

test("malformed manifests, changed images, symbolic links and unknown versions are rejected", async t => {
  const f = await fixture(t); await f.a.configureShared(f.shared);
  const { look } = await f.a.createCustom({ ...f.body, destination: "shared", sharedDirectory: f.shared });
  const filename = path.join(f.shared, look.id, "look.json"), original = await readFile(filename, "utf8"), record = JSON.parse(original);
  const file = path.join(f.shared, look.id, "images", record.images[0].storedName);
  await writeFile(file, f.blue);
  await assert.rejects(f.a.importLook({ id: look.id, prompt: f.body.prompt }), /incomplete/);
  await rm(file); const outside = path.join(f.root, "outside.png"); await writeFile(outside, f.red); await symlink(outside, file);
  await assert.rejects(f.a.importLook({ id: look.id, prompt: f.body.prompt }), /Unsafe/);
  await rm(file); await writeFile(file, f.red);
  for (const change of [{ version: 2 }, { look: { ...record.look, prompt: "changed" } }, { images: [{ ...record.images[0], storedName: "../../secret" }] }]) {
    await writeFile(filename, JSON.stringify({ ...record, ...change }));
    await assert.rejects(f.a.detail(look.id));
  }
  for (const change of [{ notes: { text: "Invalid" } }, { colours: "Invalid" }, { colours: [null] }, { styleAnalysis: { stylePrompt: {} } }, { styleBlocks: [null] }]) {
    const malformed = { ...record, look: { ...record.look, ...change } };
    malformed.hash = createHash("sha256").update(JSON.stringify({ look: malformed.look, images: malformed.images })).digest("hex");
    await writeFile(filename, JSON.stringify(malformed));
    await assert.rejects(f.a.detail(look.id), { status: 409 });
  }
  await writeFile(filename, original);
  assert.equal((await f.a.detail(look.id)).name, f.body.name);
});

test("shared images retain each supported file format and reject mismatched declared types", async t => {
  const f = await fixture(t), store = createSharedLooks({ directory: path.join(f.root, "formats"), assetDirectory: path.join(f.root, "format-assets") });
  await store.configure(f.shared);
  for (const [format, mimeType] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"], ["avif", "image/avif"]]) {
    const bytes = await sharp(f.red).toFormat(format).toBuffer();
    const metadata = await sharedLookImage(bytes);
    assert.equal(metadata.mimeType, mimeType);
    const look = await store.add({ ...f.body, id: `look-${randomUUID()}` }, [{ bytes, example: { fileName: `reference.${format}` } }], f.shared);
    assert.deepEqual((await store.image(look.id, metadata.storedName, 0)).bytes, bytes);
    const filename = path.join(f.shared, look.id, "look.json"), record = JSON.parse(await readFile(filename, "utf8"));
    record.images[0].mimeType = mimeType === "image/png" ? "image/jpeg" : "image/png";
    record.hash = createHash("sha256").update(JSON.stringify({ look: record.look, images: record.images })).digest("hex");
    await writeFile(filename, JSON.stringify(record));
    await assert.rejects(store.image(look.id, metadata.storedName, 0), /format does not match/);
  }
});

test("shared routes protect origins and return actual images; old backends block sharing", async t => {
  const f = await fixture(t), app = express(); app.use(express.json()); registerLooksRoutes(app, f.options("a"));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post("/api/looks/shared/folder", { directory: f.shared })).status, 200);
  const response = await post("/api/looks/custom", { ...f.body, destination: "shared", sharedDirectory: f.shared });
  const { look } = await response.json(); assert.equal(response.status, 200);
  const image = await fetch(base + look.examples[0].url); assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), f.red);
  assert.equal((await fetch(base + "/api/looks/shared", { headers: { Origin: "https://unrelated.example" } })).status, 403);
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { looksLibrary: true, looksWorkspaceTools: true } }));
  for (const run of [() => looksApi.shared(), () => looksApi.share([], ""), () => looksApi.search({ source: "shared" }), () => looksApi.create({ destination: "shared" })]) await assert.rejects(run(), /Restart.*Shared User Looks/);
  assert.equal(mock.mock.callCount(), 4);
});

test("actual kungfukoi storage reads our files and our reader reads its files", { skip: !process.env.UPSTREAM_LOOKS_ROOT }, async t => {
  const f = await fixture(t);
  const upstream = await import(pathToFileURL(path.join(process.env.UPSTREAM_LOOKS_ROOT, "server/lookbook-storage.js")));
  const peer = upstream.createLookbookStorage({ directory: path.join(f.root, "peer"), cacheDirectory: path.join(f.root, "peer-cache"), readAsset: async url => ({ buffer: url.includes("blue") ? f.blue : f.red }) });
  const peerStyle = await import(pathToFileURL(path.join(process.env.UPSTREAM_LOOKS_ROOT, "src/createLookStyle.js")));
  const blocks = lookStyleBlocks({ medium: f.body.prompt, lighting: "Soft shadows and luminous highlights.", mood: "Quiet visual tension." });
  blocks[0].weight = "absolute"; blocks[1].enabled = false;
  assert.equal(compileLookStyle(blocks), peerStyle.compileLookStyle(blocks), "Both apps compile identical sections and priorities");
  f.body = { ...f.body, prompt: compileLookStyle(blocks), styleBoardVersion: 1, styleBlocks: blocks, notes: "A reusable illustrated treatment.", palette: [{ name: "Reference", hex: "#334455" }] };
  await peer.configure({ directory: "", looksDirectory: f.shared, copyLocal: false });
  await f.a.configureShared(f.shared);
  const own = await f.a.createCustom({ ...f.body, destination: "shared", sharedDirectory: f.shared });
  const fromUs = await peer.get(own.look.id);
  assert.equal(fromUs.prompt, f.body.prompt); assert.equal(fromUs.styleAnalysis.stylePrompt, f.body.prompt);
  assert.deepEqual(fromUs.styleBlocks, blocks); assert.equal(fromUs.colours[0].hex, "#334455"); assert.equal(fromUs.notes, f.body.notes);
  assert.deepEqual(fromUs.examples.map(item => item.fileName), ["red.png", "blue.png"]);
  assert.deepEqual(await readFile(await peer.ensureAsset(fromUs.examples[0].localUrl)), f.red);
  assert.deepEqual(await readFile(await peer.ensureAsset(fromUs.examples[1].localUrl)), f.blue);
  const peerDraft = { ...f.body, id: `look-${randomUUID()}`, sourceProvider: "Newt", styleAnalysis: { stylePrompt: f.body.prompt, fingerprint: "b".repeat(64) },
    styleBlocks: [{ id: "medium", text: "Painted material", enabled: true, weight: "primary" }], colours: [{ hex: "#334455", name: "Reference", percent: 100 }] };
  const other = await peer.add(peerDraft);
  const fromPeer = await f.a.detail(other.id);
  assert.equal(fromPeer.styleBlocks[0].text, "Painted material"); assert.equal(fromPeer.colours[0].hex, "#334455");
  const imported = await f.a.createStyle({ id: other.id, prompt: fromPeer.styleAnalysis.stylePrompt });
  assert.equal(imported.look.prompt, peerDraft.prompt);
  assert.deepEqual(await f.options("a").readAsset(imported.look.examples[1].localUrl), f.blue);
  await peer.remove(own.look.id, { directory: f.shared });
  assert.equal((await f.a.search({ source: "shared" })).total, 1);
  await f.a.removeShared(other.id, f.shared);
  assert.equal((await peer.read()).length, 0);
});
