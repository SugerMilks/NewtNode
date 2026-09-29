import test from "node:test";
import assert from "node:assert/strict";
import { storyboardSpatialPlanIssues, storyboardSpatialPrompt } from "../src/storyboardSpatial.js";
import { storyboardCastRepairTargets, applyStoryboardCastRepair, storyboardFrameDirection, storyboardFrameContext, validateStoryboardRevision } from "../src/storyboardWorkflow.js";
import { storyboardPlannedCastPatch, resolveStoryboardFrameCast, currentStoryboardCast } from "../src/storyboardCast.js";
import { registerStoryboardRoutes } from "../server/routes/storyboard.js";
import { validateCreativeResponse } from "../server/creative-llm.js";

const characters = ["Woman", "Man", "Waiter"].map(tag => ({ tag, name: tag, label: `${tag} sheet`, url: `/outputs/${tag}.png` }));
const seats = [{ tag: "Woman", place: "table-west-seat" }, { tag: "Man", place: "table-east-seat" }];
const cast = (tag, visibility = "visible") => ({ tag, visibility, position: tag === "Woman" ? "screen-left midground" : "screen-right midground", action: "Seated, listening", eyeline: "Toward the other speaker" });
function frame(number, patch = {}) {
  return { id: `f${number}`, number, shotId: `s${number}`, phase: "single", purpose: "Conversation beat", prompt: `Moment ${number}: @Woman and @Man sit across the table.`, beat: "The conversation continues", notes: "", shot: "MS", lens: "35mm", angle: "None", durationSeconds: 3,
    stateBefore: "Both seated", stateAfter: "Both still seated", cameraSide: "South of the conversation axis", cast: [cast("Woman"), cast("Man")],
    spatial: { spaceId: "cafe-continuous", cameraSetupId: "table-master", view: "From south, both occupied seats and the full table width stay within the frame.", visiblePlaces: seats.map(person => person.place), present: structuredClone(seats), hidden: [], blockingChange: "" }, ...patch };
}
function missingPartner(number, tag) {
  const value = frame(number, { prompt: `Moment ${number}: @${tag === "Man" ? "Woman" : "Man"} sips coffee; @${tag} is offscreen.`, cast: [cast("Woman", tag === "Woman" ? "offscreen" : "visible"), cast("Man", tag === "Man" ? "offscreen" : "visible")] });
  value.spatial.hidden = [{ tag, reason: "outside-frame", explanation: "Only the active speaker is shown." }];
  return value;
}
const patches = frames => ({ frames: frames.map(value => ({ number: value.number, prompt: `Moment ${value.number}: @Woman at screen-left and @Man at screen-right remain visible at their seats.`, beat: value.beat, notes: value.notes, cast: [cast("Woman"), cast("Man")], spatial: { ...value.spatial, hidden: [] } })) });
const issues = frames => storyboardSpatialPlanIssues(frames, characters).map(issue => issue.message).join("\n");

test("the reported disappearing listeners in panels 2-4 and 6-7 are caught even with complete cast lists", () => {
  const frames = [frame(1), ...[2, 3, 4].map(n => missingPartner(n, "Man")), frame(5), ...[6, 7].map(n => missingPartner(n, "Woman"))];
  assert.deepEqual(storyboardCastRepairTargets(frames, characters).map(target => target.number), [2, 3, 4, 6, 7]);
  for (const n of [2, 3, 4, 6, 7]) assert.match(issues(frames), new RegExp(`Frame ${n}: .*still in view`));
  const draft = { frames }, before = structuredClone(draft);
  const repair = patches(frames.filter(value => [2, 3, 4, 6, 7].includes(value.number)));
  const corrected = applyStoryboardCastRepair(draft, repair, characters);
  assert.equal(issues(corrected.frames), "");
  assert.deepEqual(draft, before);
  for (const value of corrected.frames) {
    const planned = { ...value, ...storyboardPlannedCastPatch(value) };
    assert.deepEqual(resolveStoryboardFrameCast(planned, characters).references.map(person => person.tag), ["Woman", "Man"]);
  }
});

test("a changed camera ID or lens cannot crop someone out of a world place still listed in view", () => {
  const value = missingPartner(2, "Man");
  value.lens = "50mm"; value.spatial.cameraSetupId = "new-angle";
  assert.match(issues([frame(1), value]), /still in view/);
});

