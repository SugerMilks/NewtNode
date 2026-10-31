import test from "node:test";
import assert from "node:assert/strict";
import { storyboardShotRows, validateStoryboardShots, storyboardShotPlanIssues, mergeStoryboardShotPlan, storyboardShotNeedsPlan, storyboardShotSource, storyboardShotListContext, storyboardShotGalleryPatch } from "../src/storyboardShotList.js";
import { storyboardEditSignature, storyboardFrameWithVersion, restoreStoryboardFrameVersion } from "../src/storyboardWorkflow.js";
import { nodeApi } from "../src/api/newtApi.js";
import { bindNewtPresetInputs } from "../src/myNewt/presets.js";

const row = (number = 1, patch = {}) => ({ id: `shot-${number}`, number, shotDescription: `Action ${number}`, prompt: "", shot: "WS", lens: "35mm", angle: "None", ...patch });
const planned = frames => frames.map((frame, i) => ({ id: frame.id, number: i + 1, shotId: `shot-${i + 1}`, phase: "single", prompt: `Planned action ${i + 1}`, shot: frame.shot, lens: frame.lens, angle: frame.angle, cast: [], spatial: null }));

test("Shot List validation accepts 1-35 ordered rows and rejects missing content, duplicate IDs and invalid cameras", () => {
  const rows = storyboardShotRows(Array.from({ length: 35 }, (_, i) => row(i + 1)));
  assert.equal(validateStoryboardShots(rows).length, 35);
  for (const bad of [[], [...rows, { ...rows[0], id: "more", number: 36 }], [rows[0], { ...rows[0], number: 2 }], [{ ...rows[0], number: 2 }], [{ ...rows[0], description: " " }], [{ ...rows[0], description: "x".repeat(1401) }], [{ ...rows[0], lens: "invented" }]]) assert.throws(() => validateStoryboardShots(bad));
});

test("Shot List planning keeps count, order, identity and explicit camera settings; Auto remains the planner's choice", () => {
  const originals = [row(), row(2, { shot: "None", lens: "None" })], shots = storyboardShotRows(originals), good = planned(originals);
  good[1].shot = "CU"; good[1].lens = "85mm";
  assert.deepEqual(storyboardShotPlanIssues(good, shots), []);
  for (const patch of [{ id: "wrong" }, { number: 2 }, { shot: "CU" }, { lens: "50mm" }, { angle: "Low Angle" }, { phase: "opening" }, { shotId: good[1].shotId }]) {
    const input = patch.angle ? storyboardShotRows([row(1, { angle: "High Angle" }), originals[1]]) : shots;
    assert.ok(storyboardShotPlanIssues([{ ...good[0], ...patch }, good[1]], input).length);
  }
  assert.ok(storyboardShotPlanIssues(good.slice(1), shots).length);
  assert.ok(storyboardShotPlanIssues([...good].reverse(), shots).length);
});

test("planning preserves current media, versions and authored text, with a ready signature that survives JSON", () => {
  const originals = [row(1, { prompt: "Old image direction", resultUrl: "/outputs/old.png", exportUrl: "/outputs/export.png", resultVersion: 42, versions: [{ resultUrl: "/outputs/older.png" }] })];
  const before = structuredClone(originals), result = mergeStoryboardShotPlan(originals, planned(originals));
  assert.deepEqual(originals, before);
  assert.equal(result[0].resultUrl, originals[0].resultUrl);
  assert.equal(result[0].exportUrl, originals[0].exportUrl);
  assert.deepEqual(result[0].versions, originals[0].versions);
  assert.equal(result[0].shotDescription, "Action 1");
  assert.equal(result[0].generatedDirection.prompt, "Old image direction");
  assert.equal(storyboardShotNeedsPlan(JSON.parse(JSON.stringify(result[0]))), false);
  assert.equal(storyboardShotNeedsPlan({ ...result[0], shotDescription: "Changed action" }), true);
  assert.equal(storyboardShotNeedsPlan({ ...result[0], lens: "85mm" }), true);
  assert.notEqual(storyboardEditSignature(result), storyboardEditSignature([{ ...result[0], shotDescription: "Changed action" }]));
});

test("shot descriptions and planning provenance follow generated versions and restored images", () => {
  const original = row(1, { prompt: "Old", shotDescription: "Old brief", resultUrl: "/outputs/old.png" });
  original.shotPlanSource = storyboardShotSource(original);
  const next = storyboardFrameWithVersion(original, { resultUrl: "/outputs/new.png", prompt: "New", shotDescription: "New brief" });
  const restored = restoreStoryboardFrameVersion(next, 0);
  assert.equal(restored.shotDescription, "Old brief");
  assert.equal(restored.shotPlanSource, original.shotPlanSource);
  assert.equal(restored.versions.at(-1).resultUrl, "/outputs/new.png");
});

