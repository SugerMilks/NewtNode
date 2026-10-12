import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSeedanceDraftStore, registerSeedanceDraftRoutes } from "../server/seedance-drafts.js";
import { seedanceDraftCompletionEndpoint, seedanceDraftLifetimeMs, selectedSeedanceDraft, finishedSeedanceDraftState } from "../src/seedanceDraft.js";
import { buildVideoGenerationRequest, normalizeVideoGenerationResult } from "../src/nodeRunners/videoModels.js";
import { finishSeedanceDraft } from "../src/nodeRunners/seedanceDraft.js";
import { normalizedResultItems } from "../src/mediaResults.js";
import { generationEstimate, estimateVideoRunCost } from "../src/generationPricing.js";
import { generationQuoteKey } from "../src/pricingTrust.js";
import { nodeApi } from "../src/api/newtApi.js";
import { filmDirectorSceneSnapshot } from "../src/filmDirectorScenes.js";
import { createFilmDirectorRevisionSnapshot } from "../src/filmDirectorRevision.js";

const original = { prompt: "Original prompt", submittedPrompt: "Original mapped prompt", project: { id: "project" }, node: { id: "video" },
  settings: { generateAudio: false, duration: "5", aspectRatio: "16:9" } };
const video = { url: "https://example.test/finished.mp4" };
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-draft-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let key = "original-key", time = Date.now();
  const calls = [], histories = [];
  const queue = {
    submit: async (endpoint, { input }) => { calls.push({ kind: "submit", endpoint, input }); return { request_id: "request-final" }; },
    subscribeToStatus: async (endpoint, options) => calls.push({ kind: "poll", endpoint, options }),
    result: async () => ({ data: { video, seed: 4 } }), ...overrides.queue
  };
  const options = { directory, now: () => time, getKey: () => key,
    createClient: captured => { calls.push({ kind: "client", key: captured }); return { queue }; },
    download: async (_req, url, options) => { calls.push({ kind: "download", url, options }); return { publicPath: "/outputs/final.mp4", fileName: "final.mp4" }; },
    history: async item => histories.push(item), ...overrides };
  const store = createSeedanceDraftStore(options);
  const draft = await store.recordDraft({ draftId: "provider-draft", key, startedAt: time, original });
  return { store, draft, calls, histories, directory, queue, options,
    setKey: value => { key = value; }, age: ms => { time += ms; } };
}

test("durable finish submits only the provider draft ID, once across concurrent calls and reloads", async t => {
  const h = await fixture(t);
  const [first, second] = await Promise.all([h.store.complete(h.draft.receiptId, {}), h.store.complete(h.draft.receiptId, {})]);
  assert.deepEqual(first, second);
  assert.deepEqual(h.calls.find(x => x.kind === "submit"), { kind: "submit", endpoint: seedanceDraftCompletionEndpoint,
    input: { draft_id: "provider-draft", resolution: "1080p", codec: "auto" } });
  assert.equal(h.calls.filter(x => x.kind === "submit").length, 1);
  assert.equal(h.histories.length, 1); assert.equal(h.histories[0].prompt, original.prompt);
  assert.equal(h.histories[0].cost.amountUsd, null); assert.equal(h.histories[0].settings.resolution, "1080p");
  assert.equal(h.calls.find(x => x.kind === "download").options.removeAudio, true);
  h.age(seedanceDraftLifetimeMs + 1); h.setKey("");
  assert.deepEqual(await createSeedanceDraftStore(h.options).complete(h.draft.receiptId, {}), first);
  assert.equal(h.calls.filter(x => x.kind === "submit").length, 1);
  const saved = await readFile(path.join(h.directory, `${h.draft.receiptId}.json`), "utf8");
  assert.ok(!saved.includes("original-key")); assert.ok(!JSON.stringify(h.draft).includes("Fingerprint"));
});

test("expired drafts, missing receipts and changed/disabled keys cannot spend money", async t => {
  const h = await fixture(t);
  for (const key of ["", "other-key"]) {
    h.setKey(key); await assert.rejects(h.store.complete(h.draft.receiptId, {}), /original Fal API key/);
  }
  h.setKey("original-key"); h.age(seedanceDraftLifetimeMs);
  await assert.rejects(h.store.complete(h.draft.receiptId, {}), /expired/);
  await assert.rejects(h.store.complete("../outside", {}), /Invalid draft receipt/);
  await assert.rejects(h.store.complete("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", {}), /installation that created/);
  assert.equal(h.calls.filter(x => x.kind === "submit").length, 0);
});

test("uncertain submission stays blocked after restart instead of charging twice", async t => {
  let submits = 0;
  const h = await fixture(t, { queue: { submit: async () => { submits++; throw new Error("Network lost"); } } });
  await assert.rejects(h.store.complete(h.draft.receiptId, {}), /Network lost/);
  await assert.rejects(createSeedanceDraftStore(h.options).complete(h.draft.receiptId, {}), /could not be confirmed/);
  assert.equal(submits, 1);
});

test("known queued request resumes by polling only, even after draft expiry", async t => {
  let first = true;
  const h = await fixture(t, { queue: { subscribeToStatus: async () => { if (first) { first = false; throw new Error("Lost polling connection"); } } } });
  await assert.rejects(h.store.complete(h.draft.receiptId, {}), /Lost polling/);
  h.age(seedanceDraftLifetimeMs + 1);
  assert.equal((await createSeedanceDraftStore(h.options).complete(h.draft.receiptId, {})).video.localUrl, "/outputs/final.mp4");
  assert.equal(h.calls.filter(x => x.kind === "submit").length, 1);
});

