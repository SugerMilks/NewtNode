import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arrangeNodesOnGrid, canvasDragAnchor, canvasDragDelta, canvasGridSize, snapCanvasCoordinate } from "../src/nodeGrid.js";
import { estimatedNodeRect, rectsOverlap } from "../src/nodeGeometry.js";
import { canvasSnapToGridEnabled, rememberCanvasSnapToGrid } from "../src/workflowPreferences.js";
import { cloneGraphState } from "../src/workflowState.js";

const node = (id, x, y, type = "plainText", data = {}) => ({ id, type, x, y, data: { text: id, ...data } });
const onGrid = n => Math.abs(n / canvasGridSize - Math.round(n / canvasGridSize)) < .00001;

test("canvas grid rounds positive, fractional and negative scene coordinates", () => {
  for (const [value, expected] of [[13, 0], [15, 28], [42.5, 56], [-15, -28], [-13, 0], [84, 84]]) assert.equal(snapCanvasCoordinate(value), expected);
});

test("disabled snapping and zero-motion clicks leave node positions untouched", () => {
  const anchor = { x: 13.25, y: -70 }, delta = { x: 3.4, y: 19.1 };
  assert.equal(canvasDragDelta(anchor, delta, false), delta);
  assert.deepEqual(canvasDragDelta(anchor, { x: 0, y: 0 }, true), { x: 0, y: 0 });
});

test("enabled dragging snaps the anchor, not each selected node independently", () => {
  const nodes = [node("a", 13, 23), node("b", 521.5, 317.25)], anchor = canvasDragAnchor(nodes);
  const delta = canvasDragDelta(anchor, { x: 37, y: 24 }, true);
  assert.deepEqual(delta, { x: 43, y: 33 });
  const moved = nodes.map(n => ({ ...n, x: n.x + delta.x, y: n.y + delta.y }));
  assert.ok(onGrid(moved[0].x) && onGrid(moved[0].y));
  assert.equal(moved[1].x - moved[0].x, nodes[1].x - nodes[0].x);
  assert.equal(moved[1].y - moved[0].y, nodes[1].y - nodes[0].y);
  assert.deepEqual(canvasDragAnchor([], { x: 1, y: 2 }), { x: 1, y: 2 });
});

test("pan and zoom do not change snapped scene positions", () => {
  const anchor = { x: -101, y: 273 }, start = { x: 240, y: 280 };
  for (const scale of [.18, .53, 1, 2.5]) {
    const pointer = { x: start.x + 83 * scale, y: start.y - 49 * scale };
    const delta = canvasDragDelta(anchor, { x: (pointer.x - start.x) / scale, y: (pointer.y - start.y) / scale }, true);
    assert.deepEqual({ x: anchor.x + delta.x, y: anchor.y + delta.y }, { x: -28, y: 224 });
  }
});

test("grid arrangement requires at least two existing selected nodes", () => {
  const nodes = [node("a", 13, 17)], groups = [];
  for (const selected of [[], ["missing"], ["a"], ["a", "a", "missing"]]) {
    const result = arrangeNodesOnGrid(nodes, selected, { groups });
    assert.equal(result.nodes, nodes); assert.equal(result.groups, groups); assert.equal(result.changed, false);
  }
});

test("mixed node sizes arrange into aligned rows and columns without overlapping", () => {
  const nodes = [node("a", 13, 23), node("b", 111, 35, "skillDirector"), node("c", 27, 444, "editor", { editorNodeWidth: 1600 }), node("d", 129, 451, "character")];
  const before = structuredClone(nodes), result = arrangeNodesOnGrid(nodes, nodes.map(n => n.id));
  assert.ok(result.changed);
  for (const n of result.nodes) assert.ok(onGrid(n.x) && onGrid(n.y));
  assert.equal(result.nodes[0].y, result.nodes[1].y); assert.equal(result.nodes[0].x, result.nodes[2].x);
  assert.equal(result.nodes[1].x, result.nodes[3].x);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) assert.equal(rectsOverlap(estimatedNodeRect(result.nodes[i]), estimatedNodeRect(result.nodes[j])), false);
  assert.deepEqual(nodes, before);
  result.nodes.forEach((n, i) => assert.equal(n.data, nodes[i].data));
  assert.equal(arrangeNodesOnGrid(result.nodes, nodes.map(n => n.id)).changed, false);
});

