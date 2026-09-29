import test from "node:test";
import { storyboardFrameContext, storyboardFrameDirection, storyboardFrameWithVersion, storyboardEditSignature } from "../src/storyboardWorkflow.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertStoryboardCharacterTags, storyboardCharacterMentioned, storyboardCastPlanIssues,
  storyboardPlannedCastPatch, currentStoryboardCast, resolveStoryboardFrameCast,
  storyboardCastPrompt, storyboardQcCharacterInputs
} from "../src/storyboardCast.js";
import { validateCreativeResponse } from "../server/creative-llm.js";
import { storyboardQcUnavailable } from "../src/storyboardPlanValidation.js";
import { nodeApi } from "../src/api/newtApi.js";
import { runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";
import { storyboardImageSettings, normalizeStoryboardImageModel } from "../src/storyboardImageModels.js";
import { storyboardPromptPolicy } from "../src/storyboardPromptPolicy.js";

const characters = ["Dad", "Mom", "Daughter", "Son", "Neighbor", "Driver"].map((tag) => ({
  tag, name: tag, url: `/outputs/${tag}.png`, label: `${tag} Character Sheet`
}));
const member = (tag, position, visibility = "visible") => ({ tag, position, visibility, action: "Listening", eyeline: "Toward @Dad" });
function planned(overrides = {}) {
  const frame = {
    number: 1, shot: "WS", lens: "35mm", angle: "None", beat: "The family pauses to listen.", notes: "CUT 1 - opening",
    prompt: "@Dad stands screen-left foreground. @Mom is screen-right midground. @Daughter is center background. @Son is offscreen right.",
    cast: [member("Daughter", "center background"), member("Dad", "screen-left foreground"), member("Mom", "screen-right midground"), member("Son", "outside frame right", "offscreen")],
    ...overrides
  };
  return { ...frame, ...storyboardPlannedCastPatch(frame) };
}

test("six-character roster resolves only the visible shot cast, in explicit reference order", () => {
  const frame = planned();
  const resolved = resolveStoryboardFrameCast(frame, characters);
  assert.deepEqual(resolved.references.map((item) => item.tag), ["Daughter", "Dad", "Mom"]);
  const prompt = storyboardCastPrompt(frame, resolved.references);
  assert.match(prompt, /Visible referenced cast: 3 distinct identities/);
  assert.match(prompt, /@Dad: screen-left foreground/);
  assert.match(prompt, /@Mom: screen-right midground/);
  assert.match(prompt, /@Son: OFFSCREEN, do not depict/);
  assert.match(prompt, /reference image 1, "Daughter Character Sheet", defines @Daughter ONLY/);
  assert.doesNotMatch(prompt, /Neighbor Character Sheet|Driver Character Sheet|Son Character Sheet/);
  assert.match(prompt, /multiple views of ONE identity/);
});

test("isolated close-up excludes the offscreen eyeline target; OTS includes a visible shoulder", () => {
  const frame = planned({ shot: "CU", beat: "@Daughter replies.", prompt: "@Daughter looks left toward @Dad offscreen.",
    cast: [member("Daughter", "screen-right foreground"), member("Dad", "offscreen left", "offscreen")] });
  assert.deepEqual(resolveStoryboardFrameCast(frame, characters).references.map((item) => item.tag), ["Daughter"]);
  const ots = planned({ prompt: "@Daughter at right, @Dad's shoulder in left foreground.", beat: "@Daughter replies.",
    cast: [member("Daughter", "right midground"), member("Dad", "left foreground, shoulder only")] });
  assert.deepEqual(resolveStoryboardFrameCast(ots, characters).references.map((item) => item.tag), ["Daughter", "Dad"]);
});

test("empty cast inserts do not inherit characters from the scene or connected roster", () => {
  const frame = planned({ prompt: "A key rests on the empty table.", beat: "The key.", cast: [] });
  assert.deepEqual(resolveStoryboardFrameCast(frame, characters).references, []);
  assert.match(storyboardCastPrompt(frame), /Visible referenced cast: 0 distinct identities/);
});

test("plan validation rejects duplicates, unknown tags, omitted mentions and missing blocking", () => {
  assert.deepEqual(storyboardCastPlanIssues([planned()], characters), []);
  for (const patch of [
    { cast: [member("Dad", "left"), member("Dad", "right")] },
    { cast: [member("Unknown", "left")] }, { cast: [] },
    { cast: [member("Dad", "")] }, { cast: [null] }, { cast: [member("@Dad", "left")] }
  ]) assert.ok(storyboardCastPlanIssues([planned(patch)], characters).length);
  assert.throws(() => resolveStoryboardFrameCast(planned({ cast: [member("Unknown", "left")] }), characters), /unknown character/);
});

test("new plans have enforceable cast fields through the shared provider schema", () => {
  const { castSource, ...frame } = planned();
  const plan = { sceneTitle: "Greeting", analysis: "Same geography.", frames: [frame] };
  const check = () => validateCreativeResponse({}, { route: "storyboard-plan", provider: "test", text: JSON.stringify(plan) });
  assert.equal(check().frames[0].cast.length, 4);
  delete frame.cast;
  assert.throws(check, /cast/);
});

test("save/reopen retains bindings; edits to shot text invalidate hidden blocking without losing media", () => {
  const original = planned({ resultUrl: "/outputs/keep.png", exportUrl: "/outputs/export.png" });
  const reopened = JSON.parse(JSON.stringify(original));
  assert.deepEqual(currentStoryboardCast(reopened), original.cast);
  for (const field of ["prompt", "beat", "notes", "shot", "lens", "angle"]) {
    const edited = { ...reopened, [field]: "New manual instruction" };
    assert.equal(currentStoryboardCast(edited), null);
    assert.equal(edited.resultUrl, original.resultUrl);
    assert.equal(edited.exportUrl, original.exportUrl);
  }
  const edited = { ...reopened, prompt: "@Dad is now screen-right. @Mom is screen-left." };
  assert.doesNotMatch(storyboardCastPrompt(edited), /@Dad: screen-left foreground/);
});

test("legacy exact names work without @; prefixes and ambiguous generic casts cannot swap references", () => {
  assert.equal(storyboardCharacterMentioned("@Daughter smiles", { tag: "Daugh", name: "Daugh" }), false);
  assert.equal(storyboardCharacterMentioned("@Joanne enters", { tag: "Jo", name: "Jo" }), false);
  assert.equal(storyboardCharacterMentioned("Mother waits", { tag: "Mom", name: "Mom" }), false);
  const frame = { number: 1, prompt: "Dad stands left; Mom stands right." };
  assert.deepEqual(resolveStoryboardFrameCast(frame, characters).references.map((item) => item.tag), ["Dad", "Mom"]);
  assert.throws(() => resolveStoryboardFrameCast({ number: 2, prompt: "The woman faces the man." }, characters), /identities are ambiguous/);
  assert.throws(() => assertStoryboardCharacterTags([{ tag: "Dad" }, { tag: "dad" }]), /unique name/);
  assert.throws(() => resolveStoryboardFrameCast(frame, characters.map((item) => item.tag === "Mom" ? { ...item, url: "" } : item)), /sheet missing for @Mom/);
});

test("new camera-relative assignments are honored, without inheriting a previous shot's coordinates", () => {
  const reversed = planned({ prompt: "Reverse: @Dad is screen-right foreground, @Mom left background.", beat: "@Mom answers.",
    cast: [member("Dad", "screen-right foreground"), member("Mom", "screen-left background")] });
  assert.match(storyboardCastPrompt(reversed, resolveStoryboardFrameCast(reversed, characters).references), /@Dad: screen-right foreground/);
});

const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
function getFunction(source, name, deps = {}) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1);
  const rest = source.slice(start);
  const end = rest.search(/\n(?:async )?function /);
  return new Function(...Object.keys(deps), `${end < 0 ? rest : rest.slice(0, end)}; return ${name};`)(...Object.values(deps));
}

