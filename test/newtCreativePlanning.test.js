import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { MyNewtService } from "../server/my-newt.js";
import { NewtSkillStore } from "../server/newt-skills.js";
import { newtPresetSummary, newtPresetDetails, newtPresetRevision, newtPresetIndex } from "../server/newt-preset-discovery.js";
import { myNewtSnapshot } from "../src/myNewt/contract.js";
import { normalizeMyNewtPlan } from "../src/myNewt/plan.js";
import { removeMyNewtCanvasNodes } from "../src/myNewt/canvasActions.js";

const owner = { projectId: "creative-project", nodeId: "newt" };
const snapshot = () => myNewtSnapshot({ ...owner, nodes: [{ id: "newt", type: "myNewt", data: {} }], edges: [], presets: [],
  catalog: [{ type: "plainText", label: "Text", ports: { input: [], output: [{ id: "promptOut" }] } }] });
const preset = (id = "look") => ({ id, name: "Cinematic Location", isSystem: true, graph: {
  nodes: [{ id: "prompt", type: "text", data: { title: "Location prompt", text: "A deep, empty location plate", apiKey: "secret" } },
    { id: "image", type: "imageModel", data: { model: "Nano Banana Pro", aspectRatio: "16:9", prompt: "Saved creative guidance" } }],
  edges: [{ from: { nodeId: "prompt", port: "textOut" }, to: { nodeId: "image", port: "promptIn" } }]
} });
const answerPlan = { summary: "Explain the workflow", workflowBasis: { mode: "existing", reason: "The user only wants an answer." },
  steps: [{ id: "explain", title: "Explain" }], deliverables: [{ kind: "answer", label: "Workflow guidance", count: 1 }] };
const savedPlan = { summary: "Use the established location workflow", workflowBasis: { mode: "presets", presetIds: ["look"], reason: "Its location plate and model match the brief." },
  steps: [{ id: "setup", title: "Insert saved workflow" }], deliverables: [{ kind: "workflow", label: "Location workflow", count: 1 }] };
const response = (operation, payload) => ({ status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
  output: [{ type: "function_call", name: "project_action", call_id: crypto.randomUUID(), arguments: JSON.stringify({ operation, payload: JSON.stringify(payload), reason: operation }) }] });
const context = body => JSON.parse(body.input.findLast(item => item.content?.startsWith?.("Current project data")).content.split("\n").slice(1).join("\n"));
const toolResults = body => body.input.filter(item => item.type === "function_call_output").map(item => JSON.parse(item.output));
async function settle(service) {
  for (let i = 0; i < 600; i++) { if (!service.loops.size) return; await new Promise(resolve => setTimeout(resolve, 3)); }
  throw new Error("Creative planning did not settle");
}
async function fixture(t, invoke, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "newt-creative-")), directory = path.join(root, "tasks");
  const skillStore = new NewtSkillStore({ directory: path.join(root, "skills") });
  const presets = [preset()], reads = [];
  const presetStore = {
    list: async () => presets.map(item => newtPresetSummary(item)),
    get: async (id, args) => {
      reads.push({ id, args });
      const item = presets.find(item => item.id === id); if (!item) throw new Error("Missing preset");
      return { ...structuredClone(item), revision: newtPresetRevision(item) };
    }
  };
  const service = new MyNewtService({ directory, skillStore, presetStore, getKey: () => "mock", invoke, ...options });
  await service.ready;
  t.after(async () => { await settle(service); await Promise.all([...service.queues.values()]); await rm(root, { recursive: true, force: true }); });
  const start = async (brief = "Develop an evocative cinematic location using my established process.") => {
    const result = await service.start({ ...owner, brief, snapshot: snapshot(), settings: { autoReview: true, budget: 100 } });
    await settle(service); return service.jobs.get(result.id);
  };
  return { service, skillStore, presetStore, presets, reads, start, directory };
}

