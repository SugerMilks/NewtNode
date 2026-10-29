import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { isRunnableNode } from "../src/nodeRunner.js";
import { resetCopiedNodeRuntime, remapImportedGraph, clearStaleRunningState } from "../src/workflowState.js";
import { buildNewtPresetGraph, instantiateNewtPreset } from "../src/myNewt/presets.js";
import { myNewtFields } from "../src/myNewt/contract.js";
import { estimatedNodeWidth, estimatedNodeHeight, estimatedNodeRect } from "../src/nodeGeometry.js";
import { normalizedResultItems } from "../src/mediaResults.js";

const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
function isolated(name, next, dependencies = {}) {
  const start = editor.indexOf(`function ${name}(`), end = next ? editor.indexOf(`function ${next}(`, start) : editor.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0 && end > start, `${name} exists in the real editor`);
  return Function(...Object.keys(dependencies), `${editor.slice(start, end)};return ${name};`)(...Object.values(dependencies));
}
const vectorConfigText = editor.match(/    vector: (\{.*\}),\n    cameraCoverage:/)?.[1];
assert.ok(vectorConfigText);
const colors = { image: "blue", prompt: "yellow", character: "cyan", transfer: "pink", style: "purple", video: "green", audio: "orange", preview: "gray" };
const vectorConfig = Function("PenTool", "portColors", `return (${vectorConfigText});`)(null, colors);
const config = node => node.type === "vector" ? vectorConfig : {
  plainText: { input: [], output: [{ id: "promptOut", color: colors.prompt }] },
  image: { input: [], output: [{ id: "imageOut", color: colors.image }] },
  video: { input: [], output: [{ id: "videoOut", color: colors.video }] },
  character: { input: [], output: [{ id: "characterOut", color: colors.character }, { id: "voiceOut", color: colors.audio }] },
  transfer: { input: [], output: [{ id: "transferOut", color: colors.transfer }] },
  style: { input: [], output: [{ id: "styleOut", color: colors.style }] },
  preview: { input: [{ id: "sourceIn", color: colors.preview }], output: [] },
  imageModel: { input: [{ id: "imagePromptIn", color: colors.image }], output: [{ id: "imageOut", color: colors.image }] }
}[node.type];
const portKind = (node, id, role) => Object.entries(colors).find(([, value]) => value === config(node)?.[role]?.find(port => port.id === id)?.color)?.[0] || "";
const accepted = isolated("acceptedInputPortKinds", "portsAreCompatible", { portKindForNodePort: portKind });
const compatible = isolated("portsAreCompatible", "getPortCompatibilityError", { portKindForNodePort: portKind, acceptedInputPortKinds: accepted });
const validate = isolated("getConnectionError", "getPortPoint", {
  outputPortIdsForNode: node => (config(node)?.output || []).map(port => port.id),
  inputPortIdsForNode: node => (config(node)?.input || []).map(port => port.id),
  isVideoModelUnsupportedInput: () => false,
  getPortCompatibilityError: (source, from, target, to) => compatible(source, from, target, to) ? "" : "Incompatible media"
});
const savedResult = { type: "image", url: "/outputs/Vector/mark.png", svgUrl: "/outputs/Vector/mark.svg", label: "Mark", width: 1024, height: 1024 };

test("Vector uses existing image media, preserved node menus and manual generation", () => {
  assert.equal(nodeTypeDefinitions.find(item => item.type === "vector")?.label, "Vector Node");
  assert.deepEqual(vectorConfig.input.map(item => item.id), ["promptIn", "imageIn", "transferIn"]);
  assert.deepEqual(vectorConfig.output, [{ id: "imageOut", label: "Selected design", color: colors.image }]);
  assert.equal(isRunnableNode({ type: "vector", data: {} }), false);
  assert.deepEqual(myNewtFields.vector, []);
  assert.match(editor, /manualOnly: \[[^\]]*"vector"/);
  assert.equal(estimatedNodeWidth("vector"), 900);
  assert.equal(estimatedNodeHeight("vector"), 1020);
  assert.deepEqual(estimatedNodeRect({ type: "vector", x: 120, y: 80 }), { left: 120, top: 80, right: 1020, bottom: 1100 });
});

test("real canvas validator accepts text/images and rejects incompatible or locked references", () => {
  const vector = { id: "v", type: "vector", data: {} };
  const connect = (source, port, targetPort) => validate({ nodeId: source.id, port }, { nodeId: vector.id, port: targetPort }, [source, vector]);
  assert.equal(connect({ id: "i", type: "image", data: {} }, "imageOut", "imageIn"), "");
  assert.equal(connect({ id: "t", type: "plainText", data: { text: "Logo" } }, "promptOut", "promptIn"), "");
  assert.match(connect({ id: "m", type: "video", data: {} }, "videoOut", "imageIn"), /Incompatible/);
  assert.match(connect({ id: "c", type: "character", data: {} }, "characterOut", "imageIn"), /Lock/);
  assert.match(connect({ id: "b", type: "transfer", data: {} }, "transferOut", "imageIn"), /Lock/);
  assert.match(connect({ id: "b", type: "transfer", data: {} }, "transferOut", "transferIn"), /Lock/);
  const board = { id: "b", type: "transfer", data: { activated: true, resultUrl: "/outputs/mood.png" } };
  assert.equal(connect(board, "transferOut", "transferIn"), "");
  assert.equal(connect(board, "transferOut", "imageIn"), "", "legacy Mood Board wires remain valid");
  assert.match(connect({ id: "s", type: "style", data: {} }, "styleOut", "transferIn"), /Incompatible/);
  assert.match(connect({ id: "i", type: "image", data: {} }, "imageOut", "transferIn"), /Incompatible/);
  vector.data.vectorMode = "vectorize";
  assert.match(connect(board, "transferOut", "transferIn"), /Text to vector/);
  vector.data.vectorMode = "generate";
  assert.equal(connect({ id: "c", type: "character", data: { locked: true, activated: true } }, "characterOut", "imageIn"), "");
  assert.match(connect({ id: "c", type: "character", data: { locked: true, activated: true } }, "voiceOut", "imageIn"), /Incompatible/);
  assert.equal(validate({ nodeId: "v", port: "imageOut" }, { nodeId: "p", port: "sourceIn" }, [vector, { id: "p", type: "preview", data: {} }]), "");
});