test("actual plan normalization and editor persistence keep cast bindings without touching image state", () => {
  const normalizeChoice = (value, choices, fallback) => choices.includes(value) ? value : fallback;
  const normalize = getFunction(server, "normalizeStoryboardPlanFrame", { normalizeChoice });
  const fromPlan = getFunction(editor, "storyboardFramesFromPlan", {
    storyboardMaxFrameCount: 35, normalizeChoice, shotPresetNames: ["WS"], lensPresetNames: ["35mm"], typePresetNames: ["None"],
    createStoryboardFrame: (number, patch) => ({ id: `frame-${number}`, number, ...patch }), storyboardPlannedCastPatch, storyboardFrameDirection
  });
  const [frame] = fromPlan([normalize(planned())]);
  assert.deepEqual(currentStoryboardCast(frame), planned().cast);
  assert.deepEqual(currentStoryboardCast(JSON.parse(JSON.stringify(frame))), frame.cast);
});

test("actual editor source mapping works with internal and connected identities, without array-position aliases", () => {
  const summaries = characters.map(({ tag, name }) => ({ tag, name }));
  const sources = characters.toReversed().map((item) => ({ id: item.tag, data: { tag: item.tag, resultUrl: item.url } }));
  const resolve = getFunction(editor, "storyboardFrameCastForNode", {
    connectedDirectorPackageSource: () => null,
    storyboardCharacterSummariesForNode: () => summaries,
    assertStoryboardCharacterTags, storyboardCharacterSourcesForNode: () => sources,
    characterTag: (source) => source.data.tag, characterOutputReference: (data) => ({ url: data.resultUrl }),
    characterReferenceLabel: (source) => `${source.data.tag} Character Sheet`,
    characterGenerationPhysicalDetailsPrompt: () => assert.fail("Do not copy physical details into Storyboard shot prompts"),
    characterTraitPrompt: () => assert.fail("Do not copy appearance traits into Storyboard shot prompts"), resolveStoryboardFrameCast
  });
  assert.deepEqual(resolve({ id: "board" }, planned()).references.map(({ tag, url }) => ({ tag, url })), ["Daughter", "Dad", "Mom"].map((tag) => ({ tag, url: `/outputs/${tag}.png` })));
});

