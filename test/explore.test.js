import test from "node:test";
import { isCoverageNode } from "../src/coveragePresets.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exploreDefaults, exploreRequest, exploreDirectionRequest, explorePlanningPrompt, normalizeExploreData, normalizeExplorePlan, explorePlanSchema, exploreSelectionPatch, validateExplorePlan, exploreImagePrompt, explorePlanningInstructions, exploreGrades, exploreStyleFamilies, exploreReferenceDescription } from "../src/explore.js";
import { gradePresetPrompts } from "../src/colorLook.js";
import { stylePresetPrompts } from "../src/modelOptions.js";
import { exploreMediumGuidance } from "../src/exploreArtDirection.js";
import { normalizedResultItems } from "../src/mediaResults.js";
import { runExploreGeneration } from "../src/nodeRunners/explore.js";
import { clearStaleRunningState } from "../src/workflowState.js";
import { registerExploreRoutes } from "../server/routes/explore.js";
import { validateCreativeResponse, openAiLlmBody, falLlmInput } from "../server/creative-llm.js";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { shouldNotifyNodeGenerationComplete } from "../src/generationChime.js";
import { nodeApi } from "../src/api/newtApi.js";

const direction = (name = "Sculptural light") => ({ name, concept: `${name}: a purposeful still life`, composition: "Off-center, generous negative space",
  lighting: "Hard directional key", palette: "Black, white, yellow", treatment: "Precise editorial photography", styleBrief: "Graphic lighting and restrained materials.", prompt: `A single image with ${name}.` });
const input = (patch = {}) => ({ data: exploreDefaults(), prompt: "A perfume bottle", references: [], ...patch });
const item = (name = "Sculptural light") => ({ url: `/outputs/${name}.png`, type: "image", label: name, direction: direction(name) });

