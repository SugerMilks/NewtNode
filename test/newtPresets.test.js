import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildNewtPresetGraph, instantiateNewtPreset, newtPresetOffset } from "../src/myNewt/presets.js";
import { NewtPresetStore } from "../server/newt-presets.js";
import { estimatedNodeRect, groupToRect, rectsOverlap } from "../src/nodeGeometry.js";

const graph = {
  nodes: [
    { id: "newt", type: "myNewt", x: -600, y: 0, data: { jobId: "live-task" } },
    { id: "image", type: "image", x: 0, y: 100, data: { title: "Source", resultUrl: "/outputs/original.png", locked: true } },
    { id: "model", type: "imageModel", x: 420, y: 120, data: { model: "Nano Banana Pro", quality: "high", prompt: "Test", status: "running", apiKey: "hidden", jobId: "old", resultItems: [{ url: "/outputs/result.png" }], manifest: { sourceNodeId: "image", image: { nodeId: "image" } } } },
    { id: "outside", type: "plainText", x: 900, y: 0, data: { text: "External" } }
  ],
  edges: [
    { id: "edge", from: { nodeId: "image", port: "imageOut" }, to: { nodeId: "model", port: "imageIn" }, color: "blue" },
    { id: "excluded", from: { nodeId: "outside", port: "promptOut" }, to: { nodeId: "model", port: "promptIn" } },
    { id: "agent", from: { nodeId: "image", port: "imageOut" }, to: { nodeId: "newt", port: "imageIn" } }
  ],
  groups: [
    { id: "group", name: "Image setup", nodeIds: ["image", "model"], x: -25, y: 70, width: 860, height: 760 },
    { id: "partial", nodeIds: ["outside", "model"], x: 400, y: -25, width: 900, height: 500 }
  ]
};

test("Newt Presets preserve selected creative data and internal edges, not agent or jobs", () => {
  const original = structuredClone(graph);
  const result = buildNewtPresetGraph(graph, ["newt", "image", "model"], { model: { width: 600, height: 980 } });
  assert.deepEqual(result.nodes.map((node) => node.id), ["image", "model"]);
  assert.equal(result.edges.length, 1); assert.equal(result.groups.length, 1);
  assert.equal(result.nodes[0].data.locked, true);
  assert.equal(result.nodes[1].data.quality, "high");
  assert.equal(result.nodes[1].data.status, "ready");
  assert.equal(result.nodes[1].data.resultItems[0].url, "/outputs/result.png");
  assert.deepEqual(result.nodes[1].presetSize, { width: 600, height: 980 });
  assert.doesNotMatch(JSON.stringify(result), /apiKey|hidden|jobId|live-task/);
  assert.deepEqual(graph, original);
  assert.throws(() => buildNewtPresetGraph(graph, ["newt"]), /creative node/);
});

test("inserting copies remaps all internal IDs and preserves layout, including nested references", () => {
  const saved = buildNewtPresetGraph(graph, ["image", "model"]);
  const first = instantiateNewtPreset(saved, { x: 2000, y: 300 });
  const second = instantiateNewtPreset(saved);
  const [image, model] = first.nodes;
  assert.notEqual(image.id, "image"); assert.notEqual(image.id, second.nodes[0].id);
  assert.equal(first.edges[0].from.nodeId, image.id);
  assert.equal(first.edges[0].to.nodeId, model.id);
  assert.notEqual(first.edges[0].id, second.edges[0].id);
  assert.equal(model.data.manifest.sourceNodeId, image.id);
  assert.equal(model.data.manifest[image.id].nodeId, image.id);
  assert.deepEqual(first.groups[0].nodeIds, first.nodes.map((node) => node.id));
  assert.equal(model.x - image.x, 420);
  assert.equal(model.y - image.y, 20);
  assert.equal(first.groups[0].x, 1975);
  assert.equal(saved.nodes[1].data.manifest.sourceNodeId, "image");
});

