import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyboardPromptPolicy } from "../src/storyboardPromptPolicy.js";
import { storyboardFrameContext } from "../src/storyboardWorkflow.js";
import { storyboardCastPrompt, assertStoryboardCharacterTags, storyboardCastPlanningRules, storyboardCastPlanIssues, storyboardQcCharacterInputs, storyboardPlannedCastPatch } from "../src/storyboardCast.js";
import { storyboardReasoningSkill } from "../server/creative-llm.js";
import { storyboardPlanIssues, storyboardQcUnavailable } from "../src/storyboardPlanValidation.js";
import { storyboardDirectorExpansionInstruction } from "../src/storyboardShotExpansion.js";
import { stylePresetPrompts, shotPresetPrompts, lensPresetPrompts, typePresetPrompts } from "../src/modelOptions.js";

const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
function getFunction(source, name, deps = {}) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1);
  const rest = source.slice(start);
  const end = rest.search(/\n(?:async )?function /);
  return new Function(...Object.keys(deps), `${end < 0 ? rest : rest.slice(0, end)}; return ${name};`)(...Object.values(deps));
}
function editorHandler(name, nextName, deps) {
  const body = editor.slice(editor.indexOf(`  async function ${name}(`), editor.indexOf(`  async function ${nextName}(`));
  assert.ok(body.length);
  return new Function(...Object.keys(deps), `${body}; return ${name};`)(...Object.values(deps));
}
const styleConstants = new Function(`${editor.slice(editor.indexOf("const storyboardBaseInstruction ="), editor.indexOf("const storyboardCharacterSheetStyleInstruction ="))}; return { storyboardBaseInstruction, storyboardReferenceStyleGuard, storyboardMoodBoardStyleInstruction, storyboardFinalStyleClamp, storyboardContinuityInstruction };`)();
const sceneReferenceMap = getFunction(editor, "storyboardSceneReferenceMapPrompt");
const propReferenceMap = getFunction(editor, "storyboardPropReferenceMapPrompt");
const buildPrompt = getFunction(editor, "buildStoryboardFramePrompt", {
  ...styleConstants, stylePresetPrompts, shotPresetPrompts, lensPresetPrompts, typePresetPrompts,
  storyboardPromptPolicy, storyboardCastPrompt, storyboardFrameContext, connectedDirectorPackageSource: () => null,
  storyboardAspectRatioForNode: () => "16:9", storyboardSceneReferenceMapPrompt: sceneReferenceMap,
  storyboardPropReferenceMapPrompt: propReferenceMap, promptPiecesForSource: (source) => [source.data.prompt],
  storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png"
});

test("character bindings ignore legacy appearance prose but retain tag, sheet and reference order", () => {
  const prompt = storyboardCastPrompt({}, [{ tag: "Red", label: "Red Character Sheet", details: "Blue eyes, silver hair, a red silk coat." }]);
  assert.match(prompt, /reference image 1, "Red Character Sheet", defines @Red ONLY/);
  assert.doesNotMatch(prompt, /Blue eyes|silver hair|red silk coat|Details for/);
});

test("the image prompt carries physical occupancy through current, previous and anchor references", () => {
  const frame = {
    number: 2, shot: "MS", lens: "35mm", prompt: "@Woman sips coffee while @Man listens at his seat.",
    cast: ["Woman", "Man"].map((tag, i) => ({ tag, visibility: "visible", position: i ? "screen-right" : "screen-left", action: i ? "Listens" : "Sips coffee", eyeline: "Toward scene partner" })),
    spatial: {
      spaceId: "cafe", cameraSetupId: "table-master", view: "Both occupied seats remain inside the frame.",
      visiblePlaces: ["west-seat", "east-seat"], present: [{ tag: "Woman", place: "west-seat" }, { tag: "Man", place: "east-seat" }], hidden: [], blockingChange: ""
    }
  };
  Object.assign(frame, storyboardPlannedCastPatch(frame));
  const prompt = buildPrompt({ data: {} }, frame, "Two people talk over coffee.", {}, {}, {
    castReferences: ["Woman", "Man"].map(tag => ({ tag, label: `${tag} sheet` })),
    activeLocationSources: [], activePropSources: [], hasPreviousFrameReference: true, hasSpatialAnchorReference: true
  });
  assert.match(prompt, /PHYSICAL STAGING: Space cafe; camera setup table-master/);
  assert.match(prompt, /World places inside this frame: west-seat; east-seat/);
  assert.match(prompt, /@Man at east-seat/);
  assert.match(prompt, /Keep people who occupy the visible area, even while listening/);
  assert.match(prompt, /PREVIOUS_FRAME\.png/);
  assert.match(prompt, /SPATIAL_ANCHOR\.png/);
  assert.match(prompt, /"Man sheet", defines @Man ONLY/);
});

