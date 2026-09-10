import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyboardPlanIssues, storyboardQcUnavailable, requireStoryboardPlanResponse } from "../src/storyboardPlanValidation.js";

const shotList = "CUT 1 - The child plays soccer, then the camera rises to a bird's eye view of the entire field, then ascends above the clouds.\nCUT 2 - Static close-up of the coach.";
const frame = (number, cut, prompt = `Distinct visual state ${number}`) => ({ number, notes: `CUT ${cut} - keyframe`, prompt });
const frames = () => [frame(1, 1, "Child playing soccer on the field."), frame(2, 1, "Entire soccer field directly below."), frame(3, 1, "Clouds below camera; field far beneath."), frame(4, 2, "Coach close-up on sideline.")];

test("a complex Director shot maps to multiple contiguous frames without inventing edits", () => {
  assert.deepEqual(storyboardPlanIssues({ frames: frames() }, shotList), []);
});

test("plans cannot drop, interleave, reorder or invent Director CUTS", () => {
  for (const invalid of [
    [frame(1, 1), frame(2, 2)],
    [frame(1, 2), frame(2, 1), frame(3, 1), frame(4, 1)],
    [frame(1, 1), frame(2, 2), frame(3, 1), frame(4, 1)],
    [...frames(), frame(5, 3)], frames().slice(0, 3)
  ]) assert.ok(storyboardPlanIssues({ frames: invalid }, shotList).length);
});

test("frame validation catches duplicate prompts, missing notes, numbering and empty plans", () => {
  assert.ok(storyboardPlanIssues({ frames: [] }).length);
  assert.ok(storyboardPlanIssues({ frames: [frame(2, 1)] }).length);
  assert.ok(storyboardPlanIssues({ frames: [frame(1, 1, "Same"), frame(2, 1, " SAME ")] }).length);
  assert.ok(storyboardPlanIssues({ frames: frames().map((item) => ({ ...item, notes: "" })) }, shotList).length);
});

test("a failed planner response never supplies fallback frames for replacing current work", () => {
  const current = { frames: frames() }, before = structuredClone(current);
  assert.throws(() => requireStoryboardPlanResponse({ ok: false }, { error: "Provider unavailable", plan: { frames: [frame(1, 1, "Generic fallback")] } }), /Provider unavailable/);
  assert.deepEqual(current, before);
  assert.throws(() => requireStoryboardPlanResponse({ ok: true }, { plan: { frames: [] } }), /preserved/);
  assert.equal(requireStoryboardPlanResponse({ ok: true }, { plan: current }), current);
});

test("unavailable visual QC is neither a pass nor permission for another paid generation", () => {
  const qc = storyboardQcUnavailable("Provider unavailable");
  assert.equal(qc.pass, false);
  assert.equal(qc.shouldRetry, false);
  assert.equal(qc.severity, "unreviewed");
  assert.equal(qc.summary, "Provider unavailable");
});

test("the real editor planning failure path preserves frames, image URLs, analysis and selection", async () => {
  const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const planning = source.slice(source.indexOf("  async function planStoryboardNode("), source.indexOf("  async function generateStoryboardFrame("));
  const node = { id: "board", data: { storyboardFrames: [{ id: "frame", resultUrl: "/outputs/full.png", prompt: "User-edited prompt" }], selectedFrameId: "frame", storyboardAnalysis: "Existing analysis", title: "Board" } };
  const before = structuredClone(node.data);
  const deps = {
    nodesRef: { current: [node] }, edgesRef: { current: [] },
    buildIncomingByNode: () => ({}), expandStoryboardDirectorIncoming: () => ({}),
    storyboardSceneDescriptionForNode: () => "The scene", connectedDirectorPackageSource: () => null,
    storyboardFrameCountForNode: () => 3, assertCharacterOutputReferences: () => {},
    updateNode: (_id, patch) => Object.assign(node.data, patch), workflowRequestContext: () => ({}),
    storyboardCharacterSummariesForNode: () => [], storyboardSceneReferenceSummaries: () => [], storyboardPropReferenceSummaries: () => [],
    nodeApi: { planStoryboard: async () => ({ response: { ok: false }, data: { error: "Provider unavailable", plan: { frames: [frame(1, 1, "Old server fallback")] } } }) },
    requireStoryboardPlanResponse,
    storyboardFramesFromPlan: () => assert.fail("Do not normalize fallback data"),
    pushUndoSnapshot: () => assert.fail("Do not create an undo step for a failed plan"),
    updateStoryboardNodeFrames: () => assert.fail("Do not replace user frames")
  };
  const run = new Function(...Object.keys(deps), `${planning}; return planStoryboardNode;`)(...Object.values(deps));
  assert.equal(await run(node), null);
  assert.equal(node.data.status, "error");
  assert.equal(node.data.error, "Provider unavailable");
  for (const [key, value] of Object.entries(before)) assert.deepEqual(node.data[key], value);
});
