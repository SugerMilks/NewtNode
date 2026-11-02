import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { cameraCoverageDefaults, coverageOutputPatch, isReframeNode, reframeUtilityTransition } from "../src/cameraCoverage.js";
import { nodeTypeDefinitions, nodeMenuEntries } from "../src/nodeRegistry.js";
import { isRunnableNode } from "../src/nodeRunner.js";
import { buildNewtPresetGraph, instantiateNewtPreset } from "../src/myNewt/presets.js";
import { remapImportedGraph } from "../src/workflowState.js";
import { estimatedNodeRect } from "../src/nodeGeometry.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { normalizeEditorGraph, normalizeCurrentNode, createDefaultNodeData, utilityVideoModelSelectionPatch, utilityImageModelSelectionPatch, previewSourceResultItems, connectedPreviewSources, connectedOutputItem, visiblePortIdsForNode, inputPortDefinitionsForNode, outputPortDefinitionsForNode, nodeResultMediaType, connectedText };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const editor = module.exports;
const original = "/outputs/original.png", refined = "/outputs/refined.png";
const legacy = () => ({ id: "reframe", type: "cameraCoverage", x: 123, y: 456, canvasId: "second", data: {
  ...cameraCoverageDefaults(), title: "My angles", model: "Nano Banana Pro", resolution: "4K", masterImage: { url: "/uploads/master.png" }, coverageView: "shot",
  coveragePasses: [{ id: "pass", url: "/outputs/pass.mp4", trajectory: [{ time: 0, azimuth: 0 }] }], coveragePassId: "pass",
  ...coverageOutputPatch([{ id: "shot", label: "Wide", originalUrl: original, versionId: "refined", lensTarget: "18", lensFraming: "camera", versions: [
    { id: "original", url: original, label: "Original", type: "image" }, { id: "refined", url: refined, label: "Refined", type: "image", kind: "refine" }
  ] }], "shot") } });
const fixture = () => ({ nodes: [{ id: "master", type: "image", data: { title: "Master", resultUrl: "/uploads/master.png" } }, legacy(),
  { id: "preview", type: "preview", data: {} }, { id: "output", type: "output", data: {} }], edges: [
  { id: "in", from: { nodeId: "master", port: "imageOut" }, to: { nodeId: "reframe", port: "imageIn" } },
  { id: "preview-edge", from: { nodeId: "reframe", port: "imageOut" }, to: { nodeId: "preview", port: "sourceIn" } },
  { id: "output-edge", from: { nodeId: "reframe", port: "imageOut" }, to: { nodeId: "output", port: "mediaIn" } }
], groups: [] });

test("ReFrame is available only as a Video utility, with unchanged general Utility defaults", () => {
  assert.equal(nodeMenuEntries(nodeTypeDefinitions, {}).some(entry => entry.type === "cameraCoverage"), false);
  const data = editor.createDefaultNodeData("utility", "Utility", 1);
  assert.equal(data.utilityVideoModel, "Wan Fun Control");
  const patch = editor.utilityVideoModelSelectionPatch(data, "ReFrame");
  const node = editor.normalizeCurrentNode({ id: "new", type: "utility", data: { ...data, ...patch } });
  assert.equal(isReframeNode(node), true);
  assert.equal(node.data.utilityMode, "video"); assert.equal(node.data.model, "Nano Banana 2.1");
  assert.equal(node.data.coverageAutoRefine, true); assert.equal(node.data.resultUrl, "");
  assert.equal(editor.nodeResultMediaType(node), "image"); assert.equal(isRunnableNode(node), false);
  assert.equal(isReframeNode({ type: "utility", data: { ...node.data, utilityMode: "image" } }), false);
});

test("legacy projects migrate ports, media, settings, canvas and names without losing pending receipts", () => {
  const graph = fixture(); graph.nodes[1].data.coverageJob = { id: "queued", kind: "pass", status: "queued" };
  const result = editor.normalizeEditorGraph(graph.nodes, graph.edges, graph.groups), node = result.nodes.find(n => n.id === "reframe");
  assert.equal(node.type, "utility"); assert.equal(node.data.utilityVideoModel, "ReFrame");
  assert.equal(node.data.model, "Nano Banana Pro"); assert.equal(node.data.resolution, "4K");
  assert.equal(node.data.title, "My angles"); assert.equal(node.canvasId, "second"); assert.equal(node.x, 123); assert.equal(node.y, 456);
  for (const key of ["coverageShots", "coveragePasses", "coverageJob", "masterImage"]) assert.deepEqual(node.data[key], graph.nodes[1].data[key]);
  assert.equal(node.data.resultUrl, refined); assert.equal(result.edges.length, 3);
  assert.deepEqual(result.edges.map(e => e.from.port), ["imageOut", "utilityOut", "utilityOut"]);
  assert.deepEqual(editor.visiblePortIdsForNode(node), ["imageIn", "utilityOut"]);
  assert.deepEqual(editor.inputPortDefinitionsForNode(node).map(p => p.id), ["imageIn"]);
  assert.equal(editor.outputPortDefinitionsForNode(node)[0].color, "#3d85ff");
  assert.deepEqual(editor.normalizeEditorGraph(result.nodes, result.edges, result.groups), result);
  assert.equal(estimatedNodeRect(node).right - node.x, 780);
});