for (const useStoryboardStyle of [undefined, true, false]) {
  const mode = useStoryboardStyle === false ? "custom" : useStoryboardStyle === true ? "monochrome" : "legacy default";
  test(`${mode} planning uses the rendering policy once without copying appearance metadata`, async () => {
    let request, calls = 0;
    const frame = { number: 1, shot: "MS", lens: "35mm", angle: "None", beat: "@Red pauses.", notes: "CUT 1", prompt: "@Red removes a jacket, screen-left foreground, looking right.",
      cast: [{ tag: "Red", visibility: "visible", position: "screen-left foreground", action: "Removes a jacket", eyeline: "Right" }] };
    const generate = getFunction(server, "generateStoryboardPlanWithOpenAi", {
      assertStoryboardCharacterTags, storyboardDirectorExpansionInstruction, storyboardCastPlanningRules, storyboardCastPlanIssues, storyboardPlanIssues,
      storyboardPromptPolicy, storyboardReasoningSkill, storyboardFalModel: "mock", storyboardOpenAiModel: "mock",
      runTextLlm: async (body) => { request = body; calls += 1; return { text: JSON.stringify({ sceneTitle: "Scene", analysis: "Stable geography", frames: [frame] }), usage: {} }; },
      parseStoryboardPlanJson: JSON.parse, estimateTextProcessingCost: () => ({ amountUsd: null })
    });
    const result = await generate({ sceneDescription: "@Red removes a jacket.", frameCount: 1, characters: [{ tag: "Red", name: "Red", details: "Blue eyes and a red silk coat" }], useStoryboardStyle });
    assert.equal(calls, 1);
    assert.deepEqual(result.plan.frames, [frame]);
    assert.match(request.prompt, /exact @tag/);
    assert.match(request.prompt, /Do not move unwanted descriptions.*cast metadata or notes/);
    assert.match(request.prompt, /removing a jacket/);
    assert.doesNotMatch(request.prompt, /Blue eyes and a red silk coat|lighting logic, palette/);
    assert.match(request.systemPrompt, /not by redescribing.*physical features, clothing or colors/);
    assert.match(request.prompt, useStoryboardStyle === false ? /STORYBOARD RENDER MODE: CUSTOM STYLE/ : /STORYBOARD RENDER MODE: BLACK-AND-WHITE LINE ART/);
  });

  test(`${mode} generation keeps actions and tags while aligning location and prop rendering`, () => {
    const node = { data: { useStoryboardStyle, sceneName: "Scene" } };
    const frame = { number: 1, prompt: "@Red removes a jacket and hands it to @Blue at @Studio by @Lamp.", beat: "The handoff.", notes: "Preserve eyelines", resultUrl: "/outputs/existing.png" };
    const refs = ["Red", "Blue"].map((tag) => ({ tag, label: `${tag} Character Sheet`, details: "Long silver hair, hazel eyes and a bright red coat" }));
    const incoming = { styleIn: [{ source: { data: { prompt: "Saturated editorial color photography" } } }] };
    const before = JSON.stringify({ node, frame, refs, incoming });
    const prompt = buildPrompt(node, frame, "A handoff at @Studio", incoming, {}, {
      castReferences: refs, activeLocationSources: [{ tag: "Studio", label: "Studio reference" }], activePropSources: [{ tag: "Lamp", label: "Lamp reference" }]
    });
    assert.ok(prompt.includes(frame.prompt));
    assert.match(prompt, /"Red Character Sheet", defines @Red ONLY/);
    assert.match(prompt, /"Blue Character Sheet", defines @Blue ONLY/);
    assert.doesNotMatch(prompt, /Long silver hair|hazel eyes|bright red coat/);
    if (useStoryboardStyle !== false) {
      assert.match(prompt, /STORYBOARD STYLE LOCK/);
      assert.match(prompt, /simple monochrome value groups, not source colors/);
      assert.match(prompt, /simple monochrome linework\/value groups/);
      assert.doesNotMatch(prompt, /Saturated editorial color photography|Preserve relevant materials and palette|shape, materials, color/);
    } else {
      assert.match(prompt, /Saturated editorial color photography/);
      assert.match(prompt, /Preserve relevant materials and palette/);
      assert.doesNotMatch(prompt, /STORYBOARD STYLE LOCK|STORYBOARD RENDER MODE: BLACK-AND-WHITE LINE ART|simple monochrome linework/);
    }
    assert.equal(JSON.stringify({ node, frame, refs, incoming }), before);
  });

  test(`${mode} review respects references without demanding their hues or re-describing outfits`, async () => {
    let request;
    const review = getFunction(server, "reviewStoryboardFrameWithOpenAi", {
      storyboardQcCharacterInputs, storyboardQcUnavailable, storyboardQcReviewPrompt: getFunction(server, "storyboardQcReviewPrompt", { storyboardPromptPolicy }),
      runMediaDescriptionLlm: async (body) => { request = body; return { text: '{"pass":true}', usages: [] }; },
      storyboardVisionFalModel: "mock", storyboardVisionOpenAiModel: "mock", estimateTextProcessingCost: () => ({}),
      normalizeStoryboardQcResult: (value) => value, parseStoryboardPlanJson: JSON.parse
    });
    await review({ sourceUrl: "/outputs/board.png", characterReferences: [{ tag: "Red", url: "/outputs/red.png" }], framePrompt: "@Red removes a jacket.", useStoryboardStyle });
    assert.deepEqual(request.inputs.map(({ url }) => url), ["/outputs/board.png", "/outputs/red.png"]);
    assert.match(request.prompt, /not new physical descriptions or wardrobe\/color catalogues/);
    assert.match(request.prompt, /Do not undo an explicit clothing interaction/);
    assert.match(request.prompt, /Occupancy audit: use PHYSICAL STAGING/);
    assert.match(request.prompt, /An offscreen label alone does not excuse this/);
    assert.match(request.prompt, /Fail unexplained disappearing occupants as major continuity errors/);
    if (useStoryboardStyle !== false) assert.match(request.prompt, /Never fail a monochrome board for not matching the colors/);
    else {
      assert.match(request.prompt, /Color and photographic rendering are allowed/);
      assert.doesNotMatch(request.prompt, /Fail obvious colored output|STORYBOARD RENDER MODE: BLACK-AND-WHITE LINE ART/);
    }
  });

  test(`${mode} client passes its rendering choice to planning and review without changing saved content`, async () => {
    let planRequest, reviewRequest;
    const node = { id: "board", data: { useStoryboardStyle, storyboardFrames: [{ prompt: "Saved manual text", resultUrl: "/outputs/keep.png" }] } };
    const before = JSON.stringify(node);
    const plan = editorHandler("planStoryboardNode", "generateStoryboardFrame", {
      nodesRef: { current: [node] }, edgesRef: { current: [] }, buildIncomingByNode: () => ({}), expandStoryboardDirectorIncoming: () => ({}),
      storyboardSceneDescriptionForNode: () => "@Red removes a jacket.", connectedDirectorPackageSource: () => null, storyboardFrameCountForNode: () => 1,
      updateNode: () => {}, updateStoryboardStatus: () => {}, storyboardTaskBusy: () => false, normalizeStoryboardFrameCountValue: () => "Auto", assertCharacterOutputReferences: () => {}, assertStoryboardCharacterTags,
      storyboardCharacterSummariesForNode: () => [{ name: "Red", tag: "Red" }], storyboardSceneReferenceSummaries: () => [], storyboardPropReferenceSummaries: () => [], workflowRequestContext: () => ({}),
      nodeApi: { planStoryboard: async (body) => { planRequest = body; return { response: { ok: false }, data: {} }; } },
      requireStoryboardPlanResponse: () => { throw new Error("Mock refusal preserves saved content"); }
    });
    await plan(node, { replace: true });
    const review = editorHandler("reviewStoryboardGeneratedFrame", "exportStoryboardFrameResult", {
      nodeApi: { reviewStoryboardFrame: async (body) => { reviewRequest = body; return { response: { ok: true }, data: { qc: { pass: true } } }; } },
      storyboardPreviousFrameLabel: "PREVIOUS_FRAME.png", storyboardSpatialAnchorLabel: "SPATIAL_ANCHOR.png",
      workflowContextPayload: (value) => value, workflowRequestContext: () => ({}), normalizeStoryboardQcForClient: (value) => value, storyboardQcUnavailable
    });
    await review({ node, frame: { number: 1 }, generated: { url: "/outputs/board.png" }, framePrompt: "@Red pauses" });
    assert.equal(planRequest.useStoryboardStyle, useStoryboardStyle !== false);
    assert.equal(reviewRequest.useStoryboardStyle, useStoryboardStyle !== false);
    assert.equal(JSON.stringify(node), before);
  });
}

