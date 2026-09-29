import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createConnectionHarness } from "./helpers/connectionHarness.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const draftEdge = { from: { nodeId: "source", port: "imageOut" }, color: "#3d85ff", x: 0, y: 0 };
const event = () => ({ clientX: 600, clientY: 300, preventDefault() {}, stopPropagation() {} });
function harness({ to, hit = true, ...options } = {}) {
  return createConnectionHarness(source, {
    draftEdge,
    document: { elementFromPoint: () => hit ? { closest: () => to ? { dataset: to } : null } : null },
    ...options
  });
}

test("dropping a wire on empty canvas, non-input surfaces or outside the viewport clears it without a menu or graph edits", () => {
  for (const hit of [true, false]) {
    const edges = [{ id: "existing" }];
    const h = harness({ hit, edges });
    h.finishConnection(event());
    assert.equal(h.state.draftEdge, null);
    assert.equal(h.state.menu, null);
    assert.strictEqual(h.state.edges, edges);
    assert.equal(h.state.undoCount, 0);
    assert.equal(h.state.stopCount, 1);
  }
});

test("compatible inputs still connect once with the source color and an undo snapshot", () => {
  const h = harness({ to: { nodeId: "target", portId: "imageIn" } });
  h.finishConnection(event());
  assert.equal(h.state.edges.length, 1);
  assert.deepEqual(h.state.edges[0].from, draftEdge.from);
  assert.deepEqual(h.state.edges[0].to, { nodeId: "target", port: "imageIn" });
  assert.equal(h.state.edges[0].color, draftEdge.color);
  assert.equal(h.state.undoCount, 1);
  assert.equal(h.state.draftEdge, null);
  assert.equal(h.state.menu, null);
  h.finishConnection(event());
  assert.equal(h.state.edges.length, 1);
  assert.equal(h.state.undoCount, 1);
});

test("invalid and self connections cancel without changing existing edges", () => {
  for (const nodeId of ["source", "target"]) {
    const h = harness({ to: { nodeId, portId: "audioIn" }, getConnectionError: () => "Incompatible input" });
    h.finishConnection(event());
    assert.equal(h.state.edges.length, 0);
    assert.equal(h.state.undoCount, 0);
    assert.equal(h.state.draftEdge, null);
    assert.equal(h.state.menu, null);
    assert.equal(h.state.status, nodeId === "target" ? "Incompatible input" : "");
  }
});

test("single-input replacement and output invalidation remain intact", () => {
  const existing = { id: "old", from: { nodeId: "other", port: "imageOut" }, to: { nodeId: "target", port: "imageIn" } };
  const h = harness({ to: { nodeId: "target", portId: "imageIn" }, nodes: [{ id: "target", type: "autoAspect" }], edges: [existing] });
  h.finishConnection(event());
  assert.equal(h.state.edges.length, 1);
  assert.deepEqual(h.state.edges[0].from, draftEdge.from);
  assert.deepEqual(h.state.patches, [{ id: "target", patch: { resultUrl: "" } }]);
});

test("ordinary canvas releases and marquee completion do not open the picker", () => {
  for (const dragState of [null, { type: "pan" }, { type: "marquee" }]) {
    const h = harness({ draftEdge: null, dragState });
    h.finishConnection(event());
    assert.equal(h.state.menu, null);
    assert.equal(h.state.edges.length, 0);
    assert.equal(h.state.undoCount, 0);
    assert.equal(h.state.dragState, null);
  }
});

test("only the explicit canvas context menu opens the picker, never a click inside a node", () => {
  for (const insideNode of [false, true]) {
    const h = harness({ draftEdge: null });
    h.openContextMenu({ ...event(), target: { closest: () => insideNode ? {} : null } });
    assert.deepEqual(h.state.menu, insideNode ? null : { x: 600, y: 300 });
  }
  assert.doesNotMatch(source, /pendingConnection|keepDraftEdge|compatibleInputPortForNewNode|preferredAutoInputPorts|autoConnectionOutputKind/);
  assert.match(source, /onContextMenu=\{openCanvasContextMenu\}/);
  assert.match(source, /addNode\(item\.type, contextMenu\.scene\)/);
});