test("a failed local save recovers the finished render without paid resubmission", async t => {
  let downloads = 0;
  const h = await fixture(t, { download: async () => { if (++downloads === 1) throw new Error("Disk unavailable"); return { publicPath: "/outputs/final.mp4" }; } });
  await assert.rejects(h.store.complete(h.draft.receiptId, {}), /Disk unavailable/);
  await createSeedanceDraftStore(h.options).complete(h.draft.receiptId, {});
  assert.equal(h.calls.filter(x => x.kind === "submit").length, 1);
  assert.equal(h.calls.filter(x => x.kind === "poll").length, 1);
});

test("completion route rejects errors with preserved-preview messaging", async t => {
  const h = await fixture(t); let handler;
  registerSeedanceDraftRoutes({ post: (_url, fn) => { handler = fn; } }, { store: h.store, sendApiError: (res, error) => res.status(error.status).json({ error: error.message }) });
  const res = { status(n) { this.code = n; return this; }, json(body) { this.body = body; } };
  await handler({ body: { receiptId: "invalid" } }, res); assert.equal(res.code, 400);
});

test("Director overrides Draft without changing source node choices; old nodes stay standard", () => {
  const node = { id: "v", data: { model: "Seedance 2.5", seedanceDraft: true, resolution: "1080p", duration: "5 seconds" } };
  assert.equal(buildVideoGenerationRequest({ node }).resolution, "480p");
  const full = buildVideoGenerationRequest({ node, filmDirector: { videoModel: "Seedance 2.5", resolution: "1080p", seedanceDraft: false } });
  assert.equal(full.seedanceDraft, false); assert.equal(full.resolution, "1080p");
  const legacy = { id: "v", data: { model: "Seedance 2.5", resolution: "1080p" } };
  assert.equal(buildVideoGenerationRequest({ node: legacy }).seedanceDraft, false);
  assert.equal(buildVideoGenerationRequest({ node: legacy, filmDirector: { videoModel: "Seedance 2.5", seedanceDraft: true } }).resolution, "480p");
  assert.equal(node.data.resolution, "1080p");
  assert.equal(filmDirectorSceneSnapshot({ skillSeedanceDraft: true }).skillSeedanceDraft, true);
  assert.equal(createFilmDirectorRevisionSnapshot({ skillSeedanceDraft: true }).skillSeedanceDraft, true);
});

test("draft metadata survives shared results and JSON; finishing appends without replacing the preview", () => {
  const receiptId = "receipt", draft = { receiptId, draftId: "provider", expiresAt: new Date().toISOString() };
  const result = normalizeVideoGenerationResult({ video: { localUrl: "/outputs/preview.mp4" }, seedanceDraft: draft }, 0);
  const data = JSON.parse(JSON.stringify({ resultItems: normalizedResultItems([result], "", "video"), selectedResultIndex: 0 }));
  assert.deepEqual(selectedSeedanceDraft(data).seedanceDraft, draft);
  const final = normalizeVideoGenerationResult({ video: { localUrl: "/outputs/final.mp4" }, seedanceDraftSource: receiptId }, 0);
  const next = finishedSeedanceDraftState(data, receiptId, final);
  assert.equal(next.resultItems[0].url, "/outputs/preview.mp4"); assert.equal(next.selectedResultIndex, 1);
  assert.equal(finishedSeedanceDraftState(next, receiptId, final).resultItems.length, 2);
});

test("draft costs cannot reuse standard quotes", () => {
  const settings = { model: "Seedance 2.5", kind: "video", provider: "fal", resolution: "480p", duration: "5 seconds" };
  assert.ok(estimateVideoRunCost(settings) > 0);
  assert.equal(generationEstimate({ ...settings, seedanceDraft: true }).amountUsd, null);
  assert.equal(estimateVideoRunCost({ ...settings, seedanceDraft: true }), null);
  assert.notEqual(generationQuoteKey(settings), generationQuoteKey({ ...settings, seedanceDraft: true }));
});

test("completion controller does not overwrite a changed project or deleted node", async () => {
  let node = { id: "v", data: { resultItems: [{ url: "/outputs/draft.mp4", seedanceDraft: { receiptId: "receipt" } }] } };
  let resolve;
  const task = finishSeedanceDraft({ node, getCurrent: () => node, update: patch => { node = { ...node, data: { ...node.data, ...patch } }; },
    complete: () => new Promise(done => { resolve = done; }) });
  node = { id: "v", data: { resultItems: [] } };
  resolve({ video: { localUrl: "/outputs/final.mp4" }, seedanceDraftSource: "receipt" });
  await task;
  assert.deepEqual(node.data, { resultItems: [] });
});

test("reselecting an already finished draft only selects its saved final", async () => {
  const node = { id: "v", data: { resultItems: [
    { url: "/outputs/draft.mp4", seedanceDraft: { receiptId: "receipt" } },
    { url: "/outputs/final.mp4", seedanceDraftSource: "receipt" }
  ], selectedResultIndex: 0 } };
  let patch;
  await finishSeedanceDraft({ node, getCurrent: () => node, update: value => { patch = value; }, complete: () => assert.fail("Must not request a second finish") });
  assert.equal(patch.selectedResultIndex, 1); assert.equal(patch.resultItems.length, 2);
});

test("API checks health and never replays paid finishing POSTs", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/health") return new Response(JSON.stringify({ routes: { seedanceDrafts: true } }));
    throw new Error("Network lost");
  });
  await assert.rejects(nodeApi.completeSeedanceDraft({ receiptId: "receipt" }), /will not submit a duplicate/);
  assert.equal(calls.filter(x => x.options.method === "POST").length, 1);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ routes: {} })));
  await assert.rejects(nodeApi.generateVideo({ seedanceDraft: true }), /Restart.*Draft mode/);
});
