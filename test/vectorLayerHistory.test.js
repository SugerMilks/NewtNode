import test from "node:test";
import assert from "node:assert/strict";
import { vectorLayerHistoryShortcut, stepVectorLayerHistory } from "../src/vectorLayerHistory.js";

test("Vector layer history recognizes Mac and Windows undo/redo shortcuts", () => {
  for (const modifier of ["metaKey", "ctrlKey"]) {
    assert.equal(vectorLayerHistoryShortcut({ key: "z", [modifier]: true }), "undo");
    assert.equal(vectorLayerHistoryShortcut({ key: "Z", [modifier]: true, shiftKey: true }), "redo");
    assert.equal(vectorLayerHistoryShortcut({ key: "y", [modifier]: true }), "redo");
  }
  for (const override of [{ altKey: true }, { defaultPrevented: true }, { isComposing: true }, { metaKey: false }, { key: "c" }]) {
    assert.equal(vectorLayerHistoryShortcut({ key: "z", metaKey: true, ...override }), null);
  }
});

test("layer history works from controls but leaves typing undo to text fields", () => {
  const key = target => vectorLayerHistoryShortcut({ key: "z", metaKey: true, target });
  for (const target of [{ tagName: "SELECT" }, { tagName: "BUTTON" }, { tagName: "INPUT", type: "range" }, { tagName: "INPUT", type: "checkbox" }]) assert.equal(key(target), "undo");
  for (const type of ["text", "search", "email", "url", "tel", "number", "password"]) assert.equal(key({ tagName: "INPUT", type }), null);
  assert.equal(key({ isContentEditable: true }), null);
  assert.equal(key({ closest: () => ({}) }), null);
  assert.equal(key({ tagName: "INPUT", type: "text", readOnly: true }), "undo");
});

test("rapid undo and redo stay ordered and cannot insert undefined operations", () => {
  const operations = Array.from({ length: 5 }, (_, index) => ({ type: "rename", key: "a", name: `Name ${index}` }));
  let history = { operations, redo: [] };
  for (let i = 0; i < 12; i++) history = stepVectorLayerHistory(history, "undo");
  assert.deepEqual(history, { operations: [], redo: operations.toReversed() });
  const empty = history; assert.equal(stepVectorLayerHistory(history, "undo"), empty);
  for (let i = 0; i < 12; i++) history = stepVectorLayerHistory(history, "redo");
  assert.deepEqual(history, { operations, redo: [] });
  assert.equal(stepVectorLayerHistory(history, "redo"), history);
  assert.equal(operations.length, 5);
});
