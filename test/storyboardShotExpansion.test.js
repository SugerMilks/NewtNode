import test from "node:test";
import assert from "node:assert/strict";

import {
  storyboardDirectorCuts,
  storyboardDirectorExpansionInstruction,
  storyboardDirectorFramePlan,
  storyboardKeyframeCountForCut
} from "../src/storyboardShotExpansion.js";

test("parses Film Director CUT sections without merging neighboring shots", () => {
  const cuts = storyboardDirectorCuts(`CUT 1 — WS:
A child enters the field.

CUT 2 — CU:
The child ties a shoe.`);

  assert.equal(cuts.length, 2);
  assert.match(cuts[0].text, /enters the field/);
  assert.doesNotMatch(cuts[0].text, /ties a shoe/);
  assert.match(cuts[1].text, /ties a shoe/);
});

test("keeps a simple static shot to one storyboard frame", () => {
  assert.equal(
    storyboardKeyframeCountForCut("CUT 1 — shot frame: MS; camera movement: Static: A child waits by the goal."),
    1
  );
});

test("expands a continuous multi-stage camera move into at least three frames", () => {
  const cut = "CUT 1 — A kid plays soccer, then the camera rises to a bird's-eye view of the entire field, then moves above the clouds.";
  assert.equal(storyboardKeyframeCountForCut(cut), 3);
});

test("director frame plans may contain more frames than cuts", () => {
  const plan = storyboardDirectorFramePlan(`CUT 1 — Static CU of the child.
CUT 2 — The camera tracks the child, then rises to an overhead view, then continues above the clouds.`);

  assert.equal(plan.cutCount, 2);
  assert.equal(plan.cuts[0].frameCount, 1);
  assert.equal(plan.cuts[1].frameCount, 3);
  assert.equal(plan.frameCount, 4);
});

test("expansion instructions preserve CUTS while requesting internal keyframes", () => {
  const instruction = storyboardDirectorExpansionInstruction("CUT 1 — The camera moves from field level to a bird's-eye view.");
  assert.match(instruction, /A CUT is one continuous shot, not necessarily one storyboard frame/);
  assert.match(instruction, /CUT 1: 2 storyboard frames/);
  assert.match(instruction, /CUT 1 · opening/);
});