test("presets start beyond all current measured nodes and groups, preserving negative coordinates", () => {
  const saved = buildNewtPresetGraph(graph, ["image", "model"]);
  const occupied = [{ left: -400, top: -100, right: 1300, bottom: 1600 }, { left: 500, top: 0, right: 3000, bottom: 600 }];
  const placed = instantiateNewtPreset(saved, newtPresetOffset(saved, occupied));
  for (const rect of [...placed.nodes.map((node) => estimatedNodeRect(node)), ...placed.groups.map(groupToRect)]) {
    for (const obstacle of occupied) assert.equal(rectsOverlap(rect, obstacle), false);
    assert.ok(rect.left >= 3080);
  }
  assert.equal(placed.groups[0].y, -100);
});

test("presets sanitize nested runtime and private state", () => {
  const source = { nodes: [{ id: "board", type: "storyboard", data: {
    status: "planning", storyboardFrames: [{ status: "running", jobId: "old", url: "/outputs/old.png" }],
    nested: JSON.parse('{"authorization":"private","__proto__":{"unsafe":true},"quality":"high"}')
  } }] };
  const copied = buildNewtPresetGraph(source).nodes[0].data;
  assert.equal(copied.status, "ready"); assert.equal(copied.storyboardFrames[0].status, "ready");
  assert.deepEqual(copied.nested, { quality: "high" });
  assert.doesNotMatch(JSON.stringify(copied), /private|unsafe|jobId/);
});

async function storeFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "newt-presets-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "original.png");
  await writeFile(source, "full resolution bytes");
  const collect = (value, result = new Set()) => {
    if (typeof value === "string" && value.startsWith("/outputs/")) result.add(value);
    else if (value && typeof value === "object") Object.values(value).forEach((entry) => collect(entry, result));
    return result;
  };
  const rewrite = (value, urls) => typeof value === "string" ? urls.get(value) || value : Array.isArray(value) ? value.map((entry) => rewrite(entry, urls)) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewrite(entry, urls)])) : value;
  const dependencies = { directory: path.join(root, "presets"), assetsDirectory: path.join(root, "dependencies"), assetsUrl: "/outputs/Newt-Presets/dependencies", resolveAsset: async (url) => ({ filePath: url === "/outputs/original.png" ? source : path.join(root, "missing.png") }), collectAssetUrls: collect, rewriteAssetUrls: rewrite };
  const store = new NewtPresetStore(dependencies);
  return { store, dependencies, source };
}

test("local preset store copies full-resolution media, survives restart and keeps placed assets on delete", async (t) => {
  const { store, dependencies, source } = await storeFixture(t);
  const saved = await store.save({ name: " My workflow ", graph: buildNewtPresetGraph(graph, ["image"]) });
  assert.equal(saved.name, "My workflow");
  const url = saved.graph.nodes[0].data.resultUrl;
  assert.match(url, /^\/outputs\/Newt-Presets\/dependencies\//);
  const file = path.join(dependencies.assetsDirectory, saved.id, "0-original.png");
  assert.equal(await readFile(file, "utf8"), "full resolution bytes");
  await rm(source);
  const reloaded = new NewtPresetStore(dependencies);
  assert.equal((await reloaded.list())[0].nodeCount, 1);
  assert.deepEqual(await reloaded.get(saved.id), saved);
  await reloaded.remove(saved.id);
  assert.deepEqual(await reloaded.list(), []);
  assert.equal(await readFile(file, "utf8"), "full resolution bytes");
  await assert.rejects(reloaded.get(saved.id), /no longer available/);
});

test("preset save failures are atomic and do not leave partially copied assets", async (t) => {
  const { store, dependencies } = await storeFixture(t);
  await assert.rejects(store.save({ name: "Broken", graph: buildNewtPresetGraph(graph, ["image", "model"]) }), /not saved/);
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await readdir(dependencies.assetsDirectory), []);
  await assert.rejects(store.get("../../secrets"), /Invalid/);
  await assert.rejects(store.save({ name: " ", graph }), /Name/);
});

test("concurrent duplicate preset names never overwrite an existing workflow", async (t) => {
  const { store } = await storeFixture(t);
  const savedGraph = buildNewtPresetGraph(graph, ["outside"]);
  const results = await Promise.allSettled([store.save({ name: "Test", graph: savedGraph }), store.save({ name: "test", graph: savedGraph })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /already exists/);
  assert.equal((await store.list()).length, 1);
});
