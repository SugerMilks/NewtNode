import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { learningSnapshot, learningChanges, learningAsset, learningText, lessonMatches, exportLearningSkill, learningAnalysisRetryToken } from "../src/myNewt/learning.js";
import { LearningRecorder } from "../src/myNewt/learningRecorder.js";
import { NewtLearningStore } from "../server/newt-learning.js";
import { createNewtLearningSummarizer, learningAnalysisEvidence, validateLearningSummary, learningAnalysisFailure } from "../server/newt-learning-summary.js";
import { llmResponseBody } from "../server/llm-responses.js";
import { registerNewtLearningRoutes } from "../server/routes/newtLearning.js";
import { MyNewtService } from "../server/my-newt.js";
import { myNewtSnapshot } from "../src/myNewt/contract.js";
import { newtLearningApi } from "../src/api/newtApi.js";

const node = (data = {}) => ({ id: "image", type: "imageModel", canvasId: "main", x: 0, y: 0, data: { title: "Cinematic plate", prompt: "A layered garden", model: "Nano Banana Pro", ...data } });
const graph = nodes => ({ nodes, edges: [], canvases: [{ id: "main", name: "Look development" }] });
const note = (id = "note-1") => ({ id, at: 1, kind: "note", nodeType: "imageModel", title: "Layered locations", canvas: "Look development", detail: "For cinematic location plates, preserve a clear foreground, middle distance and background.", asset: "/outputs/plate.png" });
const lesson = { title: "Layered locations", guidance: "For cinematic location plates, use a layered composition.", kind: "preference", scope: "project", tags: ["location", "cinematic", "composition"], enabled: true };
const summary = { summary: "A location composition was selected with an explicit reason.", lessons: [{ ...lesson, scope: undefined, enabled: undefined, evidenceIds: ["note-1"] }] };
delete summary.lessons[0].scope; delete summary.lessons[0].enabled;
async function fixture(t, summarize = async () => structuredClone(summary)) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-learning-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new NewtLearningStore({ directory, summarize });
  await store.create({ id: "session", projectId: "project", title: "Location session" });
  return { directory, store };
}
async function approve(store, value = lesson) {
  await store.append("session", { projectId: "project", events: [note()] });
  await store.finish("session", { projectId: "project" });
  return store.approve("session", { ...value, projectId: "project", suggestionId: "note-1" });
}

test("private Watch Me sessions and approved lessons are excluded from version control", async () => {
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /^server\/data\/newt-learning\/\s*$/m);
});

test("observation uses an allowlist, redacts common secrets and excludes Newt, credentials and external media", () => {
  const value = learningSnapshot([node({ apiKey: "secret", password: "private", filePath: "/Users/me/private", prompt: "bearer secret-secret-secret https://example.com/?token=secret", resultUrl: "https://example.com/secret.png", myNewtRunRecords: { token: "secret" } }), { id: "newt", type: "myNewt", data: { brief: "private" } }]);
  assert.equal(value.nodes.length, 1); assert.deepEqual(value.nodes[0].outputs, []);
  assert.doesNotMatch(JSON.stringify(value), /secret|private|apiKey|filePath/);
  for (const url of ["/outputs/../secret.png", "/outputs/%2e%2e/private", "/outputs/x?key=secret", "data:xxx", "file:///tmp/a", "/outputs/a\\x.png", "/outputs/%5cx"]) assert.equal(learningAsset(url), "");
  assert.equal(learningAsset("/outputs/plate.png"), "/outputs/plate.png");
  assert.equal(learningText("sk-123456789abcdefghijkl"), "[redacted]");
  assert.throws(() => learningSnapshot(Array.from({ length: 401 }, () => node())), /400/);
});

