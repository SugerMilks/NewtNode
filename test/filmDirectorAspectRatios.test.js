import assert from "node:assert/strict";
import test from "node:test";

import {
  filmDirectorAspectRatioOptions,
  normalizeFilmDirectorAspectRatio
} from "../src/filmDirectorAspectRatios.js";

test("Film Director exposes professional video aspect ratio choices", () => {
  assert.deepEqual(filmDirectorAspectRatioOptions, ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
});

test("Film Director aspect ratio normalization accepts display labels", () => {
  assert.equal(normalizeFilmDirectorAspectRatio("16:9 (Landscape)"), "16:9");
  assert.equal(normalizeFilmDirectorAspectRatio("9:16 (Portrait)"), "9:16");
  assert.equal(normalizeFilmDirectorAspectRatio("unknown", "1:1"), "1:1");
});