test("preset discovery exposes settings and ports without credentials and supports large library paging", () => {
  const source = preset(), summary = newtPresetSummary(source);
  assert.deepEqual(summary.nodeTypes, ["text", "imageModel"]);
  assert.equal(summary.settings[0].model, "Nano Banana Pro");
  const details = newtPresetDetails(source);
  assert.deepEqual(details.edges, source.graph.edges);
  assert.equal(details.nodes[0].data.text, source.graph.nodes[0].data.text);
  assert.doesNotMatch(JSON.stringify(details), /secret|apiKey/);
  assert.equal(source.graph.nodes[0].data.apiKey, "secret");
  const entries = Array.from({ length: 30 }, (_, i) => newtPresetSummary({ ...preset(String(i)), name: i === 29 ? "Dog Casting" : `Workflow ${i}` }));
  const page = newtPresetIndex(entries, "A dog in a park");
  assert.equal(page.items[0].id, "29"); assert.equal(page.nextOffset, 12);
  const ids = new Set([...page.items, ...newtPresetIndex(entries, "A dog in a park", 12).items, ...newtPresetIndex(entries, "A dog in a park", 24).items].map(item => item.id));
  assert.equal(ids.size, 30);
  source.graph.nodes[1].data.model = "Seedream 4.5";
  assert.notEqual(newtPresetRevision(source), summary.revision);
});

test("preset details page long prompts, nodes and connections instead of silently clipping JSON", () => {
  const source = preset(); source.graph.nodes[0].data.text = "x".repeat(24000);
  source.graph.nodes.push(...Array.from({ length: 30 }, (_, i) => ({ id: `node-${i}`, type: "text", data: { text: "z".repeat(20000) } })));
  source.graph.edges = Array.from({ length: 31 }, (_, i) => ({ from: { nodeId: "prompt", port: "textOut" }, to: { nodeId: i ? `node-${i - 1}` : "image", port: "promptIn" } }));
  const details = newtPresetDetails(source);
  assert.equal(details.nextOffset, 6); assert.equal(details.nextEdgeOffset, 30);
  assert.ok(JSON.stringify(details).length < 30000);
  assert.ok(details.nodes.some(node => node.omittedDetails));
  assert.equal(newtPresetDetails(source, { edgeOffset: 30 }).edges.length, 1);
  const first = newtPresetDetails(source, { nodeIds: ["prompt"], field: "text" }).details[0];
  const last = newtPresetDetails(source, { nodeIds: ["prompt"], field: "text", itemOffset: first.nextOffset }).details[0];
  assert.equal(first.text + last.text, source.graph.nodes[0].data.text);
  assert.throws(() => newtPresetDetails(source, { nodeIds: ["prompt", "image"], field: "text" }), /one preset node field/);
});

test("plans record a concrete workflow basis without breaking legacy local plans", () => {
  assert.deepEqual(normalizeMyNewtPlan(savedPlan).workflowBasis, savedPlan.workflowBasis);
  assert.throws(() => normalizeMyNewtPlan({ ...savedPlan, workflowBasis: { mode: "presets", presetIds: [], reason: "Use saved work" } }), /preset/);
  assert.throws(() => normalizeMyNewtPlan({ ...savedPlan, workflowBasis: { mode: "custom", reason: "" } }), /Explain whether/);
  assert.equal(normalizeMyNewtPlan({ ...savedPlan, workflowBasis: undefined }).workflowBasis, undefined);
});