test("arrangement measures expanded nodes and avoids stationary nodes and groups", () => {
  const nodes = [node("a", 1, 2), node("b", 35, 15), node("stationary", 440, 15)];
  const bounds = new Map([["a", { left: 1, top: 2, right: 981, bottom: 2402 }]]);
  const groups = [{ id: "empty-group", x: 900, y: 0, width: 200, height: 200, nodeIds: [] }];
  const result = arrangeNodesOnGrid(nodes, ["a", "b"], { bounds, groups });
  assert.equal(result.nodes[2], nodes[2]); assert.equal(result.groups[0], groups[0]);
  assert.ok(result.nodes[1].x - result.nodes[0].x >= 980 + 112);
  assert.ok(result.nodes[0].x >= 1100 + 112);
  assert.ok(onGrid(result.nodes[0].x));
});

test("subpixel measurement noise at a grid boundary does not shift a layout column", () => {
  const nodes = [node("a", 0, 0), node("b", 100, 0)];
  const measured = width => new Map([["a", { left: 0, top: 0, right: width, bottom: 206 }]]);
  const first = arrangeNodesOnGrid(nodes, ["a", "b"], { bounds: measured(560 + .00001) });
  assert.equal(first.nodes[1].x, 672);
  assert.equal(arrangeNodesOnGrid(first.nodes, ["a", "b"], { bounds: measured(560 - .00001) }).changed, false);
});

test("collision checks repeat after grid rounding and are deterministic", () => {
  const nodes = [node("a", 1, 2), node("b", 2, 3), node("obstacle1", 2, 3), node("obstacle2", 1150, 2)];
  const first = arrangeNodesOnGrid(nodes, ["a", "b"]);
  assert.deepEqual(arrangeNodesOnGrid(nodes, ["b", "a"]), first);
  for (const moved of first.nodes.slice(0, 2)) for (const obstacle of first.nodes.slice(2)) assert.equal(rectsOverlap(estimatedNodeRect(moved), estimatedNodeRect(obstacle)), false);
  assert.ok(first.nodes.slice(0, 2).every(n => onGrid(n.x) && onGrid(n.y)));
});

test("fully selected groups and nested backdrops move as rigid units", () => {
  const nodes = [node("a", 76, 85), node("b", 524.5, 107), node("c", 1040, 23)];
  const groups = [{ id: "outer", x: 33, y: 12, width: 850, height: 450, nodeIds: ["a", "b"] },
    { id: "inner", x: 60, y: 65, width: 370, height: 300, nodeIds: ["a"] }];
  const result = arrangeNodesOnGrid(nodes, ["a", "b", "c"], { groups });
  const dx = result.nodes[0].x - nodes[0].x, dy = result.nodes[0].y - nodes[0].y;
  assert.equal(result.nodes[1].x - nodes[1].x, dx); assert.equal(result.nodes[1].y - nodes[1].y, dy);
  result.groups.forEach((g, i) => { assert.equal(g.x - groups[i].x, dx); assert.equal(g.y - groups[i].y, dy); assert.equal(g.nodeIds, groups[i].nodeIds); });
  assert.equal(arrangeNodesOnGrid(result.nodes, ["a", "b", "c"], { groups: result.groups }).changed, false);
});

test("a partially selected group never drags its unselected members", () => {
  const nodes = [node("a", 75, 75), node("b", 475, 75), node("c", 1000, 75)];
  const groups = [{ id: "group", x: 30, y: 10, width: 800, height: 350, nodeIds: ["a", "b"] }];
  const result = arrangeNodesOnGrid(nodes, ["a", "c"], { groups });
  assert.equal(result.nodes[1], nodes[1]); assert.equal(result.groups[0], groups[0]);
});

