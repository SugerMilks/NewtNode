import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeProjectCanvases, canvasGraph, replaceCanvasGraph, snapshotCanvases, projectGraphForStorage, copyCanvasGraph, transferCanvasNodes, nodeIsWorking, canvasTabDropTarget } from "../src/projectCanvases.js";
import { workflowStateFingerprint } from "../src/workflowState.js";
import { buildWorkflowDocument } from "../src/workflowFiles.js";
import { buildProjectOutputItems } from "../src/projectOutputs.js";
import { workflowApi } from "../src/api/newtApi.js";

const node = (id, canvasId, data = {}) => ({ id, canvasId, type: "image", x: 50, y: 60, data });
const wire = (id, from, to) => ({ id, from: { nodeId: from, port: "imageOut" }, to: { nodeId: to, port: "sourceIn" } });
const fixture = () => normalizeProjectCanvases({
  nodes: [node("a", "one", { resultUrl: "/uploads/source.png" }), node("b", "one"), node("c", "two", { resultUrl: "/outputs/other.png" })],
  edges: [wire("ab", "a", "b")], groups: [{ id: "g", nodeIds: ["a", "b"], canvasId: "one", x: 0, y: 0 }],
  canvases: [{ id: "one", name: "Design", viewport: { x: 40, y: 50, scale: 0.7 } }, { id: "two", name: "Animation", viewport: { x: -200, y: 100, scale: 1.2 } }], activeCanvasId: "two"
});

test("tab drops choose insertion slots after removing the dragged tab", () => {
  const rects = [{ id: 'a', left: 10, right: 70 }, { id: 'b', left: 74, right: 204 }, { id: 'c', left: 208, right: 300 }];
  assert.deepEqual(canvasTabDropTarget(rects, 'c', 0), { index: 0, markerX: 8 });
  assert.deepEqual(canvasTabDropTarget(rects, 'c', 90), { index: 1, markerX: 72 });
  assert.deepEqual(canvasTabDropTarget(rects, 'a', 160), { index: 1, markerX: 206 });
  assert.deepEqual(canvasTabDropTarget(rects, 'a', 400), { index: 2, markerX: 302 });
  assert.equal(canvasTabDropTarget(rects, 'b', 80).index, 1);
  const scrolled = rects.map(rect => ({ ...rect, left: rect.left - 120.5, right: rect.right - 120.5 }));
  assert.deepEqual(canvasTabDropTarget(scrolled, 'c', -30.5), { index: 1, markerX: -48.5 });
  assert.deepEqual(rects.map(rect => rect.id), ['a', 'b', 'c']);
});

test("tab drops ignore foreign drags, missing sources, invalid pointers and single tabs", () => {
  const rects = [{ id: 'a', left: 0, right: 100 }];
  assert.equal(canvasTabDropTarget(rects, 'a', 10), null);
  assert.equal(canvasTabDropTarget(rects, 'other', 10), null);
  assert.equal(canvasTabDropTarget([], 'a', 10), null);
  assert.equal(canvasTabDropTarget(rects, 'a', NaN), null);
});

test("legacy projects migrate without losing nodes, connections, groups, or view", () => {
  const source = { nodes: [node("a"), node("b")], edges: [wire("ab", "a", "b")], groups: [{ id: "g", nodeIds: ["a", "b"] }], viewport: { x: 70, y: 80, scale: 0.5 } };
  const graph = normalizeProjectCanvases(source);
  assert.equal(graph.canvases.length, 1); assert.equal(graph.activeCanvasId, "canvas-1");
  assert.equal(graph.nodes.length, 2); assert.deepEqual(graph.edges, source.edges);
  assert.deepEqual(graph.groups[0].nodeIds, source.groups[0].nodeIds); assert.deepEqual(graph.viewport, source.viewport);
  assert.deepEqual(graph.nodes.map(n => n.canvasId), ["canvas-1", "canvas-1"]);
  assert.equal(source.nodes[0].canvasId, undefined);
});

test("empty canvases and each viewport survive document/storage round trips", () => {
  const graph = fixture(); graph.canvases.push({ id: "empty", name: "Delivery", viewport: { x: 0, y: 0, scale: 1 } });
  const document = buildWorkflowDocument({ ...graph, name: "Project", id: "test" });
  assert.equal(document.version, 2);
  const stored = projectGraphForStorage(JSON.parse(JSON.stringify(document.graph)));
  assert.deepEqual(stored, graph);
  assert.deepEqual(canvasGraph(stored, "empty"), { nodes: [], edges: [], groups: [] });
  assert.equal(stored.nodes[2].data.resultUrl, "/outputs/other.png");
});

test("invalid owners recover their own canvas and never produce cross-canvas wires", () => {
  const graph = fixture(); graph.nodes.push(node("d", "orphan")); graph.edges.push(wire("bad", "a", "c"), wire("missing", "gone", "a"));
  const recovered = normalizeProjectCanvases(graph);
  assert.equal(recovered.nodes.length, 4); assert.ok(recovered.canvases.some(c => c.id === "orphan"));
  assert.deepEqual(recovered.edges.map(e => e.id), ["ab"]);
});

