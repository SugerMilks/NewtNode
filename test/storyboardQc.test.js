import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createStoryboardQc, storyboardQcImage, storyboardQcInputs, storyboardQcDecision, storyboardQcFailureTypes } from "../server/storyboard-qc.js";
import { creativeSchemas, validateCreativeResponse } from "../server/creative-llm.js";
import { storyboardPromptPolicy } from "../src/storyboardPromptPolicy.js";
import { storyboardQcCharacterInputs } from "../src/storyboardCast.js";
import { storyboardQcUnavailable } from "../src/storyboardPlanValidation.js";

const image = { buffer: await sharp({ create: { width: 3840, height: 2160, channels: 3, background: "#aabbaa" } }).png().toBuffer(), mimeType: "image/png", fileName: "original.png" };
const pass = { pass: true, severity: "ok", summary: "Cast and staging match.", issues: [], shouldRetry: false, correctionPrompt: "", confidence: "high", needsDetail: false, failureType: "none" };
const missing = { ...pass, pass: false, severity: "major", failureType: "missing_cast", summary: "@Man is missing from the visible east seat.", issues: ["@Man's east seat is visibly empty."], shouldRetry: true, correctionPrompt: "Restore @Man in the east seat." };
const input = { sourceUrl: "/outputs/frame.png", characterReferences: [{ tag: "Woman", url: "/outputs/woman.png" }, { tag: "Man", url: "/outputs/man.png" }], previousFrameUrl: "/outputs/previous.png", spatialAnchorUrl: "/outputs/anchor.png", framePrompt: "@Woman listens while @Man talks.", sceneDescription: "Both remain seated.", useStoryboardStyle: true };
const options = { connection: { provider: "atlas", key: "fixture-only" }, model: "mock", policy: "test policy" };
function harness(verdicts = [pass], cost = 0.12) {
  const calls = [], records = [];
  const assets = new Map();
  const run = createStoryboardQc({ readLocalAsset: async url => assets.get(url) || image, review: async request => {
    calls.push(request);
    const verdict = verdicts[Math.min(calls.length - 1, verdicts.length - 1)];
    if (verdict instanceof Error) throw verdict;
    return { qc: verdict, cost: { amountUsd: cost, currency: "USD" }, result: { provider: "atlas", text: JSON.stringify(verdict), usages: [{ cost }] } };
  } });
  return { calls, records, assets, run: (body = input, opts = options) => run(body, { ...opts, recordUsage: async (value, tier) => records.push({ ...value, tier }) }) };
}

test("Balanced reviews every panel with all named identities and bounded copies, not original generation files", async () => {
  const h = harness();
  const before = Buffer.from(image.buffer);
  const result = await h.run();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].reasoningEffort, "low");
  assert.equal(h.calls[0].connection.key, options.connection.key);
  assert.deepEqual(h.calls[0].preparedInputs.map(item => item.url), storyboardQcInputs(input).map(item => item.url));
  for (const [i, item] of h.calls[0].preparedInputs.entries()) {
    const meta = await sharp(item.asset.buffer).metadata();
    assert.equal(meta.width, i < 3 ? 1536 : 1024);
    assert.equal(meta.width / meta.height, 16 / 9);
  }
  assert.ok(h.calls[0].preparedInputs[1].label.includes("@Woman"));
  assert.ok(h.calls[0].preparedInputs[2].label.includes("@Man"));
  assert.deepEqual(image.buffer, before);
  assert.equal(result.qc.mode, "balanced");
  assert.equal(result.qc.pass, true);
  assert.equal(result.qc.escalated, false);
  assert.equal(result.cost.amountUsd, 0.12);
  assert.equal(h.records[0].tier, "balanced/routine");
});

test("review copies keep small images small and preserve portrait aspect ratio", async () => {
  const small = { ...image, buffer: await sharp(image.buffer).resize(360, 640).png().toBuffer() };
  const result = await storyboardQcImage(small, 1536);
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.width, 360);
  assert.equal(meta.height, 640);
});

test("shared previous/spatial anchor is sent once, but distinct named identity bindings are retained", () => {
  const items = storyboardQcInputs({ ...input, spatialAnchorUrl: input.previousFrameUrl });
  assert.equal(items.length, 4);
  assert.equal(items.filter(item => item.url === input.previousFrameUrl).length, 1);
});

test("Deep stays one full-resolution high-reasoning review", async () => {
  const h = harness();
  const result = await h.run({ ...input, qcMode: "deep" });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].reasoningEffort, "high");
  for (const item of h.calls[0].preparedInputs) assert.deepEqual(item.asset.buffer, image.buffer);
  assert.equal(result.qc.mode, "deep");
  assert.equal(result.qc.escalated, false);
});

test("a missing listener needs independent higher-detail confirmation before one image retry is permitted", async () => {
  const h = harness([missing]);
  const result = await h.run();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].reasoningEffort, "high");
  assert.equal(h.calls[1].qcMode, "balanced");
  assert.equal(h.calls[1].framePrompt, input.framePrompt);
  assert.equal((await sharp(h.calls[1].preparedInputs[1].asset.buffer).metadata()).width, 2048);
  assert.equal(result.qc.shouldRetry, true);
  assert.equal(result.qc.escalated, true);
  assert.equal(result.cost.amountUsd, 0.24);
  assert.deepEqual(h.records.map(item => item.tier), ["balanced/routine", "balanced/confirmation"]);
});

