import assert from "node:assert/strict";
import test from "node:test";
import { filmDirectorCutLimit } from "../src/filmDirectorLimits.js";

test("Film Director permits one cut per second", () => {
  assert.equal(filmDirectorCutLimit("5"), 5);
  assert.equal(filmDirectorCutLimit("10"), 10);
  assert.equal(filmDirectorCutLimit("15"), 15);
  assert.equal(filmDirectorCutLimit("20"), 20);
});

test("Film Director preserves its 25-shot editor cap", () => {
  assert.equal(filmDirectorCutLimit("30"), 25);
  assert.equal(filmDirectorCutLimit("invalid"), 15);
});