test("meaningful diffs ignore dragging, transient state and credentials; result selection is not approval", () => {
  const a = node({ resultUrl: "/outputs/a.png", resultItems: [{ url: "/outputs/a.png" }, { url: "/outputs/b.png" }] });
  const before = learningSnapshot([a]);
  assert.deepEqual(learningChanges(before, learningSnapshot([{ ...a, x: 99, data: { ...a.data, status: "generating", apiKey: "new" } }])), []);
  const changes = learningChanges(before, learningSnapshot([{ ...a, data: { ...a.data, prompt: "Wider framing", resultUrl: "/outputs/b.png" } }]));
  assert.deepEqual(changes.map(item => item.kind), ["edited", "selected"]);
  assert.match(changes[1].detail, /does not imply approval/);
  const after = learningSnapshot([a, { id: "preview", type: "preview", data: {} }], [{ from: { nodeId: "image", port: "imageOut" }, to: { nodeId: "preview", port: "mediaIn" } }]);
  assert.ok(learningChanges(before, after).some(event => event.kind === "connected"));
});

test("recorder is off by default, has an idempotent persistent outbox, and stops observing when paused", async () => {
  const saved = [], sent = []; let fail = true;
  const recorder = new LearningRecorder({ session: { id: "session", projectId: "project" }, persist: item => saved.push(structuredClone(item)), send: async (_action, body) => {
    sent.push(body); if (fail) throw new Error("offline"); return { count: body.events.length };
  } });
  recorder.observe(graph([node()])); assert.equal(recorder.pending.length, 0);
  recorder.start(graph([node()])); recorder.observe(graph([node({ prompt: "New framing" })]));
  const id = recorder.pending[0].id;
  await assert.rejects(recorder.flush(), /offline/); assert.equal(recorder.pending[0].id, id);
  fail = false; await recorder.flush(); assert.equal(sent[1].events[0].id, id); assert.equal(recorder.pending.length, 0);
  recorder.pause(); recorder.observe(graph([node({ prompt: "Not recorded" })])); assert.equal(recorder.pending.length, 0);
  const restored = new LearningRecorder({ session: saved.at(-1), send: async () => ({ count: 1 }) });
  assert.equal(restored.recording, false);
});

test("events added during a flush are preserved and sent in order", async () => {
  let release; const received = [];
  const recorder = new LearningRecorder({ session: { id: "session", projectId: "project" }, send: async (_action, body) => {
    received.push(body.events.map(event => event.id)); if (received.length === 1) await new Promise(resolve => { release = resolve; }); return { count: received.flat().length };
  } });
  recorder.add([note("a")]); const flush = recorder.flush();
  await new Promise(resolve => setTimeout(resolve, 0)); recorder.add([note("b")]); release(); await flush;
  assert.deepEqual(received, [["a"], ["b"]]); assert.equal(recorder.count, 2);
});

test("initial recorder context is bounded before it reaches browser storage", () => {
  let saved;
  const recorder = new LearningRecorder({ session: { id: "session", projectId: "project" }, send: async () => {}, persist: value => { saved = value; } });
  recorder.add([{ ...note(), detail: "x".repeat(20000), unexpectedSecret: "secret" }]);
  assert.equal(saved.pending[0].detail.length, 1200); assert.equal(saved.pending[0].unexpectedSecret, undefined);
});

test("sessions persist across restart, append retries deduplicate, and recording never creates approved guidance", async t => {
  const { store, directory } = await fixture(t);
  await store.append("session", { projectId: "project", events: [note(), note()] });
  await store.append("session", { projectId: "project", events: [note()] });
  assert.equal((await store.session("session", "project")).events.length, 1);
  await store.finish("session", { projectId: "project" });
  assert.deepEqual((await store.retrieve("project", "cinematic location")).lessons, []);
  const recovered = new NewtLearningStore({ directory });
  assert.equal((await recovered.session("session", "project")).suggestions.length, 1);
  await assert.rejects(store.append("session", { projectId: "project", events: [] }), { status: 409 });
  await assert.rejects(store.session("session", "other"), { status: 404 });
  await assert.rejects(store.create({ id: "../../escape", projectId: "project" }), /Invalid/);
});

