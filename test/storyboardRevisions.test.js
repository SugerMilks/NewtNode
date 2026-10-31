import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyboardRenderSceneContext } from "../src/storyboardContinuity.js";
import { storyboardFrameWithVersion, storyboardFrameDirection, storyboardEditSignature, storyboardRevisionTargets, validateStoryboardRevision, storyboardPanelEditingLocked, storyboardPlanningSettings } from "../src/storyboardWorkflow.js";
import { storyboardShotListMode, storyboardShotNeedsPlan, storyboardShotSource, storyboardShotRows, storyboardShotListError, storyboardShotListContext, mergeStoryboardShotPlan } from "../src/storyboardShotList.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const extract = (name, next, deps) => {
  const start = source.indexOf(`  async function ${name}(`), end = source.indexOf(`  async function ${next}(`, start);
  assert.ok(start > 0 && end > start);
  return new Function(...Object.keys(deps), `${source.slice(start, end)}; return ${name};`)(...Object.values(deps));
};
const makeFrame = number => ({ id: `f${number}`, number, prompt: `Door opens ${number}`, beat: "Door opens", notes: "", shot: "WS", lens: "35mm", angle: "None", cast: [], resultUrl: `/outputs/old-${number}.png`, status: "complete" });

test("Shot List planning accepts Auto cameras without becoming stale and rejects intervening edits", async () => {
  for (const change of [null, "shotDescription", "approach"]) {
    const node = { id: "b", data: { storyboardApproach: "Shot List", storyboardFrames: [{ ...makeFrame(1), shotDescription: "Door opens", shot: "None", lens: "None" }] } };
    const update = (_id, patch) => { node.data = { ...node.data, ...patch }; };
    const deps = {
      nodesRef: { current: [node] }, edgesRef: { current: [] }, storyboardShotListMode, storyboardShotListError, storyboardShotRows,
      storyboardTaskBusy: () => false, buildIncomingByNode: () => ({}), storyboardSceneDescriptionForNode: item => storyboardShotListContext(item.data),
      normalizeStoryboardFrameCountValue: () => "Auto", updateStoryboardStatus: update, updateNode: update,
      assertCharacterOutputReferences() {}, assertStoryboardCharacterTags() {}, storyboardCharacterSummariesForNode: () => [], workflowRequestContext: () => ({}),
      storyboardSceneReferenceSummaries: () => [], storyboardPropReferenceSummaries: () => [],
      storyboardReferenceCandidates: () => [{ nodeId: "door", tag: "Door", name: "Door", type: "prop-reference" }],
      requireStoryboardPlanResponse: (_response, data) => data.plan, storyboardFramesFromPlan: frames => frames, mergeStoryboardShotPlan, storyboardEditSignature, storyboardPlanningSettings,
      pushUndoSnapshot() {}, updateStoryboardNodeFrames: (_id, frames, patch) => update(node.id, { ...patch, storyboardFrames: frames }),
      nodeApi: { planStoryboard: async body => {
        assert.equal(body.shots.length, 1);
        if (change === "shotDescription") update(node.id, { storyboardFrames: [{ ...node.data.storyboardFrames[0], shotDescription: "New request" }] });
        if (change === "approach") update(node.id, { storyboardApproach: "Dialogue" });
        return { response: { ok: true }, data: { plan: { frames: [{ ...makeFrame(1), phase: "single", shotId: "s1" }] } } };
      } }
    };
    // React updates replace node data; retain the request's snapshot separately.
    const initial = structuredClone(node);
    deps.nodesRef.current = [initial];
    const originalUpdate = update;
    deps.updateNode = deps.updateStoryboardStatus = (_id, patch) => { originalUpdate(_id, patch); deps.nodesRef.current = [node]; };
    await extract("planStoryboardNode", "generateStoryboardFrame", deps)(initial);
    if (change) {
      assert.match(node.data.error, /changed while planning/);
      assert.equal(node.data.storyboardFrames[0].resultUrl, "/outputs/old-1.png");
    } else {
      assert.equal(node.data.error, "");
      assert.equal(node.data.storyboardFrames[0].lens, "35mm");
      assert.equal(node.data.storyboardFrames[0].shotDescription, "@Door opens");
      assert.equal(node.data.storyboardPlanSceneDescription, storyboardShotListContext(node.data));
      assert.equal(storyboardShotNeedsPlan(node.data.storyboardFrames[0]), false);
    }
  }
});

