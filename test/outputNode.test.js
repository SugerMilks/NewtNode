import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeOutputSettings, normalizeOutputData, outputCandidates, outputFileStem, pendingOutputCandidates, mergeOutputReceipts, connectedOutputSources } from "../src/outputNode.js";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { isRunnableNode } from "../src/nodeRunner.js";
import { clearStaleRunningState, resetCopiedNodeRuntime, remapImportedGraph } from "../src/workflowState.js";
import { buildNewtPresetGraph, instantiateNewtPreset } from "../src/myNewt/presets.js";
import { myNewtSettings, validateMyNewtPatch } from "../src/myNewt/contract.js";
import { outputApi } from "../src/api/newtApi.js";

const sources = [
  { url: "/outputs/one.png", fileName: "Client Hero.png", type: "image", label: "Hero", sourceName: "Image Model", selected: false, ready: true },
  { url: "/outputs/two.png", type: "image", sourceName: "Explore", selected: true, ready: true },
  { url: "/outputs/clip.mp4", type: "video", sourceName: "Video Model", selected: true, ready: true },
  { url: "/outputs/music.mp3", type: "audio", sourceName: "Audio Model", selected: true, ready: true }
];

test("Output sits directly before Utility, is manual-only, and defaults to non-destructive copies", () => {
  assert.equal(nodeTypeDefinitions[nodeTypeDefinitions.findIndex(item => item.type === "utility") - 1].type, "output");
  assert.equal(isRunnableNode({ type: "output", data: {} }), false);
  const settings = normalizeOutputSettings();
  assert.equal(settings.autoExport, false);
  assert.equal(settings.collision, "number");
  assert.equal(settings.scope, "selected");
  assert.deepEqual(Object.values(settings.destinations).map(value => value.format), ["original", "original", "original"]);
  settings.destinations.image.path = "/tmp/example";
  assert.equal(normalizeOutputSettings().destinations.image.path, "");
});

test("naming, per-type destinations and batching produce stable receipt keys without changing sources", () => {
  const before = structuredClone(sources);
  const selected = outputCandidates(sources);
  assert.deepEqual(selected.map(item => item.name), ["two", "clip", "music"]);
  assert.equal(outputCandidates(sources, { scope: "all" })[0].name, "Client Hero");
  const numbered = outputCandidates(sources, { nameMode: "project", numbering: true, startNumber: 8, padding: 3 }, "Coffee Ad");
  assert.deepEqual(numbered.map(item => item.name), ["Coffee Ad_008", "Coffee Ad_009", "Coffee Ad_010"]);
  assert.deepEqual(outputCandidates(sources, { nameMode: "source" }).map(item => item.name), ["Explore", "Video Model", "Audio Model"]);
  assert.equal(outputCandidates(sources, { nameMode: "custom", customName: "Delivery" })[0].name, "Delivery");
  assert.deepEqual(outputCandidates([...sources, sources[1]]), selected);
  assert.deepEqual(sources, before);
  const changed = outputCandidates(sources, { destinations: { image: { path: "/tmp/new-location" } } });
  assert.notEqual(changed[0].key, selected[0].key);
  assert.equal(changed[1].key, selected[1].key);
  assert.equal(outputCandidates([{ ...sources[1], ready: false }]).length, 0);
  assert.equal(outputCandidates([{ ...sources[1], type: "model3d" }]).length, 0);
});

test("safe cross-platform names retain user words and remove extensions/path syntax", () => {
  assert.equal(outputFileStem("C:\\folder\\Hero frame.png"), "Hero frame");
  assert.equal(outputFileStem("/tmp/client/test?.mp4"), "test_");
  assert.equal(outputFileStem("CON.mp3"), "_CON");
  assert.equal(outputFileStem("..."), "Output");
  assert.equal(outputFileStem("scene.v2.mov"), "scene.v2");
  assert.equal(outputFileStem("x".repeat(300)).length, 140);
  assert.equal(outputFileStem("scene..png"), "scene");
  assert.ok(Buffer.byteLength(outputFileStem("\u65e5".repeat(200))) <= 140);
});

test("receipt bookkeeping suppresses automatic retries including failed or uncertain attempts", () => {
  const items = outputCandidates(sources);
  let receipts = mergeOutputReceipts([], items.map(item => ({ key: item.key, status: "queued" })));
  assert.deepEqual(pendingOutputCandidates(items, receipts), []);
  for (const status of ["saved", "failed", "uncertain", "skipped", "canceled"]) {
    receipts = mergeOutputReceipts(receipts, [{ key: items[0].key, status }]);
    assert.equal(receipts.length, items.length);
    assert.deepEqual(pendingOutputCandidates(items, receipts), []);
  }
  const fresh = outputCandidates([{ ...sources[1], url: "/outputs/new.png" }]);
  assert.equal(pendingOutputCandidates(fresh, receipts).length, 1);
});