test("a genuinely tighter single and return to the establishing view are valid", () => {
  const single = missingPartner(2, "Man");
  single.shot = "CU";
  single.spatial.cameraSetupId = "woman-single";
  single.spatial.view = "Tight crop on the west seat; right edge ends before the east seat.";
  single.spatial.visiblePlaces = ["table-west-seat"];
  single.spatial.hidden[0].explanation = "The east seat lies beyond the right edge of the close-up.";
  assert.equal(issues([frame(1), single, frame(3)]), "");
  const planned = { ...single, ...storyboardPlannedCastPatch(single) };
  assert.deepEqual(resolveStoryboardFrameCast(planned, characters).references.map(person => person.tag), ["Woman"]);
  assert.match(storyboardFrameContext(planned), /east seat lies beyond the right edge/);
});

test("same camera cannot silently crop a character away, including after an intervening reverse", () => {
  const reverse = frame(2); reverse.spatial.cameraSetupId = "reverse";
  const value = missingPartner(3, "Man"); value.spatial.visiblePlaces = ["table-west-seat"];
  assert.match(issues([frame(1), reverse, value]), /unchanged camera setup/);
});

test("partial foreground partners count as visible; inserts keep on-set cast outside their crop", () => {
  const ots = frame(2); ots.cast[1].position = "screen-right foreground shoulder only";
  ots.spatial.cameraSetupId = "woman-ots";
  assert.equal(issues([frame(1), ots]), "");
  const insert = frame(3, { prompt: "Close insert of two cups on the tabletop.", cast: [cast("Woman", "offscreen"), cast("Man", "offscreen")] });
  insert.spatial.cameraSetupId = "cups-insert"; insert.spatial.visiblePlaces = [];
  insert.spatial.view = "Only the cup surfaces fill the frame; both seats lie outside every edge.";
  insert.spatial.hidden = seats.map(person => ({ tag: person.tag, reason: "outside-frame", explanation: "Tight tabletop insert excludes both seated bodies entirely." }));
  assert.equal(issues([frame(1), ots, insert]), "");
  assert.deepEqual(resolveStoryboardFrameCast({ ...insert, ...storyboardPlannedCastPatch(insert) }, characters).references, []);
});

test("real occlusion and exits are allowed, but silent disappearance or teleporting are not", () => {
  const hidden = missingPartner(2, "Man");
  hidden.spatial.hidden = [{ tag: "Man", reason: "occluded", explanation: "The closing opaque divider completely covers the east seat." }];
  hidden.spatial.blockingChange = "The opaque divider closes in front of the east seat.";
  assert.equal(issues([frame(1), hidden]), "");
  const exit = frame(2, { prompt: "@Woman waits after @Man leaves.", cast: [cast("Woman"), cast("Man", "offscreen")] });
  exit.spatial.present = [seats[0]];
  assert.match(issues([frame(1), exit]), /disappears from the scene/);
  exit.spatial.blockingChange = "@Man exits through the rear door.";
  assert.equal(issues([frame(1), exit]), "");
  const moved = frame(2); moved.spatial.present[1].place = "bar-stool";
  assert.match(issues([frame(1), moved]), /changes world place/);
  const newScene = frame(3, { prompt: "Later, @Woman is alone in the cafe.", cast: [cast("Woman")] });
  newScene.spatial.spaceId = "cafe-later"; newScene.spatial.present = [seats[0]];
  assert.equal(issues([frame(1), newScene]), "");
});

test("complete occupancy bookkeeping rejects unknowns, duplicates, missing and contradictory visibility", () => {
  const broken = frame(1); broken.cast = [cast("Woman")];
  assert.match(issues([broken]), /physically present but missing from the cast/);
  const unknown = frame(1); unknown.spatial.present.push({ tag: "Stranger", place: "door" });
  assert.match(issues([unknown]), /known tag/);
  const duplicate = frame(1); duplicate.spatial.present.push(seats[0]);
  assert.match(issues([duplicate]), /one known tag/);
  const unjustified = missingPartner(2, "Man"); unjustified.spatial.hidden = [];
  assert.match(issues([unjustified]), /explain why present @Man/);
});