function generationHarness(options = {}) {
  const node = { id: "board", data: { storyboardFrames: [1, 2, 3].map(makeFrame), storyboardAutoQc: false, status: "ready" } };
  const requests = [], exports = [], reviews = [];
  const update = (_id, patch) => Object.assign(node.data, patch);
  const deps = {
    storyboardRenderSceneContext, connectedText: () => "",
    nodesRef: { current: [node] }, edgesRef: { current: [] }, generationProvider: "fal",
    storyboardTaskBusy: item => item.data.status === "running", updateStoryboardStatus: update, pushUndoSnapshot() {},
    storyboardImageSettings: data => data, normalizeStoryboardImageModel: model => model, normalizedStoryboardFrames: frames => frames,
    buildIncomingByNode: () => ({}), storyboardSceneDescriptionForNode: () => "The scene was changed after the original plan.",
    updateNode: update, workflowRequestContext: () => ({}), assertCharacterOutputReferences() {}, assertStoryboardCharacterTags() {},
    storyboardCharacterSummariesForNode: () => [], ensureStoryboardCharactersReady: async () => node,
    storyboardNodeWithMostPreparedCharacters: (_prepared, live) => live, storyboardAspectRatioForNode: () => "16:9", storyboardResolutionForNode: () => "1K",
    patchStoryboardFrame: (_id, id, patch) => { node.data.storyboardFrames = node.data.storyboardFrames.map(frame => frame.id === id ? { ...frame, ...patch } : frame); },
    storyboardContinuityReferenceItems: () => [], storyboardFrameCastForNode: () => ({ references: [] }), storyboardCharacterSourcesForNode: () => [],
    storyboardSceneReferenceSources: () => [], storyboardRequiredLocationSourcesForFrame: () => [], storyboardPropReferenceSources: () => [], storyboardRequiredPropSourcesForFrame: () => [],
    storyboardImagePromptItems: () => [], storyboardImagePromptItemsForFrame: items => items,
    buildStoryboardFramePrompt: (_node, frame) => `${frame.prompt}\n${frame.shot}\n${frame.notes}`,
    storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png",
    runImageModelGeneration: async request => {
      requests.push(request);
      if (options.fail === request.index + 1) throw new Error("Mock provider failure");
      if (options.failCorrection && requests.length === 2) throw new Error("fetch failed");
      if (options.emptyCorrection && requests.length === 2) return [];
      if (options.duringRun) options.duringRun(node);
      return [{ url: `/outputs/new-${request.index + 1}.png` }];
    },
    reviewStoryboardGeneratedFrame: async request => {
      reviews.push(request);
      return { pass: false, shouldRetry: true, severity: "major", summary: "Prop rotated prematurely", issues: ["Display faces the wrong seat"] };
    },
    storyboardQcRetryPrompt: prompt => `${prompt}\nRestore the established prop orientation.`,
    exportStoryboardFrameResult: async request => { exports.push(request); return { url: request.generated.url }; },
    storyboardFrameWithVersion, storyboardFrameDirection, storyboardEditSignature, storyboardShotListMode, storyboardShotNeedsPlan, storyboardShotSource,
    updateStoryboardNodeFrames: (_id, frames, patch) => update(node.id, { storyboardFrames: frames, ...patch }), loadOutputHistory() {}
  };
  return { node, requests, exports, reviews, run: extract("generateStoryboardNode", "reviewStoryboardGeneratedFrame", deps) };
}

for (const failure of ["failCorrection", "emptyCorrection"]) {
  test(`${failure}: a new panel retains the first image and failed QC without a third paid submission`, async () => {
    const h = generationHarness({ [failure]: true });
    h.node.data.storyboardAutoQc = true;
    h.node.data.storyboardFrames[1].resultUrl = "";
    await h.run(h.node, ["f2"]);
    const frame = h.node.data.storyboardFrames[1];
    assert.equal(h.requests.length, 2);
    assert.equal(h.reviews.length, 1);
    assert.equal(h.exports.length, 1);
    assert.equal(frame.resultUrl, "/outputs/new-2.png");
    assert.equal(frame.status, "complete");
    assert.equal(frame.qcPassed, false);
    assert.equal(frame.qcRetryCount, 1);
    assert.match(frame.qcWarning, /Prop rotated prematurely/);
    assert.match(frame.error, /first image is retained/);
    assert.match(h.node.data.error, /may still be billed/);
  });
}

test("a failed QC correction preserves an existing panel instead of publishing the rejected candidate", async () => {
  const h = generationHarness({ failCorrection: true });
  h.node.data.storyboardAutoQc = true;
  await h.run(h.node, ["f2"]);
  const frame = h.node.data.storyboardFrames[1];
  assert.equal(h.requests.length, 2);
  assert.equal(h.exports.length, 0);
  assert.equal(frame.resultUrl, "/outputs/old-2.png");
  assert.equal(frame.status, "error");
  assert.match(h.node.data.error, /fetch failed/);
  assert.doesNotMatch(h.node.data.error, /first image is retained/);
});

