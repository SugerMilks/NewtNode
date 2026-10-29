import test from "node:test";
import assert from "node:assert/strict";
import { exploreRequest, exploreDirectionRequest, explorePlanningPrompt, explorePlanningInstructions, exploreImagePrompt, exploreDefaults } from "../src/explore.js";
import { exploreContrastBriefs, exploreMediumGuidance } from "../src/exploreArtDirection.js";
import { stylePresetPrompts } from "../src/modelOptions.js";
import { runExploreGeneration } from "../src/nodeRunners/explore.js";
import { registerExploreRoutes } from "../server/routes/explore.js";

const request = (data = {}, extra = {}) => exploreRequest({ data: { ...exploreDefaults(), ...data }, prompt: "A tree", random: () => .3, ...extra });
const direction = index => ({ name: `World ${index}`, concept: `Physical miniature staging ${index}`, composition: `Viewpoint and scale ${index}`,
  lighting: `Distinct light character ${index}`, palette: `Palette system ${index}`, treatment: `Tactile rendering ${index}`, styleBrief: `Reusable look ${index}`, prompt: `One standalone tree image, direction ${index}` });

test("fixed Claymation and cinematic styles receive nine genuinely different multi-axis strategies", () => {
  for (const styleFamily of ["Claymation", "Cinematic Standard", "Cinematic Indie"]) {
    const planned = request({ styleFamily });
    assert.equal(planned.version, 3);
    assert.equal(planned.creativeRange, 55);
    assert.equal(planned.directionBriefs.length, 9);
    assert.equal(planned.directionLooks.every(look => look.styleFamily === styleFamily), true);
    for (const axis of ["camera", "composition", "lighting", "palette", "artDirection", "texture"]) {
      assert.equal(new Set(planned.directionBriefs.map(brief => brief[axis])).size, 9, `${styleFamily}: no repeated ${axis}`);
    }
    const prompt = JSON.parse(explorePlanningPrompt(planned));
    assert.equal(new Set(prompt.contrastAssignments).size, 9);
    assert.ok(prompt.contrastAssignments.some(value => value.includes("Ground-level")));
    assert.ok(prompt.contrastAssignments.some(value => value.includes("True overhead")));
    assert.ok(prompt.contrastAssignments.some(value => value.includes("monochrome")));
    assert.equal(prompt.lookGuidance.styles[styleFamily], exploreMediumGuidance[styleFamily]);
    for (let i = 0; i < 9; i++) {
      const resolved = exploreDirectionRequest(planned, i), image = exploreImagePrompt(resolved, direction(i));
      assert.ok(image.includes(prompt.contrastAssignments[i]), "the image receives the same assigned strategy as the planner");
      for (const field of ["concept", "composition", "lighting", "palette", "treatment", "prompt"]) assert.ok(image.includes(direction(i)[field]));
      assert.ok(!image.includes(stylePresetPrompts[styleFamily]), "shared narrow lighting/lens boilerplate cannot erase the planned look");
    }
  }
  assert.match(explorePlanningInstructions, /at least four unconstrained axes/);
  assert.match(explorePlanningInstructions, /Silently compare all pairs/);
  assert.match(explorePlanningInstructions, /not sequential shots of the same setup/);
  assert.match(explorePlanningInstructions, /not director-name shorthand/);
});

test("contrast assignments remain distinct across 25 images even with deterministic randomness", () => {
  for (const random of [() => 0, () => .3, () => .999]) {
    for (const preserveImageContent of [true, false]) {
      const briefs = exploreContrastBriefs({ count: 25, exploreMode: true, action: "explore", preserveImageContent, creativeTask: "Auto", random });
      assert.equal(new Set(briefs.map(brief => JSON.stringify(brief))).size, 25);
      for (let i = 0; i < briefs.length; i++) for (let j = i + 1; j < briefs.length; j++) {
        assert.ok(Object.keys(briefs[i]).filter(key => briefs[i][key] !== briefs[j][key]).length >= (preserveImageContent ? 3 : 4));
      }
    }
  }
  assert.notDeepEqual(request({}, { random: () => .1 }).directionBriefs, request({}, { random: () => .8 }).directionBriefs);
});

test("attached image composition is protected while mood and character references permit varied staging", () => {
  const locked = request({ styleFamily: "Claymation" }, { references: [{ url: "/outputs/tree.png", role: "product" }] });
  for (const brief of locked.directionBriefs) assert.deepEqual(Object.keys(brief), ["lighting", "palette", "texture", "tonalDesign"]);
  const image = exploreImagePrompt(exploreDirectionRequest(locked, 0), direction(0));
  assert.match(image, /camera viewpoint, framing and spatial relationships/);
  assert.match(image, /keep the supplied image content and composition fixed/);
  assert.doesNotMatch(JSON.parse(explorePlanningPrompt(locked)).contrastAssignments.join("\n"), /camera:|composition:|artDirection:/);
  for (const role of ["mood", "character"]) {
    const unlocked = request({}, { references: [{ url: "/outputs/reference.png", role }] });
    assert.equal(unlocked.preserveImageContent, false);
    assert.ok(unlocked.directionBriefs.every(brief => Number.isInteger(brief.camera)));
  }
});

test("explicit grade, camera and monochrome styles override incompatible contrast suggestions", () => {
  for (const data of [{ styleFamily: "Photography B&W" }, { styleFamily: "Storyboard" }, { gradePreset: "Warm" }]) {
    const planned = request(data, { camera: "Locked eye-level 50mm medium shot" });
    const planning = JSON.parse(explorePlanningPrompt(planned));
    for (let i = 0; i < 9; i++) {
      assert.doesNotMatch(planning.contrastAssignments[i], /camera:|palette:/);
      assert.match(planning.contrastAssignments[i], /tonalDesign:/);
      const image = exploreImagePrompt(exploreDirectionRequest(planned, i), direction(i));
      assert.ok(image.includes(planning.contrastAssignments[i]));
      assert.match(image, /Locked eye-level 50mm medium shot/);
    }
  }
  const color = JSON.parse(explorePlanningPrompt(request({ styleFamily: "Photography Color" })));
  assert.doesNotMatch(color.contrastAssignments.join("\n"), /Expressive monochrome/);
});

