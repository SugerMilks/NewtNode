import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editorShuttleKey } from "../src/nodeKeyboardRouting.js";

const target = (match = "", other = {}) => ({ closest: s => s.split(/,\s*/).includes(match) ? {} : null, ...other });
const event = (key, extra = {}) => ({ key, target: target(), preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
test("J/K/L ignore typing, modifiers, key-repeat, modal dialogs and composition", () => {
  for (const key of ["j", "k", "l", "J", "K", "L"]) assert.equal(editorShuttleKey(event(key)), key.toLowerCase());
  for (const key of [" ", "i", "o", "+", "ArrowLeft"]) assert.equal(editorShuttleKey(event(key)), null);
  for (const property of ["defaultPrevented", "isComposing", "repeat", "metaKey", "ctrlKey", "altKey"]) assert.equal(editorShuttleKey(event("l", { [property]: true })), null);
  for (const match of ["input", "textarea", "select", "[contenteditable]", "[role='textbox']", "[role='searchbox']", "[role='combobox']", "[role='spinbutton']", "[role='dialog']", "[aria-modal='true']", ".editor-context-menu"]) {
    assert.equal(editorShuttleKey(event("j", { target: target(match) })), null);
  }
  assert.equal(editorShuttleKey(event("k", { target: target("", { isContentEditable: true }) })), null);
  assert.equal(editorShuttleKey(event("l", { target: target("", { ownerDocument: { querySelector: () => ({}) } }) })), null);
});

test("focused Editor consumes shuttle keys once without altering other timeline shortcuts", () => {
  const source = readFileSync(new URL("../src/components/EditorNodeBody.jsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("  function keyDown(event)"), source.indexOf("  function handleBodyPointerDown(event)"));
  const calls = [], gesture = { current: null }, player = { pause: () => calls.push("pause"), shuttle: dir => calls.push(dir) };
  const route = new Function("editorShuttleKey", "gesture", "player", "contextMenu", `return (${handler});`)(editorShuttleKey, gesture, player, null);
  for (const key of ["j", "k", "l"]) { const e = event(key); route(e); assert.equal(e.defaultPrevented, true); assert.equal(e.stopped, true); }
  assert.deepEqual(calls, [-1, "pause", 1]);
  route(event("l", { target: target("input") }));
  gesture.current = { kind: "clip" }; route(event("j")); assert.equal(calls.length, 3);
});

test("canvas shuttle routing targets only a sole selected Editor and never another node or drag", () => {
  const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = source.indexOf("      const shuttleKey = editorShuttleKey(event);"), end = source.indexOf("      const editorZoomDirection", start);
  assert.ok(start > 0 && end > start);
  const route = new Function("event", "canvasRef", "dragState", "selectedNodeIds", "nodes", "editorShuttleKey", "editorPlayback", source.slice(start, end));
  const canvas = target(), nodes = [{ id: "a", type: "editor" }, { id: "b", type: "editor" }, { id: "text", type: "plainText" }];
  const run = (selected, key = "l", focus = canvas, drag = null) => {
    const calls = [], e = event(key, { target: focus });
    route(e, { current: canvas }, drag, selected, nodes, editorShuttleKey, id => ({ pause: () => calls.push([id, "pause"]), shuttle: dir => calls.push([id, dir]) }));
    return calls;
  };
  assert.deepEqual(run(["a"]), [["a", 1]]); assert.deepEqual(run(["a"], "j"), [["a", -1]]); assert.deepEqual(run(["a"], "k"), [["a", "pause"]]);
  for (const selection of [[], ["text"], ["a", "b"], ["a", "text"], ["missing"]]) assert.deepEqual(run(selection), []);
  assert.deepEqual(run(["a"], "j", target("input")), []); assert.deepEqual(run(["a"], "j", canvas, { type: "nodes" }), []);
});
