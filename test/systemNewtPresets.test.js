import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NewtPresetStore } from "../server/newt-presets.js";
import { registerNewtPresetRoutes } from "../server/routes/newtPresets.js";
import { instantiateNewtPreset, newtPresetDisplayName } from "../src/myNewt/presets.js";
import { myNewtLocalAction } from "../src/myNewt/localActions.js";
import { myNewtSnapshot } from "../src/myNewt/contract.js";
import { newtPresetsApi } from "../src/api/newtApi.js";

const id = "4267ddd9-2217-45cc-8ee8-a37f6222fef4";
const assetsUrl = "/outputs/Newt-Presets/dependencies";
const collect = (value, urls = new Set()) => {
  if (typeof value === "string" && value.startsWith("/outputs/")) urls.add(value);
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collect(item, urls));
  return urls;
};
const userGraph = { nodes: [{ id: "text", type: "plainText", x: 0, y: 0, data: { text: "Editable copy" } }], edges: [], groups: [] };
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "system-newt-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const systemDirectory = path.join(root, "system");
  const dependencies = { directory: path.join(root, "user"), systemDirectory, assetsDirectory: path.join(root, "media"), assetsUrl,
    collectAssetUrls: collect, rewriteAssetUrls: (value) => value, resolveAsset: () => { throw new Error("Unexpected media upload"); } };
  await mkdir(path.join(systemDirectory, "assets"), { recursive: true });
  await mkdir(dependencies.directory);
  const bytes = Buffer.from("original full-resolution image bytes");
  const file = `assets/${createHash("sha256").update(bytes).digest("hex")}.png`;
  const url = `${assetsUrl}/${id}/0-original%20image.png`;
  const preset = { id, name: "Original workflow", version: 2, graph: { nodes: [{ id: "image", type: "image", x: 100, y: 50, data: { resultUrl: url } }], edges: [], groups: [] } };
  const manifest = { version: 1, presets: [{ id, assets: [{ url, file }] }] };
  await writeFile(path.join(systemDirectory, file), bytes);
  await writeFile(path.join(systemDirectory, `${id}.json`), JSON.stringify(preset));
  await writeFile(path.join(systemDirectory, "manifest.json"), JSON.stringify(manifest));
  return { dependencies, store: new NewtPresetStore(dependencies), preset, bytes, file, manifest };
}

test("system presets override legacy personal copies and reject deletion without touching either file", async (t) => {
  const { dependencies, store, preset } = await fixture(t);
  const legacy = { ...preset, name: "Legacy copy", isSystem: false };
  const legacyFile = path.join(dependencies.directory, `${id}.json`);
  await writeFile(legacyFile, JSON.stringify(legacy));
  assert.deepEqual((await store.list()).map((item) => [item.name, item.isSystem]), [[preset.name, true]]);
  await assert.rejects(store.remove(id), { status: 403 });
  assert.deepEqual(JSON.parse(await readFile(legacyFile)), legacy);
  assert.deepEqual((await store.get(id)).graph, preset.graph);
  assert.equal((await new NewtPresetStore(dependencies).list())[0].isSystem, true);
});

test("system insertion restores missing full-resolution media without changing graph or existing media", async (t) => {
  const { dependencies, store, preset, bytes } = await fixture(t);
  const result = await store.get(id);
  assert.equal(result.isSystem, true);
  assert.deepEqual(result.graph, preset.graph);
  const media = path.join(dependencies.assetsDirectory, id, "0-original image.png");
  assert.deepEqual(await readFile(media), bytes);
  const copy = instantiateNewtPreset(result.graph);
  assert.notEqual(copy.nodes[0].id, preset.graph.nodes[0].id);
  copy.nodes[0].data.title = "Changed copy";
  assert.equal((await store.get(id)).graph.nodes[0].data.title, undefined);
  await writeFile(media, "existing project media");
  await store.get(id);
  assert.equal(await readFile(media, "utf8"), "existing project media");
  await rm(media);
  await new NewtPresetStore(dependencies).get(id);
  assert.deepEqual(await readFile(media), bytes);
});

test("new user presets stay removable and cannot spoof system identity or replace a system name", async (t) => {
  const { dependencies, store, preset } = await fixture(t);
  await assert.rejects(store.save({ name: preset.name.toUpperCase(), graph: userGraph }), /already exists/);
  const saved = await store.save({ id, name: "My variant", isSystem: true, graph: userGraph });
  assert.notEqual(saved.id, id);
  assert.equal(saved.isSystem, false);
  // Even a manually edited personal file cannot grant itself built-in status.
  await writeFile(path.join(dependencies.directory, `${saved.id}.json`), JSON.stringify({ ...saved, isSystem: true }));
  assert.equal((await store.get(saved.id)).isSystem, false);
  assert.equal((await store.list()).find((item) => item.id === saved.id).isSystem, false);
  await new NewtPresetStore(dependencies).remove(saved.id);
  assert.equal((await store.list()).length, 1);
});

