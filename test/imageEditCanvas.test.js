import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizedResultItems } from "../src/mediaResults.js";
import { nonOverlappingPosition } from "../src/nodeGeometry.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const body = source.slice(source.indexOf("  async function acceptAiImageEdit("), source.indexOf("  async function applyPreviewLayoutImageEdit("));
function editor(nodes) {
  const nodesRef = { current: nodes }, applied = [], snapshots = [];
  const dependencies = { nodesRef, normalizedResultItems, nonOverlappingPosition,
    pushUndoSnapshot: () => snapshots.push(structuredClone(nodesRef.current)),
    restorePreviewLayoutImageEdit: async (item) => applied.push(item),
    createNodeId: () => "new-image", createNodeData: () => ({}), defaultNodePosition: () => ({ x: 0, y: 0 }),
    occupiedPlacementRects: () => nodesRef.current.map((node) => ({ left: node.x, top: node.y, right: node.x + 380, bottom: node.y + 400 })),
    setNodes: (value) => { nodesRef.current = value; }, setSelectedNodeIds: () => {}, settleNewNodePlacement: async () => {}, setPreviewLightboxItem: () => {}
  };
  const accept = new Function(...Object.keys(dependencies), `${body}; return acceptAiImageEdit;`)(...Object.values(dependencies));
  return { accept, nodesRef, applied, snapshots };
}
const original = { id: "source", type: "image", x: 0, y: 0, data: { resultUrl: "/uploads/original.png" } };
const image = { url: original.data.resultUrl, editContext: { type: "nodeResult", nodeId: "source", itemIndex: 0 } };
const result = { url: "/outputs/edit.png", thumbnailUrl: "/outputs/thumb.jpg", fileName: "edit.png", width: 1200, height: 1800, before: image.url, sourceUrl: image.url };

test("adding an edit creates a separate non-overlapping image with the full-resolution result and undo snapshot", async () => {
  const existing = [structuredClone(original), { id: "neighbor", x: 440, y: 0, data: {} }];
  const state = editor(existing);
  await state.accept(image, result, "copy");
  assert.equal(state.nodesRef.current.length, 3); assert.deepEqual(state.nodesRef.current[0], original);
  const added = state.nodesRef.current[2];
  assert.equal(added.type, "image"); assert.equal(added.data.resultUrl, result.url);
  assert.equal(added.data.resultItems[0].sourceUrl, image.url);
  assert.equal(added.data.resultItems[0].before, undefined);
  assert.equal(state.snapshots[0].length, 2);
  for (const node of existing) assert.ok(added.x >= node.x + 380 || added.x + 380 <= node.x || added.y >= node.y + 400 || added.y + 400 <= node.y);
});

test("applying an edit retains its node context and is undoable", async () => {
  const state = editor([structuredClone(original)]); await state.accept(image, result, "apply");
  assert.equal(state.snapshots.length, 1); assert.equal(state.nodesRef.current.length, 1);
  assert.equal(state.applied[0].url, result.url); assert.deepEqual(state.applied[0].editContext, image.editContext);
});

test("a deleted, changed or generating source cannot be overwritten", async () => {
  for (const nodes of [[], [{ ...original, data: { resultUrl: "/outputs/new.png" } }], [{ ...original, data: { ...original.data, status: "running" } }]]) {
    const state = editor(nodes); await assert.rejects(state.accept(image, result, "apply"), /changed|generating/);
    assert.equal(state.applied.length, 0); assert.equal(state.snapshots.length, 0);
  }
});

test("the image editing API wrapper does not use the generic retrying transport", () => {
  const api = readFileSync(new URL("../src/api/newtApi.js", import.meta.url), "utf8");
  const section = api.slice(api.indexOf("editImage(form)"), api.indexOf("editImage(form)") + 1800);
  assert.match(section, /fetch\(/); assert.doesNotMatch(section, /postNodeJson|postNodeForm/);
});