test("AI reads authoritative presets, approves a reasoned plan and inserts its exact revision", async t => {
  const bodies = [];
  const f = await fixture(t, async body => {
    bodies.push(body);
    if (bodies.length === 1) return response("read", { presetId: "look" });
    if (!context(body).plan) return response("plan", savedPlan);
    return response("preset", { presetId: "look", bindings: {}, stepId: "setup" });
  });
  const job = await f.start();
  assert.equal(job.status, "running"); assert.equal(job.plan.approved, true);
  assert.equal(job.pending.operation, "preset");
  assert.equal(job.pending.payload.presetRevision, newtPresetRevision(f.presets[0]));
  assert.equal(job.plan.presetRevisions.look, job.pending.payload.presetRevision);
  assert.equal(context(bodies[0]).graph.presets[0].name, "Cinematic Location");
  assert.equal(f.reads.every(item => item.args.restoreAssets === false), true);
  assert.ok(bodies[0].input[0].content.includes("Workflow Planning"));
  assert.equal(f.service.public(job).skills.items[0].instructions, undefined);
  assert.equal(Object.keys(job.receipts).length, 0);
});

test("uninspected or unplanned presets cannot be inserted; current library updates are discovered", async t => {
  const bodies = []; let f;
  f = await fixture(t, async body => {
    bodies.push(body);
    switch (bodies.length) {
      case 1: return response("plan", savedPlan);
      case 2:
        assert.match(toolResults(body).at(-1).error, /Read the current details/);
        f.presets.push({ ...preset("second"), name: "Newly Saved Casting" });
        return response("read", { presetId: "look" });
      case 3:
        assert.ok(context(body).graph.presets.some(item => item.id === "second"));
        return response("plan", savedPlan);
      case 4: return response("preset", { presetId: "second" });
      default:
        assert.match(toolResults(body).at(-1).error, /Update the plan/);
        return response("ask", { message: "Verification complete." });
    }
  });
  const job = await f.start(); assert.equal(job.status, "waiting"); assert.equal(job.pending, null);
});

test("a preset edited after plan approval needs reinspection and a new plan", async t => {
  let calls = 0, f;
  f = await fixture(t, async body => {
    switch (++calls) {
      case 1: return response("read", { presetId: "look" });
      case 2: return response("plan", savedPlan);
      case 3:
        f.presets[0].graph.nodes[1].data.model = "Nano Banana 2.1";
        return response("read", { presetId: "look" });
      case 4: return response("preset", { presetId: "look" });
      case 5:
        assert.match(toolResults(body).at(-1).error, /changed since inspection/);
        return response("plan", savedPlan);
      default: return response("preset", { presetId: "look" });
    }
  });
  const job = await f.start();
  assert.equal(calls, 6); assert.equal(job.pending.operation, "preset");
  assert.equal(job.pending.payload.presetRevision, newtPresetRevision(f.presets[0]));
});

test("skill edits affect new AI tasks, not running or recovered tasks; local actions remain free", async t => {
  const bodies = [];
  const f = await fixture(t, async body => { bodies.push(body); return response("ask", { message: "Waiting for creative direction." }); });
  const job = await f.start(), captured = structuredClone(job.creativeSkills);
  const item = (await f.skillStore.publicList())[0];
  await f.skillStore.update(item.id, { expectedRevision: item.revision, instructions: "A distinctive new preference", enabled: true });
  assert.deepEqual(job.creativeSkills, captured);
  await f.service.control(job.id, { ...owner, action: "resume" }); await settle(f.service);
  assert.deepEqual(job.creativeSkills, captured);
  assert.equal(bodies[0].input[0].content, bodies[1].input[0].content);
  const recovered = new MyNewtService({ directory: f.directory, getKey: () => "mock", skillStore: f.skillStore });
  await recovered.ready; assert.deepEqual(recovered.jobs.get(job.id).creativeSkills, captured);
  await f.service.control(job.id, { ...owner, action: "stop" });
  const next = await f.start(); assert.notEqual(next.creativeSkills.revision, captured.revision);
  assert.equal(next.creativeSkills.skills[0].instructions, "A distinctive new preference");
  await f.service.control(next.id, { ...owner, action: "stop" });
  const before = bodies.length, local = await f.start("Add a Text node");
  assert.equal(local.execution, "local"); assert.equal(local.creativeSkills, null);
  assert.equal(local.spent, 0); assert.equal(bodies.length, before);
});