test("Explore defaults, normalization, selection and port-independent style survive persistence", () => {
  const data = normalizeExploreData({ ...exploreDefaults(), resultItems: [item(), item("Reflections")], selectedResultIndex: 1, custom: "keep" });
  assert.equal(data.resultText, direction().styleBrief);
  assert.equal(data.resultUrl, item("Reflections").url);
  assert.equal(data.custom, "keep");
  assert.deepEqual(normalizeExploreData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(exploreSelectionPatch(data, 0).resultUrl, item().url);
  assert.equal(exploreDefaults().model, "OpenAI Image 2.5 Flare");
  assert.equal(exploreDefaults().quality, "medium");
  assert.equal(exploreDefaults().directionCount, 9);
  assert.ok(nodeTypeDefinitions.some(node => node.type === "explore"));
});

test("new Explore defaults survive normalization without changing saved model, quality or direction choices", () => {
  const data = normalizeExploreData();
  assert.equal(data.model, "OpenAI Image 2.5 Flare");
  assert.equal(data.quality, "medium");
  assert.equal(data.directionCount, 9);
  assert.equal(exploreRequest(input()).count, 9);
  assert.equal(normalizeExploreData({ directionCount: 100 }).directionCount, 25);
  assert.equal(normalizeExploreData({ directionCount: 25 }).directionCount, 25);
  const saved = normalizeExploreData({ model: "Nano Banana Pro", quality: "high", directionCount: 4 });
  assert.equal(saved.model, "Nano Banana Pro");
  assert.equal(saved.quality, "high");
  assert.equal(saved.directionCount, 4);
});

test("planning is bounded and rejects missing briefs, parents and refinement notes", () => {
  assert.throws(() => exploreRequest(input({ prompt: " " })), /brief/);
  assert.equal(exploreRequest(input({ data: { directionCount: 8, variations: 3 } })).count, 8);
  assert.throws(() => exploreRequest(input({ action: "refine", parents: [item()] })), /Describe/);
  assert.throws(() => exploreRequest(input({ action: "combine", parents: [item()], note: "Mix" })), /two/);
  assert.throws(() => exploreRequest(input({ references: Array(9).fill({ url: "/outputs/a.png" }) })), /eight/);
  assert.throws(() => exploreRequest(input({ action: "invent" })), /supported/);
});

test("removed Advanced Outputs state is discarded without altering saved images or direction details", () => {
  assert.equal(Object.hasOwn(exploreDefaults(), "advancedOutputsOpen"), false);
  const legacy = normalizeExploreData({ resultItems: [item()], selectedResultIndex: 0 });
  const open = normalizeExploreData(JSON.parse(JSON.stringify({ ...legacy, advancedOutputsOpen: true })));
  assert.equal(Object.hasOwn(open, "advancedOutputsOpen"), false);
  assert.equal(open.resultText, legacy.resultText);
  assert.equal(open.resultUrl, legacy.resultUrl);
  assert.deepEqual(open.resultItems, legacy.resultItems);
  assert.deepEqual(normalizeExploreData({ ...open, advancedOutputsOpen: false }), legacy);
});

test("References expansion is not restored from legacy project data", () => {
  assert.equal(Object.hasOwn(exploreDefaults(), "referencesOpen"), false);
  const saved = { ...exploreDefaults(), resultItems: [item()], styleFamily: "Claymation", gradePreset: "None" };
  for (const referencesOpen of [true, false]) {
    assert.deepEqual(normalizeExploreData({ ...saved, referencesOpen }), normalizeExploreData(saved));
  }
});

test("medium, reference authority and cinematic craft are explicit rather than a universal film filter", () => {
  assert.match(explorePlanningInstructions, /Graphic\/logo tasks require clean marks/);
  assert.match(explorePlanningInstructions, /scene content, viewpoint, framing, subject proportions and positions stay fixed/);
  assert.match(explorePlanningInstructions, /None of these settings weakens subject\/identity fidelity/);
  const request = exploreRequest(input({ references: [{ url: "/outputs/product.png", role: "product", label: "Bottle" }, { url: "/outputs/mood.png", role: "mood", label: "Lighting" }], camera: "35mm", style: "Muted color" }));
  const prompt = exploreImagePrompt(request, direction(), 1);
  assert.match(prompt, /1: product - Bottle; 2: mood - Lighting/);
  assert.match(prompt, /Variation 2/);
  assert.match(prompt, /35mm/);
  assert.match(prompt, /Muted color/);
});

test("Astra structured output and Fal local validation reject malformed, duplicate and incomplete plans", () => {
  const request = { route: "explore-plan", model: "gpt-6-astra", prompt: "test", responseMimeType: "application/json", reasoningEffort: "medium" };
  assert.equal(openAiLlmBody(request).text.format.type, "json_schema");
  assert.equal(falLlmInput({ ...request, model: "openai/gpt-6-astra" }).reasoning, true);
  const plan = { directions: [direction(), direction("Reflections")] };
  assert.deepEqual(validateExplorePlan(plan, 2), plan);
  assert.throws(() => validateExplorePlan(plan, 3), /expected/);
  assert.throws(() => validateExplorePlan({ directions: [direction(), direction()] }, 2), /duplicate/);
  assert.throws(() => validateCreativeResponse({}, { route: request.route, provider: "mock", text: '{"directions":[{"name":"Test"}]}' }), /planning data/);
  assert.throws(() => validateCreativeResponse({ status: "incomplete" }, { route: request.route, provider: "mock", text: JSON.stringify(plan) }), /incomplete/);
});

test("Explore gives Fal the exact output contract, including string palettes and no echoed look fields", () => {
  const body = falLlmInput({ model: "openai/gpt-6-astra", route: "explore-plan", prompt: "Brief", systemPrompt: explorePlanningInstructions });
  assert.ok(body.system_prompt.includes(JSON.stringify(explorePlanSchema)));
  assert.match(body.system_prompt, /Palette is one descriptive string, never an array or object/);
  assert.match(body.system_prompt, /request metadata are inputs only/);
  assert.equal(body.prompt, "Brief");
  assert.equal(body.reasoning, true);
  assert.equal(body.response_format, undefined, "the Fal adapter must not invent an unsupported schema parameter");
});

test("Explore canonicalizes harmless metadata and string palettes without changing required content", () => {
  const raw = { commentary: "Unused", directions: [{ ...direction(), palette: [" Warm ivory ", "Deep charcoal"], styleFamily: "Echoed family", gradePreset: "Echoed grade" }] };
  const original = structuredClone(raw);
  const expected = { directions: [{ ...direction(), palette: "Warm ivory, Deep charcoal" }] };
  assert.deepEqual(normalizeExplorePlan(raw), expected);
  assert.deepEqual(raw, original);
  for (const provider of ["fal", "atlas", "OpenAI"]) {
    assert.deepEqual(validateCreativeResponse({}, { route: "explore-plan", provider, text: JSON.stringify(raw) }), expected);
  }
  const invalid = [
    null, [], {}, { directions: [] }, { directions: [null] }, { directions: [[direction()]] },
    ...[[], [" "], ["warm", 2], [{ color: "blue" }], { primary: "blue" }, null, " ", "x".repeat(5001)].map(palette => ({ directions: [{ ...direction(), palette }] })),
    { directions: [{ ...direction(), prompt: undefined }] },
    { directions: [{ ...direction(), name: "x".repeat(101) }] },
    { directions: Array.from({ length: 26 }, (_, index) => direction(`Look ${index}`)) }
  ];
  for (const value of invalid) {
    assert.throws(() => validateCreativeResponse({}, { route: "explore-plan", provider: "fal", text: JSON.stringify(value) }), /planning data/);
  }
  for (const data of [{ partial: true }, { status: "incomplete" }, { choices: [{ finish_reason: "content_filter" }] }, { output: [{ content: [{ type: "refusal" }] }] }]) {
    assert.throws(() => validateCreativeResponse(data, { route: "explore-plan", provider: "fal", text: JSON.stringify(raw) }), /incomplete or refused/);
  }
  assert.throws(() => validateCreativeResponse({}, { route: "film-director-style", provider: "fal", text: JSON.stringify({ styleDirection: "Good light", extra: true }) }), /planning data/);
});

function runnerFixture(patch = {}, options = {}) {
  let data = { ...exploreDefaults(), directionCount: 2, prompt: "Bottle", ...patch }, plans = 0, generations = [], planningRequests = [];
  const run = () => runExploreGeneration({ node: { id: "explore-test", data, type: "explore" }, prompt: data.prompt, references: options.references || [], workflowContext: { projectId: "test" },
    update: update => { data = { ...data, ...structuredClone(update) }; options.onUpdate?.(data); }, shouldStop: options.shouldStop,
    plan: async request => { plans++; planningRequests.push(request); return options.plan ? options.plan(request) : { directions: Array.from({ length: request.count }, (_, index) => direction(`Direction ${index + 1}`)) }; },
    generate: async args => { generations.push(args); if (options.generate) return options.generate(args, generations.length); return [item(`Image ${generations.length}`)]; }
  });
  return { run, data: () => data, plans: () => plans, generations, planningRequests, patch: patch => { data = { ...data, ...patch }; } };
}

test("Explore Mode defaults on and explicit off plus Random controls survive reopening", () => {
  assert.equal(exploreDefaults().exploreMode, true);
  assert.equal(normalizeExploreData({}).exploreMode, true);
  assert.deepEqual(exploreStyleFamilies.slice(0, 2), ["Auto", "Random"]);
  assert.deepEqual(exploreGrades.slice(0, 2), ["None", "Random"]);
  const data = normalizeExploreData({ exploreMode: false, styleFamily: "Random", gradePreset: "Random", resultItems: [item()] });
  assert.deepEqual(normalizeExploreData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(data.exploreMode, false); assert.equal(data.styleFamily, "Random"); assert.equal(data.gradePreset, "Random");
});

test("random choices balance each preset pool and resolved guidance remains consistent", () => {
  const request = exploreRequest(input({ data: { directionCount: 25, styleFamily: "Random", gradePreset: "Random" }, random: () => 0.3 }));
  assert.equal(request.directionLooks.length, 25);
  const styles = request.directionLooks.map(look => look.styleFamily), grades = request.directionLooks.map(look => look.gradePreset);
  assert.equal(new Set(styles.slice(0, 14)).size, 14);
  assert.equal(new Set(grades.slice(0, 10)).size, 10);
  assert.equal(new Set(request.directionLooks.map(look => JSON.stringify(look))).size, 25);
  assert.ok(styles.every(name => !["None", "Auto", "Random", "UGC Device", "Sexy as Fuk", "Strange as Fuk"].includes(name)));
  const planning = JSON.parse(explorePlanningPrompt(request));
  request.directionLooks.forEach((look, index) => {
    const resolved = exploreDirectionRequest(request, index);
    assert.equal(resolved.style, exploreMediumGuidance[look.styleFamily]);
    assert.equal(resolved.grade, gradePresetPrompts[look.gradePreset]);
    assert.equal(planning.lookGuidance.styles[look.styleFamily], resolved.style);
    assert.equal(planning.lookGuidance.grades[look.gradePreset], resolved.grade);
    assert.ok(exploreImagePrompt(resolved, direction()).includes(resolved.grade));
    assert.ok(exploreImagePrompt(resolved, direction()).includes(`Selected style family (${look.styleFamily}) takes precedence`));
    assert.match(exploreImagePrompt(resolved, direction()), /black-and-white work use tonal contrast only/);
  });
  const different = exploreRequest(input({ data: { directionCount: 25, styleFamily: "Random", gradePreset: "Random" }, random: () => 0.8 }));
  assert.notDeepEqual(different.directionLooks, request.directionLooks);
});

test("random style and random grade are independent and graphic tasks stay graphic", () => {
  for (const data of [{ styleFamily: "Random", gradePreset: "Warm" }, { styleFamily: "Cinematic Standard", gradePreset: "Random" }, { styleFamily: "Auto", gradePreset: "None" }]) {
    const request = exploreRequest(input({ data }));
    for (const look of request.directionLooks) {
      if (data.styleFamily !== "Random") assert.equal(look.styleFamily, data.styleFamily);
      if (data.gradePreset !== "Random") assert.equal(look.gradePreset, data.gradePreset);
    }
  }
  const graphic = exploreRequest(input({ data: { creativeTask: "Brand / Logo", styleFamily: "Random", directionCount: 25 } }));
  assert.ok(graphic.directionLooks.every(look => !/Cinematic|Photography|Vintage/.test(look.styleFamily)));
});

test("attached content is locked for both modes while mood-only references are not scene templates", () => {
  for (const exploreMode of [true, false]) {
    const request = exploreRequest(input({ data: { exploreMode, creativeRange: 100 }, references: [{ role: "product", url: "/outputs/scene.png", label: "Scene" }] }));
    assert.equal(request.preserveImageContent, true);
    const planned = JSON.parse(explorePlanningPrompt(request));
    assert.match(planned.contentPreservation, /poses, expressions, wardrobe, accessories/);
    assert.match(planned.contentPreservation, /camera viewpoint, framing and spatial relationships/);
    const image = exploreImagePrompt(exploreDirectionRequest(request, 0), direction());
    assert.ok(image.endsWith(planned.contentPreservation));
    assert.match(image, /Only an explicit change/);
    if (!exploreMode) assert.match(image, /restrained, faithful/);
  }
  const mood = exploreRequest(input({ references: [{ role: "mood", url: "/outputs/look.png" }] }));
  assert.equal(mood.preserveImageContent, false);
  assert.equal(JSON.parse(explorePlanningPrompt(mood)).contentPreservation, undefined);
  assert.match(explorePlanningInstructions, /even when Explore Mode is on/);
});

test("planning reconstruction validates and preserves assigned looks without rerolling", async () => {
  let handler, calls = 0, planned;
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, {
    runTextLlm: async options => { calls++; planned = JSON.parse(options.prompt); return { text: JSON.stringify({ directions: [direction(), direction("Second")] }) }; },
    recordHistory: async () => {}, estimateCost: () => ({ amountUsd: 0 })
  });
  const request = exploreRequest(input({ data: { directionCount: 2, exploreMode: false, styleFamily: "Random", gradePreset: "Random" }, style: "Soft light" }));
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } });
  const res = response(); await handler({ body: request }, res);
  assert.equal(res.code, 200); assert.equal(planned.exploreMode, false);
  assert.deepEqual(planned.directionLooks, request.directionLooks);
  assert.equal(planned.connectedStyle, "Soft light");
  for (const directionLooks of [[], [{ styleFamily: "Random", gradePreset: "Warm" }, request.directionLooks[1]], [{ styleFamily: "invented", gradePreset: "Warm" }, request.directionLooks[1]]]) {
    const failed = response(); await handler({ body: { ...request, directionLooks } }, failed);
    assert.equal(failed.code, 400);
  }
  assert.equal(calls, 1);
});

