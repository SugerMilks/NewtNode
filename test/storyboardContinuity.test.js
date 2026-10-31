import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyboardContinuityFrames, storyboardRenderSceneContext } from "../src/storyboardContinuity.js";

const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
function extract(name, deps = {}) {
  const start = editor.indexOf(`function ${name}(`), end = editor.indexOf("\nfunction ", start);
  assert.ok(start > 0 && end > start);
  return new Function(...Object.keys(deps), `${editor.slice(start, end)}; return ${name};`)(...Object.values(deps));
}
const referenceUrl = extract("storyboardFrameReferenceUrl");
const references = extract("storyboardContinuityReferenceItems", {
  normalizedStoryboardFrames: frames => frames, storyboardContinuityFrames, storyboardFrameReferenceUrl: referenceUrl,
  storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png"
});
const frame = (id, patch = {}) => ({ id, shot: "MS", beat: "Conversation at the table", resultUrl: `/outputs/${id}.png`, qcPassed: true, spatial: { spaceId: "cafe" }, ...patch });
const refs = (frames, current = frames.at(-1)) => references({ data: { storyboardFrames: frames } }, current);

test("even consecutive approved medium shots keep the establishing geography, not only the latest potentially drifted image", () => {
  const frames = [frame("master", { shot: "WS", prompt: "A laptop prop, an object on the table" }), frame("woman"), frame("turn-laptop"), frame("screen", { shot: "CU" })];
  const before = structuredClone(frames);
  assert.deepEqual(refs(frames), [
    { url: "/outputs/turn-laptop.png", label: "PREVIOUS_FRAME.png" },
    { url: "/outputs/master.png", label: "SPATIAL_ANCHOR.png" }
  ]);
  assert.deepEqual(frames, before);
});

test("approved inserts are recent-state references but not geography anchors", () => {
  const frames = [frame("insert", { purpose: "Screen insert" }), frame("master", { shot: "WS" }), frame("detail", { shot: "ECU" }), frame("current")];
  assert.deepEqual(refs(frames).map(item => item.url), ["/outputs/detail.png", "/outputs/master.png"]);
});

test("new scenes and returns after a discontinuity cannot inherit an older scene's anchor", () => {
  const frames = [frame("cafe-master", { shot: "WS" }), frame("street", { spatial: { spaceId: "street" } }), frame("cafe-return")];
  assert.deepEqual(refs(frames), []);
  frames.push(frame("cafe-next"));
  assert.deepEqual(refs(frames).map(item => item.url), ["/outputs/cafe-return.png"]);
});

test("legacy frames remain usable and repeated references are bounded and deduplicated", () => {
  const frames = [frame("master", { spatial: undefined, qcPassed: undefined }), frame("next", { spatial: undefined })];
  assert.equal(refs(frames).length, 1);
  frames.push(frame("third", { spatial: undefined }));
  assert.equal(refs(frames).length, 2);
  frames[1].resultUrl = frames[0].resultUrl;
  assert.equal(refs(frames).length, 1);
  assert.deepEqual(refs([frames[0]]), []);
  assert.deepEqual(refs(frames, { id: "missing" }), []);
});

test("a legacy unplanned panel uses only the latest continuous space when prior frames have geography", () => {
  const frames = [frame("old-master"), frame("street", { spatial: { spaceId: "street" } }), frame("legacy", { spatial: undefined })];
  assert.deepEqual(refs(frames).map(item => item.url), ["/outputs/street.png"]);
});

test("rejected first images retained after a correction failure and unreviewed images never become anchors", () => {
  const frames = [frame("master"), frame("failed-correction", { qcPassed: false }), frame("unreviewed", { qcPassed: null, qcReviewStatus: "unreviewed" }), frame("current")];
  assert.deepEqual(refs(frames).map(item => item.url), ["/outputs/master.png"]);
  frames[0].qcPassed = false;
  assert.deepEqual(refs(frames), []);
});

test("Shot List render context omits future authored rows but preserves local and connected context", () => {
  const data = { storyboardApproach: "Shot List", sceneDescription: "Opposite seats by the window" };
  const allShots = "Shot 1: Computer faces the man. Shot 5: Turn computer. Shot 8: Whale appears.";
  assert.equal(storyboardRenderSceneContext(data, allShots), data.sceneDescription);
  assert.equal(storyboardRenderSceneContext(data, allShots, "Connected cafe scene"), "Connected cafe scene");
  assert.equal(storyboardRenderSceneContext({ storyboardApproach: "Shot List" }, allShots), "");
  for (const approach of [undefined, "Narrative", "Dialogue", "Action", "Commercial", "Montage"]) {
    assert.equal(storyboardRenderSceneContext({ storyboardApproach: approach }, allShots), allShots);
  }
});