test("a failed correction cannot overwrite a concurrent user edit with its retained candidate", async () => {
  const h = generationHarness({ failCorrection: true, duringRun: node => { node.data.storyboardFrames[1].prompt = "New author direction"; } });
  h.node.data.storyboardAutoQc = true;
  h.node.data.storyboardFrames[1].resultUrl = "";
  await h.run(h.node, ["f2"]);
  assert.equal(h.node.data.storyboardFrames[1].resultUrl, "");
  assert.equal(h.node.data.storyboardFrames[1].prompt, "New author direction");
  assert.equal(h.exports.length, 0);
  assert.match(h.node.data.error, /changed while generation/);
  assert.doesNotMatch(h.node.data.error, /first image is retained/);
});

test("selective replacements do not replan: successful directions are committed, failed and unselected panels survive", async () => {
  const harness = generationHarness({ fail: 3 }), { node } = harness;
  const original = structuredClone(node.data.storyboardFrames);
  const revisedFrames = original.slice(1).map(frame => ({ ...frame, prompt: "Closer on the door", shot: "CU", notes: "New staging" }));
  await harness.run(node, ["f2", "f3"], { revisedFrames, instruction: "Move closer" });
  assert.equal(harness.requests.length, 2);
  assert.deepEqual(node.data.storyboardFrames[0], original[0]);
  const updated = node.data.storyboardFrames[1], failed = node.data.storyboardFrames[2];
  assert.equal(updated.shot, "CU"); assert.equal(updated.notes, "New staging");
  assert.equal(updated.resultUrl, "/outputs/new-2.png"); assert.equal(updated.versions[0].resultUrl, original[1].resultUrl);
  assert.equal(failed.resultUrl, original[2].resultUrl); assert.equal(failed.prompt, original[2].prompt); assert.equal(failed.shot, "WS");
  assert.equal(failed.status, "error"); assert.match(node.data.error, /1 frame failed/);
  assert.deepEqual(harness.requests[0].imagePromptItems.map(item => item.url), [original[1].resultUrl]);
  assert.match(harness.requests[0].prompt, /Closer on the door\nCU\nNew staging/);
  assert.equal(harness.exports.length, 1);
});

test("Generate Missing and an empty selection cannot regenerate existing images", async () => {
  const harness = generationHarness();
  await harness.run(harness.node, []);
  await harness.run(harness.node);
  assert.equal(harness.requests.length, 0);
  harness.node.data.storyboardFrames[1].resultUrl = "";
  await harness.run(harness.node);
  assert.equal(harness.requests.length, 1); assert.equal(harness.requests[0].index, 1);
});

test("unplanned Shot List edits cannot submit images, and successful selected revisions update the authored row only", async () => {
  const harness = generationHarness(), { node } = harness;
  node.data.storyboardApproach = "Shot List";
  const row = node.data.storyboardFrames[1];
  row.shotDescription = "Move closer on the doorway";
  await harness.run(node, [row.id]);
  assert.equal(harness.requests.length, 0);
  assert.match(node.data.error, /Plan Shots/);
  const before = structuredClone(node.data.storyboardFrames);
  const revised = { ...row, prompt: "The door handle turns in close-up", shot: "CU" };
  await harness.run(node, [row.id], { revisedFrames: [revised], instruction: "Close on the handle" });
  assert.equal(harness.requests.length, 1);
  assert.deepEqual(node.data.storyboardFrames[0], before[0]);
  assert.deepEqual(node.data.storyboardFrames[2], before[2]);
  const current = node.data.storyboardFrames[1];
  assert.equal(current.shotDescription, revised.prompt);
  assert.equal(storyboardShotNeedsPlan(current), false);
  assert.equal(current.generatedDirection.shotDescription, revised.prompt);
  assert.equal(current.versions[0].resultUrl, before[1].resultUrl);
});

test("protected and concurrently edited panels are never replaced", async () => {
  const protectedRun = generationHarness();
  protectedRun.node.data.storyboardFrames[1].protected = true;
  await protectedRun.run(protectedRun.node, ["f2"]);
  assert.equal(protectedRun.requests.length, 0);
  const changedRun = generationHarness({ duringRun: node => { node.data.storyboardFrames[1].notes = "New user note"; } });
  await changedRun.run(changedRun.node, ["f2"]);
  assert.equal(changedRun.node.data.storyboardFrames[1].resultUrl, "/outputs/old-2.png");
  assert.equal(changedRun.node.data.storyboardFrames[1].notes, "New user note");
  assert.equal(changedRun.exports.length, 0);
  assert.match(changedRun.node.data.error, /changed while generation/);
});

