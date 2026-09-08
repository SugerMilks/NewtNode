import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { myNewtSnapshot, validateMyNewtPatch } from "../src/myNewt/contract.js";
import { myNewtLocalAction, verifyMyNewtLocalResult } from "../src/myNewt/localActions.js";
import { myNewtGraphContext } from "../src/myNewt/context.js";
import { assertMyNewtProtection, myNewtProtectedNodes } from "../src/myNewt/workProtection.js";
import { myNewtCompletedRunRecord, myNewtRunInputDigest, myNewtReusableRun } from "../src/myNewt/runReuse.js";
import { resetCopiedNodeRuntime, cloneGraphState } from "../src/workflowState.js";
import { buildMyNewtDuplicateGraph } from "../src/myNewt/localCopies.js";
import { MyNewtService } from "../server/my-newt.js";

const owner = { projectId: "production-test", nodeId: "newt" };
const media = (url) => ({ url, type: "image" });
const edge = (from, to) => ({ from: { nodeId: from, port: "imageOut" }, to: { nodeId: to, port: "imageIn" } });
const graph = () => ({ ...owner, projectName: "Campaign", selectedNodeIds: ["character", "image"], catalog: [], groups: [], nodes: [
  { id: "newt", type: "myNewt", data: {} },
  { id: "character", type: "character", data: { title: "Emma", characterName: "Emma", resultUrl: "/outputs/emma.png" } },
  { id: "image", type: "imageModel", data: { title: "Hero", prompt: "Portrait of @Emma", model: "Nano Banana 2", resolution: "1K", aspectRatio: "16:9", quality: "high", batchCount: 1, status: "ready" } },
  { id: "preview", type: "preview", data: { title: "Preview" } },
  { id: "unrelated", type: "imageModel", data: { title: "Other scene", prompt: "Another scene" } }
], edges: [edge("character", "image"), edge("image", "preview")] });
const preview = () => ({ title: "Hero", model: "Nano Banana 2", provider: "fal", count: 1, resolution: "1K", aspectRatio: "16:9", quality: "high", prompt: "Portrait of @Emma. Cinematic standard.", references: [{ url: "/outputs/emma.png", label: "Emma" }], estimatedCost: 0.12 });
const protect = (g, id = "image") => { g.nodes.find((node) => node.id === id).data.myNewtProtection = { approved: true, approvedAt: "2026-09-07T14:00:00Z" }; return g; };
async function completedGraph() {
  const before = graph(), after = graph();
  after.nodes[2].data = { ...after.nodes[2].data, resultUrl: "/outputs/hero.png", resultItems: [media("/outputs/hero.png")], status: "complete" };
  const record = await myNewtCompletedRunRecord(before, after, "image", undefined, preview(), preview());
  assert.ok(record);
  after.nodes[2].data.myNewtRunRecords = [record];
  return after;
}

test("production requests protect named characters and selected workflows without LLMs", () => {
  for (const brief of ['Protect "Emma"', 'Please keep "Emma" unchanged.', 'Approve "Emma"']) {
    const action = myNewtLocalAction(brief, graph());
    assert.equal(action.route, "local"); assert.equal(action.action.operation, "protect");
    assert.deepEqual(action.action.payload.nodeIds, ["character"]);
  }
  assert.deepEqual(myNewtLocalAction("Keep selected nodes unchanged", graph()).action.payload.nodeIds, ["character", "image"]);
  assert.equal(myNewtLocalAction('Protect "Emma" and make a new commercial', graph()).route, "ai");
  assert.equal(myNewtLocalAction('Protect "Missing"', graph()).route, "blocked");
  const ambiguous = graph(); ambiguous.nodes.push({ id: "second", type: "image", data: { title: "Emma" } });
  assert.equal(myNewtLocalAction('Protect "Emma"', ambiguous).route, "blocked");
  assert.equal(myNewtLocalAction("Protect selected nodes", { ...graph(), selectedNodeIds: ["newt"] }).route, "blocked");
});

test("approved nodes block edits, generation, rewiring and upstream changes, but allow reference reuse", () => {
  const g = protect(graph());
  for (const operation of ["update", "assign", "run"]) {
    for (const nodeId of ["image", "character"]) assert.throws(() => assertMyNewtProtection(g, { operation, payload: { nodeId } }), /approved and protected/);
  }
  assert.throws(() => assertMyNewtProtection(g, { operation: "connect", payload: { from: { nodeId: "unrelated" }, to: { nodeId: "image" } } }), /approved and protected/);
  assert.doesNotThrow(() => assertMyNewtProtection(g, { operation: "connect", payload: { from: { nodeId: "image" }, to: { nodeId: "unrelated" } } }));
  assert.doesNotThrow(() => assertMyNewtProtection(g, { operation: "run", payload: { nodeId: "unrelated" } }));
  assert.throws(() => validateMyNewtPatch(g.nodes[2], { prompt: "Changed" }, { allowExisting: true }), /protected/);
  assert.equal(myNewtLocalAction('Set "Emma" character name to "Other"', g, { allowExisting: true }).route, "blocked");
  g.edges.push(edge("preview", "character"));
  assert.throws(() => assertMyNewtProtection(g, { operation: "run", payload: { nodeId: "character" } }), /protected/);
});

