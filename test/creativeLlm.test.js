import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  creativeOpenAiModel, creativeFalModel, creativeSchemas, openAiLlmBody, falLlmInput, creativeFinalOutputText, validateCreativeResponse,
  directorReasoningSkill, storyboardReasoningSkill
} from "../server/creative-llm.js";
import { myNewtTokenCost } from "../src/myNewt/intelligence.js";
import { storyboardDirectorExpansionInstruction } from "../src/storyboardShotExpansion.js";
import { storyboardPlanIssues } from "../src/storyboardPlanValidation.js";
import { myNewtRequestEstimate } from "../server/my-newt.js";

const route = "film-director-style";
const output = JSON.stringify({ styleDirection: "Muted color, motivated light, restrained performances." });
const request = { route, prompt: "A quiet scene", systemPrompt: "Return JSON only", reasoningEffort: "high", responseMimeType: "application/json" };

test("creative defaults select Astra without changing Smart Text or media models", () => {
  assert.equal(creativeOpenAiModel, "gpt-6-astra");
  assert.equal(creativeFalModel, "openai/gpt-6-astra");
  const body = openAiLlmBody({ ...request, model: creativeOpenAiModel });
  assert.equal(body.reasoning.effort, "high");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.store, false);
  assert.ok(body.max_output_tokens >= 8000);
  for (const key of ["temperature", "top_p", "logprobs"]) assert.equal(Object.hasOwn(body, key), false);
});

test("every creative route has an enforceable contract and bounded output", () => {
  for (const route of Object.keys(creativeSchemas)) {
    const body = openAiLlmBody({ ...request, route, model: creativeOpenAiModel });
    assert.equal(body.text.format.schema, creativeSchemas[route]);
    assert.ok(body.max_output_tokens <= 24000);
    assert.throws(() => validateCreativeResponse({}, { route, provider: "test", text: "{}" }), /planning data/);
  }
  const body = openAiLlmBody({ ...request, route: "smart-text", model: "gpt-5.6-luna", responseMimeType: "text/plain" });
  assert.equal(body.text, undefined);
  assert.equal(body.max_output_tokens, undefined);
});

test("Fal uses only documented router controls, not unsupported effort or schema fields", () => {
  const body = falLlmInput({ ...request, model: creativeFalModel });
  assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "model", "prompt", "reasoning", "system_prompt"]);
  assert.equal(body.reasoning, true);
  assert.equal(body.model, creativeFalModel);
  for (const route of Object.keys(creativeSchemas)) {
    assert.equal(falLlmInput({ ...request, route, model: creativeFalModel }).reasoning, true);
  }
});

test("partial, refused, malformed and missing-field responses cannot masquerade as a completed plan", () => {
  for (const data of [
    { partial: true }, { status: "incomplete" }, { status: "failed" },
    { output: [{ content: [{ type: "refusal", refusal: "Cannot comply" }] }] }
  ]) assert.throws(() => validateCreativeResponse(data, { route, text: output, provider: "test" }));
  for (const text of ["[object Object]", "{", "{}", '{"styleDirection":42}', '{"styleDirection":""}', '{"styleDirection":"   "}', '[]']) {
    assert.throws(() => validateCreativeResponse({}, { route, text, provider: "test" }));
  }
  assert.deepEqual(validateCreativeResponse({}, { route, text: `\`\`\`json\n${output}\n\`\`\``, provider: "fal" }), JSON.parse(output));
});

test("Director count and CUT numbering cannot disagree", () => {
  const plan = { recommendedShotCount: 1, continuityLedger: "Same room.", mustHaveActions: "A reaction.", cuts: [{ number: 1, shotFrame: "CU", cameraMovement: "Static", shotType: "Reaction", description: "A reacts." }] };
  const check = (value) => validateCreativeResponse({}, { route: "film-director-shotlist", provider: "test", text: JSON.stringify(value) });
  assert.equal(check(plan).cuts.length, 1);
  assert.throws(() => check({ ...plan, recommendedShotCount: 2 }), /count/);
  assert.throws(() => check({ ...plan, cuts: [{ ...plan.cuts[0], number: 2 }] }), /numbers/);
});

test("background skills protect revisions, single-take pacing and same-CUT continuity", () => {
  assert.match(directorReasoningSkill, /newest user instructions/);
  assert.match(directorReasoningSkill, /preserve everything else/);
  assert.match(directorReasoningSkill, /single continuous shot/);
  assert.match(directorReasoningSkill, /heard sound when only sampled video frames/);
  assert.match(storyboardReasoningSkill, /between cuts, not between adjacent moments/);
  assert.match(storyboardReasoningSkill, /Matching CUs of different speakers are valid/);
});

