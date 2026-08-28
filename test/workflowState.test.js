import test from "node:test";
import assert from "node:assert/strict";
import {
  clearStaleRunningState,
  dedupeEdges,
  remapImportedGraph,
  workflowStateFingerprint
} from "../src/workflowState.js";

test("workflowStateFingerprint ignores viewport changes", () => {
  const base = {
    nodes: [{ id: "a", type: "image", x: 0, y: 0, data: { title: "Image" } }],
    edges: [],
    groups: [],
    projectName: "Project",
    projectPackagePath: "",
    viewport: { x: 0, y: 0, scale: 1 }
  };
  assert.equal(workflowStateFingerprint(base), workflowStateFingerprint({ ...base, viewport: { x: 100, y: -20, scale: 1.5 } }));
});

test("remapImportedGraph remaps node, edge, and group ids with an offset", () => {
  const graph = {
    nodes: [
      { id: "a", type: "image", x: 10, y: 20, data: { title: "A" } },
      { id: "b", type: "video", x: 30, y: 40, data: { title: "B" } }
    ],
    edges: [{ id: "edge-1", from: { nodeId: "a", port: "imageOut" }, to: { nodeId: "b", port: "videoIn" }, color: "#fff" }],
    groups: [{ id: "group-1", x: 0, y: 0, width: 100, height: 100, nodeIds: ["a", "b"] }]
  };

  const remapped = remapImportedGraph(graph, { x: 100, y: 200 }, 123);
  assert.match(remapped.nodes[0].id, /^image-/);
  assert.notEqual(remapped.nodes[0].id, "a");
  assert.equal(remapped.nodes[0].x, 110);
  assert.equal(remapped.nodes[1].y, 240);
  assert.equal(remapped.edges[0].from.nodeId, remapped.nodes[0].id);
  assert.equal(remapped.edges[0].to.nodeId, remapped.nodes[1].id);
  assert.deepEqual(remapped.groups[0].nodeIds, remapped.nodes.map((node) => node.id));
});

test("dedupeEdges and clearStaleRunningState preserve load-safe graph state", () => {
  const edge = { id: "a", from: { nodeId: "n1", port: "out" }, to: { nodeId: "n2", port: "in" } };
  assert.equal(dedupeEdges([edge, { ...edge, id: "b" }]).length, 1);
  assert.deepEqual(clearStaleRunningState({ id: "n", data: { status: "running", resultUrl: "" } }).data.status, "ready");
  assert.deepEqual(clearStaleRunningState({ id: "n", data: { status: "running", resultUrl: "/outputs/a.png" } }).data.status, "complete");
  assert.deepEqual(
    clearStaleRunningState({ id: "character", type: "character", data: { status: "compiling", characterBatchProgress: { completed: 1, total: 2 } } }).data,
    { status: "ready", characterBatchProgress: null }
  );
});