test("QC gets full identity sheets with explicit labels alongside generated and continuity frames", async () => {
  let captured;
  const prompt = getFunction(server, "storyboardQcReviewPrompt", { storyboardPromptPolicy });
  const review = getFunction(server, "reviewStoryboardFrameWithOpenAi", {
    storyboardQcCharacterInputs, storyboardQcUnavailable, storyboardQcReviewPrompt: prompt,
    runMediaDescriptionLlm: async (request) => { captured = request; return { text: '{"pass":true}', usages: [] }; },
    storyboardVisionFalModel: "mock", storyboardVisionOpenAiModel: "mock", estimateTextProcessingCost: () => ({}),
    normalizeStoryboardQcResult: (value) => value, parseStoryboardPlanJson: JSON.parse
  });
  const refs = resolveStoryboardFrameCast(planned(), characters).references;
  await review({ sourceUrl: "/outputs/current.png", previousFrameUrl: "/outputs/previous.png", spatialAnchorUrl: "/outputs/anchor.png",
    characterReferences: refs, framePrompt: storyboardCastPrompt(planned(), refs) });
  assert.deepEqual(captured.inputs.map((item) => item.url), ["/outputs/current.png", ...refs.map((item) => item.url), "/outputs/previous.png", "/outputs/anchor.png"]);
  assert.match(captured.inputs[1].label, /@Daughter only/);
  assert.match(captured.prompt, /duplicated person replacing another/);
  assert.match(captured.prompt, /wrong identity or swapped assignment is a major failure/);
  assert.match(captured.prompt, /not the review images/);
  assert.throws(() => storyboardQcCharacterInputs([{ tag: "Dad" }]), /original sheet/);
  assert.throws(() => storyboardQcCharacterInputs(Array(17).fill(characters[0])), /up to 16/);
});