test("legacy hand-authored color words are not destructively stripped from saved prompts or tags", () => {
  const node = { data: {} };
  const frame = { number: 1, prompt: "@Red gives @Blue the red key, not the blue key.", resultUrl: "/outputs/keep.png" };
  const before = structuredClone(frame);
  const prompt = buildPrompt(node, frame, "Keep both keys", {}, {}, { castReferences: [], activeLocationSources: [], activePropSources: [] });
  assert.ok(prompt.includes(frame.prompt));
  assert.match(prompt, /story-critical identifier/);
  assert.match(prompt, /overrides descriptive appearance\/color language in old prompts/);
  assert.deepEqual(frame, before);
});

test("live route handlers pass the explicit rendering choice through, defaulting legacy requests to monochrome", async () => {
  const routes = new Map();
  const captured = [];
  const deps = {
    app: { post: (url, handler) => routes.set(url, handler) },
    storyboardDirectorFramePlan: () => ({}), normalizeStoryboardFrameCount: () => 1,
    requireActiveLlmProvider: () => {}, activeLlmProvider: () => "mock",
    generateStoryboardPlanWithOpenAi: async (body) => { captured.push(body); return { plan: {} }; },
    reviewStoryboardFrameWithOpenAi: async (body) => { captured.push(body); return { qc: { pass: true } }; },
    createStoryboardQc: ({ review }) => review, readLocalAsset: async () => {},
    activeLlmCredential: () => "test", storyboardVisionOpenAiModel: "mock", storyboardVisionFalModel: "mock",
    storyboardQcReviewPrompt: () => "Policy",
    recordStoryboardLlmUsage: async () => {}, normalizeStoryboardPlan: (plan) => plan
  };
  const source = server.slice(server.indexOf('app.post("/api/node/storyboard-plan"'), server.indexOf('app.post("/api/node/storyboard-export-frame"'));
  new Function(...Object.keys(deps), source)(...Object.values(deps));
  for (const useStoryboardStyle of [undefined, true, false]) {
    for (const handler of routes.values()) {
      let response;
      await handler({ body: { sceneDescription: "@Red pauses.", sourceUrl: "/outputs/frame.png", useStoryboardStyle } }, {
        json: (value) => { response = value; }, status: () => assert.fail("Valid mocked request should not fail")
      });
      assert.ok(response);
      assert.equal(captured.at(-1).useStoryboardStyle, useStoryboardStyle !== false);
    }
  }
  assert.equal(captured.length, 6);
});
