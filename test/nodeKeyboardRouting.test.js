import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canDeleteCanvasSelection, focusCanvasSelection } from "../src/nodeKeyboardRouting.js";

function element(selector = "", properties = {}) {
  return { closest: (selectors) => selectors.split(", ").includes(selector) ? {} : null, ...properties };
}

function canvasFixture() {
  const ownerDocument = { activeElement: null, querySelector: () => null };
  return {
    ...element(),
    ownerDocument,
    focus(options) {
      assert.deepEqual(options, { preventScroll: true });
      ownerDocument.activeElement = this;
    }
  };
}

test("selection hands keyboard focus from the last input to the canvas without scrolling", () => {
  const canvas = canvasFixture();
  canvas.ownerDocument.activeElement = element("textarea");
  const key = () => ({ key: "Backspace", target: canvas.ownerDocument.activeElement });
  assert.equal(canDeleteCanvasSelection(key(), canvas), false);
  focusCanvasSelection(canvas);
  assert.equal(canvas.ownerDocument.activeElement, canvas);
  assert.equal(canDeleteCanvasSelection(key(), canvas), true);
  assert.doesNotThrow(() => focusCanvasSelection(null));
});

test("Delete and Backspace work from the canvas, node header, or selection toolbar", () => {
  const canvas = canvasFixture();
  for (const key of ["Delete", "Backspace"]) {
    for (const target of [canvas, element(".node-title"), element("button")]) {
      assert.equal(canDeleteCanvasSelection({ key, target }, canvas), true);
    }
  }
});

test("typing and editable controls protect selected nodes and edges equally", () => {
  const canvas = canvasFixture();
  for (const selector of ["input", "textarea", "select", "[role='textbox']", "[role='searchbox']", "[role='combobox']", "[role='spinbutton']"]) {
    for (const key of ["Delete", "Backspace"]) {
      assert.equal(canDeleteCanvasSelection({ key, target: element(selector) }, canvas), false);
    }
  }
  assert.equal(canDeleteCanvasSelection({ key: "Delete", target: element("", { isContentEditable: true }) }, canvas), false);
});

test("modal overlays protect the graph even before a dialog control takes focus", () => {
  const canvas = canvasFixture();
  assert.equal(canDeleteCanvasSelection({ key: "Delete", target: element("[role='dialog']") }, canvas), false);
  canvas.ownerDocument.querySelector = (selector) => {
    assert.equal(selector, "[aria-modal='true']");
    return {};
  };
  assert.equal(canDeleteCanvasSelection({ key: "Delete", target: canvas }, canvas), false);
});

test("consumed keys and text composition never delete canvas selections", () => {
  const canvas = canvasFixture();
  const event = { key: "Delete", target: canvas };
  assert.equal(canDeleteCanvasSelection({ ...event, defaultPrevented: true }, canvas), false);
  assert.equal(canDeleteCanvasSelection({ ...event, isComposing: true }, canvas), false);
  assert.equal(canDeleteCanvasSelection({ ...event, key: "Enter" }, canvas), false);
  assert.equal(canDeleteCanvasSelection(event, null), false);
});

test("all graph selection gestures hand focus to the programmatically focusable canvas", () => {
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  for (const name of ["startGroupDrag", "startNodeDrag", "startSelectionMove", "startCanvasPointerDown", "beginCanvasPan", "selectEdge"]) {
    const start = editor.indexOf(`  function ${name}(`);
    assert.notEqual(start, -1);
    const handler = editor.slice(start, editor.indexOf("\n  function ", start + 1));
    assert.match(handler, /focusCanvasSelection\(canvasRef\.current\)/, name);
  }
  assert.match(editor, /className="node-canvas"\s+tabIndex=\{-1\}/);
  assert.match(editor, /if \(!canDeleteCanvasSelection\(event, canvasRef\.current\)\) return;\s+if \(selectedNodeIds\.length\)/);
});