test("editing an idle panel while another renders preserves edits, selection, versions and revision notes", async () => {
  const harness = generationHarness({ duringRun: node => {
    node.data.storyboardFrames[0] = { ...node.data.storyboardFrames[0], prompt: "A new user direction", shot: "CU", protected: true };
    node.data.storyboardRevisionInstruction = "Revise the next panel after this run";
    node.data.selectedFrameId = "f1";
  } });
  await harness.run(harness.node, ["f2"]);
  const [idle, rendered] = harness.node.data.storyboardFrames;
  assert.equal(idle.prompt, "A new user direction");
  assert.equal(idle.shot, "CU");
  assert.equal(idle.protected, true);
  assert.equal(idle.resultUrl, "/outputs/old-1.png");
  assert.equal(rendered.resultUrl, "/outputs/new-2.png");
  assert.equal(rendered.versions[0].resultUrl, "/outputs/old-2.png");
  assert.equal(harness.node.data.selectedFrameId, "f1");
  assert.equal(harness.node.data.storyboardRevisionInstruction, "Revise the next panel after this run");
});

test("a stale revision response cannot start image generation", async () => {
  const node = { id: "board", data: { storyboardFrames: [makeFrame(1)] } };
  const request = { frames: structuredClone(node.data.storyboardFrames), sceneDescription: "Original scene", characters: [] };
  let runs = 0;
  const deps = { nodesRef: { current: [node] }, storyboardTaskBusy: () => false, storyboardRevisionRequest: () => request, storyboardRevisionTargets, validateStoryboardRevision, storyboardEditSignature,
    updateStoryboardStatus: (_id, patch) => Object.assign(node.data, patch), updateNode: (_id, patch) => Object.assign(node.data, patch),
    nodeApi: { reviseStoryboard: async () => {
      node.data.storyboardFrames[0].protected = true;
      return { response: { ok: true }, data: { revision: { frames: [makeFrame(1)], summary: "Updated", warnings: [], affectedFrameIds: [] } } };
    } }, generateStoryboardNode: async () => { runs++; } };
  await extract("reviseStoryboardNode", "reviewStoryboardSequence", deps)(node, ["f1"], "Closer");
  assert.equal(runs, 0); assert.equal(node.data.storyboardFrames[0].protected, true); assert.match(node.data.error, /changed while revising/);
});

test("an async image edit merges with live panels without erasing a render completed during the edit", async () => {
  const node = { id: "b", type: "storyboard", data: { status: "running", storyboardFrames: [makeFrame(1), { ...makeFrame(2), status: "running" }] } };
  const deps = {
    nodesRef: { current: [node] }, normalizedStoryboardFrames: frames => frames, storyboardPanelEditingLocked, storyboardEditSignature, storyboardFrameWithVersion,
    storyboardTaskBusy: node => node.data.status === "running", safeStillFrameName: value => value, fileBaseName: value => value, fileNameFromLocalUrl: () => "frame.png", mimeForOutputItem: () => "image/png",
    createEditedPreviewLayoutImageBlob: async () => {
      node.data.storyboardFrames[1] = { ...node.data.storyboardFrames[1], resultUrl: "/outputs/finished-during-edit.png", status: "complete" };
      node.data.storyboardRevisionInstruction = "Keep this new note";
      return new Blob(["fixture"]);
    },
    uploadNodeAsset: async () => ({ localUrl: "/outputs/edited.png", fileName: "edited.png" }), pushUndoSnapshot() {}, setPreviewLightboxItem() {},
    updateStoryboardNodeFrames: (_id, updater, patch) => { Object.assign(node.data, { ...patch, storyboardFrames: updater(node.data.storyboardFrames) }); }
  };
  const apply = extract("applyPreviewLayoutImageEdit", "restorePreviewLayoutImageEdit", deps);
  await apply({ url: "/outputs/old-1.png", editContext: { type: "storyboardFrame", nodeId: "b", itemId: "f1" } }, { type: "crop" });
  assert.equal(node.data.storyboardFrames[0].resultUrl, "/outputs/edited.png");
  assert.equal(node.data.storyboardFrames[0].versions[0].resultUrl, "/outputs/old-1.png");
  assert.equal(node.data.storyboardFrames[1].resultUrl, "/outputs/finished-during-edit.png");
  assert.equal(node.data.storyboardRevisionInstruction, "Keep this new note");
  assert.equal(node.data.status, "running");
});