test("save/reopen retains settings, receipts and job ownership; copies and presets cannot resume or auto-write", () => {
  const node = { id: "output", type: "output", x: 100, y: 200, data: normalizeOutputData({
    outputSettings: { autoExport: true, destinations: { image: { path: "/tmp/delivery", format: "jpeg" } } },
    outputJob: { id: "request-id", items: outputCandidates(sources) }, outputReceipts: [{ key: "attempt", status: "queued" }], status: "running"
  }) };
  const reopened = clearStaleRunningState(JSON.parse(JSON.stringify(node)));
  assert.deepEqual(reopened.data.outputJob, node.data.outputJob);
  assert.deepEqual(reopened.data.outputReceipts, node.data.outputReceipts);
  assert.equal(reopened.data.outputSettings.autoExport, true);
  const graph = { nodes: [node], edges: [], groups: [] };
  const copies = [resetCopiedNodeRuntime(node.data), remapImportedGraph(graph).nodes[0].data, buildNewtPresetGraph(graph).nodes[0].data, instantiateNewtPreset(graph).nodes[0].data];
  for (const data of copies) {
    assert.equal(data.outputJob, null);
    assert.equal(data.outputSettings.autoExport, false);
    assert.equal(data.outputSettings.destinations.image.path, "/tmp/delivery");
    assert.deepEqual(data.outputReceipts, []);
  }
  assert.throws(() => validateMyNewtPatch({ ...node, data: { ...node.data, status: "ready" } }, { outputSettings: { autoExport: true } }, myNewtSettings({ allowExisting: true })), /not an editable/);
});

const deps = {
  selectedItem: source => source.chosen || null,
  resultItems: source => source.data.resultItems || [],
  mediaType: source => source.media || "image",
  sourceLabel: source => source.data.title || source.type
};
const connection = source => ({ source, edge: { from: { nodeId: source.id, port: "boardOut" }, to: { nodeId: "output", port: "mediaIn" } } });
test("connected media keeps selected results, all Explore results, and ready-only source state", () => {
  const source = { id: "e", type: "explore", data: { resultItems: sources.slice(0, 2) }, chosen: sources[1] };
  const values = connectedOutputSources([connection(source)], deps);
  assert.deepEqual(outputCandidates(values).map(item => item.url), [sources[1].url]);
  assert.equal(outputCandidates(values, { scope: "all" }).length, 2);
  source.data.status = "running";
  assert.equal(outputCandidates(connectedOutputSources([connection(source)], deps)).length, 0);
  source.data.status = "error";
  assert.equal(outputCandidates(connectedOutputSources([connection(source)], deps)).length, 1, "a failed rerun must not block completed previous files");
});

test("uploaded media retains its original user filename instead of a managed storage ID", () => {
  const chosen = { url: "/uploads/generated-storage-id.png", type: "image" };
  const source = { id: "i", type: "image", data: { fileName: "Client Hero.png", resultItems: [chosen] }, chosen };
  assert.equal(outputCandidates(connectedOutputSources([connection(source)], deps))[0].name, "Client Hero");
});

test("Storyboard selected output is its board; All Results exports individual completed panels", () => {
  const source = { id: "s", type: "storyboard", data: { title: "Coffee", storyboardFrames: [
    { id: "f1", number: 1, resultUrl: "/outputs/frame1.png" }, { id: "f2", number: 2, exportUrl: "/outputs/frame2.png" }, { id: "f3", number: 3 }
  ] }, chosen: { url: "/outputs/board.png", type: "image" } };
  const values = connectedOutputSources([connection(source)], deps);
  assert.deepEqual(outputCandidates(values).map(item => item.url), ["/outputs/board.png"]);
  assert.deepEqual(outputCandidates(values, { scope: "all" }).map(item => item.name), ["Coffee_01", "Coffee_02"]);
});

test("Character bases and stale Editor exports never fall back to general result arrays", () => {
  for (const type of ["character", "editor", "transfer"]) {
    const source = { id: type, type, data: { resultItems: [sources[0]] } };
    assert.deepEqual(connectedOutputSources([connection(source)], deps), []);
    source.chosen = sources[1];
    assert.deepEqual(connectedOutputSources([connection(source)], deps).map(item => item.url), [sources[1].url]);
  }
});

test("Output media port accepts actual media but not prompt, camera, style or 3D", async () => {
  const code = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = code.indexOf("function acceptedInputPortKinds("), end = code.indexOf("\nfunction portsAreCompatible(", start);
  const accepts = new Function("portKindForNodePort", `${code.slice(start, end)}; return acceptedInputPortKinds;`)(() => "preview");
  const kinds = accepts({ type: "output" }, "mediaIn");
  assert.deepEqual(kinds, ["image", "video", "audio", "transfer", "character"]);
  assert.match(code, /manualOnly:.*"output"/);
});

test("export API never replays a filesystem-write POST after an uncertain response", async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Disconnected"); };
  try { await assert.rejects(() => outputApi.export({ requestId: "test" }), /may already have been saved/); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(calls, 1);
});

test("canceling the native folder picker is not an export error or request to save", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ canceled: true }), { status: 499 });
  try { assert.deepEqual(await outputApi.selectFolder({}), { canceled: true, path: "" }); }
  finally { globalThis.fetch = originalFetch; }
});

test("known Output API rejections retain status for safe controller recovery", async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: "Two exports already running" }), { status: 429 }); };
  try { await assert.rejects(() => outputApi.export({}), error => error.status === 429 && /already running/.test(error.message)); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(calls, 1);
});
