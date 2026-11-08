import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clampEditor, createEditorTimeline, editorRange, editorImportMedia } from "../src/editorTimeline.js";

const source = readFileSync(new URL("../src/components/EditorNodeBody.jsx", import.meta.url), "utf8");
function handler(name, next, deps) {
  const start = source.indexOf(`  function ${name}(`), end = source.indexOf(`  function ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return new Function(...Object.keys(deps), `${source.slice(start, end)};return ${name};`)(...Object.values(deps));
}

test("range menu clears both marks through the existing edit path without changing clips", () => {
  const original = { ...editorImportMedia(createEditorTimeline(), { url: "/uploads/clip.mp4", type: "video", duration: 8 }, "clip"), inFrame: 24, outFrame: 100 };
  let result, calls = 0, menu, focused = false;
  const clear = handler("clearRange", "togglePlayback", {
    perform: action => { calls++; result = action(original); }, setContextMenu: value => { menu = value; },
    root: { current: { focus: () => { focused = true; } } }
  });
  clear();
  assert.equal(calls, 1); assert.equal(result.inFrame, 0); assert.equal(result.outFrame, null);
  assert.deepEqual(editorRange(result), { start: 0, end: 192 });
  for (const key of ["clips", "assets", "tracks", "imports"]) assert.deepEqual(result[key], original[key]);
  assert.equal(original.inFrame, 24); assert.equal(original.outFrame, 100);
  assert.equal(menu, null); assert.equal(focused, true);
  assert.match(source, /label="Clear In and Out" onClick=\{clearRange\}/);
  assert.match(source, /role="menuitem" autoFocus onClick=\{clearRange\}/);
});

test("context menus track the pointer in node coordinates and stay inside scaled nodes", () => {
  for (const scale of [0.25, 0.5, 1, 2]) {
    let menu; const calls = [];
    const open = handler("openTimelineMenu", "openTrackMenu", {
      clampEditor, setContextMenu: value => { menu = value; },
      root: { current: { focus() {}, offsetWidth: 720, clientWidth: 720, clientHeight: 600, getBoundingClientRect: () => ({ left: 100, top: 80, width: 720 * scale }) } }
    });
    const event = { clientX: 100 + 200 * scale, clientY: 80 + 120 * scale, preventDefault: () => calls.push("prevent"), stopPropagation: () => calls.push("stop") };
    open(event, { kind: "range" });
    assert.deepEqual(menu, { kind: "range", x: 200, y: 120 }); assert.deepEqual(calls, ["prevent", "stop"]);
    open({ ...event, clientX: 10000, clientY: 10000 }, { kind: "gap", gap: { start: 0, end: 24 } });
    assert.deepEqual(menu, { kind: "gap", gap: { start: 0, end: 24 }, x: 536, y: 552 });
  }
});

test("menu keys do not trigger timeline shortcuts; Escape dismisses without editing or seeking", () => {
  let menu = { kind: "range" }, focused = false;
  const keyDown = handler("keyDown", "handleBodyPointerDown", {
    contextMenu: menu, setContextMenu: value => { menu = value; },
    root: { current: { focus: () => { focused = true; } } }
  });
  for (const key of [" ", "Enter", "Delete", "i", "o", "+"]) {
    const event = { key, target: { closest: selector => selector === ".editor-context-menu" }, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
    keyDown(event);
    assert.equal(event.stopped, true); assert.equal(event.prevented, undefined, "Native menu button activation is preserved");
  }
  const escape = { key: "Escape", target: { closest: selector => selector === ".editor-context-menu" }, stopPropagation() {}, preventDefault() { this.prevented = true; } };
  keyDown(escape); assert.equal(menu, null); assert.equal(focused, true); assert.equal(escape.prevented, true);
});
