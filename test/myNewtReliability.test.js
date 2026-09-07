import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtService } from "../server/my-newt.js";
import { reservedTotal } from "../server/my-newt-budget.js";
import { myNewtSnapshot, validateMyNewtPatch, myNewtRunStages } from "../src/myNewt/contract.js";
import { myNewtGraphContext, myNewtReadDetails, myNewtConversation } from "../src/myNewt/context.js";
import { myNewtReasoningProfile, myNewtTokenCost, myNewtReasoningAllowance } from "../src/myNewt/intelligence.js";
import { normalizeMyNewtPlan, verifyMyNewtPlan } from "../src/myNewt/plan.js";
import { myNewtCheckpoint, restoreMyNewtCheckpoint } from "../src/myNewt/recovery.js";
import { buildNewtPresetGraph, bindNewtPresetInputs, instantiateNewtPreset } from "../src/myNewt/presets.js";

const owner = { projectId: "review-project", nodeId: "newt" };
const graph = { nodes: [{ id: "newt", type: "myNewt", data: {} }, { id: "image", type: "imageModel", data: { title: "Image", model: "Nano Banana 2", prompt: "Original", status: "ready" } }], edges: [], groups: [] };
const snapshot = () => myNewtSnapshot({ ...structuredClone(graph), ...owner });
const response = (operation, payload) => ({ usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: "function_call", name: "project_action", call_id: Math.random().toString(), arguments: JSON.stringify({ operation, payload: JSON.stringify(payload), reason: operation }) }] });
const plan = { summary: "Review workflow", steps: [{ id: "main", title: "Complete the brief" }], deliverables: [{ kind: "workflow", nodeId: "image", label: "Image workflow", count: 1 }], runs: [] };
const context = (body) => JSON.parse(body.input.findLast((item) => item.content?.startsWith?.("Current project data"))?.content.split("\n").slice(1).join("\n"));
const wait = async (service) => {
  for (let i = 0; i < 400; i++) { if (!service.loops.size) return; await new Promise((resolve) => setTimeout(resolve, 2)); }
  throw new Error("Loop did not settle");
};
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-reliability-"));
  const invoke = options.invoke || (async () => response("ask", { message: "Review" }));
  const service = new MyNewtService({ directory, getKey: () => "mock", relay: async () => ({ status: 200, data: { cost: { amountUsd: 0.004 } } }), ...options,
    invoke: async (body, key) => context(body).plan ? invoke(body, key) : response("plan", options.plan || plan) });
  await service.ready;
  t.after(async () => { await wait(service); await Promise.all([...service.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  const start = async (settings = {}, extra = {}) => {
    const job = await service.start({ ...owner, brief: "Review the workflow", settings: { approvePlan: false, allowImages: true, ...settings }, snapshot: snapshot(), ...extra });
    await wait(service); return service.jobs.get(job.id);
  };
  return { service, start };
}

test("approval with a new note discards the old paid action instead of approving it", async (t) => {
  let calls = 0;
  const { service, start } = await fixture(t, { invoke: async () => ++calls === 1 ? response("run", { nodeId: "image" }) : response("ask", { message: "Updated direction" }) });
  const job = await start(); const actionId = job.pending.id;
  await service.control(job.id, { ...owner, action: "approve", note: "Do not generate. Only change the prompt." });
  await wait(service);
  assert.equal(await service.claim(job.id, { ...owner, actionId, clientId: "test" }), null);
  assert.equal(job.pending, null); assert.deepEqual(job.receipts, {});
  assert.match(job.notes[0], /Do not generate/);
});

test("edits made during reasoning cannot be stamped onto the old action or claimed", async (t) => {
  let finish, entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  let calls = 0;
  const { service } = await fixture(t, { invoke: async () => {
    if (++calls > 1) return response("ask", { message: "Reconsider changes" });
    entered(); return new Promise((resolve) => { finish = resolve; });
  } });
  const started = await service.start({ ...owner, brief: "Edit prompt", settings: { approvePlan: false }, snapshot: snapshot() });
  await enteredPromise;
  const changed = snapshot(); changed.nodes[1].data.prompt = "New user direction";
  await service.sync(started.id, { ...owner, snapshot: changed });
  finish(response("update", { nodeId: "image", patch: { prompt: "Edited old direction" } })); await wait(service);
  const job = service.jobs.get(started.id), pending = job.pending;
  assert.equal(pending.expected.nodes[1].data.prompt, "Original");
  assert.equal(await service.claim(job.id, { ...owner, actionId: pending.id, clientId: "test" }), null);
  await wait(service);
  assert.equal(job.snapshot.nodes[1].data.prompt, "New user direction");
});

test("a claimed batch stops submitting further paid requests when new direction arrives", async (t) => {
  let submissions = 0;
  const { service, start } = await fixture(t, { invoke: async () => response("run", { nodeId: "image" }), relay: async () => { submissions++; return { status: 200, data: { cost: { amountUsd: 0.1 } } }; } });
  const job = await start({ approveRuns: false }), actionId = job.pending.id;
  await service.claim(job.id, { ...owner, actionId, clientId: "test" });
  const request = { ...owner, actionId, clientId: "test", sequence: 1, route: "/api/node/generate-image", body: { nodeId: "image", model: "Nano Banana 2" } };
  await service.request(job.id, request);
  await service.control(job.id, { ...owner, action: "note", note: "Stop generating" }); await wait(service);
  await assert.rejects(service.request(job.id, { ...request, sequence: 2 }), /New direction/);
  assert.equal(submissions, 1);
});

test("Storyboard reported cost releases the $2 reserve, while unknown cost remains reserved", async (t) => {
  let reported = true;
  const { service, start } = await fixture(t, { invoke: async () => response("run", { nodeId: "image" }), relay: async () => ({ status: 200, data: reported ? { qc: { pass: true }, cost: { amountUsd: 0.004 } } : { qc: { pass: true } } }) });
  const job = await start({ approveRuns: false }), actionId = job.pending.id;
  await service.claim(job.id, { ...owner, actionId, clientId: "test" });
  const before = job.spent;
  const request = { ...owner, actionId, clientId: "test", sequence: 1, route: "/api/node/storyboard-qc", body: { nodeId: "image" } };
  await service.request(job.id, request);
  assert.ok(Math.abs(job.spent - before - 0.004) < 1e-9); assert.equal(reservedTotal(job), 0);
  reported = false;
  await service.request(job.id, { ...request, sequence: 2 });
  assert.equal(reservedTotal(job), 2); assert.ok(Math.abs(job.spent - before - 0.004) < 1e-9);
  assert.equal(service.public(job).reservations[`${actionId}:2`].state, "uncertain");
});

test("missing reasoning keys do not reserve or spend money", async (t) => {
  let available = true;
  const { service, start } = await fixture(t, { getKey: () => available ? "mock" : "", invoke: async () => { available = false; return response("read", {}); } });
  const job = await start();
  assert.equal(job.status, "paused"); assert.equal(reservedTotal(job), 0);
  assert.ok(job.spent < 0.02); assert.match(job.message, /key/);
});

test("complete-batch preview stops a run before its first request if the allowance is too small", async (t) => {
  const { service, start } = await fixture(t, { invoke: async () => response("run", { nodeId: "image" }) });
  const job = await start({ approveRuns: false }), actionId = job.pending.id;
  await service.prepare(job.id, { ...owner, actionId, preview: { estimatedCost: 8, count: 9 } });
  assert.equal(await service.claim(job.id, { ...owner, actionId, clientId: "test" }), null);
  assert.equal(job.status, "paused"); assert.equal(Object.keys(job.receipts).length, 0);
});

test("plan approval is distinct from paid approval and new notes require a fresh plan", async (t) => {
  const { service, start } = await fixture(t);
  const job = await start({ approvePlan: true });
  assert.equal(job.status, "plan-approval"); assert.equal(job.plan.approved, false);
  await service.control(job.id, { ...owner, action: "approve-plan", note: "Change the plan first" }); await wait(service);
  assert.equal(job.status, "plan-approval"); assert.equal(job.plan.approved, false);
  await service.control(job.id, { ...owner, action: "approve-plan" }); await wait(service);
  assert.equal(job.plan.approved, true); assert.equal(job.status, "waiting");
});

test("completion checks reject missing outputs, wrong settings, failed batches and missing references", () => {
  const p = normalizeMyNewtPlan({ ...plan, deliverables: [{ kind: "image", nodeId: "image", label: "Two frames", count: 2, settings: { resolution: "1K" }, referenceIds: ["asset"] }] }); p.approved = true;
  const state = snapshot(); state.nodes[1].data.resolution = "1K";
  state.nodes[1].data.resultItems = [{ url: "/outputs/1.png", type: "image" }, { url: "/outputs/2.png", type: "image" }];
  assert.equal(verifyMyNewtPlan(state, p).ok, false);
  state.nodes.push({ id: "asset", type: "image", data: {} }); state.edges.push({ from: { nodeId: "asset" }, to: { nodeId: "image" } });
  assert.equal(verifyMyNewtPlan(state, p).ok, true);
  assert.equal(verifyMyNewtPlan(state, p, { baselineUrls: ["/outputs/1.png"] }).ok, false);
  state.nodes[1].data.status = "error";
  assert.equal(verifyMyNewtPlan(state, p).ok, false);
});

test("the backend will not finish when an approved media deliverable is absent", async (t) => {
  const { start } = await fixture(t, { plan: { ...plan, deliverables: [{ kind: "image", label: "New image", nodeId: "image", count: 1 }] }, invoke: async () => response("finish", { message: "Done" }) });
  const job = await start(); assert.equal(job.status, "waiting"); assert.match(job.message, /Completion check/);
});

test("follow-up tasks retain created-node access, outputs context and independent budget/checkpoint", async (t) => {
  const { service, start } = await fixture(t, { invoke: async () => response("finish", { message: "Finished" }) });
  const first = await start({}, { checkpoint: myNewtCheckpoint(graph) }); first.createdIds = ["image"];
  const second = await start({}, { parentId: first.id, brief: "Make the second frame wider", checkpoint: myNewtCheckpoint(graph, "Before follow-up") });
  assert.notEqual(first.id, second.id); assert.deepEqual(second.createdIds, ["image"]); assert.deepEqual(second.newIds, []);
  assert.equal(second.parentId, first.id); assert.equal(second.checkpoint.name, "Before follow-up");
  assert.equal((await service.history(owner)).length, 2);
  const restored = await service.recover(second.id, owner);
  assert.equal(restored.job.status, "stopped"); assert.ok(restored.checkpoint.graph.nodes.length);
  await assert.rejects(service.recover(second.id, { ...owner, projectId: "wrong" }), /different project/);
});

test("unchanged and completed task polling performs no repeated journal writes", async (t) => {
  const { service, start } = await fixture(t, { invoke: async () => response("finish", { message: "Finished" }) });
  const job = await start(), file = path.join(service.directory, `${job.id}.json`);
  const before = await readFile(file, "utf8"); let saves = 0;
  const save = service.save.bind(service); service.save = async (...args) => { saves++; return save(...args); };
  await service.sync(job.id, { ...owner, snapshot: snapshot() }); await wait(service);
  await service.sync(job.id, owner); await wait(service);
  assert.equal(saves, 0); assert.equal(await readFile(file, "utf8"), before);
});

test("paused time does not consume the active task duration limit", async (t) => {
  let now = 1000;
  const { service, start } = await fixture(t, { now: () => now });
  const job = await start({ maxMinutes: 1 }); assert.equal(job.status, "waiting");
  now += 24 * 60 * 60 * 1000;
  await service.control(job.id, { ...owner, action: "resume" }); await wait(service);
  assert.equal(job.status, "waiting"); assert.doesNotMatch(job.message, /time limit/);
});

test("large snapshots retain My Newt and its last-node inputs; model context pages explicitly", () => {
  const nodes = Array.from({ length: 500 }, (_, index) => ({ id: `node-${index}`, type: "image", data: { title: `Asset ${index}`, resultUrl: `/outputs/${index}.png` } }));
  nodes.push({ id: "newt", type: "myNewt", data: {} });
  const state = myNewtSnapshot({ nodes, edges: [{ from: { nodeId: "node-499" }, to: { nodeId: "newt" } }] });
  assert.equal(state.nodes.length, 501);
  const page = myNewtGraphContext(state, { nodeId: "newt" });
  assert.equal(page.totalNodes, 501); assert.equal(page.nextOffset, 80);
  assert.ok(page.nodes.some((node) => node.id === "node-499")); assert.ok(page.nodes.some((node) => node.id === "newt"));
  assert.equal(myNewtReadDetails(state, { nodeIds: ["node-490"] })[0].data.resultUrl, "/outputs/490.png");
});

test("context compaction keeps paired tool responses and explicitly pages output arrays", () => {
  const state = snapshot(); state.nodes[1].data.resultItems = Array.from({ length: 50 }, (_, i) => ({ url: `/outputs/${i}.png` }));
  const details = myNewtReadDetails(state, { nodeIds: ["image"] })[0];
  assert.equal(details.data.resultItems.totalItems, 50);
  const page = myNewtReadDetails(state, { nodeIds: ["image"], field: "resultItems", itemOffset: 40 })[0];
  assert.equal(page.items[0].url, "/outputs/40.png"); assert.equal(page.nextOffset, 48);
  const messages = Array.from({ length: 60 }, (_, i) => [{ type: "function_call", call_id: `${i}`, arguments: "x".repeat(100) }, { type: "function_call_output", call_id: `${i}`, output: "ok" }]).flat();
  const compact = myNewtConversation(messages, { maxCharacters: 1000 });
  assert.ok(compact.length < messages.length);
  for (let i = 0; i < compact.length; i += 2) assert.equal(compact[i].call_id, compact[i + 1].call_id);
});

test("Director unlocked sections remain editable and revisions have a real runner stage", () => {
  const node = { id: "director", type: "skillDirector", data: { skillDirectorLocks: { setup: true, style: false, scene: true } } };
  assert.deepEqual(validateMyNewtPatch(node, { styleDirection: "Soft contrast" }, { allowExisting: true }), { styleDirection: "Soft contrast" });
  assert.doesNotThrow(() => validateMyNewtPatch(node, { skillDirectorRevisionNotes: "Move the camera" }, { allowExisting: true }));
  assert.throws(() => validateMyNewtPatch(node, { sceneOverview: "New" }, { allowExisting: true }), /scene.*locked/);
  assert.ok(myNewtRunStages.skillDirector.includes("revise")); assert.ok(!myNewtRunStages.skillDirector.includes("scene"));
});

test("Auto saves on routine work, preserves creative Astra, and Economy never upgrades itself", () => {
  const routine = myNewtReasoningProfile({ reasoningMode: "auto" }, { brief: "Connect the image to Preview" });
  const creative = myNewtReasoningProfile({ reasoningMode: "auto" }, { brief: "Create a cinematic storyboard with careful continuity" });
  assert.equal(routine.model, "gpt-5.6-luna"); assert.equal(creative.model, "gpt-6-astra");
  assert.equal(myNewtReasoningProfile({ reasoningMode: "economy" }, { escalated: true, brief: "Creative scene" }).model, "gpt-5.6-luna");
  assert.equal(myNewtReasoningProfile({ reasoningMode: "best" }, { brief: "Rename a node" }).model, "gpt-6-astra");
  assert.ok(myNewtReasoningAllowance(routine, 10000) < myNewtReasoningAllowance(creative, 10000) / 20);
});

test("reasoning prices use each model's actual input, cache, and output rates", () => {
  const usage = { input_tokens: 1000000, output_tokens: 1000000, input_tokens_details: { cached_tokens: 200000, cache_write_tokens: 100000 } };
  assert.ok(Math.abs(myNewtTokenCost("gpt-5.6-luna", usage) - 1.369) < 1e-9);
  assert.equal(myNewtTokenCost("gpt-6-astra", usage), 58.45);
  assert.equal(myNewtTokenCost("unknown", usage), null); assert.equal(myNewtTokenCost("gpt-6-astra", null), null);
});

test("preset bindings preserve original workflows, replace references, and clear dependent outputs", () => {
  const saved = buildNewtPresetGraph({ nodes: [
    { id: "old", type: "image", x: 0, y: 0, data: { title: "Old Park", resultUrl: "/outputs/old.png" } },
    { id: "model", type: "imageModel", x: 400, y: 0, data: { prompt: "Show @OldPark", resultUrl: "/outputs/old-result.png", resultItems: [{ url: "/outputs/old-result.png" }] } }
  ], edges: [{ from: { nodeId: "old", port: "imageOut" }, to: { nodeId: "model", port: "imagePromptIn" } }], slots: [{ nodeId: "old", role: "Location", label: "Park" }] });
  const placed = bindNewtPresetInputs(instantiateNewtPreset(saved), { old: "new" }, [{ id: "new", type: "image", data: { title: "New Park", resultUrl: "/outputs/new.png" } }]);
  assert.equal(placed.nodes.length, 1); assert.equal(placed.nodes[0].data.prompt, "Show @NewPark");
  assert.equal(placed.nodes[0].data.resultUrl, ""); assert.equal(placed.edges[0].from.nodeId, "new");
  assert.equal(saved.nodes[1].data.resultUrl, "/outputs/old-result.png");
  assert.throws(() => bindNewtPresetInputs(instantiateNewtPreset(saved), { old: "new" }, [{ id: "new", type: "video", data: {} }]), /matching/);
});

test("checkpoint restoration retains the current agent, clears interrupted work and restores the graph", () => {
  const original = structuredClone(graph); original.nodes[1].data.apiKey = "secret";
  const checkpoint = myNewtCheckpoint(original);
  const current = structuredClone(original); current.nodes[1].data.prompt = "Changed"; current.nodes.push({ id: "new-image", type: "image", data: { resultUrl: "/outputs/new.png" } });
  current.nodes[0].data.jobId = "current-job";
  const restored = restoreMyNewtCheckpoint(checkpoint, current);
  assert.equal(restored.nodes.find((node) => node.id === "image").data.prompt, "Original");
  assert.equal(restored.nodes.find((node) => node.id === "newt").data.jobId, "current-job");
  assert.doesNotMatch(JSON.stringify(checkpoint), /secret|apiKey/);
  assert.ok(!restored.nodes.some((node) => node.id === "new-image"));
});

test("settings sent with approval invalidate the old action as well", async (t) => {
  let calls = 0;
  const { service, start } = await fixture(t, { invoke: async () => ++calls === 1 ? response("run", { nodeId: "image" }) : response("ask", { message: "Review new settings" }) });
  const job = await start(), actionId = job.pending.id;
  await service.control(job.id, { ...owner, action: "approve", settings: { ...job.settings, allowImages: false } });
  await wait(service);
  assert.equal(await service.claim(job.id, { ...owner, actionId, clientId: "test" }), null);
  assert.equal(job.settings.allowImages, false);
  assert.deepEqual(job.receipts, {});
});

test("malformed payloads produce a tool error without an editor mutation", async (t) => {
  let calls = 0;
  const { service, start } = await fixture(t, { invoke: async () => ++calls === 1 ? response("update", null) : response("ask", { message: "Review" }) });
  const job = await start();
  assert.equal(job.pending, null);
  assert.ok(job.messages.some((item) => item.output?.includes("Invalid JSON")));
  assert.equal(job.snapshot.nodes[1].data.prompt, "Original");
});

test("built Director edits go through revisions rather than leaving the final prompt stale", () => {
  const node = { id: "d", type: "skillDirector", data: { skillDirectorBuilt: true, skillDirectorLocks: {} } };
  assert.throws(() => validateMyNewtPatch(node, { sceneOverview: "New scene" }, { allowExisting: true }), /revision/);
  assert.deepEqual(validateMyNewtPatch(node, { skillDirectorRevisionNotes: "New scene" }, { allowExisting: true }), { skillDirectorRevisionNotes: "New scene" });
});

test("preset tag swaps do not cascade or rewrite managed asset URLs", () => {
  const saved = { nodes: [
    { id: "a", type: "image", data: { title: "A" } },
    { id: "b", type: "image", data: { title: "B" } },
    { id: "prompt", type: "plainText", data: { text: "@A with @b, not @AB", sourceUrl: "/outputs/@A.png" } }
  ], edges: [], groups: [], slots: [{ nodeId: "a", type: "image", role: "Prop", label: "A" }, { nodeId: "b", type: "image", role: "Prop", label: "B" }] };
  const available = [{ id: "new-b", type: "image", data: { title: "B" } }, { id: "new-c", type: "image", data: { title: "C" } }];
  const bound = bindNewtPresetInputs(saved, { a: "new-b", b: "new-c" }, available);
  assert.equal(bound.nodes[0].data.text, "@B with @C, not @AB");
  assert.equal(bound.nodes[0].data.sourceUrl, "/outputs/@A.png");
  assert.throws(() => bindNewtPresetInputs(saved, { missing: "new-b" }, available), /no longer exists/);
});

test("old unapproved actions are discarded on recovery and cannot bypass the plan", async (t) => {
  const { service, start } = await fixture(t, { invoke: async () => response("run", { nodeId: "image" }) });
  const job = await start(); job.plan = null;
  await service.save(job);
  const recovered = new MyNewtService({ directory: service.directory, getKey: () => "mock" });
  await recovered.ready;
  assert.equal(recovered.jobs.get(job.id).status, "paused");
  assert.equal(recovered.jobs.get(job.id).pending, null);
  assert.match(recovered.jobs.get(job.id).messages.at(-1).output, /fresh plan/);
});

test("a historical checkpoint cannot replace a project while a follow-up task is active", async (t) => {
  const { service, start } = await fixture(t, { invoke: async () => response("finish", { message: "Ready" }) });
  const original = await start({}, { checkpoint: myNewtCheckpoint(graph) });
  const followup = await service.start({ ...owner, brief: "Continue", parentId: original.id, snapshot: snapshot() });
  await wait(service);
  await assert.rejects(service.recover(original.id, owner), /other task/);
  await service.control(followup.id, { ...owner, action: "stop" });
  assert.ok((await service.recover(original.id, owner)).checkpoint);
});