test("deep confirmation can overturn a cheap-pass false alarm without regenerating an image", async () => {
  const h = harness([missing, pass]);
  const result = await h.run();
  assert.equal(h.calls.length, 2);
  assert.equal(result.qc.pass, true);
  assert.equal(result.qc.shouldRetry, false);
});

test("uncertain passing reviews still escalate, and unresolved uncertainty is not cached or approved", async () => {
  const h = harness([{ ...pass, confidence: "uncertain", needsDetail: true }]);
  await assert.rejects(h.run(), error => error.cost.amountUsd === 0.24);
  await assert.rejects(h.run());
  assert.equal(h.calls.length, 4);
});

test("minor performance/polish notes never cause an image retry", async () => {
  const h = harness([{ ...pass, severity: "minor", failureType: "polish", summary: "Smile could be stronger." }]);
  const result = await h.run();
  assert.equal(h.calls.length, 1);
  assert.equal(result.qc.pass, true);
  assert.equal(result.qc.severity, "minor");
  assert.equal(result.qc.shouldRetry, false);
  assert.equal(storyboardQcDecision({ ...missing, failureType: "polish" }).shouldRetry, false);
});

test("all essential categories can fail; contradictory or uncertain decisions cannot approve anchors", () => {
  assert.deepEqual(creativeSchemas["storyboard-qc-adaptive"].properties.failureType.enum, storyboardQcFailureTypes);
  for (const failureType of storyboardQcFailureTypes.slice(2)) {
    assert.equal(storyboardQcDecision({ ...missing, failureType }).shouldRetry, true);
    assert.equal(storyboardQcDecision({ ...pass, failureType }).severity, "unreviewed");
  }
  assert.equal(storyboardQcDecision({ ...missing, confidence: "uncertain" }).shouldRetry, false);
  assert.equal(storyboardQcDecision({ ...missing, shouldRetry: false }).shouldRetry, false);
});

test("identical and concurrent reviews are reused with zero repeat cost and one history entry", async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.run(), h.run()]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.records.length, 1);
  assert.equal(a.cost.amountUsd + b.cost.amountUsd, 0.12);
  assert.equal([a, b].filter(result => result.qc.cacheHit).length, 1);
  const reused = await h.run();
  assert.equal(reused.cost.amountUsd, 0);
  reused.qc.summary = "Changed externally";
  assert.equal((await h.run()).qc.summary, pass.summary);
});

test("cache invalidates on image bytes, reference labels, instructions, mode, provider, credentials and policy", async () => {
  const h = harness();
  await h.run();
  await h.run({ ...input, framePrompt: "A revised action" });
  await h.run({ ...input, sceneDescription: "New scene" });
  await h.run({ ...input, qcMode: "deep" });
  await h.run({ ...input, characterReferences: [{ ...input.characterReferences[0], tag: "Different" }] });
  await h.run(input, { ...options, model: "new-model" });
  await h.run(input, { ...options, policy: "updated policy" });
  await h.run(input, { ...options, connection: { ...options.connection, key: "different-fixture-key" } });
  await h.run(input, { ...options, connection: { ...options.connection, provider: "fal" } });
  h.assets.set(input.sourceUrl, { ...image, buffer: await sharp(image.buffer).negate().png().toBuffer() });
  await h.run();
  h.assets.set(input.characterReferences[0].url, { ...image, buffer: await sharp(image.buffer).negate().png().toBuffer() });
  await h.run();
  assert.equal(h.calls.length, 11);
});

test("schema/provider failures are never retried, and paid invalid responses are accounted once", async () => {
  const error = Object.assign(new Error("Invalid response"), { llmResult: { text: "bad", usages: [{}] }, cost: { amountUsd: 0.15 } });
  const h = harness([error]);
  const results = await Promise.allSettled([h.run(), h.run()]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.records.length, 1);
  assert.equal(results.reduce((sum, result) => sum + result.reason.cost.amountUsd, 0), 0.15);
  await assert.rejects(h.run());
  assert.equal(h.calls.length, 2);
});

test("failed confirmation includes the first paid review without double billing", async () => {
  const error = Object.assign(new Error("Provider failed"), { llmResult: { text: "incomplete" }, cost: { amountUsd: 0.2 } });
  const h = harness([missing, error]);
  await assert.rejects(h.run(), error => error.cost.amountUsd === 0.32);
  assert.equal(h.calls.length, 2);
  assert.equal(h.records.length, 2);
  assert.equal(h.records[1].cost.amountUsd, 0.2);
});

test("unpriced requests remain unknown, never zero", async () => {
  const h = harness([pass], null);
  assert.equal((await h.run()).cost.amountUsd, null);
  const failing = harness([new Error("Connection lost after submission")]);
  await assert.rejects(failing.run(), error => error.cost.amountUsd === null);
});