test("legacy presets retain ReFrame and rewire its outputs before catalog filtering", () => {
  const preset = buildNewtPresetGraph(fixture());
  assert.equal(preset.nodes.find(n => n.id === "reframe").type, "utility");
  assert.equal(preset.edges[1].from.port, "utilityOut");
  const copy = instantiateNewtPreset(preset), node = copy.nodes.find(isReframeNode);
  assert.equal(node.data.resultUrl, refined); assert.equal(copy.edges.length, 3);
  assert.notEqual(node.id, "reframe");
});

test("Utility ReFrame publishes all versions to Preview and the selected refined shot to Output", () => {
  const graph = fixture(), result = editor.normalizeEditorGraph(graph.nodes, graph.edges), node = result.nodes.find(isReframeNode), edge = result.edges[1];
  assert.deepEqual(editor.previewSourceResultItems(node, edge).map(i => i.url), [original, refined]);
  assert.equal(editor.connectedOutputItem(node, result.edges[2]).url, refined);
  const preview = editor.connectedPreviewSources([{ source: node, edge }])[0];
  assert.deepEqual(preview.items.map(i => i.sourceSelectedResult), [false, true]);
  assert.deepEqual(preview.items.map(i => i.label), ["Wide - Original", "Wide - Refined"]);
  assert.equal(editor.connectedText([{ source: node, edge }]), "");
});

test("switching tools restores ReFrame shots and its refinement model, not another tool's model", () => {
  const node = editor.normalizeCurrentNode(legacy());
  const leave = reframeUtilityTransition(node.data, editor.utilityVideoModelSelectionPatch(node.data, "RIFE Video"));
  const other = { ...node.data, ...leave, model: "Wan Fun Control", resolution: "720p" };
  assert.equal(other.resultUrl, ""); assert.equal(other.coverageShots.length, 1);
  const returned = { ...other, ...reframeUtilityTransition(other, { utilityVideoModel: "ReFrame" }) };
  assert.equal(returned.model, "Nano Banana Pro"); assert.equal(returned.resolution, "4K");
  assert.equal(returned.resultUrl, refined); assert.deepEqual(returned.coverageShots, node.data.coverageShots);
  assert.equal(returned.masterImage.url, "/uploads/master.png");
});

test("pending ReFrame work blocks tool switches without blocking ordinary camera edits", () => {
  for (const jobs of [{ coverageJob: { id: "pass", kind: "pass", status: "uncertain" } },
    { coverageShotJobs: [{ id: "refine", shotId: "shot", kind: "refine", status: "running" }] }]) {
    const data = { ...editor.normalizeCurrentNode(legacy()).data, ...jobs };
    assert.equal(reframeUtilityTransition(data, { utilityMode: "image" }), null);
    assert.equal(reframeUtilityTransition(data, { utilityVideoModel: "RIFE Video" }), null);
    assert.deepEqual(reframeUtilityTransition(data, { coverageDuration: 12 }), { coverageDuration: 12 });
    const copy = remapImportedGraph({ nodes: [{ id: "copy", type: "utility", x: 0, y: 0, data }] }).nodes[0];
    assert.equal(copy.data.coverageJob, null); assert.deepEqual(copy.data.coverageShotJobs, []);
    assert.equal(copy.data.resultUrl, refined);
  }
});

test("reopened ReFrame retains only one master-image connection and unrelated Video tools remain runnable", () => {
  const graph = fixture(); graph.nodes.push({ ...graph.nodes[0], id: "another-master" });
  graph.edges.push({ ...graph.edges[0], id: "newer-input", from: { nodeId: "another-master", port: "imageOut" } });
  const result = editor.normalizeEditorGraph(graph.nodes, graph.edges);
  assert.equal(result.edges.filter(e => e.to.nodeId === "reframe").length, 1);
  assert.equal(result.edges.find(e => e.to.nodeId === "reframe").id, "newer-input");
  assert.equal(isRunnableNode({ type: "utility", data: { utilityMode: "video", utilityVideoModel: "Video Outpaint" } }), true);
});