for (const scenario of ["correct swapped identities", "missing sheet", "duplicate tags"]) {
  test(`complete Storyboard runner with six characters: ${scenario}`, async (t) => {
    const roster = structuredClone(characters);
    if (scenario === "missing sheet") roster[0].url = "";
    if (scenario === "duplicate tags") roster[5].tag = "Dad";
    const sources = roster.toReversed().map((item) => ({ data: { tag: item.tag, url: item.url } }));
    const node = { id: "board", type: "storyboard", data: { useStoryboardStyle: false, storyboardFrames: [{ id: "frame", ...planned() }] } };
    const updateNode = (_id, patch) => { node.data = { ...node.data, ...patch }; };
    const generate = t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: true }, data: { image: { localUrl: "/outputs/generated.png" } } }));
    const review = t.mock.method(nodeApi, "reviewStoryboardFrame", async () => ({ response: { ok: true }, data: { qc: {
      pass: review.mock.callCount() > 1, shouldRetry: true, severity: "major",
      issues: ["@Dad and @Mom swapped positions."], correctionPrompt: "Put @Dad screen-left foreground; @Mom screen-right midground."
    } } }));
    const characterTag = (source) => source.data.tag;
    const characterOutputReference = (data) => ({ url: data.url });
    const characterReferenceLabel = (source) => `${characterTag(source)} Character Sheet`;
    const uniqueStoryboardImagePromptItems = getFunction(editor, "uniqueStoryboardImagePromptItems");
    const storyboardCharacterReferenceItemForSource = getFunction(editor, "storyboardCharacterReferenceItemForSource", { characterOutputReference, characterReferenceLabel });
    const storyboardImagePromptItems = getFunction(editor, "storyboardImagePromptItems", {
      connectedDirectorPackageSource: () => null, storyboardCharacterReferenceItemForSource,
      connectedImagePromptItems: () => [], uniqueStoryboardImagePromptItems
    });
    const buildStoryboardFramePrompt = getFunction(editor, "buildStoryboardFramePrompt", {
      storyboardPromptPolicy, storyboardFrameContext,
      connectedDirectorPackageSource: () => null, storyboardAspectRatioForNode: () => "16:9", storyboardCastPrompt,
      storyboardSceneReferenceMapPrompt: () => "", storyboardPropReferenceMapPrompt: () => "",
      shotPresetPrompts: {}, lensPresetPrompts: {}, typePresetPrompts: {}, storyboardContinuityInstruction: "Preserve physical geography.",
      storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png"
    });
    const reviewSource = editor.slice(editor.indexOf("  async function reviewStoryboardGeneratedFrame("), editor.indexOf("  async function exportStoryboardFrameResult("));
    const reviewDeps = {
      nodeApi, storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png",
      workflowContextPayload: (value) => value, workflowRequestContext: () => ({}), normalizeStoryboardQcForClient: (value) => value, storyboardQcUnavailable
    };
    const reviewStoryboardGeneratedFrame = new Function(...Object.keys(reviewDeps), `${reviewSource}\nreturn reviewStoryboardGeneratedFrame;`)(...Object.values(reviewDeps));
    const deps = {
      nodesRef: { current: [node] }, edgesRef: { current: [] }, generationProvider: "fal",
      storyboardTaskBusy: () => false, updateStoryboardStatus: updateNode, pushUndoSnapshot: () => {}, storyboardFrameWithVersion, storyboardFrameDirection, storyboardEditSignature,
      storyboardImageSettings, normalizeStoryboardImageModel, runImageModelGeneration, assertStoryboardCharacterTags,
      assertCharacterOutputReferences: () => {}, storyboardCharacterSummariesForNode: () => roster,
      storyboardFrameCastForNode: (_node, frame) => resolveStoryboardFrameCast(frame, roster),
      buildIncomingByNode: () => ({}), expandStoryboardDirectorIncoming: (value) => value,
      normalizedStoryboardFrames: (frames) => frames, storyboardSceneDescriptionForNode: () => "@Dad, @Mom, @Daughter and @Son at home; @Neighbor and @Driver arrive later.",
      storyboardPlanIsCurrent: () => true, updateNode, workflowRequestContext: () => ({}), connectedDirectorPackageSource: () => null,
      ensureStoryboardCharactersReady: async () => node, storyboardNodeWithMostPreparedCharacters: (_prepared, state) => state,
      storyboardAspectRatioForNode: () => "16:9", storyboardResolutionForNode: () => "1K",
      patchStoryboardFrame: (_id, frameId, patch) => { node.data.storyboardFrames = node.data.storyboardFrames.map((frame) => frame.id === frameId ? { ...frame, ...patch } : frame); },
      storyboardContinuityReferenceItems: () => [{ url: "/outputs/previous.png", label: "PREVIOUS_FRAME.png" }],
      storyboardCharacterSourcesForNode: () => sources, characterTag,
      storyboardSceneReferenceSources: () => [], storyboardRequiredLocationSourcesForFrame: () => [],
      storyboardPropReferenceSources: () => [], storyboardRequiredPropSourcesForFrame: () => [],
      storyboardImagePromptItems, storyboardImagePromptItemsForFrame: getFunction(editor, "storyboardImagePromptItemsForFrame", { uniqueStoryboardImagePromptItems }),
      buildStoryboardFramePrompt, storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png",
      reviewStoryboardGeneratedFrame, storyboardQcRetryPrompt: getFunction(editor, "storyboardQcRetryPrompt"),
      exportStoryboardFrameResult: async () => ({ url: "/outputs/export.png" }),
      updateStoryboardNodeFrames: (_id, frames, patch) => updateNode("board", { storyboardFrames: frames, ...patch }), loadOutputHistory: () => {}
    };
    const handler = editor.slice(editor.indexOf("  async function generateStoryboardNode("), editor.indexOf("  async function reviewStoryboardGeneratedFrame("));
    const run = new Function(...Object.keys(deps), `${handler}\nreturn generateStoryboardNode;`)(...Object.values(deps));
    const result = await run(node);
    if (scenario !== "correct swapped identities") {
      assert.equal(result.status, "error");
      assert.match(node.data.error, scenario === "missing sheet" ? /sheet missing for @Dad/ : /unique name/);
      assert.equal(generate.mock.callCount(), 0);
      assert.equal(review.mock.callCount(), 0);
      return;
    }
    assert.equal(result.status, "complete");
    assert.equal(generate.mock.callCount(), 2);
    assert.equal(review.mock.callCount(), 2);
    for (const call of generate.mock.calls) {
      const body = call.arguments[0];
      assert.deepEqual(body.imagePromptUrls, ["/outputs/Daughter.png", "/outputs/Dad.png", "/outputs/Mom.png", "/outputs/previous.png"]);
      assert.deepEqual(body.imagePromptLabels, ["Daughter Character Sheet", "Dad Character Sheet", "Mom Character Sheet", "PREVIOUS_FRAME.png"]);
      assert.match(body.prompt, /@Son: OFFSCREEN, do not depict/);
      assert.match(body.prompt, /reference image 2, "Dad Character Sheet", defines @Dad ONLY/);
    }
    for (const call of review.mock.calls) {
      assert.deepEqual(call.arguments[0].characterReferences, ["Daughter", "Dad", "Mom"].map((tag) => ({ tag, url: `/outputs/${tag}.png` })));
      assert.equal(call.arguments[0].useStoryboardStyle, false);
    }
    assert.match(generate.mock.calls[1].arguments[0].prompt, /Put @Dad screen-left foreground; @Mom screen-right midground/);
    assert.equal(node.data.storyboardFrames[0].qcRetryCount, 1);
  });
}