// Exercise the actual server adapters without importing/starting the application's live server.
const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const adapters = server.slice(server.indexOf("async function runTextLlm("), server.indexOf("async function processTextWithLlm("));
function adapterFixture({ provider = "openai", data, onRequest = () => {} } = {}) {
  const deps = {
    requireActiveLlmProvider: () => provider, preferredTextLlmProvider: provider,
    falTextModel: creativeFalModel, falVisionTextModel: creativeFalModel, openAiTextModel: creativeOpenAiModel,
    skillDirectorLlmEndpoint: "openrouter/router", openAiTextApiKey: "mock-key",
    openAiLlmBody, falLlmInput, creativeFinalOutputText, validateCreativeResponse, myNewtTokenCost,
    creativeUsageContext: new AsyncLocalStorage(),
    estimateTextProcessingCost: ({ usage }) => ({ amountUsd: usage?.cost ?? 0 }),
    fetch: async (url, options) => { onRequest(url, JSON.parse(options.body)); return { ok: true, json: async () => data }; },
    subscribeFal: async (url, options) => { onRequest(url, options.input); return data; },
    extractFalText: (value) => value.output || "",
    extractOpenAiResponseText: (value) => value.output_text || "",
    falResultUsage: (value) => value.usage,
    readLocalAsset: async () => ({ buffer: Buffer.from("full-resolution-reference"), mimeType: "image/png" }),
    localAssetToFalUrl: async (url) => url,
    httpError: (status, message) => Object.assign(new Error(message), { status }), AbortSignal
  };
  return new Function(...Object.keys(deps), `${adapters}\nreturn {runTextLlm,runMediaDescriptionLlm};`)(...Object.values(deps));
}

test("direct OpenAI transport sends Astra High and schema, recording actual model token costs", async () => {
  const api = adapterFixture({ data: { status: "completed", output_text: output, usage: { input_tokens: 1000, output_tokens: 100 } }, onRequest: (url, body) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(body.model, creativeOpenAiModel);
    assert.equal(body.reasoning.effort, "high");
    assert.equal(body.text.format.strict, true);
  } });
  const result = await api.runTextLlm(request);
  assert.equal(result.text, output);
  assert.equal(result.usage.cost, 0.015);
});

test("Fal transport sends Astra and retains provider-reported usage", async () => {
  const api = adapterFixture({ provider: "fal", data: { output, usage: { cost: 0.023 } }, onRequest: (url, body) => {
    assert.equal(url, "openrouter/router"); assert.equal(body.model, creativeFalModel);
    assert.equal(body.reasoning, true, "Mandatory reasoning must not be disabled");
  } });
  const result = await api.runTextLlm(request);
  assert.equal(result.usage.cost, 0.023);
});

test("Fal mood-board analysis explicitly enables mandatory reasoning and still validates JSON", async () => {
  const visualOutput = JSON.stringify({ assets: [{ tag: "@MoodBoard", description: "Low contrast, muted color." }] });
  const api = adapterFixture({ provider: "fal", data: { output: visualOutput, usage: { cost: 0.02 } }, onRequest: (url, body) => {
    assert.equal(url, "openrouter/router/vision");
    if (!(body.reasoning ?? false)) throw new Error("Reasoning is mandatory for this endpoint and cannot be disabled.");
    assert.equal(body.model, creativeFalModel);
    assert.deepEqual(body.image_urls, ["/outputs/mood-board.png"]);
  } });
  const result = await api.runMediaDescriptionLlm({ ...request, route: "film-director-visual-analysis", inputs: [{ url: "/outputs/mood-board.png" }] });
  assert.equal(result.text, visualOutput);
  assert.equal(result.usages[0].cost, 0.02);
});

test("Fal reasoning is not used as scene output and reasoning-only results retain billed usage", async () => {
  const api = adapterFixture({ provider: "fal", data: { output: `<think>Internal scratchpad with {\"styleDirection\":\"not the answer\"}.</think>\n${output}`, usage: { cost: 0.023 } } });
  assert.equal((await api.runTextLlm(request)).text, output);
  for (const text of ["<think>unfinished", "<think>reasoning only</think>"]) {
    const incomplete = adapterFixture({ provider: "fal", data: { output: text, usage: { cost: 0.023 } } });
    await assert.rejects(incomplete.runTextLlm(request), error => {
      assert.match(error.message, /invalid JSON/);
      assert.equal(error.cost.amountUsd, 0.023);
      return true;
    });
  }
  assert.equal(creativeFinalOutputText(output), output);
});

test("an incomplete paid response retains billing metadata while rejecting the draft", async () => {
  const api = adapterFixture({ data: { status: "incomplete", output_text: output, usage: { input_tokens: 1000, output_tokens: 100 } } });
  await assert.rejects(api.runTextLlm(request), (error) => {
    assert.match(error.message, /incomplete/);
    assert.equal(error.cost.amountUsd, 0.015);
    assert.equal(error.llmResult.model, creativeOpenAiModel);
    return true;
  });
});

test("visual analysis uses full image content, image labels and the Astra schema", async () => {
  const api = adapterFixture({ data: { output_text: JSON.stringify({ assets: [{ tag: "@Hero", description: "Neutral reference garment." }] }) }, onRequest: (_url, body) => {
    assert.equal(body.model, creativeOpenAiModel);
    const content = body.input[0].content;
    assert.equal(content[1].text, "@Hero");
    assert.equal(Buffer.from(content[2].image_url.split(",")[1], "base64").toString(), "full-resolution-reference");
    assert.equal(body.text.format.name, "film_director_visual_analysis");
  } });
  const result = await api.runMediaDescriptionLlm({ ...request, route: "film-director-visual-analysis", inputs: [{ url: "/outputs/full.png", label: "@Hero" }] });
  assert.match(result.text, /@Hero/);
});

