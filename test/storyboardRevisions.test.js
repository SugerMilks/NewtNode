import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyboardFrameWithVersion, storyboardFrameDirection, storyboardEditSignature, storyboardRevisionTargets, validateStoryboardRevision, storyboardPanelEditingLocked } from "../src/storyboardWorkflow.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const extract = (name, next, deps) => {
  const start = source.indexOf(`  async function ${name}(`), end = source.indexOf(`  async function ${next}(`, start);
  assert.ok(start > 0 && end > start);
  return new Function(...Object.keys(deps), `${source.slice(start, end)}; return ${name};`)(...Object.values(deps));
};
const makeFrame = number => ({ id: `f${number}`, number, prompt: `Door opens ${number}`, beat: "Door opens", notes: "", shot: "WS", lens: "35mm", angle: "None", cast: [], resultUrl: `/outputs/old-${number}.png`, status: "complete" });

function generationHarness(options = {}) {
  const node = { id: "board", data: { storyboardFrames: [1, 2, 3].map(makeFrame), storyboardAutoQc: false, status: "ready" } };
  const requests = [], exports = [];
  const update = (_id, patch) => Object.assign(node.data, patch);
  const deps = {
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
      if (options.duringRun) options.duringRun(node);
      return [{ url: `/outputs/new-${request.index + 1}.png` }];
    },
    exportStoryboardFrameResult: async request => { exports.push(request); return { url: request.generated.url }; },
    storyboardFrameWithVersion, storyboardFrameDirection, storyboardEditSignature,
    updateStoryboardNodeFrames: (_id, frames, patch) => update(node.id, { storyboardFrames: frames, ...patch }), loadOutputHistory() {}
  };
  return { node, requests, exports, run: extract("generateStoryboardNode", "reviewStoryboardGeneratedFrame", deps) };
}

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
