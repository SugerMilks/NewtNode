import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCameraCoverageData, coverageOutputPatch, cameraCoverageDefaults, selectCoverageVersion, applyCoverageVersion } from "../src/cameraCoverage.js";
import { normalizedResultItems } from "../src/mediaResults.js";
import { isRunnableNode } from "../src/nodeRunner.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
function isolated(name, next, dependencies = {}) {
  const body = source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
  return Function(...Object.keys(dependencies), `${body};return ${name};`)(...Object.values(dependencies));
}
const shot = (id, name, url) => ({ id, label: name, originalUrl: url, versionId: "original", versions: [{ id: "original", url, type: "image" }] });
test("real canvas selected output and Preview collection preserve distinct shot names and images", () => {
  const node = { id: "camera", type: "cameraCoverage", data: { ...cameraCoverageDefaults(), ...coverageOutputPatch([
    shot("a", "Wide master", "/outputs/wide.png"), shot("b", "OTS candidate", "/outputs/ots.png")], "b") } };
  const edge = { from: { nodeId: "camera", port: "imageOut" }, to: { nodeId: "preview", port: "sourceIn" } };
  const selected = isolated("connectedOutputItem", "connectedOutputUrl", { normalizeCameraCoverageData });
  assert.equal(selected(node, edge).url, "/outputs/ots.png"); assert.equal(selected(node, edge).label, "OTS candidate");
  assert.equal(selected(node, { from: { port: "videoOut" } }), null);
  const resultItems = isolated("previewSourceResultItems", "previewSelectionForNode", { normalizedResultItems,
    isCoverageNode: () => false, connectedOutputItem: selected, normalizeCameraCoverageData });
  assert.equal(resultItems(node, edge).length, 2);
  const previews = isolated("connectedPreviewSources", "previewSourceResultItems", { previewMediaType: () => "image", previewSourceResultItems: resultItems, sourceLabel: () => "ReFrame", normalizeCameraCoverageData });
  const preview = previews([{ source: node, edge }])[0];
  assert.deepEqual(preview.items.map(i => i.label), ["Wide master", "OTS candidate"]);
  assert.equal(preview.items[1].sourceSelectedResult, true);
  assert.equal(preview.sourceNodeType, "cameraCoverage");
  const updates = [];
  const selectPreview = isolated("selectPreviewItem", "startPreviewThumbDrag", { previewSource: preview, previewItems: preview.items,
    node: { id: "preview" }, incoming: { sourceIn: [{ source: node, edge }] }, normalizeCameraCoverageData, selectCoverageVersion, onUpdate: (id, patch) => updates.push({ id, patch }) });
  selectPreview(0);
  assert.equal(updates[0].patch.coverageShotId, "a");
  assert.equal(normalizeCameraCoverageData({ ...node.data, ...updates[0].patch }).resultUrl, "/outputs/wide.png");
  node.data = { ...node.data, ...applyCoverageVersion(node.data, "b", { id: "refined", label: "Refined", kind: "refine", url: "/outputs/refined.png" }) };
  const expanded = previews([{ source: node, edge }])[0];
  assert.equal(expanded.items.length, 3);
  assert.deepEqual(expanded.items.map(item => item.sourceSelectedResult), [false, false, true]);
  const chooseOriginal = isolated("selectPreviewItem", "startPreviewThumbDrag", { previewSource: expanded, previewItems: expanded.items,
    node: { id: "preview" }, incoming: { sourceIn: [{ source: node, edge }] }, normalizeCameraCoverageData, selectCoverageVersion, onUpdate: (id, patch) => updates.push({ id, patch }) });
  chooseOriginal(1);
  const patch = updates.at(-2).patch;
  assert.equal(patch.coverageShots[1].versionId, "original");
  assert.equal(normalizeCameraCoverageData({ ...node.data, ...patch }).resultUrl, "/outputs/ots.png");
});
test("ReFrame is manual, image-typed and never leaks fidelity prompts", () => {
  const node = { type: "cameraCoverage", data: cameraCoverageDefaults() };
  assert.equal(isRunnableNode(node), false);
  const mediaType = isolated("nodeResultMediaType", "buildIncomingByNode"); assert.equal(mediaType(node), "image");
  assert.match(source, /if \(source.type === "cameraCoverage"\) return \[\];/);
  assert.match(source, /manualOnly: \[[^\]]*"cameraCoverage"/);
  assert.match(source, /replacesSingleCoverageInput = .*cameraCoverage/);
});