async function cleanupFixture(t) {
  let calls = 0, missing = false;
  const verified = [];
  const f = await fixture(t, async () => {
    switch (++calls) {
      case 1: return response("plan", answerPlan);
      case 2: return response("create", { type: "imageModel", temporary: true, title: "Temporary Prop" });
      case 3: return response("cleanup", { nodeIds: ["temporary"], retainedNodeIds: ["retained"] });
      default: return response("ask", { message: "Cleanup checked." });
    }
  }, { verifyOutputs: async items => { verified.push(items); if (missing) throw new Error("Retained output file is missing."); } });
  const job = await f.start(), actionId = job.pending.id;
  await f.service.claim(job.id, { ...owner, actionId, clientId: "test-editor" });
  const state = snapshot();
  // The editor has completed a preparation branch and preserved the chosen result.
  state.nodes.push({ id: "temporary", type: "imageModel", x: 0, y: 0, data: { resultUrl: "/outputs/prop.png", status: "complete" } },
    { id: "retained", type: "image", x: 600, y: 0, data: { url: "/outputs/prop.png", status: "ready" } });
  await f.service.complete(job.id, { ...owner, actionId, clientId: "test-editor", result: { createdId: "temporary" }, snapshot: state });
  await settle(f.service);
  return { ...f, job, state, verified, missing: () => { missing = true; } };
}

test("cleanup verifies retained files, persists temporary ownership, and never relays a paid request", async t => {
  const f = await cleanupFixture(t);
  assert.deepEqual(f.job.temporaryIds, ["temporary"]);
  assert.equal(f.job.pending.operation, "cleanup");
  const actionId = f.job.pending.id;
  assert.ok(await f.service.claim(f.job.id, { ...owner, actionId, clientId: "test-editor" }));
  assert.equal(f.verified.length, 2); assert.equal(f.verified[0][0].url, "/outputs/prop.png");
  await assert.rejects(f.service.request(f.job.id, { ...owner, actionId, clientId: "test-editor", sequence: 1, route: "/api/node/generate-image", body: { nodeId: "temporary" } }), /no longer owns/);
  await f.service.complete(f.job.id, { ...owner, actionId, clientId: "test-editor", result: { removedIds: ["temporary"], filesDeleted: false }, snapshot: removeMyNewtCanvasNodes(f.state, ["temporary"]) });
  await settle(f.service);
  assert.equal(f.job.snapshot.nodes.some(node => node.id === "temporary"), false);
  assert.equal(f.job.snapshot.nodes.some(node => node.id === "retained"), true);
  assert.deepEqual(f.job.receipts, {});
  const recovered = new MyNewtService({ directory: f.directory, getKey: () => "mock" }); await recovered.ready;
  assert.deepEqual(recovered.jobs.get(f.job.id).temporaryIds, ["temporary"]);
});

test("a new connection invalidates pending cleanup before it can be claimed", async t => {
  const f = await cleanupFixture(t), actionId = f.job.pending.id;
  f.state.edges.push({ from: { nodeId: "temporary", port: "imageOut" }, to: { nodeId: "retained", port: "imageIn" } });
  await f.service.sync(f.job.id, { ...owner, snapshot: structuredClone(f.state) });
  await settle(f.service);
  assert.equal(await f.service.claim(f.job.id, { ...owner, actionId, clientId: "test-editor" }), null);
  assert.equal(f.job.snapshot.nodes.some(node => node.id === "temporary"), true);
});

test("missing retained files block cleanup at claim without deleting nodes", async t => {
  const f = await cleanupFixture(t), actionId = f.job.pending.id;
  f.missing();
  assert.equal(await f.service.claim(f.job.id, { ...owner, actionId, clientId: "test-editor" }), null);
  assert.match(f.job.message, /file is missing/);
  assert.equal(f.job.snapshot.nodes.some(node => node.id === "temporary"), true);
});