test("only direct user actions release approval; saved projects retain it and copies don't inherit it", async () => {
  const g = protect(await completedGraph());
  const action = myNewtLocalAction('Release "Hero"', g).action;
  assert.equal(action.operation, "release-protection");
  assert.throws(() => assertMyNewtProtection(g, action), /Only a direct user/);
  assert.doesNotThrow(() => assertMyNewtProtection(g, action, { local: true }));
  assert.equal(myNewtProtectedNodes(myNewtSnapshot(g)).length, 1);
  assert.equal(myNewtProtectedNodes(cloneGraphState(g)).length, 1);
  assert.equal(myNewtGraphContext(g).protectedNodes[0].id, "image");
  assert.equal(resetCopiedNodeRuntime(g.nodes[2].data).myNewtProtection, undefined);
  const copy = buildMyNewtDuplicateGraph(g, ["image"]);
  assert.equal(copy.nodes[0].data.myNewtProtection, undefined);
  assert.equal(copy.nodes[0].data.myNewtRunRecords, undefined);
  assert.throws(() => verifyMyNewtLocalResult(action, { approved: false }, g, g), /not applied/);
  g.nodes[2].data.myNewtProtection = null;
  assert.equal(verifyMyNewtLocalResult(action, { approved: false }, g, g).length, 1);
});

