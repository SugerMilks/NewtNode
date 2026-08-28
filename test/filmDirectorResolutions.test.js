import assert from "node:assert/strict";
import test from "node:test";

import {
  filmDirectorResolutionOptions,
  normalizeFilmDirectorResolution
} from "../src/filmDirectorResolutions.js";

test("Film Director exposes professional video resolution choices", () => {
  assert.deepEqual(filmDirectorResolutionOptions, ["480p", "720p", "1080p", "4K"]);
});

test("Film Director resolution normalization is case-insensitive and stable", () => {
  assert.equal(normalizeFilmDirectorResolution("4k"), "4K");
  assert.equal(normalizeFilmDirectorResolution("1080P"), "1080p");
  assert.equal(normalizeFilmDirectorResolution("unknown", "480p"), "480p");
});