test("random batches save actual looks per result, resume the same choices and reuse them for More Like This", async () => {
  let stop = false, pauseAfterFirst = true;
  const fixture = runnerFixture({ directionCount: 3, styleFamily: "Random", gradePreset: "Random" }, {
    references: [{ role: "product", label: "Scene", url: "/outputs/scene.png" }], shouldStop: () => stop,
    onUpdate: data => { if (pauseAfterFirst && data.resultItems.length === 1) { stop = true; pauseAfterFirst = false; } }
  });
  await fixture.run();
  const request = fixture.planningRequests[0];
  assert.equal(fixture.data().status, "paused");
  assert.equal(fixture.generations.length, 1);
  const savedQueue = structuredClone(fixture.data().exploreQueue);
  stop = false;
  fixture.patch({ exploreAction: "retry", styleFamily: "Auto", gradePreset: "None", exploreMode: false });
  await fixture.run();
  assert.equal(fixture.plans(), 1); assert.equal(fixture.generations.length, 3);
  for (let index = 0; index < 3; index++) {
    const result = fixture.data().resultItems[index], look = request.directionLooks[index];
    assert.equal(result.exploreSettings.styleFamily, look.styleFamily);
    assert.equal(result.exploreSettings.gradePreset, look.gradePreset);
    assert.match(result.prompt, /CONTENT LOCK/);
    assert.ok(result.prompt.includes(gradePresetPrompts[look.gradePreset]));
    assert.equal(result.prompt, exploreImagePrompt(savedQueue[index].request, savedQueue[index].direction));
  }
  const chosen = fixture.data().resultItems[1];
  fixture.patch({ exploreAction: "more", exploreParentIndexes: [1], styleFamily: "Random", gradePreset: "Random" });
  await fixture.run();
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.data().resultItems.at(-1).exploreSettings.styleFamily, chosen.exploreSettings.styleFamily);
  assert.equal(fixture.data().resultItems.at(-1).exploreSettings.gradePreset, chosen.exploreSettings.gradePreset);
  const refined = exploreRequest(input({ data: { styleFamily: "Random", gradePreset: "Random" }, action: "refine", parents: [chosen], note: "Softer highlights" }));
  assert.deepEqual(refined.directionLooks[0], { styleFamily: chosen.exploreSettings.styleFamily, gradePreset: chosen.exploreSettings.gradePreset });
});

