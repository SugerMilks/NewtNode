import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtService } from "../server/my-newt.js";
import { myNewtDefaults, myNewtSettings, myNewtSnapshot, validateMyNewtPatch } from "../src/myNewt/contract.js";
import { myNewtRequiresPlanApproval, myNewtRequiresRunApproval, myNewtReviewInstructions } from "../src/myNewt/review.js";
import { myNewtCompletedRunRecord } from "../src/myNewt/runReuse.js";

const owner = { projectId: "auto-review-test", nodeId: "newt" };
const snapshot = () => myNewtSnapshot({ ...owner, nodes: [
  { id: "newt", type: "myNewt", data: {} },
  { id: "image", type: "imageModel", data: { title: "Image", model: "Nano Banana 2", prompt: "A city", status: "ready" } }
], edges: [], groups: [] });
const plan = { summary: "Create one image", steps: [{ id: "render", title: "Render the image" }], deliverables: [{ kind: "image", nodeId: "image", label: "Image", count: 1 }], runs: [{ kind: "image", model: "Nano Banana 2", batchCount: 1 }] };
const preview = { title: "Image", model: "Nano Banana 2", provider: "fal", count: 1, estimatedCost: 0.12 };
const response = (operation, payload) => ({ usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: "function_call", name: "project_action", call_id: crypto.randomUUID(), arguments: JSON.stringify({ operation, payload: JSON.stringify(payload), reason: operation }) }] });
async function wait(service) {
  for (let i = 0; i < 1000; i++) { if (!service.loops.size) return; await new Promise((resolve) => setTimeout(resolve, 3)); }
  throw new Error("Newt loop did not settle");
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-auto-review-"));
  const calls = [], submissions = [];
  const service = new MyNewtService({ directory, getKey: () => "mock", provider: () => "fal",
    invoke: async (body) => {
      calls.push(body);
      const context = JSON.parse(body.input.findLast((item) => item.content?.startsWith?.("Current project data")).content.split("\n").slice(1).join("\n"));
      if (!context.plan) return response("plan", options.plan || plan);
      if (calls.length === 2 || options.repeatRun) return response("run", { nodeId: "image", stepId: "render", ...(options.force ? { force: true } : {}) });
      return response("finish", { message: "Image complete." });
    },
    relay: async (route, body) => { submissions.push({ route, body }); if (options.uncertain) throw new Error("Connection lost after submission"); return { status: 200, data: { cost: { amountUsd: 0.1 } } }; }
  });
  await service.ready;
  t.after(async () => { await wait(service); await Promise.all([...service.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  const start = async (settings = {}, extra = {}) => {
    const started = await service.start({ ...owner, brief: "Create the requested city image", settings: { autoReview: true, allowExisting: true, allowImages: true, ...settings }, snapshot: snapshot(), ...extra });
    await wait(service); return service.jobs.get(started.id);
  };
  const prepare = (job, details = preview) => service.prepare(job.id, { ...owner, actionId: job.pending.id, preview: details });
  const claim = (job) => service.claim(job.id, { ...owner, actionId: job.pending.id, clientId: "editor" });
  const request = (job, sequence = 1) => service.request(job.id, { ...owner, actionId: job.pending.id, clientId: "editor", sequence, route: "/api/node/generate-image", body: { nodeId: "image", model: "Nano Banana 2" } });
  return { service, start, prepare, claim, request, calls, submissions };
}

test("Auto Review is opt-in and preserves saved approval and permission preferences", () => {
  assert.equal(myNewtDefaults.autoReview, false);
  for (const value of [undefined, false, "true", 1]) assert.equal(myNewtSettings({ autoReview: value }).autoReview, false);
  const on = myNewtSettings({ autoReview: true });
  assert.equal(on.autoReview, true); assert.equal(on.approvePlan, true); assert.equal(on.approveRuns, true);
  assert.equal(on.allowImages, false); assert.equal(on.allowVideos, false); assert.equal(on.allowExisting, false);
  assert.equal(myNewtRequiresPlanApproval(on), false); assert.equal(myNewtRequiresRunApproval(on), false);
  assert.equal(myNewtRequiresRunApproval(on, { force: true }), false);
  assert.equal(myNewtRequiresRunApproval(on, { force: true }, { uncertain: true }), true);
  const off = myNewtSettings({ ...on, autoReview: false });
  assert.equal(myNewtRequiresPlanApproval(off), true); assert.equal(myNewtRequiresRunApproval(off), true);
  assert.equal(myNewtRequiresRunApproval({ approveRuns: false }, { force: true }), true);
  assert.equal(myNewtRequiresRunApproval({ approveRuns: false }), false);
  assert.equal(myNewtSettings({ ...on, approveRuns: false, autoReview: false }).approveRuns, false);
  assert.throws(() => validateMyNewtPatch({ type: "myNewt" }, { autoReview: true }, on), /not Newt itself/);
});

for (const force of [false, true]) test(`Auto Review completes a ${force ? "requested variant" : "normal generation"} without approval clicks`, async (t) => {
  const f = await fixture(t, { force }), job = await f.start();
  assert.equal(job.status, "running"); assert.equal(job.plan.approved, true);
  assert.equal(job.settings.approveRuns, true); assert.equal(job.pending.approved, false);
  assert.equal(await f.claim(job), null, "Complete batch preview is still required");
  await f.prepare(job); const action = await f.claim(job); assert.ok(action);
  const before = job.spent;
  await f.request(job); await f.request(job);
  assert.equal(f.submissions.length, 1, "Duplicate receipt must not resubmit");
  assert.ok(Math.abs(job.spent - before - 0.1) < 1e-9);
  const result = snapshot(); result.nodes[1].data.resultUrl = "/outputs/new-city.png";
  await f.service.complete(job.id, { ...owner, actionId: action.id, clientId: "editor", result: { nodeId: "image" }, snapshot: result });
  await wait(f.service);
  assert.equal(job.status, "complete"); assert.equal(f.calls.length, 3, "No extra paid review call");
  assert.match(f.calls[0].instructions, /Auto Review is enabled/);
  assert.match(f.calls[0].instructions, /do not call ask merely to obtain routine confirmation/);
});

test("Auto Review also skips free local plan approval without calling a model", async (t) => {
  const f = await fixture(t);
  const graph = snapshot(); graph.catalog = [{ type: "plainText", label: "Text", ports: { input: [], output: [{ id: "promptOut" }] } }];
  const job = await f.start({}, { brief: "Add a Text node", executionRoute: "local", snapshot: graph });
  assert.equal(job.execution, "local"); assert.equal(job.status, "running"); assert.equal(job.plan.approved, true);
  assert.ok(await f.claim(job)); assert.equal(job.spent, 0); assert.equal(f.calls.length, 0);
});

test("enabling Auto Review continues a pending plan, and disabling it restores run approval", async (t) => {
  const f = await fixture(t, { repeatRun: true }), job = await f.start({ autoReview: false });
  assert.equal(job.status, "plan-approval"); assert.equal(job.plan.approved, false);
  await f.service.control(job.id, { ...owner, action: "settings", settings: { ...job.settings, autoReview: true } });
  await wait(f.service);
  assert.equal(job.status, "running"); assert.equal(job.plan.approved, true);
  const oldId = job.pending.id;
  await f.service.control(job.id, { ...owner, action: "settings", settings: { ...job.settings, autoReview: false } });
  await wait(f.service);
  assert.equal(job.status, "approval"); assert.notEqual(job.pending.id, oldId);
  assert.equal(job.settings.approveRuns, true);
});

test("Auto Review does not resume paused tasks or bypass restart recovery", async (t) => {
  const f = await fixture(t), job = await f.start({ autoReview: false });
  await f.service.control(job.id, { ...owner, action: "pause" });
  await f.service.control(job.id, { ...owner, action: "settings", settings: { ...job.settings, autoReview: true } });
  assert.equal(job.status, "paused"); assert.equal(f.calls.length, 1);
  const recovered = new MyNewtService({ directory: f.service.directory, getKey: () => "mock" }); await recovered.ready;
  assert.equal(recovered.jobs.get(job.id).settings.autoReview, true);
  assert.equal(recovered.jobs.get(job.id).status, "paused");
  await f.service.control(job.id, { ...owner, action: "resume" }); await wait(f.service);
  assert.equal(job.status, "running"); assert.equal(job.plan.approved, true);
  await f.prepare(job); assert.ok(await f.claim(job));
});

test("Auto Review retains complete-batch budget limits and image permissions", async (t) => {
  const f = await fixture(t), job = await f.start();
  await f.prepare(job, { ...preview, estimatedCost: 20 });
  assert.equal(await f.claim(job), null); assert.equal(job.status, "paused"); assert.equal(f.submissions.length, 0);
  const g = await fixture(t), blocked = await g.start({ allowImages: false });
  await g.prepare(blocked); await g.claim(blocked);
  await assert.rejects(g.request(blocked), /Enable image generation/); assert.equal(g.submissions.length, 0);
});

test("Auto Review retains protection, run reuse and completion verification", async (t) => {
  const after = snapshot(); after.nodes[1].data.resultUrl = "/outputs/existing-city.png";
  after.nodes[1].data.myNewtRunRecords = [await myNewtCompletedRunRecord(snapshot(), after, "image", undefined, preview, preview)];
  const f = await fixture(t, { plan: { ...plan, deliverables: [{ ...plan.deliverables[0], fresh: false }] } });
  const job = await f.start({}, { snapshot: after });
  await f.prepare(job); await wait(f.service);
  assert.equal(f.submissions.length, 0); assert.equal(job.status, "complete");
  assert.ok(job.activity.some((item) => /Reused/.test(item.text)));
  const g = await fixture(t), protectedJob = await g.start();
  protectedJob.snapshot.nodes[1].data.myNewtProtection = { approved: true };
  assert.equal(await g.claim(protectedJob), null); assert.equal(protectedJob.status, "waiting");
  assert.match(protectedJob.message, /protected/);
  const h = await fixture(t), incomplete = await h.start();
  await h.prepare(incomplete); const action = await h.claim(incomplete);
  await h.service.complete(incomplete.id, { ...owner, actionId: action.id, clientId: "editor", result: {}, snapshot: snapshot() });
  await wait(h.service); assert.equal(incomplete.status, "waiting"); assert.match(incomplete.message, /Completion check/);
});

test("enabling Auto Review at run approval reconsiders the unclaimed action and proceeds", async (t) => {
  const f = await fixture(t, { repeatRun: true }), job = await f.start({ autoReview: false, approvePlan: false });
  assert.equal(job.status, "approval"); const oldId = job.pending.id;
  await f.service.control(job.id, { ...owner, action: "settings", settings: { ...job.settings, autoReview: true } });
  await wait(f.service);
  assert.equal(job.status, "running"); assert.notEqual(job.pending.id, oldId);
  await f.prepare(job); assert.ok(await f.claim(job)); await f.request(job);
  assert.equal(f.submissions.length, 1);
});

test("turning Auto Review off during a claimed batch stops further unapproved submissions", async (t) => {
  const f = await fixture(t), job = await f.start();
  await f.prepare(job); await f.claim(job); await f.request(job);
  await f.service.control(job.id, { ...owner, action: "settings", settings: { ...job.settings, autoReview: false } });
  await assert.rejects(f.request(job, 2), /approval|New direction/);
  assert.equal(f.submissions.length, 1);
});

test("uncertain charges still require explicit recovery approval in Auto Review", async (t) => {
  const f = await fixture(t, { force: true, uncertain: true }), job = await f.start();
  await f.prepare(job); await f.claim(job);
  await assert.rejects(f.request(job), /Connection lost/);
  assert.equal(job.status, "paused"); assert.ok(job.uncertainNodes.includes("image"));
  await assert.rejects(f.request(job), /already started/); assert.equal(f.submissions.length, 1);
  await f.service.edit(job.id, (current) => { current.status = "running"; current.pending = { ...current.pending, id: "retry", claimed: undefined, approved: false }; });
  assert.equal(await f.claim(job), null); assert.equal(job.status, "approval");
  await f.service.edit(job.id, (current) => { current.status = "running"; current.pending.claimed = "editor"; });
  await assert.rejects(f.request(job), /earlier request may have been billed/); assert.equal(f.submissions.length, 1);
});

test("invalid plans and real missing information still stop Auto Review", async (t) => {
  const f = await fixture(t, { plan: { ...plan, steps: [] } }), job = await f.start();
  assert.equal(job.status, "waiting"); assert.match(job.message, /1 to 30 steps/);
  const g = await fixture(t);
  g.service.invoke = async () => response("ask", { message: "Please attach the missing character reference." });
  const blocked = await g.start(); assert.equal(blocked.status, "waiting"); assert.match(blocked.message, /missing character/);
  assert.match(myNewtReviewInstructions({}), /Auto Review is disabled/);
});