test("approval is idempotent, relevant and scoped; edits conflict, disable and restore without touching captured guidance", async t => {
  const { store } = await fixture(t); const item = await approve(store);
  const snapshot = await store.retrieve("project", "cinematic location composition");
  assert.equal(snapshot.lessons.length, 1); assert.equal(snapshot.lessons[0].evidence, undefined);
  assert.equal((await store.retrieve("other", "cinematic location")).lessons.length, 0);
  assert.equal((await store.retrieve("project", "sing a melody")).lessons.length, 0);
  assert.equal((await store.approve("session", { ...lesson, projectId: "project", suggestionId: "note-1" })).id, item.id);
  await store.update(item.id, { ...lesson, projectId: "project", expectedRevision: 1, enabled: false });
  assert.equal((await store.retrieve("project", "cinematic location")).lessons.length, 0);
  assert.equal(snapshot.lessons.length, 1);
  await assert.rejects(store.update(item.id, { ...lesson, projectId: "project", expectedRevision: 1 }), { status: 409 });
  await store.update(item.id, { projectId: "project", expectedRevision: 2, action: "restore", restoreRevision: 1 });
  assert.equal((await store.retrieve("project", "cinematic location")).lessons[0].revision, 3);
});

test("personal lessons apply across projects without exposing source image evidence; export includes no media", async t => {
  const { store } = await fixture(t); const item = await approve(store, { ...lesson, scope: "personal" });
  assert.equal((await store.retrieve("other", "cinematic location")).lessons.length, 1);
  const other = await store.list("other"); assert.deepEqual(other.lessons[0].evidence, []);
  const file = exportLearningSkill([item]); assert.match(file, /^---\nname:/); assert.doesNotMatch(file, /\/outputs\/|plate.png/);
  assert.equal(lessonMatches(lesson, "This is what I would like you to use for the work"), 0);
  assert.ok(lessonMatches(lesson, "Design cinematic locations") > 0);
  await store.removeSession("session", { projectId: "project" });
  assert.equal((await store.list("other")).lessons.length, 0);
});

test("moving a personal lesson to another project's scope does not move its source media evidence", async t => {
  const { store } = await fixture(t); const item = await approve(store, { ...lesson, scope: "personal" });
  await store.update(item.id, { ...lesson, projectId: "other", expectedRevision: 1, scope: "project" });
  assert.equal((await store.retrieve("project", "cinematic location")).lessons.length, 0);
  assert.equal((await store.retrieve("other", "cinematic location")).lessons.length, 1);
  assert.deepEqual((await store.list("other")).lessons[0].evidence, []);
});

test("all explicit notes remain reviewable without a paid analysis", async t => {
  const { store } = await fixture(t);
  await store.append("session", { projectId: "project", events: Array.from({ length: 10 }, (_, i) => note(`note-${i}`)) });
  const result = await store.finish("session", { projectId: "project" });
  assert.equal(result.suggestions.length, 10);
});

test("analysis is explicit, bounded, evidence-linked and never resubmitted after restart or duplicate clicks", async t => {
  let calls = 0, release;
  const { store, directory } = await fixture(t, async () => { calls++; await new Promise(resolve => { release = resolve; }); return summary; });
  await store.append("session", { projectId: "project", events: [note()] }); await store.finish("session", { projectId: "project" });
  await assert.rejects(store.analyze("session", { projectId: "project" }), /Confirm/);
  await assert.rejects(store.analyze("session", { projectId: "project", consent: true, localOnly: true }), /Local actions only/);
  const first = store.analyze("session", { projectId: "project", consent: true });
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(store.analyze("session", { projectId: "project", consent: true }), { status: 409 });
  const recovered = new NewtLearningStore({ directory, summarize: () => { throw new Error("MUST NOT RUN"); } });
  assert.equal((await recovered.session("session", "project")).analysis.status, "interrupted");
  await assert.rejects(recovered.analyze("session", { projectId: "project", consent: true }), { status: 409 });
  release(); await first; assert.equal(calls, 1);
  assert.equal((await store.session("session", "project")).analysis.status, "complete");
  assert.equal((await store.retrieve("project", "cinematic")).lessons.length, 0);
});