test("graphic briefs receive graphic projections instead of a lens prescription", () => {
  const planned = request({ creativeTask: "Brand / Logo", styleFamily: "2D Animation" }, { prompt: "A tree logo" });
  for (const brief of planned.directionBriefs) { assert.equal(brief.camera, undefined); assert.ok(Number.isInteger(brief.graphicView)); }
  assert.doesNotMatch(JSON.parse(explorePlanningPrompt(planned)).contrastAssignments.join("\n"), /wide-angle|Long-lens|Dutch angle/);
  assert.match(explorePlanningInstructions, /for flat graphics specify hierarchy, projection and negative space/);
});

test("off and focused branches never receive new randomized world-building strategies", () => {
  const off = request({ exploreMode: false, styleFamily: "Claymation" });
  assert.deepEqual(off.directionBriefs, []);
  assert.equal(exploreDirectionRequest(off, 0).style, stylePresetPrompts.Claymation);
  assert.match(exploreImagePrompt(off, direction(0)), /restrained, faithful/);
  const parent = { url: "/outputs/approved.png", direction: direction(0), exploreSettings: { styleFamily: "Claymation", gradePreset: "Warm" } };
  for (const action of ["more", "refine", "combine"]) {
    const branch = request({ styleFamily: "Random", gradePreset: "Random" }, { action, parents: action === "combine" ? [parent, { ...parent, url: "/outputs/second.png" }] : [parent], note: "Only soften the shadows" });
    assert.deepEqual(branch.directionBriefs, []);
    assert.deepEqual(branch.directionLooks, [{ styleFamily: "Claymation", gradePreset: "Warm" }]);
    assert.match(exploreImagePrompt(exploreDirectionRequest(branch, 0), direction(0)), /focused branch, not a new eclectic batch/);
  }
  assert.equal(request({}, { action: "push", parents: [parent] }).directionBriefs.length, 1);
});

test("planning reconstruction preserves exact strategy assignments and rejects invalid data before billing", async () => {
  let handler, captured, calls = 0;
  registerExploreRoutes({ post: (_, value) => { handler = value; } }, {
    runTextLlm: async options => { calls++; captured = JSON.parse(options.prompt); return { text: JSON.stringify({ directions: [direction(0), direction(1)] }) }; },
    recordHistory: async () => {}, estimateCost: () => ({ amountUsd: 0 })
  });
  const planned = request({ directionCount: 2, styleFamily: "Claymation" });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } });
  const ok = response(); await handler({ body: planned }, ok);
  assert.equal(ok.code, 200); assert.deepEqual(captured.directionBriefs, planned.directionBriefs);
  assert.deepEqual(captured.contrastAssignments, JSON.parse(explorePlanningPrompt(planned)).contrastAssignments);
  for (const directionBriefs of [[], [planned.directionBriefs[0]], [null, planned.directionBriefs[1]],
    [{ ...planned.directionBriefs[0], camera: 9 }, planned.directionBriefs[1]], [{ ...planned.directionBriefs[0], camera: "2" }, planned.directionBriefs[1]],
    [{ ...planned.directionBriefs[0], invented: 1 }, planned.directionBriefs[1]]]) {
    const rejected = response(); await handler({ body: { ...planned, directionBriefs } }, rejected);
    assert.equal(rejected.code, 400);
  }
  assert.equal(calls, 1);
});

test("pause and resume preserve contrast snapshots and keep one planning call per batch", async () => {
  let data = { ...exploreDefaults(), prompt: "A tree", directionCount: 3, styleFamily: "Claymation" }, plans = 0, stopped = false;
  const generated = [];
  const run = () => runExploreGeneration({ node: { id: "test", data }, prompt: data.prompt, references: [],
    update: patch => { data = { ...data, ...structuredClone(patch) }; }, shouldStop: () => stopped,
    plan: async () => { plans++; return { directions: [direction(0), direction(1), direction(2)] }; },
    generate: async options => { generated.push(options); if (generated.length === 1) stopped = true; return [{ url: `/outputs/${generated.length}.png`, type: "image" }]; }
  });
  await run();
  const queue = structuredClone(data.exploreQueue);
  assert.equal(generated.length, 1);
  stopped = false;
  data = JSON.parse(JSON.stringify({ ...data, exploreAction: "retry", exploreMode: false, styleFamily: "Photography B&W" }));
  await run();
  assert.equal(plans, 1); assert.equal(generated.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(generated[i].prompt, exploreImagePrompt(queue[i].request, queue[i].direction));
    assert.deepEqual(data.resultItems[i].exploreSettings.contrastBrief, queue[i].request.contrastBrief);
  }
});

test("legacy queue prompts retain their pre-update guidance and do not gain new strategies", () => {
  const legacy = { ...request({ styleFamily: "Claymation" }), version: 2, style: stylePresetPrompts.Claymation };
  delete legacy.directionBriefs;
  const resolved = exploreDirectionRequest(legacy, 0), image = exploreImagePrompt(resolved, direction(0));
  assert.equal(resolved.style, stylePresetPrompts.Claymation);
  assert.doesNotMatch(image, /complete art direction|Exploration strategy|Composition \/ camera:/);
  assert.match(image, /planned look distinct and intentional through visual treatment/);
});
