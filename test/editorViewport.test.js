import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { editorZoomScrollLeft, editorScrollbarGeometry, editorTrackHeaderWidth } from "../src/editorViewport.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.00001, `${a} should equal ${b}`);
const bounds = { viewportWidth: 948, scrollWidth: 4948 };

test("zoom keeps the visible playhead at the same pixel, including scrolled views and every FPS", () => {
  for (const fps of [24, 25, 30, 60]) for (const scrollLeft of [0, 280, 480]) {
    const frame = 10 * fps, previousZoom = 48, zoom = 48 * 1.4;
    const before = frame / fps * previousZoom - scrollLeft;
    const after = editorZoomScrollLeft({ ...bounds, frame, fps, previousZoom, zoom, scrollLeft });
    close(frame / fps * zoom - after, before);
    close(editorZoomScrollLeft({ ...bounds, frame, fps, previousZoom: zoom, zoom: previousZoom, scrollLeft: after }), scrollLeft);
  }
});

test("zoom recovers offscreen playheads in the usable area, excluding sticky track headers", () => {
  for (const scrollLeft of [0, 2400]) {
    const next = editorZoomScrollLeft({ ...bounds, frame: 30 * 24, fps: 24, previousZoom: 48, zoom: 96, scrollLeft });
    close(30 * 96 - next, (bounds.viewportWidth - editorTrackHeaderWidth) / 2);
  }
});

test("zoom respects sequence start, new right edge and no-overflow bounds", () => {
  const input = { frame: 0, fps: 24, previousZoom: 96, zoom: 48, scrollLeft: 500, ...bounds };
  assert.equal(editorZoomScrollLeft(input), 0);
  assert.equal(editorZoomScrollLeft({ ...input, frame: 24 * 100, scrollWidth: 1500 }), 552);
  assert.equal(editorZoomScrollLeft({ ...input, frame: 24 * 100, scrollWidth: 500 }), 0);
  // The caller supplies the pre-zoom scroll offset even if the browser has clamped the new DOM.
  close(editorZoomScrollLeft({ frame: 24 * 8, fps: 24, previousZoom: 400, zoom: 200,
    scrollLeft: 2800, viewportWidth: 948, scrollWidth: 2548 }), 1200);
});

test("scrollbar proportions describe the timeline, not the frozen track header", () => {
  const geometry = editorScrollbarGeometry({ viewportWidth: 948, scrollWidth: 1748, scrollLeft: 400, trackWidth: 800 });
  assert.deepEqual(geometry, { maxScroll: 800, thumbWidth: 400, travel: 400, left: 200 });
});

test("scrollbar thumb stays reachable on long timelines, narrow nodes and at both ends", () => {
  const input = { viewportWidth: 390, scrollWidth: 500000, scrollLeft: 0, trackWidth: 230 };
  assert.equal(editorScrollbarGeometry(input).thumbWidth, 32);
  assert.equal(editorScrollbarGeometry(input).left, 0);
  const end = editorScrollbarGeometry({ ...input, scrollLeft: 500000 });
  assert.equal(end.left + end.thumbWidth, input.trackWidth);
  assert.equal(editorScrollbarGeometry({ ...input, trackWidth: 20 }).thumbWidth, 20);
  assert.deepEqual(editorScrollbarGeometry({ viewportWidth: 1100, scrollWidth: 1100, scrollLeft: 0, trackWidth: 920 }),
    { maxScroll: 0, thumbWidth: 920, travel: 0, left: 0 });
});

test("the always-visible scrollbar lives outside vertical tracks, and Fit remains a start-aligned view", () => {
  const source = readFileSync(new URL("../src/components/EditorNodeBody.jsx", import.meta.url), "utf8");
  assert.match(source, /<\/div>\s*<EditorTimelineScrollbar viewport=\{viewport\} scrollTo=\{scrollTo\} controls=\{scrollId\} \/>/);
  assert.match(source, /prepareFit\(next\); changeZoom\(next\)/);
  assert.match(source, /useEditorTimelineViewport\(\{ scroller, zoom, fps: timeline.fps, frame: transport.frame, contentEnd: end \}\)/);
});