test("malformed paid analysis remains unapproved and is not retried; manual review still works", async t => {
  const { store } = await fixture(t, async () => ({ summary: "Bad", lessons: [{ ...summary.lessons[0], evidenceIds: ["invented"] }] }));
  await store.append("session", { projectId: "project", events: [note()] }); await store.finish("session", { projectId: "project" });
  await assert.rejects(store.analyze("session", { projectId: "project", consent: true }), /evidence/);
  assert.equal((await store.session("session", "project")).analysis.status, "failed");
  await store.note("session", { projectId: "project", id: "takeaway", detail: "I prefer a wider lens for location plates." });
  assert.equal((await store.session("session", "project")).suggestions.length, 2);
  await store.dismiss("session", { projectId: "project", suggestionId: "takeaway" });
  await assert.rejects(store.approve("session", { ...lesson, projectId: "project", suggestionId: "takeaway" }), /Choose/);
});

test("summary sends bounded text only, no image URLs or tools; paid failures still enter History with unknown cost", async () => {
  const history = [], requests = [];
  const summarize = createNewtLearningSummarizer({ getConnection: () => ({ provider: "fal", key: "mock" }),
    invoke: async body => { requests.push(body); return { status: "completed", output_text: JSON.stringify(summary), usage: { cost: 0.002 } }; }, recordHistory: item => history.push(item) });
  const session = { projectId: "project", events: [note(), ...Array.from({ length: 590 }, (_, index) => ({ ...note(`event-${index}`), kind: "edited", detail: "x".repeat(1200) }))] };
  await summarize(session); assert.equal(requests.length, 1); assert.equal(requests[0].tools, undefined);
  assert.doesNotMatch(JSON.stringify(requests), /plate.png|input_image/); assert.equal(requests[0].store, false);
  assert.ok(Buffer.byteLength(JSON.stringify(learningAnalysisEvidence(session))) < 31000);
  assert.equal(history[0].cost.amountUsd, .002);
  const broken = createNewtLearningSummarizer({ getConnection: () => ({ provider: "fal", key: "mock" }), invoke: async () => { throw new Error("offline"); }, recordHistory: item => history.push(item) });
  await assert.rejects(broken(session), /Analysis did not complete/); assert.equal(history[1].cost.amountUsd, null); assert.equal(history[1].status, "failed");
  assert.throws(() => validateLearningSummary({ ...summary, code: "injected" }, [note()]), /evidence/);
});

test("learning schema stays compatible across OpenAI, Fal and Atlas while local evidence validation stays strict", async () => {
  for (const provider of ["openai", "fal", "atlas"]) {
    let calls = 0;
    const summarize = createNewtLearningSummarizer({ getConnection: () => ({ provider, key: "mock" }), recordHistory: async () => {},
      invoke: async body => {
        calls++;
        const sent = llmResponseBody(provider, body), format = sent.text.format;
        assert.equal(format.strict, true);
        assert.equal(format.name, "newt_session_lessons");
        assert.equal(JSON.stringify(format.schema).includes('"uniqueItems"'), false, "the provider rejects this local-only keyword");
        assert.equal(format.schema.additionalProperties, false);
        assert.deepEqual(format.schema.required, ["summary", "lessons"]);
        assert.equal(format.schema.properties.lessons.items.additionalProperties, false);
        assert.equal(format.schema.properties.lessons.items.properties.evidenceIds.minItems, 1);
        return { status: "completed", output_text: JSON.stringify(summary) };
      } });
    assert.deepEqual(await summarize({ projectId: "project", events: [note()] }), summary);
    assert.equal(calls, 1);
  }
  const duplicate = { ...summary, lessons: [{ ...summary.lessons[0], evidenceIds: ["note-1", "note-1"] }] };
  assert.throws(() => validateLearningSummary(duplicate, [note()]), /evidence/);
  assert.throws(() => validateLearningSummary({ ...summary, lessons: [{ ...summary.lessons[0], evidenceIds: ["invented"] }] }, [note()]), /evidence/);
});