test("new look requests require updated backend support before paid planning", async t => {
  let supported = false, artDirection = false, posts = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/health")) return Response.json({ routes: { exploreLookVariation: supported, exploreArtDirection: artDirection } });
    assert.equal(options.method, "POST"); posts++;
    return Response.json({ directions: [direction()] });
  });
  const request = exploreRequest(input({ data: { directionCount: 1 } }));
  await assert.rejects(nodeApi.planExplore(request), /Restart.*No planning or generation was submitted/);
  assert.equal(posts, 0);
  supported = true;
  await assert.rejects(nodeApi.planExplore(request), /broader art directions/);
  assert.equal(posts, 0, "a version 2 backend cannot silently drop the new contrast assignments");
  artDirection = true;
  await nodeApi.planExplore(request); assert.equal(posts, 1);
});

test("full exploration preserves old outputs and appends each image with its reusable direction", async () => {
  const fixture = runnerFixture({ resultItems: [item("Existing")] });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 2);
  assert.equal(fixture.data().resultItems.length, 3);
  assert.equal(fixture.data().resultItems[0].label, "Existing");
  assert.equal(fixture.data().selectedResultIndex, 1);
  assert.equal(fixture.data().exploreQueue.every(item => item.status === "complete"), true);
  assert.equal(fixture.generations[0].workflowContext.projectId, "test");
});

test("the default run plans and generates all nine images with Flare medium quality", async () => {
  const fixture = runnerFixture({ ...exploreDefaults(), prompt: "A perfume bottle" });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 9);
  assert.equal(fixture.data().resultItems.length, 9);
  for (const generation of fixture.generations) {
    assert.equal(generation.node.data.model, "OpenAI Image 2.5 Flare");
    assert.equal(generation.node.data.quality, "medium");
  }
});

test("More Like This reuses direction planning and references the exact selected image", async () => {
  const fixture = runnerFixture({ resultItems: [item()], exploreAction: "more", exploreParentIndexes: [0], variations: 2 });
  await fixture.run();
  assert.equal(fixture.plans(), 0);
  assert.equal(fixture.generations.length, 1);
  assert.equal(fixture.generations[0].imagePromptItems[0].url, item().url);
  assert.match(fixture.generations[0].imagePromptItems[0].label, /direction/);
});