test("staging survives JSON/save directions and manual edits invalidate it without altering images", () => {
  const value = frame(1, { resultUrl: "/outputs/keep.png" });
  Object.assign(value, storyboardPlannedCastPatch(value));
  const reopened = JSON.parse(JSON.stringify(value));
  assert.deepEqual(storyboardFrameDirection(reopened).spatial, value.spatial);
  assert.match(storyboardFrameContext(reopened), /PHYSICAL STAGING/);
  const edited = { ...reopened, prompt: "New user framing instruction" };
  assert.equal(currentStoryboardCast(edited), null);
  assert.doesNotMatch(storyboardFrameContext(edited), /PHYSICAL STAGING/);
  assert.equal(edited.resultUrl, value.resultUrl);
  const geometryEdited = structuredClone(reopened); geometryEdited.spatial.view = "New crop";
  assert.equal(currentStoryboardCast(geometryEdited), null);
  assert.match(storyboardSpatialPrompt(value.spatial), /World places inside this frame: table-west-seat; table-east-seat/);
});

test("old saved panels without spatial records are not changed or forced through planning", () => {
  const legacy = frame(1); delete legacy.spatial;
  const before = structuredClone(legacy);
  assert.equal(issues([legacy]), "");
  assert.equal(storyboardFrameDirection(legacy).spatial, null);
  assert.deepEqual(legacy, before);
});

test("a correction cannot invent a camera cut, exit or crop boundary to make a missing listener pass", () => {
  const draft = { frames: [frame(1), missingPartner(2, "Man")] };
  for (const key of ["spaceId", "cameraSetupId", "view", "visiblePlaces", "blockingChange"]) {
    const repair = patches([draft.frames[1]]);
    repair.frames[0].spatial[key] = key === "visiblePlaces" ? ["table-west-seat"] : "Invented change";
    assert.throws(() => applyStoryboardCastRepair(draft, repair, characters), /established camera or physical action/);
  }
});

test("selected revisions are checked against preceding unselected/protected panels", () => {
  const original = [frame(1, { protected: true }), frame(2)];
  const revision = { frames: [missingPartner(2, "Man")], affectedFrameIds: [], warnings: [] };
  assert.throws(() => validateStoryboardRevision(revision, original, ["f2"], characters), /still in view|unchanged camera/);
  const targets = storyboardCastRepairTargets(revision.frames, characters, [original[0], revision.frames[0]]);
  assert.deepEqual(targets.map(target => target.number), [2]);
});

test("real planning/revision routes auto-correct missing occupants once and retain both identity references", async () => {
  for (const mode of ["plan-v2", "revise"]) {
    const handlers = new Map(), calls = [], history = [];
    const original = [frame(1, { protected: true, resultUrl: "/outputs/master.png" }), frame(2)];
    const draft = mode === "plan-v2" ? { sceneTitle: "Coffee", analysis: "Conversation", continuity: { geography: "Two fixed seats", axis: "Across table", lighting: "Window", props: [] }, frames: [frame(1), missingPartner(2, "Man")] }
      : { summary: "Focus on the sip", frames: [missingPartner(2, "Man")], affectedFrameIds: [], warnings: [] };
    const run = async request => {
      calls.push(request);
      const value = request.route === "storyboard-cast-repair" ? patches([missingPartner(2, "Man")]) : draft;
      validateCreativeResponse({}, { route: request.route, provider: "test", text: JSON.stringify(value) });
      return { text: JSON.stringify(value), provider: "test", usage: {} };
    };
    registerStoryboardRoutes({ post: (url, handler) => handlers.set(url, handler) }, { runTextLlm: run, runMediaDescriptionLlm: run,
      recordHistory: async item => history.push(item), estimateCost: () => ({ amountUsd: .01 }), connection: () => ({}), readLocalAsset: async () => assert.fail("No reference analysis needed") });
    const before = structuredClone(original); let code = 200, body;
    await handlers.get(`/api/node/storyboard-${mode}`)({ body: { sceneDescription: "@Woman sits west and @Man east throughout their coffee conversation.", nodeId: "board", characters, frames: original, frameIds: ["f2"], instruction: "Focus on her sip without moving the camera" } }, { status(value) { code = value; return this; }, json(value) { body = value; } });
    assert.equal(code, 200, body.error);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].route, "storyboard-cast-repair");
    assert.match(calls[1].prompt, /still in view/);
    assert.match(calls[0].systemPrompt, /empty table space in place of the listener/);
    assert.deepEqual(original, before);
    const result = mode === "plan-v2" ? body.plan.frames[1] : body.revision.frames[0];
    assert.deepEqual(resolveStoryboardFrameCast({ ...result, ...storyboardPlannedCastPatch(result) }, characters).references.map(item => item.tag), ["Woman", "Man"]);
    assert.equal(history.length, 2);
    assert.equal(body.cost.amountUsd, .02);
  }
});