test("provider schema rejection is safely classified and preserved in History without a paid repair call", async () => {
  const providerError = { message: "Provider returned error", code: 400, metadata: { provider_error_code: "invalid_json_schema", raw: "secret provider detail" } };
  for (const envelope of ["body", "data", "response", "returned", "direct"]) {
    const history = []; let calls = 0;
    const summarize = createNewtLearningSummarizer({ getConnection: () => ({ provider: "fal", key: "mock" }), recordHistory: async item => history.push(item),
      invoke: async () => {
        calls++;
        if (envelope === "returned") return { error: providerError };
        if (envelope === "direct") throw new Error("OpenAI LLM request failed (HTTP 400). Invalid schema for response_format 'newt_session_lessons': 'uniqueItems' is not permitted.");
        throw Object.assign(new Error("Provider returned error"), envelope === "response" ? { response: { data: { error: providerError } } } : { [envelope]: { error: providerError } });
      } });
    await assert.rejects(summarize({ projectId: "project", events: [note()] }), { code: "invalid_schema" });
    assert.equal(calls, 1); assert.equal(history.length, 1);
    assert.equal(history[0].errorCode, "invalid_schema"); assert.equal(history[0].cost.amountUsd, null);
    assert.match(history[0].error, /request format/); assert.doesNotMatch(history[0].error, /secret provider detail/);
  }
  assert.equal(learningAnalysisFailure(new Error("connection lost")).code, "analysis_failed");
  assert.equal(learningAnalysisFailure({ output_text: "invalid_json_schema" }).code, "analysis_failed", "model output cannot enable retries");
});

test("format-rejection retries require new consent and the exact failed attempt, preserving recordings and approvals", async t => {
  let calls = 0;
  const { store, directory } = await fixture(t, async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error("Rejected format"), { code: "invalid_schema" });
    return structuredClone(summary);
  });
  const approved = await approve(store);
  const body = { projectId: "project", consent: true };
  await assert.rejects(store.analyze("session", body), /Rejected format/);
  const failed = await store.session("session", "project"), token = learningAnalysisRetryToken(failed.analysis);
  assert.ok(token); assert.equal(calls, 1);
  const recovered = new NewtLearningStore({ directory, summarize: store.summarize });
  assert.equal(learningAnalysisRetryToken((await recovered.session("session", "project")).analysis), token);
  await assert.rejects(recovered.analyze("session", { projectId: "project", retryToken: token }), /Confirm/);
  await assert.rejects(recovered.analyze("session", { ...body, retryToken: token, localOnly: true }), /Local actions only/);
  await assert.rejects(recovered.analyze("session", { ...body, retryToken: "forged" }), { status: 409 });
  await assert.rejects(recovered.analyze("session", body), { status: 409 });
  assert.equal(calls, 1);
  await assert.rejects(recovered.analyze("session", { ...body, retryToken: token }), /Rejected format/);
  const retry = await recovered.session("session", "project");
  assert.notEqual(learningAnalysisRetryToken(retry.analysis), token);
  assert.deepEqual(retry.analysis.previousAttempts, [failed.analysis]);
  await assert.rejects(recovered.analyze("session", { ...body, retryToken: token }), { status: 409 });
  const result = await recovered.analyze("session", { ...body, retryToken: learningAnalysisRetryToken(retry.analysis) });
  assert.equal(calls, 3); assert.equal(result.analysis.status, "complete"); assert.equal(result.analysis.previousAttempts.length, 2);
  assert.deepEqual(result.events, failed.events); assert.equal(result.suggestions.length, 2);
  assert.equal((await recovered.list("project")).lessons[0].id, approved.id);
  await assert.rejects(recovered.analyze("session", { ...body, retryToken: result.analysis.attemptId }), { status: 409 });
});

test("unknown failures and interrupted or successful receipts can never enable a retry", async t => {
  let calls = 0;
  const { store } = await fixture(t, async () => { calls++; throw new Error("timeout"); });
  await store.append("session", { projectId: "project", events: [note()] }); await store.finish("session", { projectId: "project" });
  await assert.rejects(store.analyze("session", { projectId: "project", consent: true }), /timeout/);
  const failed = await store.session("session", "project");
  assert.equal(learningAnalysisRetryToken(failed.analysis), "");
  await assert.rejects(store.analyze("session", { projectId: "project", consent: true, retryToken: failed.analysis.attemptId }), { status: 409 });
  assert.equal(calls, 1);
  for (const status of ["running", "interrupted", "complete"]) assert.equal(learningAnalysisRetryToken({ status, code: "invalid_schema", attemptId: "id" }), "");
  assert.equal(learningAnalysisRetryToken({ status: "failed", code: "invalid_schema", startedAt: "legacy" }), "legacy");
});