test("Grade survives persistence and reaches planning and image prompts without replacing reference guidance", async () => {
  assert.equal(exploreDefaults().gradePreset, "None");
  assert.equal(exploreGrades.includes("Custom"), false, "custom palettes remain in the connected Style node");
  for (const gradePreset of exploreGrades) {
    const request = exploreRequest(input({ data: { gradePreset }, style: "Painterly 3D", camera: "Wide lens" }));
    assert.equal(request.grade, gradePresetPrompts[gradePreset] || "");
    assert.equal(normalizeExploreData(JSON.parse(JSON.stringify({ gradePreset }))).gradePreset, gradePreset);
    const prompt = exploreImagePrompt(request, direction());
    assert.ok(!request.grade || prompt.includes(request.grade));
    assert.match(prompt, /Painterly 3D/);
    assert.match(prompt, /Wide lens/);
  }
  let handler, planned;
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, {
    runTextLlm: async options => { planned = JSON.parse(options.prompt); return { text: JSON.stringify({ directions: [direction()] }) }; },
    recordHistory: async () => {}, estimateCost: () => ({ amountUsd: 0 })
  });
  const request = exploreRequest(input({ data: { directionCount: 1, gradePreset: "Jaws of Life" }, style: "Keep typography flat" }));
  const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
  await handler({ body: request }, res);
  assert.equal(res.value.directions.length, 1);
  assert.equal(planned.grade, request.grade, "server reconstructs the same grade exactly once");
  assert.equal(planned.style, request.style);
  const fixture = runnerFixture({ gradePreset: "Jaws of Life" });
  await fixture.run();
  assert.ok(fixture.generations.every(call => call.prompt.includes(request.grade)));
  assert.equal(fixture.data().resultItems[0].exploreSettings.gradePreset, "Jaws of Life");
  assert.ok(fixture.data().resultText.includes(request.grade), "direction details retain the generated image's grade");
  assert.ok(normalizeExploreData({ ...fixture.data(), gradePreset: "Cool" }).resultText.includes(request.grade), "changing future settings does not relabel an existing image");
});

test("new runs ignore old variation multipliers but unfinished legacy queues preserve their images and grade", async () => {
  const fixture = runnerFixture({ variations: 3, gradePreset: "Warm" });
  await fixture.run();
  assert.equal(fixture.generations.length, 2);
  const queue = fixture.data().exploreQueue;
  const legacy = [{ ...queue[0], status: "complete" }, { ...queue[0], id: "legacy:1", variation: 1, status: "pending" },
    { ...queue[0], id: "legacy:2", variation: 2, status: "failed" }];
  fixture.patch({ exploreQueue: legacy, exploreAction: "retry", gradePreset: "Cool" });
  await fixture.run();
  assert.equal(fixture.generations.length, 4);
  assert.equal(fixture.plans(), 1);
  assert.match(fixture.generations.at(-1).prompt, /Variation 3/);
  assert.ok(fixture.generations.at(-1).prompt.includes(gradePresetPrompts.Warm));
  assert.equal(fixture.data().resultItems.at(-1).label, "Direction 1 3");
});

test("reference descriptions show source names and connected settings without losing multiple assets", () => {
  const source = data => ({ source: { data } });
  assert.equal(exploreReferenceDescription("imageIn"), "");
  assert.equal(exploreReferenceDescription("imageIn", [source({ title: "Bottle", fileName: "product.jpg" }), source({ title: "Packaging" })]), "Bottle: product.jpg\nPackaging");
  assert.equal(exploreReferenceDescription("cameraIn", [source({ title: "Camera", shotPreset: "Wide", lensPreset: "35mm", typePreset: "None" })]), "Camera: Wide / 35mm");
});

test("Preview's actual source helper receives all full-resolution Explore images, with direction labels and selection", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function connectedPreviewSources(");
  const helpers = editor.slice(start, editor.indexOf("function normalizedPreviewLayoutItems(", start));
  const preview = new Function("normalizedResultItems", "sourceLabel", "previewMediaType", "isCoverageNode", `${helpers}; return connectedPreviewSources;`)(normalizedResultItems, source => source.data.title, () => "image", isCoverageNode);
  const source = { id: "e", type: "explore", data: { title: "Explore", resultItems: [item(), item("Reflections")], selectedResultIndex: 1, resultUrl: item("Reflections").url } };
  const result = preview([{ source, edge: { from: { port: "imageOut" } } }]);
  assert.deepEqual(result[0].items.map(item => item.url), source.data.resultItems.map(item => item.url));
  assert.deepEqual(result[0].items.map(item => item.label), ["Sculptural light", "Reflections"]);
  assert.equal(result[0].items[1].sourceSelectedResult, true);
  assert.equal(result[0].items[1].sourceResultIndex, 1);
  assert.deepEqual(preview([{ source, edge: { from: { port: "styleOut" } } }]), []);
  assert.deepEqual(preview([{ source, edge: { from: { port: "promptOut" } } }]), []);
});

test("a failed candidate preserves successful siblings; resume never replans or repeats successes", async () => {
  const fixture = runnerFixture({}, { generate: async (_, index) => { if (index === 1) throw new Error("Provider rejected the dimensions"); return [item(`Image ${index}`)]; } });
  assert.equal((await fixture.run()).status, "error");
  assert.equal(fixture.data().resultItems.length, 1);
  fixture.patch({ exploreAction: "retry", model: "OpenAI Image 2" });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 3);
  assert.equal(fixture.generations.at(-1).node.data.model, "OpenAI Image 2.5 Flare", "resume uses original settings");
});

