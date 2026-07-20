import assert from "node:assert/strict";
import test from "node:test";
import { filmDirectorAdjacentCoverageIssue, filmDirectorShotScaleDistance } from "../src/filmDirectorCoverage.js";

test("Film Director recognizes neighboring and contrasting shot sizes", () => {
  assert.equal(filmDirectorShotScaleDistance("ECU", "CU"), 1);
  assert.equal(filmDirectorShotScaleDistance("ECU", "MS"), 3);
  assert.equal(filmDirectorShotScaleDistance("close-up", "medium shot"), 2);
});

test("single-character coverage favors meaningful adjacent scale changes", () => {
  assert.ok(filmDirectorAdjacentCoverageIssue(
    { shotFrame: "ECU", description: "@Kim reacts." },
    { shotFrame: "CU", description: "@Kim answers." },
    ["@Kim"]
  ));
  assert.equal(filmDirectorAdjacentCoverageIssue(
    { shotFrame: "ECU", description: "@Kim reacts." },
    { shotFrame: "MS", description: "@Kim crosses the room." },
    ["@Kim"]
  ), "");
});

test("multi-character shot-reverse-shot may repeat framing when the subject changes", () => {
  assert.equal(filmDirectorAdjacentCoverageIssue(
    { shotFrame: "CU", description: "@Kim speaks." },
    { shotFrame: "CU", description: "@Steve listens." },
    ["@Kim", "@Steve"]
  ), "");
  assert.ok(filmDirectorAdjacentCoverageIssue(
    { shotFrame: "CU", description: "@Kim speaks." },
    { shotFrame: "CU", description: "@Kim reacts." },
    ["@Kim", "@Steve"]
  ));
});