test("corrupt learning files are never silently replaced", async t => {
  const { store, directory } = await fixture(t); await approve(store);
  const file = path.join(directory, "lessons.json"); await writeFile(file, "broken");
  await assert.rejects(store.list("project"), { status: 503 });
  await assert.rejects(store.approve("session", { ...lesson, projectId: "project", suggestionId: "note-1" }), { status: 503 });
  assert.equal(await readFile(file, "utf8"), "broken");
});

test("learning routes reject foreign origins, remote callers and unmarked requests", async t => {
  const { directory } = await fixture(t), app = express(); app.use(express.json());
  registerNewtLearningRoutes(app, { directory, localOrigins: ["http://127.0.0.1:5176"] });
  const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/my-newt/learning?projectId=project`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url, { headers: { origin: "https://foreign.example", "x-newt-local": "1" } })).status, 403);
  const result = await fetch(url, { headers: { origin: "http://127.0.0.1:5176", "x-newt-local": "1" } }); assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("learning client gates old backends and never replays a paid POST after an uncertain response", async t => {
  const original = globalThis.fetch, calls = []; let available = false, fixed = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/api/health")) return new Response(JSON.stringify({ routes: { myNewtLearning: available, myNewtLearningAnalysis: fixed } }));
    throw new Error("connection lost");
  };
  await assert.rejects(newtLearningApi("analyze", { projectId: "project", consent: true }, "session"), /Restart/);
  assert.equal(calls.length, 1); available = true;
  await assert.rejects(newtLearningApi("analyze", { projectId: "project", consent: true }, "session"), /analysis fix/);
  assert.equal(calls.filter(item => item.options?.method === "POST").length, 0); fixed = true;
  await assert.rejects(newtLearningApi("analyze", { projectId: "project", consent: true }, "session"), /may have been billed/);
  const posts = calls.filter(item => item.options?.method === "POST");
  assert.equal(posts.length, 1); assert.equal(posts[0].options.headers["X-Newt-Local"], "1");
});

test("Newt snapshots only approved relevant lessons for new AI tasks and preserves them across restart", async t => {
  const { store, directory } = await fixture(t); await approve(store);
  const requests = [], taskDirectory = path.join(directory, "tasks");
  const service = new MyNewtService({ directory: taskDirectory, learningStore: store, getKey: () => "mock", invoke: async body => {
    requests.push(body); return { status: "completed", usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: "function_call", call_id: "ask", name: "project_action", arguments: JSON.stringify({ operation: "ask", payload: JSON.stringify({ message: "Mock question" }), reason: "mock" }) }] };
  } });
  const snapshot = myNewtSnapshot({ projectId: "project", nodes: [{ id: "newt", type: "myNewt", data: {} }] });
  const result = await service.start({ projectId: "project", nodeId: "newt", snapshot, brief: "Design cinematic location composition", settings: { budget: 10 } });
  for (let n = 0; service.loops.size && n < 600; n++) await new Promise(resolve => setTimeout(resolve, 3));
  assert.equal(requests.length, 1); assert.match(JSON.stringify(requests[0].input), /Reviewed creative lessons/);
  assert.equal(service.public(service.jobs.get(result.id)).lessons.length, 1);
  await store.removeSession("session", { projectId: "project" });
  const recovered = new MyNewtService({ directory: taskDirectory, learningStore: store, getKey: () => "mock" }); await recovered.ready;
  assert.equal(recovered.jobs.get(result.id).learnedContext.lessons.length, 1);
  assert.equal((await store.retrieve("project", "cinematic location")).lessons.length, 0);
});