test("stop waits for the current request and leaves the rest unsubmitted", async () => {
  let stop = false;
  const fixture = runnerFixture({}, { shouldStop: () => stop, generate: async () => { stop = true; return [item()]; } });
  assert.equal((await fixture.run()).status, "error", "downstream scheduling is blocked for a paused batch");
  assert.equal(fixture.generations.length, 1);
  assert.equal(fixture.data().status, "paused");
  assert.equal(fixture.data().exploreQueue[1].status, "pending");
});

test("uncertain and recovered requests cannot be resumed automatically", async () => {
  const fixture = runnerFixture({}, { generate: async () => { throw new Error("Connection interrupted; image may still be generating"); } });
  await fixture.run();
  assert.equal(fixture.generations.length, 1);
  fixture.patch({ exploreAction: "retry" });
  await assert.rejects(fixture.run(), /interrupted/);
  const restored = clearStaleRunningState({ type: "explore", data: { status: "running", exploreQueue: [{ status: "running" }, { status: "pending" }] } });
  assert.equal(restored.data.exploreQueue[0].status, "uncertain");
  assert.equal(restored.data.exploreQueue[1].status, "pending");
});

test("Explore chimes once after the full batch, not incremental results or a paused run", () => {
  const previous = { id: "a", type: "explore", data: { status: "running" } };
  assert.equal(shouldNotifyNodeGenerationComplete(previous, { ...previous, data: { status: "running", resultItems: [item()] } }), false);
  assert.equal(shouldNotifyNodeGenerationComplete(previous, { ...previous, data: { status: "complete" } }), true);
  assert.equal(shouldNotifyNodeGenerationComplete(previous, { ...previous, data: { status: "paused" } }), false);
});

test("planning route records successful and rejected paid usage, sends labeled images in one request", async () => {
  let handler, calls = [], history = [], output = { directions: [direction(), direction("Reflections")] };
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, { runTextLlm: async () => { throw Error("Unexpected text-only call"); },
    runMediaDescriptionLlm: async args => { calls.push(args); return { text: JSON.stringify(output), provider: "mock", model: "gpt-6-astra", usages: [{ cost: .01 }] }; },
    recordHistory: async entry => { history.push(entry); }, estimateCost: () => ({ amountUsd: .01 }) });
  const body = { ...exploreRequest(input({ data: { directionCount: 2 }, references: [{ role: "product", label: "Bottle", url: "/outputs/bottle.png" }] })), nodeId: "test" };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const res = response(); await handler({ body }, res);
  assert.equal(res.code, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].inputs[0].label, "product: Bottle");
  assert.equal(history[0].cost.amountUsd, .01);
  output = { directions: [direction()] };
  const failed = response(); await handler({ body }, failed);
  assert.equal(failed.code, 400);
  assert.equal(history.length, 2);
  assert.match(history[1].error, /expected/);
  const invalid = response(); await handler({ body: { ...body, references: [{ role: "product", url: "https://untrusted.example/file" }] } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(calls.length, 2);
});

test("planning cleanup reaches the image runner once, preserves old work and records malformed usage without replay", async () => {
  let handler, calls = 0, history = [], invalid = false;
  const output = { directions: [direction(), direction("Reflections")].map(value => ({ ...value, palette: ["Ivory", "Charcoal"], styleFamily: "Extra", gradePreset: "Extra" })) };
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, {
    runTextLlm: async () => { calls++; return { provider: "fal", model: "openai/gpt-6-astra", usage: { cost: .02 }, text: JSON.stringify(invalid ? { directions: [{ ...direction(), palette: { color: "blue" } }] } : output) }; },
    recordHistory: async entry => history.push(entry), estimateCost: () => ({ amountUsd: .02 })
  });
  const fixture = runnerFixture({ resultItems: [item("Existing")], styleFamily: "Random", gradePreset: "Random" }, {
    plan: async body => {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
      await handler({ body }, res);
      if (res.code !== 200) throw new Error(res.value.error);
      return res.value;
    }
  });
  await fixture.run();
  assert.equal(calls, 1); assert.equal(fixture.generations.length, 2); assert.equal(history.length, 1);
  assert.equal(fixture.data().resultItems[0].label, "Existing");
  for (let index = 0; index < 2; index++) {
    const result = fixture.data().resultItems[index + 1];
    assert.equal(result.direction.palette, "Ivory, Charcoal");
    assert.equal(result.direction.gradePreset, undefined);
    assert.equal(result.exploreSettings.gradePreset, fixture.planningRequests[0].directionLooks[index].gradePreset);
  }
  assert.deepEqual(JSON.parse(history[0].text), normalizeExplorePlan(output));
  const saved = structuredClone(fixture.data());
  invalid = true;
  await assert.rejects(fixture.run(), error => {
    assert.match(error.message, /^Explore: incomplete planning data/);
    assert.doesNotMatch(error.message, /Explore: Explore:/);
    return true;
  });
  assert.equal(calls, 2); assert.equal(fixture.generations.length, 2);
  assert.equal(history.length, 2); assert.equal(history[1].cost.amountUsd, .02);
  assert.match(history[1].error, /planning data/);
  assert.deepEqual(fixture.data().resultItems, saved.resultItems);
  assert.deepEqual(fixture.data().exploreQueue, saved.exploreQueue);
});

