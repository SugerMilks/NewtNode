import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { editorTimelineZoomDirection, editorShuttleKey } from "../src/nodeKeyboardRouting.js";
import { normalizeEditorZoom, editorZoomStep } from "../src/editorTimeline.js";

function element(match = "", properties = {}) {
  return { closest: selectors => selectors.split(/,\s*/).includes(match) ? {} : null, ...properties };
}
function keyEvent(key, properties = {}) {
  return { key, target: element(), preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties };
}

test("plain plus, equals and minus include shifted plus, repeats and numpad keys", () => {
  for (const [key, direction] of [["+", 1], ["=", 1], ["-", -1]]) {
    assert.equal(editorTimelineZoomDirection(keyEvent(key)), direction);
    assert.equal(editorTimelineZoomDirection(keyEvent(key, { repeat: true })), direction);
  }
  assert.equal(editorTimelineZoomDirection(keyEvent("+", { shiftKey: true })), 1);
  assert.equal(editorTimelineZoomDirection(keyEvent("+", { code: "NumpadAdd" })), 1);
  assert.equal(editorTimelineZoomDirection(keyEvent("-", { code: "NumpadSubtract" })), -1);
  for (const key of ["_", "0", "ArrowUp", " "]) assert.equal(editorTimelineZoomDirection(keyEvent(key)), 0);
});

test("timeline zoom leaves typing, composition, dialogs and modified shortcuts alone", () => {
  for (const property of ["defaultPrevented", "isComposing", "metaKey", "ctrlKey", "altKey"]) {
    assert.equal(editorTimelineZoomDirection(keyEvent("+", { [property]: true })), 0, property);
  }
  for (const match of ["input", "textarea", "select", "[contenteditable]", "[role='textbox']", "[role='combobox']", "[role='spinbutton']", "[role='dialog']", "[aria-modal='true']"]) {
    assert.equal(editorTimelineZoomDirection(keyEvent("-", { target: element(match) })), 0, match);
  }
  assert.equal(editorTimelineZoomDirection(keyEvent("+", { target: element("", { isContentEditable: true }) })), 0);
  assert.equal(editorTimelineZoomDirection(keyEvent("+", { target: element("", { ownerDocument: { querySelector: () => ({}) } }) })), 0);
});

test("keyboard zoom uses icon steps and limits, including old or invalid saved values", () => {
  for (const value of [undefined, null, "", "bad", NaN, Infinity, 0]) assert.equal(normalizeEditorZoom(value), 48);
  assert.equal(normalizeEditorZoom("96"), 96);
  assert.equal(editorZoomStep(48, 1), 48 * 1.4);
  assert.ok(Math.abs(editorZoomStep(editorZoomStep(48, 1), -1) - 48) < 1e-10);
  assert.equal(editorZoomStep(390, 1), 400);
  assert.equal(editorZoomStep(400, 1), 400);
  assert.equal(editorZoomStep(8, -1), 8);
});

test("canvas routing zooms only its sole selected Editor, never another node or an active drag", () => {
  const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = source.indexOf("      const editorZoomDirection = editorTimelineZoomDirection(event);");
  const end = source.indexOf('\n      if (event.key === "Backspace"', start);
  assert.ok(start > 0 && end > start);
  const route = new Function("event", "canvasRef", "dragState", "selectedNodeIds", "nodes", "updateNode", "editorTimelineZoomDirection", "editorZoomStep", source.slice(start, end));
  const canvas = element(), nodes = [{ id: "a", type: "editor", data: { editorZoom: 48 } }, { id: "b", type: "editor", data: { editorZoom: 80 } }, { id: "text", type: "plainText" }];
  const run = (selected, target = canvas, dragState = null) => {
    const calls = [], event = keyEvent("+", { target });
    route(event, { current: canvas }, dragState, selected, nodes, (...args) => calls.push(args), editorTimelineZoomDirection, editorZoomStep);
    return { calls, event };
  };
  const accepted = run(["a"]);
  assert.deepEqual(accepted.calls, [["a", { editorZoom: 48 * 1.4 }]]);
  assert.equal(accepted.event.defaultPrevented, true);
  for (const selected of [[], ["text"], ["a", "b"], ["a", "text"], ["missing"]]) assert.deepEqual(run(selected).calls, []);
  assert.deepEqual(run(["a"], element("button")).calls, []);
  assert.deepEqual(run(["a"], canvas, { type: "nodes" }).calls, []);
});

test("focused timeline consumes zoom once, while fields and active editing gestures do not zoom", () => {
  const source = readFileSync(new URL("../src/components/EditorNodeBody.jsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("  function keyDown(event)"), source.indexOf("  function handleBodyPointerDown(event)"));
  const zooms = [], gesture = { current: null };
  const route = new Function("editorTimelineZoomDirection", "editorZoomStep", "zoom", "gesture", "changeZoom", "contextMenu", "editorShuttleKey", `return (${handler});`)(editorTimelineZoomDirection, editorZoomStep, 48, gesture, value => zooms.push(value), null, editorShuttleKey);
  const event = keyEvent("+"); route(event);
  assert.deepEqual(zooms, [48 * 1.4]); assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true);
  route(keyEvent("-", { target: element("input") }));
  gesture.current = { kind: "clip" }; route(keyEvent("-"));
  assert.equal(zooms.length, 1);
  assert.match(source, /const zoom = normalizeEditorZoom\(node\.data\.editorZoom\)/);
  assert.match(source, /label="Zoom out timeline \(-\)"/);
  assert.match(source, /label="Zoom in timeline \(\+ \/ =\)"/);
});