test("canvas names, order, and ownership mark dirty; switching and viewports do not", () => {
  const graph = fixture(), before = workflowStateFingerprint(graph);
  assert.equal(workflowStateFingerprint({ ...graph, activeCanvasId: "one", viewport: { x: 40, y: 50, scale: 0.7 }, canvases: snapshotCanvases(graph.canvases, "one", { x: 4, y: 5, scale: 0.8 }) }), before);
  assert.notEqual(workflowStateFingerprint({ ...graph, canvases: [...graph.canvases].reverse() }), before);
  assert.notEqual(workflowStateFingerprint({ ...graph, canvases: graph.canvases.map(c => ({ ...c, name: c.name + " renamed" })) }), before);
});

test("duplicate and import remap wires and groups without colliding or reusing jobs", () => {
  const graph = fixture(); graph.nodes[0].data.vectorJob = { requestId: "old" };
  const first = copyCanvasGraph(graph, "one", "copy1"), second = copyCanvasGraph(graph, "one", "copy2");
  assert.equal(first.nodes.length, 2); assert.equal(first.nodes[0].canvasId, "copy1");
  assert.equal(first.nodes[0].data.vectorJob, null);
  assert.equal(first.nodes[0].data.resultUrl, "/uploads/source.png");
  assert.equal(first.edges[0].from.nodeId, first.nodes[0].id);
  assert.deepEqual(first.groups[0].nodeIds, first.nodes.map(n => n.id));
  assert.notEqual(first.edges[0].id, second.edges[0].id); assert.notEqual(first.groups[0].id, second.groups[0].id);
});

test("moving a selection detaches crossing wires but preserves internal connections and files", () => {
  const graph = fixture(); const moved = transferCanvasNodes(graph, ["a"], "two");
  assert.equal(moved.nodes.length, 3); assert.equal(moved.nodes.find(n => n.id === "a").canvasId, "two");
  assert.equal(moved.edges.length, 0); assert.deepEqual(moved.groups[0].nodeIds, ["b"]);
  const both = transferCanvasNodes(graph, ["a", "b"], "two");
  assert.deepEqual(both.edges, graph.edges); assert.equal(both.groups[0].canvasId, "two");
  assert.equal(graph.nodes[0].canvasId, "one");
});

test("copying selections preserves the source and isolates the new graph", () => {
  const graph = fixture(), copied = transferCanvasNodes(graph, ["a", "b"], "two", true);
  assert.equal(copied.nodes.length, 5); assert.equal(copied.edges.length, 2);
  assert.equal(copied.groups.length, 2); assert.equal(copied.nodes[0].canvasId, "one");
  assert.equal(copied.selectedNodeIds.length, 2);
});

test("canvas undo cannot erase a background generation completed on another canvas", () => {
  const graph = fixture(), snapshot = canvasGraph(graph, "one");
  graph.nodes.find(n => n.id === "c").data.resultUrl = "/outputs/just-finished.png";
  graph.nodes.push(node("new", "one"));
  const restored = replaceCanvasGraph(graph, "one", snapshot);
  assert.equal(restored.nodes.length, 3); assert.equal(restored.nodes.find(n => n.id === "c").data.resultUrl, "/outputs/just-finished.png");
});

test("busy protection includes per-frame, refinement, export, and agent jobs", () => {
  for (const data of [{ status: "generating" }, { storyboardFrames: [{ status: "running" }] }, { coverageShotJobs: [{ status: "submitting" }] }, { outputJob: { status: "queued" } }, { editorExportJob: { id: "j" } }, { myNewtSummary: { status: "running" } }]) {
    assert.equal(nodeIsWorking(node("a", "one", data)), true);
    const graph = fixture(); graph.nodes[0].data = data;
    assert.throws(() => transferCanvasNodes(graph, ["a"], "two"), /Finish/);
  }
  assert.equal(nodeIsWorking(node("a", "one", { status: "complete" })), false);
});

test("project assets include uploads on request and canvas history matches node identity", () => {
  const graph = fixture(), args = { nodes: graph.nodes, getNodeResultMediaType: () => "image" };
  assert.equal(buildProjectOutputItems(args).length, 1);
  assert.equal(buildProjectOutputItems({ ...args, includeInputs: true }).length, 2);
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.match(editor, /node\.id === item\.node\?\.id/);
  assert.match(editor, /hidden=\{node\.canvasId !== activeCanvasId\}/);
  assert.match(editor, /getGraph: \(\) => \(\{ \.\.\.newtCanvasGraph\(\)/);
});

test("old servers reject a multi-canvas save before any write request", async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options = {}) => { calls.push([url, options.method]); return new Response(JSON.stringify({ routes: {} }), { status: 200 }); };
  try { await assert.rejects(workflowApi.save({ canvases: fixture().canvases }), /Restart/); assert.equal(calls.length, 1); assert.match(calls[0][0], /health/); }
  finally { globalThis.fetch = original; }
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(server, /existing\?\.version >= 2 && !Array\.isArray\(req\.body\.canvases\)/);
});