test("the planning route and structured schema accept 25 directions and reject oversized batches", async () => {
  let handler, calls = 0;
  const plan = { directions: Array.from({ length: 25 }, (_, index) => direction(`Look ${index + 1}`)) };
  const llmRequest = { route: "explore-plan", model: "gpt-6-astra", prompt: "test", responseMimeType: "application/json" };
  assert.equal(openAiLlmBody(llmRequest).text.format.schema.properties.directions.maxItems, 25);
  assert.equal(openAiLlmBody(llmRequest).max_output_tokens, 24000);
  assert.equal(falLlmInput({ ...llmRequest, model: "openai/gpt-6-astra" }).max_tokens, 24000);
  assert.doesNotThrow(() => validateCreativeResponse({}, { route: "explore-plan", provider: "mock", text: JSON.stringify(plan) }));
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, {
    runTextLlm: async args => { calls++; assert.equal(JSON.parse(args.prompt).count, 25); return { text: JSON.stringify(plan), provider: "mock", model: "gpt-6-astra" }; },
    recordHistory: async () => {}, estimateCost: () => ({ amountUsd: 0 })
  });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } });
  const body = exploreRequest(input({ data: { directionCount: 25 } })), ok = response();
  await handler({ body }, ok);
  assert.equal(ok.code, 200); assert.equal(ok.value.directions.length, 25);
  for (const count of [0, 26, 9.5]) {
    const rejected = response(); await handler({ body: { ...body, count } }, rejected);
    assert.equal(rejected.code, 400);
  }
  assert.equal(calls, 1);
  assert.throws(() => validateCreativeResponse({}, { route: "explore-plan", provider: "mock", text: JSON.stringify({ directions: [...plan.directions, direction("Look 26")] }) }), /planning data/);
});

test("a 25-image batch can pause and resume without replanning or repeating completed images", async () => {
  let stop = false;
  const fixture = runnerFixture({ directionCount: 25 }, {
    shouldStop: () => stop,
    generate: async (_, index) => { if (index === 1) stop = true; return [item(`Image ${index}`)]; }
  });
  await fixture.run();
  assert.equal(fixture.data().exploreQueue.length, 25);
  assert.equal(fixture.generations.length, 1);
  assert.equal(fixture.data().status, "paused");
  stop = false;
  fixture.patch({ exploreAction: "retry" });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 25);
  assert.equal(fixture.data().resultItems.length, 25);
  assert.equal(new Set(fixture.generations.map(item => item.prompt)).size, 25);
  assert.ok(fixture.data().exploreQueue.every(item => item.status === "complete"));
});

test("resuming over-limit queues is rejected before any planning or generation calls", async () => {
  const fixture = runnerFixture({ exploreAction: "retry", exploreQueue: Array.from({ length: 26 }, () => ({ status: "pending" })) });
  await assert.rejects(fixture.run(), /up to 25/);
  assert.equal(fixture.plans(), 0);
  assert.equal(fixture.generations.length, 0);
});

test("Explore integration retains typed ports, output rail and manual-only agent guards", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.match(editor, /manualOnly: \[.*"explore"/);
  assert.match(editor, /if \(type === "explore"\) return \{ title, \.\.\.exploreDefaults\(\) \}/);
  assert.match(editor, /source\?\.type === "explore" && edge\?\.from\?\.port !== "imageOut"/);
  assert.match(editor, /exploreRunsRef\.current\.has/);
});

test("new batches carry bounded prior directions without copying their full prompts", () => {
  const request = exploreRequest(input({ data: { exploreDirections: Array.from({ length: 25 }, (_, i) => direction(`Look ${i}`)) } }));
  assert.equal(request.previousDirections.length, 16);
  assert.equal(request.previousDirections[0].name, "Look 9");
  assert.equal(request.previousDirections[0].prompt, undefined);
  assert.throws(() => exploreRequest(input({ references: [null] })), /valid URLs/);
});

test("an uncertain planning POST is never replayed", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("Socket closed"); });
  await assert.rejects(nodeApi.planExplore({ prompt: "Bottle" }), /did not resubmit/);
  assert.equal(requests, 1);
});

test("actual canvas output helper rejects removed style ports while keeping image output", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function connectedOutputItem(");
  const helper = new Function("previewMediaType", "sourceLabel", `${editor.slice(start, editor.indexOf("function connectedOutputUrl(", start))}; return connectedOutputItem;`)(() => "image", source => source.data.title);
  const source = { type: "explore", data: { title: "Look", resultUrl: "/outputs/selected.png", resultText: "Graphic light" } };
  assert.equal(helper(source, { from: { port: "imageOut" } }).url, source.data.resultUrl);
  assert.equal(helper(source, { from: { port: "styleOut" } }), null);
  assert.equal(helper(source, { from: { port: "promptOut" } }), null);
});

