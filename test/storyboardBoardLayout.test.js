import test from "node:test";
import assert from "node:assert/strict";

import { storyboardBoardGridForAspect, storyboardBoardSheetLayout } from "../src/storyboardBoardLayout.js";

test("compiled storyboard boards use the same aspect-aware grids as PDF exports", () => {
  assert.deepEqual(storyboardBoardGridForAspect("16:9"), {
    cols: 3,
    rows: 2,
    gapX: 18,
    rowGap: 18,
    captionHeight: 72
  });
  assert.equal(storyboardBoardGridForAspect("21:9").cols, 2);
  assert.equal(storyboardBoardGridForAspect("9:16").cols, 4);
  assert.equal(storyboardBoardGridForAspect("1:1").cols, 4);
});

test("one PDF page of frames produces a matching 16:9 storyboard sheet", () => {
  for (const [aspectRatio, frameCount] of [["16:9", 6], ["21:9", 4], ["9:16", 4], ["1:1", 8]]) {
    const layout = storyboardBoardSheetLayout({ aspectRatio, frameCount });
    assert.equal(layout.width, 1152);
    assert.ok(Math.abs(layout.height - 648) < 0.001, `${aspectRatio} should retain the PDF page ratio`);
  }
});

test("additional compiled storyboard rows extend one continuous image without changing panel geometry", () => {
  const firstPage = storyboardBoardSheetLayout({ aspectRatio: "16:9", frameCount: 6 });
  const extended = storyboardBoardSheetLayout({ aspectRatio: "16:9", frameCount: 12 });

  assert.equal(firstPage.panelWidth, extended.panelWidth);
  assert.equal(firstPage.panelHeight, extended.panelHeight);
  assert.equal(extended.rows, 4);
  assert.ok(extended.height > firstPage.height);
});