test("missing or malformed built-in definitions fail closed and missing media reports an error", async (t) => {
  const { dependencies, store, file } = await fixture(t);
  await rm(path.join(dependencies.systemDirectory, file));
  await assert.rejects(store.get(id), /Could not restore/);
  await assert.rejects(store.remove(id), { status: 403 });
  await writeFile(path.join(dependencies.systemDirectory, `${id}.json`), "invalid JSON");
  await assert.rejects(store.remove(id), { status: 503 });
  await assert.rejects(store.list(), /library could not be loaded/);
  await rm(path.join(dependencies.systemDirectory, "manifest.json"));
  await assert.rejects(store.remove(id), { status: 503 });
});

test("bundled media paths cannot escape the preset or bundle directories", async (t) => {
  const { dependencies, store, manifest } = await fixture(t);
  for (const asset of [
    { ...manifest.presets[0].assets[0], file: "../outside.png" },
    { ...manifest.presets[0].assets[0], url: `${assetsUrl}/${id}/..%2Foutside.png` }
  ]) {
    await writeFile(path.join(dependencies.systemDirectory, "manifest.json"), JSON.stringify({ version: 1, presets: [{ id, assets: [asset] }] }));
    await assert.rejects(store.get(id), { status: 503 });
  }
});

test("preset DELETE route returns 403 for system presets and still deletes user presets", async (t) => {
  const { dependencies } = await fixture(t);
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "delete"].map((method) => [method, (url, handler) => routes.set(`${method} ${url}`, handler)]));
  const store = registerNewtPresetRoutes(app, dependencies);
  const invoke = async (id) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await routes.get("delete /api/newt-presets/:id")({ params: { id } }, res);
    return res;
  };
  const protectedResult = await invoke(id);
  assert.equal(protectedResult.code, 403);
  assert.match(protectedResult.body.error, /permanent/);
  const saved = await store.save({ name: "New user workflow", graph: userGraph });
  assert.equal((await invoke(saved.id)).code, 200);
  await assert.rejects(store.get(saved.id), /no longer available/);
});

test("all six shipped workflows are available on fresh installations with complete media", async (t) => {
  const { dependencies } = await fixture(t);
  const systemDirectory = fileURLToPath(new URL("../server/system-newt-presets/", import.meta.url));
  const store = new NewtPresetStore({ ...dependencies, systemDirectory });
  const items = await store.list();
  assert.deepEqual(items.map((item) => item.name), ["Cinematic Location", "Cinematic Prop", "Edit Image", "Headshot Image", "Standard Workflow", "Style Transfer"]);
  assert.ok(items.every((item) => item.isSystem));
  const manifest = JSON.parse(await readFile(path.join(systemDirectory, "manifest.json")));
  for (const entry of manifest.presets) {
    const original = JSON.parse(await readFile(path.join(systemDirectory, `${entry.id}.json`)));
    const result = await store.get(entry.id);
    assert.deepEqual(result.graph, original.graph);
    for (const asset of entry.assets) {
      const restored = await readFile(path.join(dependencies.assetsDirectory, entry.id, decodeURIComponent(asset.url.split("/").at(-1))));
      assert.equal(createHash("sha256").update(restored).digest("hex"), path.basename(asset.file).split(".")[0]);
    }
  }
});

test("preset labels and free commands retain origin without changing stored names", () => {
  const presets = [{ id, name: "Standard Workflow", isSystem: true }, { id: "user", name: "My workflow", isSystem: false }];
  assert.equal(newtPresetDisplayName(presets[0]), "Standard Workflow (System)");
  assert.equal(newtPresetDisplayName(presets[1]), "My workflow (User)");
  const snapshot = myNewtSnapshot({ presets });
  assert.equal(snapshot.presets[0].isSystem, true);
  for (const name of ["Standard Workflow", "Standard Workflow (System)"]) {
    assert.equal(myNewtLocalAction(`Insert preset "${name}"`, snapshot).action.payload.presetId, id);
  }
  assert.match(myNewtLocalAction("List presets", snapshot).summary, /Standard Workflow \(System\), My workflow \(User\)/);
});

test("old backends cannot expose an unprotected library or receive DELETE from the new UI", async (t) => {
  const original = globalThis.fetch, calls = [];
  t.after(() => { globalThis.fetch = original; });
  let current = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method });
    return new Response(JSON.stringify(String(url).endsWith("/api/health") ? { routes: { systemNewtPresets: current } } : []), { headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(newtPresetsApi.list(), /Restart/);
  await assert.rejects(newtPresetsApi.remove(id), /Restart/);
  assert.ok(calls.every((call) => call.url.endsWith("/api/health")));
  current = true;
  assert.deepEqual(await newtPresetsApi.list(), []);
  await newtPresetsApi.remove("user");
  assert.equal(calls.at(-1).method, "DELETE");
});