test("Mood Board connections survive saved graph copy and presets with media intact", () => {
  const graph = { nodes: [{ id: "board", type: "transfer", x: 0, y: 0, data: { activated: true, resultUrl: "/outputs/mood.png" } },
    { id: "vector", type: "vector", x: 400, y: 0, data: { resultItems: [savedResult] } }],
    edges: [{ id: "mood-edge", from: { nodeId: "board", port: "transferOut" }, to: { nodeId: "vector", port: "transferIn" }, color: colors.transfer }], groups: [] };
  for (const restored of [remapImportedGraph(JSON.parse(JSON.stringify(graph))), instantiateNewtPreset(buildNewtPresetGraph(graph))]) {
    assert.equal(restored.edges.length, 1);
    assert.equal(restored.edges[0].to.port, "transferIn");
    assert.equal(restored.nodes.find(node => node.id === restored.edges[0].from.nodeId).data.resultUrl, "/outputs/mood.png");
    assert.equal(restored.nodes.find(node => node.id === restored.edges[0].to.nodeId).type, "vector");
  }
});

test("copy, import and presets retain editable SVG assets but never inherit request ownership", () => {
  const data = { title: "Brand Mark", prompt: "Saved brief", resultItems: [savedResult], resultUrl: savedResult.url, vectorJob: { requestId: "paid-intent", status: "running" }, status: "running", error: "Old error" };
  const copy = resetCopiedNodeRuntime(data);
  assert.equal(copy.vectorJob, null); assert.equal(copy.status, "complete"); assert.equal(copy.error, "");
  assert.deepEqual(copy.resultItems, [savedResult]); assert.equal(data.vectorJob.requestId, "paid-intent");
  const graph = { nodes: [{ id: "v", type: "vector", x: 0, y: 0, data }], edges: [], groups: [] };
  const imported = remapImportedGraph(graph, { x: 400 });
  assert.equal(imported.nodes[0].data.vectorJob, null); assert.equal(imported.nodes[0].data.resultItems[0].svgUrl, savedResult.svgUrl);
  const preset = instantiateNewtPreset(buildNewtPresetGraph(graph));
  assert.equal(preset.nodes.length, 1); assert.equal(preset.nodes[0].data.vectorJob, null);
  assert.equal(preset.nodes[0].data.resultItems[0].svgUrl, savedResult.svgUrl);
});

test("real output and Preview helpers retain every SVG variant while selecting a compatible PNG", async () => {
  const { vectorDefaults, normalizeVectorData, removeVectorResult } = await import("../src/ideogramVector.js");
  const second = { ...savedResult, url: "/outputs/Vector/mark2.png", svgUrl: "/outputs/Vector/mark2.svg", label: "Mark 2" };
  const source = { id: "v", type: "vector", data: { ...vectorDefaults(), resultItems: [savedResult, second], resultUrl: second.url, selectedResultIndex: 1 } };
  const edge = { from: { nodeId: "v", port: "imageOut" }, to: { nodeId: "p", port: "sourceIn" } };
  const selected = isolated("connectedOutputItem", "connectedOutputUrl", { normalizeVectorData });
  assert.equal(selected(source, edge).url, second.url); assert.equal(selected(source, edge).svgUrl, second.svgUrl);
  assert.equal(selected(source, { from: { port: "promptOut" } }), null);
  const items = isolated("previewSourceResultItems", "previewSelectionForNode", { normalizeVectorData, normalizedResultItems, isCoverageNode: () => false, connectedOutputItem: selected });
  const sources = isolated("connectedPreviewSources", "previewSourceResultItems", { previewMediaType: () => "image", previewSourceResultItems: items, sourceLabel: () => "Vector" });
  const preview = sources([{ source, edge }])[0];
  assert.deepEqual(preview.items.map(item => item.svgUrl), [savedResult.svgUrl, second.svgUrl]);
  assert.deepEqual(preview.items.map(item => item.label), ["Mark", "Mark 2"]);
  assert.equal(preview.items[1].sourceSelectedResult, true);
  const outputType = isolated("nodeResultMediaType", "buildIncomingByNode"); assert.equal(outputType(source), "image");
  const prompts = isolated("promptPiecesForSource", null); assert.deepEqual(prompts(source), []);
  const normalize = isolated("normalizeCurrentNode", null, { clearStaleRunningState, normalizeVectorData });
  const restored = normalize({ ...source, data: { ...source.data, vectorJob: { requestId: "interrupted", status: "running" }, status: "running" } });
  assert.deepEqual(restored.data.resultItems, normalizeVectorData(source.data).resultItems);
  assert.equal(restored.data.vectorJob.status, "uncertain");
  source.data = { ...source.data, ...removeVectorResult(source.data, second.url) };
  assert.equal(selected(source, edge).url, savedResult.url);
  assert.deepEqual(sources([{ source, edge }])[0].items.map(item => item.url), [savedResult.url]);
  source.data = { ...source.data, ...removeVectorResult(source.data, savedResult.url) };
  assert.equal(selected(source, edge), null);
  assert.deepEqual(sources([{ source, edge }]), [], "no stale output remains in connected previews");
});