test("snap preference is off by default, persists explicit choices and tolerates unavailable storage", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window"), saved = new Map();
  try {
    globalThis.window = { localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } };
    assert.equal(canvasSnapToGridEnabled(), false);
    rememberCanvasSnapToGrid(true); assert.equal(canvasSnapToGridEnabled(), true);
    rememberCanvasSnapToGrid(false); assert.equal(canvasSnapToGridEnabled(), false);
    globalThis.window = { get localStorage() { throw new Error("Storage blocked"); } };
    assert.equal(canvasSnapToGridEnabled(), false); assert.doesNotThrow(() => rememberCanvasSnapToGrid(true));
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else delete globalThis.window;
  }
});

test("arranged positions are portable while node settings and edge data stay unchanged", () => {
  const graph = { nodes: [node("a", 5, 5), node("b", 35, 75)], groups: [], edges: [{ id: "edge", from: { nodeId: "a", port: "out" }, to: { nodeId: "b", port: "in" } }] };
  const result = arrangeNodesOnGrid(graph.nodes, ["a", "b"]), snapshot = cloneGraphState({ ...graph, nodes: result.nodes });
  assert.deepEqual(snapshot.nodes, result.nodes); assert.deepEqual(snapshot.edges, graph.edges);
});

test("canvas grid UI has pressed state, a multi-selection command, one undo snapshot and Alt bypass", () => {
  const chrome = readFileSync(new URL("../src/components/CanvasChrome.jsx", import.meta.url), "utf8");
  assert.match(chrome, /aria-label="Snap nodes to grid" aria-pressed=\{enabled\}/);
  assert.match(chrome, /aria-label="Arrange selected nodes on grid"/);
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const arrange = editor.slice(editor.indexOf("function arrangeSelectedNodes()"), editor.indexOf("function updateGroup("));
  assert.equal((arrange.match(/pushUndoSnapshot\(\)/g) || []).length, 1);
  assert.equal((editor.match(/snapToGrid && !event.altKey/g) || []).length, 2);
  assert.match(editor, /onArrange=\{arrangeSelectedNodes\}/);
  assert.match(editor, /function handleCanvasWheel\(event\) \{\s+if \(event.target.closest\("\.selection-action-bar"\)\)/);
});

test("canvas snap toggle sits between presets and palette collapse, with keyboard zoom preserved", () => {
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/nodeEditor.css", import.meta.url), "utf8");
  assert.equal((editor.match(/<CanvasSnapToggle\b/g) || []).length, 1);
  assert.doesNotMatch(editor, /zoomReadoutRef|zoom-controls|zoom-readout/);
  assert.doesNotMatch(css, /\.zoom-controls|\.zoom-readout|\.canvas-snap-toggle\.beside-outputs/);
  assert.match(editor, /<PresetWorkflowPicker[^\n]+\/>\s*<CanvasSnapToggle[^\n]+\/>\s*<\/>\}\s*<button className="sidebar-hide"/);
  const toggleRule = css.match(/\.node-toolbar \.canvas-snap-toggle\s*\{([^}]+)\}/)?.[1];
  assert.ok(toggleRule);
  assert.doesNotMatch(toggleRule, /position:\s*absolute|\b(?:top|bottom|right|left):/);
  assert.match(css, /\.node-toolbar \.canvas-snap-toggle\[aria-pressed="true"\]/);
  assert.match(editor, /zoomViewportAtCanvasCenter\(1\.16\)/);
  assert.match(editor, /zoomViewportAtCanvasCenter\(1 \/ 1\.16\)/);
  assert.match(editor, /if \(commandKey && key === "0"\) \{\s*event.preventDefault\(\);\s*resetViewportZoom\(\)/);
});
