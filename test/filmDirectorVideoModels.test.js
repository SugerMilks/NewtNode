import assert from "node:assert/strict";
import test from "node:test";

import {
  filmDirectorVideoModelOptions,
  normalizeFilmDirectorVideoModel,
  videoModelSupportsFilmDirector
} from "../src/filmDirectorVideoModels.js";
import { videoModelNames } from "../src/modelOptions.js";

test("Film Director exposes every supported video model", () => {
  assert.deepEqual(filmDirectorVideoModelOptions, [
    videoModelNames.seedance,
    videoModelNames.seedance25,
    videoModelNames.klingO3Pro,
    videoModelNames.klingO34k,
    videoModelNames.minimaxH3
  ]);
  assert.equal(videoModelSupportsFilmDirector("Wan Fun Control"), false);
});

test("Film Director model normalization preserves the connected-model fallback", () => {
  assert.equal(normalizeFilmDirectorVideoModel("Kling O3 Pro"), videoModelNames.klingO3Pro);
  assert.equal(normalizeFilmDirectorVideoModel("", videoModelNames.seedance25), videoModelNames.seedance25);
  assert.equal(normalizeFilmDirectorVideoModel("", "Unsupported"), "");
});
