import assert from "node:assert/strict";
import test from "node:test";

import {
  filmDirectorDurationOptions,
  normalizeFilmDirectorDuration
} from "../src/filmDirectorDurations.js";

test("Film Director offers every whole-second duration from 4 through 30 seconds", () => {
  assert.deepEqual(filmDirectorDurationOptions, [
    "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17",
    "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"
  ]);
});

test("Film Director duration normalization preserves valid intermediate values", () => {
  assert.equal(normalizeFilmDirectorDuration("7 seconds"), "7");
  assert.equal(normalizeFilmDirectorDuration("19", "12"), "19");
  assert.equal(normalizeFilmDirectorDuration("29 seconds"), "29");
  assert.equal(normalizeFilmDirectorDuration("3", "12"), "12");
  assert.equal(normalizeFilmDirectorDuration("invalid"), "15");
});