test("adaptive QC contract requires evidence classification and uncertainty fields", () => {
  for (const provider of ["fal", "atlas", "OpenAI"]) {
    assert.doesNotThrow(() => validateCreativeResponse({}, { route: "storyboard-qc-adaptive", provider, text: JSON.stringify(pass) }));
    const { confidence, ...incomplete } = pass;
    assert.throws(() => validateCreativeResponse({}, { route: "storyboard-qc-adaptive", provider, text: JSON.stringify(incomplete) }));
  }
});

const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
function getFunction(name, deps = {}) {
  const start = server.search(new RegExp(`(?:async )?function ${name}\\(`));
  const rest = server.slice(start);
  const end = rest.search(/\n(?:async )?function /);
  return new Function(...Object.keys(deps), `${rest.slice(0, end)}; return ${name};`)(...Object.values(deps));
}
test("real review adapter sends prepared snapshots, provider connection, effort and strict contract", async () => {
  let request;
  const review = getFunction("reviewStoryboardFrameWithOpenAi", {
    storyboardQcCharacterInputs, storyboardQcUnavailable,
    storyboardQcReviewPrompt: getFunction("storyboardQcReviewPrompt", { storyboardPromptPolicy }),
    normalizeStoryboardQcResult: getFunction("normalizeStoryboardQcResult", { normalizeChoice: (value, options, fallback) => options.includes(value) ? value : fallback }),
    storyboardVisionFalModel: "mock-fal", storyboardVisionOpenAiModel: "mock-direct",
    parseStoryboardPlanJson: JSON.parse, estimateTextProcessingCost: () => ({ amountUsd: 0.12 }),
    runMediaDescriptionLlm: async body => { request = body; return { text: JSON.stringify(pass), usages: [] }; }
  });
  const preparedInputs = [{ url: input.sourceUrl, label: "Generated frame", asset: image }];
  const result = await review({ ...input, qcMode: "balanced", preparedInputs, adaptiveQc: true, reasoningEffort: "low", connection: options.connection });
  assert.equal(request.inputs, preparedInputs);
  assert.equal(request.connection, options.connection);
  assert.equal(request.reasoningEffort, "low");
  assert.equal(request.route, "storyboard-qc-adaptive");
  assert.equal(result.qc.confidence, "high");
  assert.match(request.prompt, /Occupancy audit/);
  assert.match(request.prompt, /speculative left\/right-hand anatomy/);
  assert.match(request.prompt, /essential to the story, remains a real action/);
});

test("Balanced tolerates acting nuance even on confirmation; Deep retains explicit performance scrutiny", () => {
  const prompt = getFunction("storyboardQcReviewPrompt", { storyboardPromptPolicy });
  const balanced = prompt({ adaptiveQc: true, qcMode: "balanced" });
  const deep = prompt({ adaptiveQc: true, qcMode: "deep" });
  assert.match(balanced, /Judge whether the intended story beat reads, not literal execution/);
  assert.match(balanced, /This tolerance also applies during higher-detail confirmation/);
  assert.doesNotMatch(balanced, /DEEP PERFORMANCE REVIEW/);
  assert.match(deep, /Check explicit acting direction closely/);
  assert.match(deep, /gesture, gaze, expression intensity/);
  assert.doesNotMatch(deep, /BALANCED PERFORMANCE REVIEW|need not have a particular intensity/);
});

for (const provider of ["openai", "atlas", "fal"]) test(`${provider} transport uses QC copy bytes instead of rereading originals`, async () => {
  let request, uploaded;
  const transport = getFunction("runMediaDescriptionLlm", {
    preferredTextLlmProvider: "atlas", falVisionTextModel: "mock", openAiTextModel: "mock", currentAtlasLlmRates: () => ({}),
    readLocalAsset: () => assert.fail("Prepared image must not be replaced with original"), localAssetToFalUrl: () => assert.fail("Must upload prepared copy"),
    createFalClient: () => ({ storage: { upload: async file => { uploaded = file; return "mock-upload"; } } }),
    subscribeFal: async (_endpoint, body) => { request = body; return {}; }, falLlmInput: () => ({}),
    extractFalText: () => "{}", falResultUsage: () => ({}), checkedCreativeLlmResult: result => result,
    requestLlmResponse: async (body, auth) => { request = { body, auth }; return {}; },
    openAiLlmBody: body => body, extractOpenAiResponseText: () => "{}", llmResponseModel: () => "mock", llmResponseEndpoints: { atlas: "mock" }
  });
  const copy = await storyboardQcImage(image, 1536);
  await transport({ inputs: [{ url: input.sourceUrl, label: "Frame", asset: copy }], prompt: "Review", connection: { provider, key: "fixture-only" } });
  if (provider === "fal") {
    assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), copy.buffer);
    assert.deepEqual(request.input.image_urls, ["mock-upload"]);
  } else {
    assert.equal(request.body.input[0].content[2].image_url, `data:image/png;base64,${copy.buffer.toString("base64")}`);
    assert.equal(request.auth.provider, provider);
  }
});