test("actual canvas validator respects reference locks and rejects removed Explore outputs", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("  function getConnectionError(");
  const config = exploreCanvasConfig(editor);
  const deps = { outputPortIdsForNode: node => node.type === "explore" ? config.output.map(port => port.id) : ["styleOut", "characterOut", "transferOut"], inputPortIdsForNode: node => node.type === "explore" ? config.input.map(port => port.id) : ["styleIn", "characterIn", "transferIn", "promptIn"],
    isImageModelUnsupportedInput: () => false, isImageModelUnsupportedSource: () => false, isVideoModelUnsupportedInput: () => false, getPortCompatibilityError: () => "" };
  const validatorSource = editor.slice(start, editor.indexOf("  function getPortPoint(", start));
  const validate = new Function(...Object.keys(deps), validatorSource + ";return getConnectionError;")(...Object.values(deps));
  const target = { id: "e", type: "explore", data: {} };
  assert.match(validate({ nodeId: "style", port: "styleOut" }, { nodeId: "e", port: "styleIn" }, [{ id: "style", type: "style", data: {} }, target]), /valid input/);
  assert.match(validate({ nodeId: "c", port: "characterOut" }, { nodeId: "e", port: "characterIn" }, [{ id: "c", type: "character", data: {} }, target]), /Lock/);
  assert.match(validate({ nodeId: "m", port: "transferOut" }, { nodeId: "e", port: "transferIn" }, [{ id: "m", type: "transfer", data: {} }, target]), /Lock/);
  const board = { id: "s", type: "storyboard", data: {} };
  assert.match(validate({ nodeId: "e", port: "styleOut" }, { nodeId: "s", port: "styleIn" }, [target, board]), /valid output/);
  assert.match(validate({ nodeId: "e", port: "promptOut" }, { nodeId: "s", port: "promptIn" }, [target, board]), /valid output/);
});

function exploreCanvasConfig(editor) {
  const block = editor.match(/    explore: (\{[\s\S]*?\n    \}),\n    storyboard:/);
  assert.ok(block, "Explore's actual canvas config is present");
  return new Function("Compass", "portColors", `return (${block[1]});`)(null, { image: "blue", style: "purple", prompt: "yellow", character: "cyan", transfer: "pink", camera: "red" });
}

test("restoring graphs drops removed Explore ports while keeping images and remaining references", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const config = exploreCanvasConfig(editor);
  assert.deepEqual(config.output.map(port => port.id), ["imageOut"]);
  assert.deepEqual(config.input.map(port => port.id), ["promptIn", "imageIn", "characterIn", "transferIn", "cameraIn"]);
  const start = editor.indexOf("function normalizeEdgeForCurrentGraph(");
  const deps = { cloneEdge: structuredClone, isModel3DNode: () => false, hasCameraPreset: () => true,
    portColors: { style: "purple", camera: "red", transfer: "pink", character: "cyan" },
    inputPortIdsForNode: node => node.type === "explore" ? config.input.map(port => port.id) : ["sourceIn", "styleIn", "promptIn", "imagePromptIn"],
    outputPortIdsForNode: node => node.type === "explore" ? config.output.map(port => port.id) : ["styleOut", "imageOut", "characterOut", "transferOut", "cameraOut", "promptOut"],
    isImageModelUnsupportedInput: () => false, isImageModelUnsupportedSource: () => false, isVideoModelUnsupportedInput: () => false, portsAreCompatible: () => true };
  const normalize = new Function(...Object.keys(deps), `${editor.slice(start, editor.indexOf("function transferTitleFromLegacy(", start))}; return normalizeEdgeForCurrentGraph;`)(...Object.values(deps));
  const nodes = new Map(["explore", "preview", "imageModel", "text", "style", "image", "character", "transfer", "camera"].map(type => [type, { id: type, type, data: {} }]));
  const edge = (fromPort, target, toPort, source = "explore", color = "blue") => ({ id: `${source}:${fromPort}:${target}`, from: { nodeId: source, port: fromPort }, to: { nodeId: target, port: toPort }, color });
  const removed = [edge("styleOut", "imageModel", "styleIn"), edge("promptOut", "text", "promptIn"), edge("styleOut", "explore", "styleIn", "style", "purple")];
  const kept = [edge("imageOut", "preview", "sourceIn"), edge("imageOut", "imageModel", "imagePromptIn"),
    edge("styleOut", "imageModel", "styleIn", "style", "purple"), edge("imageOut", "explore", "imageIn", "image"),
    edge("characterOut", "explore", "characterIn", "character", "cyan"), edge("transferOut", "explore", "transferIn", "transfer", "pink"),
    edge("cameraOut", "explore", "cameraIn", "camera", "red"), edge("promptOut", "explore", "promptIn", "text", "yellow")];
  assert.deepEqual([...removed, ...kept].map(item => normalize(item, nodes)).filter(Boolean), kept);
  const runStart = editor.indexOf("const outcome = await runExploreGeneration(");
  const run = editor.slice(runStart, editor.indexOf("loadOutputHistory();", runStart));
  assert.doesNotMatch(run, /incoming\.styleIn/);
  assert.match(run, /incoming\.cameraIn/);
});

test("legacy Explore style text cannot leak through text or image-reference prompt helpers", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const textStart = editor.indexOf("function connectedText(");
  const text = new Function(`${editor.slice(textStart, editor.indexOf("function directorPackageConnections(", textStart))};return connectedText;`)();
  const promptStart = editor.indexOf("function promptPiecesForSource(");
  const promptEnd = editor.indexOf("\nfunction ", promptStart + 1);
  const prompt = new Function(`${editor.slice(promptStart, promptEnd)};return promptPiecesForSource;`)();
  const source = { type: "explore", data: { resultText: "Legacy style description", title: "Explore" } };
  assert.equal(text([{ source }]), "");
  for (const outputPort of ["imageOut", "styleOut", "promptOut"]) assert.deepEqual(prompt(source, { outputPort }), []);
});