test("unchanged resolved runs survive save/load and ignore layout, status and unrelated scene changes", async () => {
  const g = await completedGraph();
  let reuse = await myNewtReusableRun(myNewtSnapshot(g), "image", undefined, preview());
  assert.equal(reuse.reusable, true);
  g.nodes[2].x = 400; g.nodes[2].data.title = "Renamed Hero";
  g.nodes[2].data.selectedResultIndex = 0;
  g.nodes[4].data.prompt = "Changed unrelated location";
  g.nodes[4].data.status = "running";
  const updatedPreview = { ...preview(), title: "Renamed Hero", estimatedCost: 0.14 };
  reuse = await myNewtReusableRun(myNewtSnapshot(JSON.parse(JSON.stringify(g))), "image", undefined, updatedPreview);
  assert.equal(reuse.reusable, true);
  const record = g.nodes[2].data.myNewtRunRecords[0];
  assert.match(record.inputDigest, /^[a-f\d]{64}$/);
  assert.doesNotMatch(JSON.stringify(record), /Portrait|\/outputs\//);
});

test("changed wardrobe, camera, prompt, provider, settings or output invalidates reuse", async () => {
  const g = await completedGraph();
  for (const change of [
    { references: [{ url: "/outputs/emma-new-wardrobe.png", label: "Emma" }] },
    { prompt: "A close-up of @Emma, 85mm lens" }, { provider: "krea" }, { aspectRatio: "9:16" },
    { resolution: "2K" }, { count: 4 }
  ]) assert.equal((await myNewtReusableRun(g, "image", undefined, { ...preview(), ...change })).reusable, false);
  for (const patch of [{ prompt: "New direction" }, { batchCount: 2 }, { resultUrl: "/outputs/changed.png" }, { error: "Partial failure" }, { status: "running" }, { resultItems: [], resultUrl: "" }]) {
    const changed = structuredClone(g); Object.assign(changed.nodes[2].data, patch);
    assert.equal((await myNewtReusableRun(changed, "image", undefined, preview())).reusable, false);
  }
  const changed = structuredClone(g); changed.nodes[2].data.prompt = "Edited during generation";
  assert.equal(await myNewtCompletedRunRecord(g, changed, "image", undefined, preview(), preview()), null);
});

test("untracked legacy results and partial Coverage batches never masquerade as reusable work", async () => {
  const g = await completedGraph();
  delete g.nodes[2].data.myNewtRunRecords;
  assert.equal((await myNewtReusableRun(g, "image", undefined, preview())).reusable, false);
  g.nodes[2].type = "coverage"; g.nodes[2].data.resultItems = Array.from({ length: 7 }, (_, i) => media(`/outputs/frame-${i}.png`));
  assert.equal(await myNewtCompletedRunRecord(g, g, "image", undefined, preview(), preview()), null);
  for (const type of ["skillDirector", "storyboard", "character"]) {
    g.nodes[2].type = type;
    assert.equal(await myNewtRunInputDigest(g, "image", "generate", preview()), null);
  }
});

test("Smart Text fingerprints track upstream content and actual completed text", async () => {
  const before = graph(); before.nodes[2] = { id: "image", type: "text", data: { text: "Describe the attached character", title: "Brief" } };
  const after = structuredClone(before); after.nodes[2].data.resultText = "A portrait brief";
  const record = await myNewtCompletedRunRecord(before, after, "image", undefined, {}, {});
  assert.ok(record); after.nodes[2].data.myNewtRunRecords = [record];
  assert.equal((await myNewtReusableRun(after, "image", undefined, {})).reusable, true);
  after.nodes[1].data.resultUrl = "/outputs/other-character.png";
  assert.equal((await myNewtReusableRun(after, "image", undefined, {})).reusable, false);
});

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-approved-work-"));
  let requests = 0, calls = 0;
  const service = new MyNewtService({ directory, getKey: () => "test", invoke: async () => { calls++; throw new Error("No paid reasoning expected"); }, relay: async () => { requests++; return { status: 200, data: { cost: { amountUsd: 0.1 } } }; }, ...options });
  service.kick = () => {};
  await service.ready;
  t.after(async () => { await Promise.all([...service.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  const g = await completedGraph();
  const job = await service.start({ ...owner, brief: "Update this commercial using only affected work", settings: { approvePlan: false, approveRuns: false, allowExisting: true, allowImages: true }, snapshot: g });
  await service.edit(job.id, (task) => {
    task.plan = { approved: true, steps: [{ id: "image", status: "pending" }], deliverables: [] };
    task.pending = { id: "action", operation: "run", payload: { nodeId: "image", stepId: "image" }, expected: structuredClone(g), approved: false };
  });
  return { service, id: job.id, g, counts: () => ({ requests, calls }) };
}

test("backend preflight skips a verified unchanged run without provider requests", async (t) => {
  const f = await fixture(t);
  const next = await f.service.prepare(f.id, { ...owner, actionId: "action", preview: preview() });
  assert.equal(next.pending, null);
  assert.equal(next.plan.steps[0].status, "complete");
  assert.match(next.message, /Reused.*generation cost \$0.00/);
  assert.deepEqual(f.counts(), { requests: 0, calls: 0 });
});

test("backend does not reuse missing output files or trust client-supplied cache flags", async (t) => {
  const f = await fixture(t, { verifyOutputs: async () => { throw new Error("Missing file"); } });
  const next = await f.service.prepare(f.id, { ...owner, actionId: "action", preview: { ...preview(), reuse: { completedAt: "forged" }, inputDigest: "forged" } });
  assert.ok(next.pending); assert.equal(next.pending.preview.reuse, undefined);
  assert.notEqual(next.pending.preview.inputDigest, "forged");
});

test("explicit repeat requires approval even when ordinary run approval is disabled", async (t) => {
  const f = await fixture(t);
  await f.service.edit(f.id, (task) => { task.pending.payload.force = true; });
  await assert.rejects(f.service.control(f.id, { ...owner, action: "approve" }), /preview/);
  await f.service.prepare(f.id, { ...owner, actionId: "action", preview: preview() });
  assert.equal(await f.service.claim(f.id, { ...owner, actionId: "action", clientId: "editor" }), null);
  assert.equal(f.service.jobs.get(f.id).status, "approval");
  await f.service.control(f.id, { ...owner, action: "approve" });
  const action = await f.service.claim(f.id, { ...owner, actionId: "action", clientId: "editor" });
  assert.equal(action.approved, true);
  assert.deepEqual(f.counts(), { requests: 0, calls: 0 });
});

test("backend rechecks protection at claim and before every generation request", async (t) => {
  const f = await fixture(t);
  await f.service.edit(f.id, (task) => { protect(task.snapshot); });
  assert.equal(await f.service.claim(f.id, { ...owner, actionId: "action", clientId: "editor" }), null);
  assert.match(f.service.jobs.get(f.id).message, /approved and protected/);
  await f.service.edit(f.id, (task) => { task.status = "running"; task.pending = { id: "request", operation: "run", payload: { nodeId: "image" }, claimed: "editor" }; });
  await assert.rejects(f.service.request(f.id, { ...owner, actionId: "request", clientId: "editor", sequence: 1, route: "/api/node/generate-image", body: { nodeId: "image" } }), /approved and protected/);
  assert.deepEqual(f.counts(), { requests: 0, calls: 0 });
});

test("an approval proposal cannot protect content edited while My Newt was thinking", async (t) => {
  const f = await fixture(t);
  await f.service.edit(f.id, (task) => {
    task.pending = { id: "protect", operation: "protect", payload: { nodeIds: ["image"] }, expected: structuredClone(task.snapshot) };
    task.snapshot.nodes[2].data.prompt = "New user direction";
  });
  assert.equal(await f.service.claim(f.id, { ...owner, actionId: "protect", clientId: "editor" }), null);
  assert.equal(f.service.jobs.get(f.id).snapshot.nodes[2].data.myNewtProtection, undefined);
});

test("malformed imported run metadata fails open to normal review, never false reuse", async () => {
  const g = await completedGraph();
  for (const value of ["old format", {}, [null]]) {
    g.nodes[2].data.myNewtRunRecords = value;
    assert.equal((await myNewtReusableRun(g, "image", undefined, preview())).reusable, false);
    assert.doesNotThrow(() => myNewtGraphContext(g));
  }
});