test("Storyboard planning passes its verified Astra contract and rejects collapsed Director moves", async () => {
  const source = server.slice(server.indexOf("async function generateStoryboardPlanWithOpenAi("), server.indexOf("async function recordStoryboardLlmUsage("));
  const shotList = "CUT 1 - A child plays soccer, then the camera rises to a bird's eye view of the entire field, then ascends above the clouds.";
  const plan = { sceneTitle: "Soccer", analysis: "A continuous ascent.", frames: [1, 2, 3].map((number) => ({ number, notes: "CUT 1 - keyframe", prompt: `Visual state ${number}` })) };
  const deps = { storyboardDirectorExpansionInstruction, storyboardPlanIssues, storyboardReasoningSkill,
    storyboardFalModel: creativeFalModel, storyboardOpenAiModel: creativeOpenAiModel,
    runTextLlm: async (body) => {
      assert.equal(body.openAiModel, creativeOpenAiModel);
      assert.equal(body.falModel, creativeFalModel);
      assert.equal(body.reasoningEffort, "high");
      assert.match(body.prompt, /child plays soccer/);
      assert.match(body.prompt, /Within one continuous CUT/);
      return { text: JSON.stringify(plan), usage: { cost: 0.03 }, provider: "fal", model: creativeFalModel };
    },
    estimateTextProcessingCost: ({ usage }) => ({ amountUsd: usage.cost }), parseStoryboardPlanJson: JSON.parse
  };
  const generate = new Function(...Object.keys(deps), `${source}; return generateStoryboardPlanWithOpenAi;`)(...Object.values(deps));
  assert.equal((await generate({ sceneDescription: "Soccer", frameCount: 3, directorShotList: shotList })).plan.frames.length, 3);
  plan.frames.length = 1;
  await assert.rejects(generate({ sceneDescription: "Soccer", frameCount: 3, directorShotList: shotList }), (error) => {
    assert.match(error.message, /at least 3 keyframes/);
    assert.equal(error.cost.amountUsd, 0.03);
    assert.equal(error.llmResult.model, creativeFalModel);
    return true;
  });
});

test("Director permits at most one repair and does not accept a still-invalid plan", async () => {
  const source = server.slice(server.indexOf("async function validateAndRepairSkillDirectorShotPlan("), server.indexOf("function buildSkillDirectorPrompt("));
  let repairs = 0, issues = ["Include a continuity ledger."];
  const deps = { skillDirectorShotPlanFromOutput: () => ({ shotList: "@Hero", shotListNotes: "" }),
    skillDirectorShotPlanIssues: () => issues,
    repairSkillDirectorShotPlan: async () => { repairs++; return { text: "repaired", usage: { cost: 0.02 } }; }
  };
  const validate = new Function(...Object.keys(deps), `${source}; return validateAndRepairSkillDirectorShotPlan;`)(...Object.values(deps));
  await assert.rejects(validate({ outputText: "draft", activeReferenceTags: ["@Hero"] }), /after one repair/);
  assert.equal(repairs, 1);
  issues = []; repairs = 0;
  await assert.rejects(validate({ outputText: "draft", activeReferenceTags: [] }), /inactive or unknown/);
  assert.equal(repairs, 1);
  repairs = 0;
  const result = await validate({ outputText: "draft", activeReferenceTags: ["@Hero"] });
  assert.equal(result.text, "draft"); assert.equal(repairs, 0);
  issues = ["CUT 1 and CUT 2 are too close in framing; consider wider contrast."];
  await validate({ outputText: "draft", activeReferenceTags: ["@Hero"] });
  assert.equal(repairs, 0, "Soft editorial preferences must not force paid repair loops");
});

test("local Director assembly is free and standalone Fal visual QC adds no fictitious main request", () => {
  const source = server.slice(server.indexOf("function estimateTextProcessingCost("), server.indexOf("function usageCost("));
  const estimate = new Function("usageCost", "roundCurrency", "falTextRequestCost", "falVisionTextUnitCost", "falVideoTextUnitCost", `${source}; return estimateTextProcessingCost;`)
    ((usage) => usage?.cost ?? null, (value) => value, 0.01, 0.02, 0.03);
  assert.equal(estimate({ provider: "local" }).amountUsd, 0);
  assert.equal(estimate({ provider: "fal", helperUsages: [{ cost: 0.03 }], hasMainRequest: false }).amountUsd, 0.03);
  assert.equal(estimate({ provider: "fal", usage: { cost: 0.02 }, helperUsages: [{ cost: 0.03 }] }).amountUsd, 0.05);
  assert.equal(myNewtRequestEstimate("/api/node/run-skill-director", { action: "build" }), 0);
});
