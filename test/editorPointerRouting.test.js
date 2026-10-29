import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/EditorNodeBody.jsx", import.meta.url), "utf8");
const handler = source.slice(source.indexOf("  function handleBodyPointerDown("), source.indexOf("  function beginScrub("));
assert.ok(handler.trim().startsWith("function handleBodyPointerDown("));

// Exercise the component's actual event handler without mounting a playback engine.
function pointerDown({ closest = "", scrollbar = false, button = 0 } = {}) {
  const result = { stopped: false, prevented: false, menuClosed: false };
  const target = { closest: selectors => selectors.split(",").includes(closest) ? {} : null };
  const route = new Function("scroller", "setGapMenu", `return (${handler});`)(
    { current: scrollbar ? target : {} }, () => { result.menuClosed = true; }
  );
  route({ target, button, stopPropagation: () => { result.stopped = true; }, preventDefault: () => { result.prevented = true; } });
  return result;
}

test("unused Editor body surfaces bubble to canvas selection/drag without stealing keyboard focus", () => {
  for (const closest of ["", ".editor-transport", ".editor-toolbar", ".editor-timecode", "output", ".editor-track-head", "strong", ".editor-bottom-bar", ".editor-selection-info", ".editor-monitor", "canvas", ".editor-error"]) {
    assert.deepEqual(pointerDown({ closest }), { stopped: false, prevented: true, menuClosed: true }, closest);
  }
  assert.match(source, /onPointerDown=\{handleBodyPointerDown\}/);
  assert.doesNotMatch(handler, /\.focus\(/);
});

test("controls, their labels and timeline interaction surfaces never start a node drag", () => {
  for (const closest of ["input", "textarea", "select", "button", "a", "label", "[contenteditable]", ".editor-ruler", ".editor-track-lane", ".editor-gap-menu", ".editor-scrollbar"]) {
    assert.deepEqual(pointerDown({ closest }), { stopped: true, prevented: false, menuClosed: closest !== ".editor-gap-menu" }, closest);
  }
  assert.deepEqual(pointerDown({ scrollbar: true }), { stopped: true, prevented: false, menuClosed: true });
});

test("non-primary clicks preserve the Editor's existing context-menu and selection behavior", () => {
  for (const button of [1, 2]) assert.deepEqual(pointerDown({ button }), { stopped: true, prevented: false, menuClosed: true });
});

test("read-only timecode and inline monitor opt into dragging without changing Preview monitors", () => {
  assert.match(source, /<div className="editor-timecode"><span>Timecode<\/span><output aria-label="Timeline timecode">/);
  assert.match(source, /<EditorMonitor nodeId=\{node\.id\} timeline=\{timeline\} allowNodeDrag \/>/);
  const monitor = readFileSync(new URL("../src/components/EditorMonitor.jsx", import.meta.url), "utf8");
  assert.match(monitor, /allowNodeDrag = false/);
  assert.match(monitor, /if \(!allowNodeDrag\) event\.stopPropagation\(\)/);
});