test("explicit planning tags exact connected script names and retains ready signatures, source text and media", () => {
  const originals = [row(1, { shotDescription: "The man sits left and woman right.", resultUrl: "/outputs/old.png",
    versions: [{ resultUrl: "/outputs/older.png" }], sourceScript: { dialogue: "The man is here.", pages: [1] } })];
  const refs = [{ nodeId: "m", tag: "Man", name: "Man" }, { nodeId: "w", tag: "Woman", name: "Woman" }];
  const before = structuredClone(originals);
  const [result] = mergeStoryboardShotPlan(originals, planned(originals), refs);
  assert.equal(result.shotDescription, "The @Man sits left and @Woman right.");
  assert.equal(result.prompt, "Planned action 1");
  assert.equal(result.resultUrl, originals[0].resultUrl);
  assert.deepEqual(result.versions, originals[0].versions);
  assert.deepEqual(result.sourceScript, originals[0].sourceScript);
  assert.equal(result.generatedDirection.shotDescription, originals[0].shotDescription);
  assert.equal(storyboardShotNeedsPlan(JSON.parse(JSON.stringify(result))), false);
  assert.deepEqual(originals, before);
});

test("gallery camera edits do not accidentally approve unplanned Setup descriptions", () => {
  const original = mergeStoryboardShotPlan([row()], planned([row()]))[0];
  assert.equal(storyboardShotNeedsPlan({ ...original, ...storyboardShotGalleryPatch(original, { lens: "85mm" }) }), false);
  const edited = { ...original, shotDescription: "A completely new action" };
  assert.equal(storyboardShotNeedsPlan({ ...edited, ...storyboardShotGalleryPatch(edited, { lens: "85mm" }) }), true);
  const explicit = { ...edited, ...storyboardShotGalleryPatch(edited, { prompt: "New final drawing direction" }) };
  assert.equal(storyboardShotNeedsPlan(explicit), false);
  assert.equal(explicit.shotDescription, explicit.prompt);
});

test("Shot List supplies scene context without needing a summary and leaves summary approaches unchanged", () => {
  const data = { storyboardApproach: "Shot List", storyboardFrames: [row(), row(2)] };
  assert.match(storyboardShotListContext(data), /Shot 1 \(WS, 35mm, None\): Action 1/);
  assert.match(storyboardShotListContext(data, "At a cafe"), /^At a cafe/);
  assert.equal(storyboardShotListContext({ ...data, storyboardApproach: "Dialogue" }, "At a cafe"), "At a cafe");
  assert.equal(storyboardShotListContext({ ...data, storyboardFrames: [row(1, { shotDescription: "" })] }), "");
});

test("old backends cannot accept a paid Shot List request; new ones receive one POST", async t => {
  const original = globalThis.fetch, calls = []; let supported = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => { calls.push({ url: String(url), ...options }); return new Response(JSON.stringify(String(url).endsWith("/api/health") ? { routes: { storyboardShotList: supported } } : { plan: {} }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  const body = { storyboardApproach: "Shot List", shots: storyboardShotRows([row()]) };
  await assert.rejects(nodeApi.planStoryboard(body), /Restart/);
  assert.equal(calls.filter(call => call.method === "POST").length, 0);
  supported = true;
  await nodeApi.planStoryboard(body);
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  assert.deepEqual(JSON.parse(calls.at(-1).body).shots, body.shots);
});

test("rebinding preset references keeps authored shots and cameras but clears stale directions and images", () => {
  const old = { id: "old", type: "image", data: { title: "Hallway" } };
  const board = { id: "b", type: "storyboard", data: { storyboardApproach: "Shot List", storyboardFrames: [row(1, { shotDescription: "A door opens in @Hallway.", prompt: "Old staging", resultUrl: "/outputs/old.png", protected: true, versions: [{ resultUrl: "/outputs/older.png" }] })] } };
  const graph = { nodes: [old, board], edges: [{ from: { nodeId: "old", port: "imageOut" }, to: { nodeId: "b", port: "sceneReferenceIn" } }], groups: [], slots: [{ nodeId: "old", type: "image", label: "Location" }] };
  const updated = bindNewtPresetInputs(graph, { old: "new" }, [{ id: "new", type: "image", data: { title: "Studio" } }]);
  const shot = updated.nodes[0].data.storyboardFrames[0];
  assert.equal(shot.shotDescription, "A door opens in @Studio.");
  assert.equal(shot.shot, "WS"); assert.equal(shot.lens, "35mm");
  assert.equal(shot.prompt, ""); assert.equal(shot.resultUrl, undefined); assert.equal(shot.versions, undefined);
  assert.equal(storyboardShotNeedsPlan(shot), true);
  assert.equal(board.data.storyboardFrames[0].resultUrl, "/outputs/old.png");
});
