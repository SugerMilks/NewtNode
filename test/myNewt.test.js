import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtService, myNewtRequestEstimate } from "../server/my-newt.js";
import { keepSingleMyNewt, myNewtInputSignature, myNewtSettings, myNewtSnapshot, snapshotAssetUrls, validateMyNewtPatch } from "../src/myNewt/contract.js";
import { withMyNewtRequestScope, scopedMyNewtRequest } from "../src/myNewt/requestScope.js";
import { estimateImageRunCost, formatRunCost } from "../src/generationPricing.js";
import { remapImportedGraph } from "../src/workflowState.js";
import { myNewtIntelligenceLevels } from "../src/myNewt/intelligence.js";

const owner = { projectId: "project-test", nodeId: "my-newt-test" };
const snapshot = { ...owner, projectName: "Test", nodes: [{ id: owner.nodeId, type: "myNewt", data: {} }, { id: "image-1", type: "imageModel", data: { model: "Nano Banana 2", prompt: "A test" } }], edges: [], catalog: [] };
const call = (operation, payload) => ({ status: "completed", usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: "function_call", call_id: `call-${Math.random()}`, name: "project_action", arguments: JSON.stringify({ operation, payload: JSON.stringify(payload), reason: "Test action" }) }] });

async function service(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-agent-test-"));
  const invoke = options.invoke || (async () => call("ask", { message: "Ready for review" }));
  const instance = new MyNewtService({ directory, getKey: () => "test-key", relay: async () => ({ status: 200, data: { image: { localUrl: "/outputs/test.png" }, cost: { amountUsd: 0.1 } } }), ...options, invoke: async (body, key) => {
    const context = JSON.parse(body.input.findLast((item) => item.content?.startsWith?.("Current project data"))?.content.split("\n").slice(1).join("\n"));
    if (!context.plan) return call("plan", { summary: "Test workflow", steps: [{ id: "test", title: "Test action" }], deliverables: [{ kind: "workflow", label: "Current graph", count: 1 }] });
    return invoke(body, key);
  } });
  const start = instance.start.bind(instance);
  t.after(async () => { await settle(instance); await Promise.all([...instance.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  instance.start = (body) => start({ ...body, settings: { approvePlan: false, ...body.settings } });
  await instance.ready; return instance;
}
async function settle(instance) {
  for (let i = 0; i < 300; i++) {
    if (!instance.loops.size) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Agent loop did not settle");
}

test("one My Newt survives normalization and imported jobs are detached", () => {
  const graph = keepSingleMyNewt({ nodes: [{ id: "a", type: "myNewt", data: { jobId: "old" } }, { id: "b", type: "myNewt" }, { id: "c", type: "image" }], edges: [{ from: { nodeId: "c" }, to: { nodeId: "b" } }], groups: [{ nodeIds: ["a", "b", "c"] }] });
  assert.deepEqual(graph.nodes.map((n) => n.id), ["a", "c"]);
  assert.equal(graph.edges.length, 0);
  assert.deepEqual(graph.groups[0].nodeIds, ["a", "c"]);
  assert.equal(remapImportedGraph(graph).nodes[0].data.jobId, "");
});

test("creative edits cannot change locks, outputs, keys, or protected nodes", () => {
  const node = { id: "one", type: "imageModel", data: {} };
  assert.throws(() => validateMyNewtPatch(node, { prompt: "test" }, myNewtSettings()), /existing/);
  for (const field of ["resultUrl", "locked", "apiKey", "__proto__", "status"]) {
    assert.throws(() => validateMyNewtPatch(node, JSON.parse(`{"${field}":"bad"}`), { allowExisting: true }), /not an editable/);
  }
  assert.deepEqual(validateMyNewtPatch(node, { prompt: "test" }, {}, ["one"]), { prompt: "test" });
  assert.throws(() => validateMyNewtPatch({ ...node, data: { locked: true } }, { prompt: "test" }, { allowExisting: true }), /locked/);
});

test("snapshot includes full-resolution managed assets, excludes credentials and thumbnails", () => {
  const state = myNewtSnapshot({ nodes: [{ id: "i", type: "image", data: { title: "Image", apiKey: "secret", resultUrl: "/outputs/full.png", thumbnailUrl: "/outputs/small.webp", resultItems: [{ url: "/outputs/other.png", secret: "hidden", filePath: "/Users/private" }] } }] });
  assert.deepEqual([...snapshotAssetUrls(state)], ["/outputs/full.png", "/outputs/other.png"]);
  assert.doesNotMatch(JSON.stringify(state), /secret|hidden|private|small.webp/);
});

test("unknown costs are not zero and unsupported requests cannot be relayed", () => {
  assert.equal(estimateImageRunCost({ model: "unknown" }), null);
  assert.equal(formatRunCost(null), "");
  assert.throws(() => myNewtRequestEstimate("/api/settings", {}), /cannot automatically/);
  assert.throws(() => myNewtRequestEstimate("/api/node/generate-video", { duration: "Auto" }), /explicit/);
});

test("planned generations detect changes anywhere in their connected reference chain", () => {
  const first = { nodes: [{ id: "image", data: { resultUrl: "/outputs/a.png" } }, { id: "director", data: {} }, { id: "video", data: {} }], edges: [{ from: { nodeId: "image", port: "imageOut" }, to: { nodeId: "director", port: "imageIn" } }, { from: { nodeId: "director", port: "directorOut" }, to: { nodeId: "video", port: "directorIn" } }] };
  const changed = structuredClone(first); changed.nodes[0].data.resultUrl = "/outputs/b.png";
  assert.notEqual(myNewtInputSignature(first, "video"), myNewtInputSignature(changed, "video"));
  changed.edges.push({ from: { nodeId: "video" }, to: { nodeId: "image" } });
  assert.doesNotThrow(() => myNewtInputSignature(changed, "video"));
});

test("request scopes are node-local and removed even after failure", async () => {
  const options = { body: JSON.stringify({ nodeId: "a" }) };
  const hits = [];
  await assert.rejects(withMyNewtRequestScope("a", async (...args) => { hits.push(args); return 7; }, async () => {
    assert.equal(await scopedMyNewtRequest("/api/node/generate-image", options), 7);
    assert.equal(scopedMyNewtRequest("/api/node/generate-image", { body: JSON.stringify({ nodeId: "b" }) }), null);
    assert.equal(scopedMyNewtRequest("/api/settings", options), null);
    throw new Error("test");
  }), /test/);
  assert.equal(hits[0][2], 1);
  assert.equal(scopedMyNewtRequest("/api/node/generate-image", options), null);
});

test("agent uses Astra Responses tool calls and asks before a paid run", async (t) => {
  let request;
  const instance = await service(t, { invoke: async (body) => { request = body; return call("run", { nodeId: "image-1" }); } });
  const job = await instance.start({ ...owner, brief: "Make an image", settings: { allowImages: true }, snapshot });
  await settle(instance);
  assert.equal(request.model, "gpt-6-astra"); assert.equal(request.store, false);
  assert.equal(request.reasoning.effort, "high");
  const state = instance.public(instance.jobs.get(job.id));
  assert.equal(state.status, "approval");
  assert.equal(await instance.claim(job.id, { ...owner, actionId: state.pending.id, clientId: "c" }), null);
  await instance.control(job.id, { ...owner, action: "approve" });
  await settle(instance);
  const action = await instance.claim(job.id, { ...owner, actionId: state.pending.id, clientId: "c" });
  assert.equal(action.payload.nodeId, "image-1");
  assert.equal(await instance.claim(job.id, { ...owner, actionId: state.pending.id, clientId: "another-tab" }), null);
});

test("paid requests are persisted once, cached on replay, and blocked while paused", async (t) => {
  let submits = 0;
  const instance = await service(t, { invoke: async () => call("run", { nodeId: "image-1" }), relay: async () => { submits++; return { status: 200, data: { cost: { amountUsd: 0.1 } } }; } });
  const job = await instance.start({ ...owner, brief: "test", settings: { allowImages: true, approveRuns: false }, snapshot });
  await settle(instance);
  const actionId = instance.jobs.get(job.id).pending.id;
  await instance.claim(job.id, { ...owner, actionId, clientId: "c" });
  const body = { nodeId: "image-1", model: "Nano Banana 2", resolution: "1K" };
  const args = { ...owner, actionId, clientId: "c", sequence: 1, route: "/api/node/generate-image", body };
  const first = await instance.request(job.id, args);
  assert.deepEqual(await instance.request(job.id, args), first); assert.equal(submits, 1);
  await assert.rejects(instance.request(job.id, { ...args, body: { ...body, prompt: "different" } }), /changed/);
  await instance.control(job.id, { ...owner, action: "pause" }); await settle(instance);
  await assert.rejects(instance.request(job.id, { ...args, sequence: 2 }), /paused/);
  assert.equal(submits, 1);
  await assert.rejects(instance.sync(job.id, { ...owner, projectId: "another", snapshot }), /different project/);
});

test("restart pauses the task and does not repeat an interrupted action", async (t) => {
  const instance = await service(t, { invoke: async () => call("create", { type: "plainText", patch: { text: "Hello" } }) });
  const job = await instance.start({ ...owner, brief: "test", snapshot }); await settle(instance);
  const actionId = instance.jobs.get(job.id).pending.id;
  await instance.claim(job.id, { ...owner, actionId, clientId: "lost-browser" });
  const restored = new MyNewtService({ directory: instance.directory, getKey: () => "key", invoke: async () => call("ask", { message: "Review the interrupted step" }) });
  await restored.ready;
  assert.equal(restored.jobs.get(job.id).status, "paused");
  assert.equal(restored.jobs.get(job.id).pending.interrupted, true);
  await restored.control(job.id, { ...owner, action: "resume" }); await settle(restored);
  assert.equal(restored.jobs.get(job.id).pending, null);
  assert.equal(restored.jobs.get(job.id).status, "waiting");
});

test("budget blocks reasoning before contacting the model", async (t) => {
  let calls = 0;
  const instance = await service(t, { invoke: async () => { calls++; return call("finish", {}); } });
  const job = await instance.start({ ...owner, brief: "test", settings: { budget: 0.25 }, snapshot }); await settle(instance);
  assert.equal(calls, 0); assert.equal(instance.jobs.get(job.id).status, "paused");
  assert.match(instance.jobs.get(job.id).message, /budget/);
});

test("notes invalidate an unclaimed run and completed jobs ignore cleanup pauses", async (t) => {
  let calls = 0;
  const instance = await service(t, { invoke: async () => ++calls === 1 ? call("run", { nodeId: "image-1" }) : call("finish", { message: "Changed direction without generating" }) });
  const job = await instance.start({ ...owner, brief: "test", snapshot }); await settle(instance);
  assert.equal(instance.jobs.get(job.id).status, "approval");
  await instance.control(job.id, { ...owner, action: "note", note: "Do not generate after all" }); await settle(instance);
  assert.equal(instance.jobs.get(job.id).status, "complete");
  await instance.control(job.id, { ...owner, action: "pause" }); await settle(instance);
  assert.equal(instance.jobs.get(job.id).status, "complete");
  assert.equal(Object.keys(instance.jobs.get(job.id).receipts).length, 0);
});

test("removing and recreating My Newt stops the orphan task", async (t) => {
  const instance = await service(t);
  const first = await instance.start({ ...owner, brief: "test", snapshot }); await settle(instance);
  const nextOwner = { ...owner, nodeId: "new-agent" };
  const second = await instance.start({ ...nextOwner, brief: "fresh task", snapshot: { ...snapshot, nodes: [{ id: "new-agent", type: "myNewt", data: {} }] } }); await settle(instance);
  assert.notEqual(first.id, second.id);
  assert.equal(instance.jobs.get(first.id).status, "stopped");
  assert.equal(second.nodeId, "new-agent");
});

test("uncertain paid submissions pause instead of retrying", async (t) => {
  let submits = 0;
  const instance = await service(t, { invoke: async () => call("run", { nodeId: "image-1" }), relay: async () => { submits++; throw new Error("Connection lost"); } });
  const job = await instance.start({ ...owner, brief: "test", settings: { allowImages: true, approveRuns: false }, snapshot }); await settle(instance);
  const actionId = instance.jobs.get(job.id).pending.id;
  await instance.claim(job.id, { ...owner, actionId, clientId: "c" });
  const args = { ...owner, actionId, clientId: "c", sequence: 1, route: "/api/node/generate-image", body: { nodeId: "image-1", model: "Nano Banana 2" } };
  await assert.rejects(instance.request(job.id, args), /Connection lost/);
  assert.equal(instance.jobs.get(job.id).status, "paused");
  assert.deepEqual(instance.jobs.get(job.id).uncertainNodes, ["image-1"]);
  await assert.rejects(instance.request(job.id, args), /already started/);
  assert.equal(submits, 1);
});

test("intelligence defaults preserve Astra high and map each slider level to its reasoning allowance", async (t) => {
  assert.equal(myNewtSettings().budget, 5);
  assert.equal(myNewtSettings().intelligence, "high");
  assert.equal(myNewtSettings({ intelligence: "invalid" }).intelligence, "high");
  for (const level of myNewtIntelligenceLevels) {
    let request, recorded;
    const instance = await service(t, { invoke: async (body) => { request = body; return call("finish", { message: "Finished" }); }, recordUsage: async (value) => { recorded = value; } });
    const job = await instance.start({ ...owner, brief: "test", settings: { intelligence: level.value }, snapshot });
    await settle(instance);
    assert.equal(request.model, "gpt-6-astra");
    assert.equal(request.reasoning.effort, level.value);
    assert.equal(request.max_output_tokens, level.maxOutputTokens);
    assert.deepEqual(recorded.intelligence, level);
    assert.equal(instance.jobs.get(job.id).snapshot.nodes[1].data.model, "Nano Banana 2");
  }
});

test("lower reasoning allowance can fit a small budget without bypassing the budget guard", async (t) => {
  let calls = 0;
  const instance = await service(t, { invoke: async () => { calls++; return call("finish", {}); } });
  const low = await instance.start({ ...owner, brief: "test", settings: { budget: 0.4, intelligence: "low" }, snapshot });
  await settle(instance);
  assert.equal(calls, 1); assert.equal(instance.jobs.get(low.id).status, "complete");
  const high = await instance.start({ ...owner, brief: "test", settings: { budget: 0.4, intelligence: "high" }, snapshot });
  await settle(instance);
  assert.equal(calls, 1); assert.equal(instance.jobs.get(high.id).status, "paused");
});

test("changing intelligence while paused is applied on the next planning request", async (t) => {
  const efforts = [];
  const instance = await service(t, { invoke: async (body) => { efforts.push(body.reasoning.effort); return call("ask", { message: "Review" }); } });
  const job = await instance.start({ ...owner, brief: "test", snapshot }); await settle(instance);
  await instance.control(job.id, { ...owner, action: "settings", settings: { intelligence: "medium" } }); await settle(instance);
  await instance.control(job.id, { ...owner, action: "resume" }); await settle(instance);
  assert.deepEqual(efforts, ["high", "medium"]);
});

test("Character and Mood Board inputs retain active generated, CU, and custom full-resolution sources", () => {
  const state = myNewtSnapshot({ nodes: [
    { id: "character", type: "character", data: { characterSheetVariants: [{ wardrobeId: "wardrobe", generated: { localUrl: "/outputs/sheet.png", thumbnailUrl: "/outputs/tiny.webp" }, videoGenerated: { localUrl: "/outputs/cu.png" } }], activeCharacterSheetId: "custom:custom-1", activeWardrobeId: "wardrobe", cuVideoGeneration: true, characterCustomSheets: [{ id: "custom-1", localUrl: "/uploads/custom.png" }] } },
    { id: "mood", type: "transfer", data: { transferImages: [{ url: "/outputs/look.png" }], resultUrl: "/outputs/mood.png" } }
  ], edges: [
    { from: { nodeId: "character", port: "characterOut" }, to: { nodeId: "newt", port: "characterIn" } },
    { from: { nodeId: "mood", port: "transferOut" }, to: { nodeId: "newt", port: "transferIn" } }
  ] });
  assert.equal(state.nodes[0].data.activeCharacterSheetId, "custom:custom-1");
  assert.equal(state.nodes[0].data.activeWardrobeId, "wardrobe");
  assert.equal(state.nodes[0].data.cuVideoGeneration, true);
  assert.deepEqual([...snapshotAssetUrls(state)].sort(), ["/outputs/cu.png", "/outputs/look.png", "/outputs/mood.png", "/outputs/sheet.png", "/uploads/custom.png"]);
  assert.equal(state.edges[0].to.port, "characterIn");
  assert.equal(state.edges[1].to.port, "transferIn");
});
