import assert from "node:assert/strict";
import test from "node:test";

import {
  canScrollableElementConsumeVerticalWheel,
  shouldStoryboardFrameTextareaConsumeWheel,
  shouldPrioritizeSelectedTextareaWheel
} from "../src/nodeWheelRouting.js";

test("selected textareas keep ordinary vertical wheel gestures", () => {
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaX: 1, deltaY: 24 }), true);
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaY: -18 }), true);
});

test("selected textareas leave horizontal canvas navigation unchanged", () => {
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaX: 24, deltaY: 2 }), false);
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaX: 16, deltaY: 16 }), true);
});

test("selected textareas leave modifier-based canvas gestures unchanged", () => {
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaY: 20, metaKey: true }), false);
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaY: 20, ctrlKey: true }), false);
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaY: 20, altKey: true }), false);
  assert.equal(shouldPrioritizeSelectedTextareaWheel({ deltaY: 20, shiftKey: true }), false);
});

test("scrollable node content consumes vertical wheel movement while it has room", () => {
  assert.equal(canScrollableElementConsumeVerticalWheel({ scrollTop: 40, scrollHeight: 800, clientHeight: 300, deltaY: 20 }), true);
  assert.equal(canScrollableElementConsumeVerticalWheel({ scrollTop: 40, scrollHeight: 800, clientHeight: 300, deltaY: -20 }), true);
});

test("scrollable node content yields at its directional boundary", () => {
  assert.equal(canScrollableElementConsumeVerticalWheel({ scrollTop: 0, scrollHeight: 800, clientHeight: 300, deltaY: -20 }), false);
  assert.equal(canScrollableElementConsumeVerticalWheel({ scrollTop: 500, scrollHeight: 800, clientHeight: 300, deltaY: 20 }), false);
  assert.equal(canScrollableElementConsumeVerticalWheel({ scrollTop: 0, scrollHeight: 300, clientHeight: 300, deltaY: 20 }), false);
});

test("only a selected storyboard frame lets its textarea consume vertical scrolling", () => {
  const scrollableTextarea = { scrollTop: 40, scrollHeight: 800, clientHeight: 300, deltaY: 20 };
  assert.equal(shouldStoryboardFrameTextareaConsumeWheel({ ...scrollableTextarea, frameSelected: false }), false);
  assert.equal(shouldStoryboardFrameTextareaConsumeWheel({ ...scrollableTextarea, frameSelected: true }), true);
});

test("selected storyboard frame textareas still yield horizontal and modifier gestures", () => {
  const scrollableTextarea = { frameSelected: true, scrollTop: 40, scrollHeight: 800, clientHeight: 300 };
  assert.equal(shouldStoryboardFrameTextareaConsumeWheel({ ...scrollableTextarea, deltaX: 30, deltaY: 4 }), false);
  assert.equal(shouldStoryboardFrameTextareaConsumeWheel({ ...scrollableTextarea, deltaY: 20, metaKey: true }), false);
});
