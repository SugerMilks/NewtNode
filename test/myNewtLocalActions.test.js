import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtService } from "../server/my-newt.js";
import { myNewtLocalAction, myNewtLocalWorkflows, buildMyNewtLocalWorkflow, verifyMyNewtLocalResult } from "../src/myNewt/localActions.js";
import { myNewtSettings, myNewtSnapshot, myNewtActionSnapshot, myNewtLocalActionSignature } from "../src/myNewt/contract.js";
import { buildMyNewtDuplicateGraph } from "../src/myNewt/localCopies.js";
import { localAssetChoices } from "../src/myNewt/localAssets.js";
import { instantiateNewtPreset, newtPresetOffset } from "../src/myNewt/presets.js";

const owner = { projectId: "local-test", nodeId: "newt" };
const catalog = [
  ["plainText", "Text", "promptOut", []], ["imageModel", "Image Model", "imageOut", ["promptIn", "imagePromptIn", "characterIn", "transferIn"]],
  ["videoModel", "Video Model", "videoOut", ["promptIn", "directorIn"]], ["preview", "Preview", "", ["sourceIn"]],
  ["image", "Image", "imageOut", []], ["coverage", "Coverage", "imageOut", ["imageIn"]],
  ["skillDirector", "Director", "directorOut", ["characterIn", "locationIn", "imageIn", "styleIn", "musicIn"]], ["storyboard", "Storyboard", "imageOut", ["sceneDescriptionIn", "directorIn", "characterIn", "sceneReferenceIn", "propsIn", "transferIn"]],
  ["character", "Character", "characterOut", []], ["transfer", "Mood Board", "transferOut", []], ["audio", "Audio", "audioOut", []]
].map(([type, label, output, input]) => ({ type, label, ports: { output: output ? [{ id: output, color: "yellow" }] : [], input: input.map((id) => ({ id })) } }));
Object.assign(catalog[1], { options: { batchCount: ["1", "2", "3", "4"], quality: ["low", "high"] }, modelControls: { "Image 2": { resolution: ["1K", "2K"], aspectRatio: ["16:9", "9:16"] } } });
Object.assign(catalog[2], { modelControls: { Seedance: { resolution: ["720p", "1080p"], duration: ["5s", "6s", "10s"] } } });
Object.assign(catalog[3], { options: { previewTab: ["preview", "layout"] } });
const graph = () => ({ ...owner, catalog, presets: [{ id: "saved", name: "Brand setup" }], nodes: [
  { id: "newt", type: "myNewt", data: {} },
  { id: "image", type: "imageModel", data: { title: "Image Model", model: "Image 2", resolution: "1K", status: "ready" } },
  { id: "video", type: "videoModel", data: { title: "Video Model", model: "Seedance", duration: "5s" } },
  { id: "preview", type: "preview", data: { title: "Preview", previewTab: "preview" } }
], edges: [], groups: [] });
const compile = (text, state = graph(), settings = { allowExisting: true }) => myNewtLocalAction(text, state, settings);

test("common workflows, nodes, saved presets, exact settings and Preview connections compile locally", () => {
  for (const workflow of myNewtLocalWorkflows) assert.equal(compile(`Please set up a ${workflow.label}!`).route, workflow.id === "music-video" ? "blocked" : "local");
  assert.equal(compile('Insert preset "Brand setup"').action.payload.presetId, "saved");
  assert.equal(compile("Add a Text node").action.payload.type, "plainText");
  assert.deepEqual(compile('Rename “Image Model” to “Frames”').action.payload.patch, { title: "Frames" });
  assert.deepEqual(compile('Set "Image Model" resolution to 2k').action.payload.patch, { resolution: "2K" });
  assert.deepEqual(compile('Set "Image Model" batch count to 4').action.payload.patch, { batchCount: "4" });
  assert.deepEqual(compile('Set "Video Model" duration to 6 seconds').action.payload.patch, { duration: "6s" });
  assert.equal(compile('Connect "Image Model" to "Preview"').action.operation, "connect");
});

test("ambiguous, negated, quoted and compound instructions never partially execute", () => {
  for (const text of ['Do not add a Text node', '"Add a Text node"', 'Add a Text node and generate a poster', 'Set up an image workflow with dramatic lighting', 'Explain how to add a Text node']) {
    assert.equal(compile(text).route, "ai");
    assert.equal(compile(text, graph(), { localOnly: true }).route, "blocked");
  }
  assert.equal(compile('Set "Image Model" resolution to 2K and generate it').route, "blocked");
  assert.equal(compile('Set "Image Model" resolution to 9K').route, "blocked");
  assert.equal(compile('Insert preset "Missing"').route, "blocked");
  const duplicate = graph(); duplicate.nodes.push({ ...duplicate.nodes[1], id: "duplicate" });
  assert.match(compile('Rename "Image Model" to "New"', duplicate).error, /More than one/);
  assert.equal(compile("Add a My Newt node").route, "blocked");
});

test("local updates honor existing-node permissions, locks, busy state and Director control", () => {
  assert.match(compile('Rename "Image Model" to "New"', graph(), {}).error, /disabled/);
  for (const data of [{ locked: true }, { status: "generating" }, { status: "planning" }]) {
    const state = graph(); Object.assign(state.nodes[1].data, data);
    assert.equal(compile('Set "Image Model" resolution to 2K', state).route, "blocked");
  }
  const state = graph(); state.edges.push({ from: { nodeId: "director", port: "directorOut" }, to: { nodeId: "video", port: "directorIn" } });
  assert.match(compile('Set "Video Model" duration to 10s', state).error, /controlled by a Director/);
  assert.equal(compile('Rename "Video Model" to "Final"', state).route, "local");
  assert.equal(myNewtSettings({}).localOnly, false);
  assert.equal(myNewtSettings({ localOnly: true }).localOnly, true);
});

const makeWorkflow = (id) => buildMyNewtLocalWorkflow(id, { catalog, createData: (type, label) => ({ title: label, status: "ready" }), nodeWidth: (node) => node.type === "skillDirector" ? 1200 : 500 });
test("workflow templates insert full connected layouts with fresh IDs and no overlap or generation", () => {
  for (const workflow of myNewtLocalWorkflows) {
    const built = makeWorkflow(workflow.id);
    assert.equal(built.nodes.length, workflow.types.length); assert.equal(built.edges.length, workflow.inputs.length);
    assert.equal(built.nodes.at(-1).data.previewTab, "layout");
    assert.ok(built.nodes.every((node) => node.data.status === "ready"));
    const offset = newtPresetOffset(built, [{ left: 0, right: 7000, top: 0, bottom: 2000 }]);
    const inserted = instantiateNewtPreset(built, offset);
    assert.ok(inserted.nodes.every((node) => node.x > 7000));
    if (inserted.nodes[1]) assert.ok(inserted.nodes[1].x - inserted.nodes[0].x >= (workflow.types[0] === "skillDirector" ? 1300 : 600));
    const expected = graph(), state = { ...expected, nodes: [...expected.nodes, ...inserted.nodes], edges: inserted.edges };
    const result = { createdIds: inserted.nodes.map((node) => node.id) };
    const action = { operation: "workflow", payload: { workflowId: workflow.id } };
    assert.equal(verifyMyNewtLocalResult(action, result, state, expected).length, workflow.types.length);
    if (workflow.inputs.length) assert.throws(() => verifyMyNewtLocalResult(action, result, { ...state, edges: [] }, expected), /connection/);
  }
});

const wait = async (service) => { for (let i = 0; i < 400; i++) { if (!service.loops.size) return; await new Promise((resolve) => setTimeout(resolve, 2)); } throw new Error("Task did not settle"); };
function assetGraph() {
  const state = graph(); state.projectName = "Original";
  state.nodes.push(...[
    ["emma", "character", "Emma"], ["park", "image", "Park"], ["book", "image", "Book"], ["look", "transfer", "Look"], ["music", "audio", "Song"]
  ].map(([id, type, title]) => ({ id, type, x: 0, y: 0, data: { title, url: `/uploads/${id}.png`, status: "complete" } })));
  state.edges = state.nodes.slice(4).map((node) => ({ from: { nodeId: node.id, port: catalog.find((item) => item.type === node.type).ports.output[0].id }, to: { nodeId: "newt", port: "imageIn" } }));
  return state;
}

test("hidden project commands and asset inventories require no LLM or existing-node edits", () => {
  for (const brief of ["Save", "Save my project", "Could you please save my work!"]) assert.equal(compile(brief, graph(), {}).action.operation, "save-project");
  const rename = compile('Rename project to "Summer Campaign"', graph(), {});
  assert.equal(rename.action.operation, "rename-project"); assert.equal(rename.action.payload.name, "Summer Campaign");
  assert.equal(compile("Rename project to X and generate video").route, "blocked");
  for (const brief of ["List attached assets", "What's connected?", "List presets", "List nodes"]) assert.equal(compile(brief, assetGraph()).action.operation, "report");
  assert.match(compile("List attached assets", assetGraph()).summary, /Emma.*Park.*Book.*Look.*Song/);
  assert.equal(compile("Save and render").route, "ai");
  assert.throws(() => verifyMyNewtLocalResult({ operation: "save-project" }, { saved: false }, graph(), graph()), /save did not complete/);
  assert.throws(() => verifyMyNewtLocalResult(rename.action, { renamed: true }, graph(), graph()), /name was not updated/);
});

test("attached assets retain explicit roles and are never silently discarded", () => {
  const state = assetGraph();
  const result = compile("Set up Director workflow using @Emma as character, @Park as location, @Book as prop, @Look as mood board", state);
  assert.equal(result.route, "local");
  assert.deepEqual(result.action.payload.bindings.map((binding) => binding.port), ["characterIn", "locationIn", "imageIn", "styleIn"]);
  assert.equal(compile("Set up Director workflow using attached images", state).route, "blocked");
  assert.equal(compile("Set up Coverage using attached images", state).route, "blocked");
  assert.equal(compile("Set up image workflow using @Song", state).route, "blocked");
  assert.equal(compile("Set up music video workflow using @Emma, @Song", state).route, "local");
  assert.equal(compile("Set up music video workflow using @Emma", state).route, "blocked");
  assert.equal(compile("Set up Coverage using @Park and generate it", state).route, "blocked");
  assert.equal(compile('Set up Coverage using "Park" "', state).route, "blocked");
  assert.equal(compile('Set up Coverage using @Park,', state).route, "blocked");
  state.nodes.find((node) => node.id === "park").data.title = "Black and White, Original";
  assert.equal(localAssetChoices(state, '"Black and White, Original" as location and @Book as prop').length, 2);
  const snapshot = myNewtSnapshot(state);
  assert.equal(compile("Set up Coverage using @Book", snapshot).route, "local");
});

test("each-image workflows and previews wire all named sources and verify the result", () => {
  const state = assetGraph();
  for (const brief of ["Set up Coverage for each attached image", "Preview attached images in a Preview", "Set up image edit workflow using @Park", "Set up music video workflow using @Song and @Emma"]) {
    const compiled = compile(brief, state); assert.equal(compiled.route, "local", compiled.error);
    const p = compiled.action.payload;
    const built = buildMyNewtLocalWorkflow(p.workflowId, { catalog, createData: (_, title) => ({ title }), nodeWidth: () => 500, sourceNodes: state.nodes, ...p });
    const completed = { ...state, nodes: [...state.nodes, ...built.nodes], edges: [...state.edges, ...built.edges, ...built.externalEdges] };
    const result = { createdIds: built.nodes.map((node) => node.id) };
    assert.equal(new Set(completed.nodes.map((node) => node.data?.title).filter(Boolean)).size, completed.nodes.filter((node) => node.data?.title).length);
    assert.equal(verifyMyNewtLocalResult(compiled.action, result, completed, state).length, built.nodes.length);
    assert.throws(() => verifyMyNewtLocalResult(compiled.action, result, { ...completed, edges: completed.edges.filter((edge) => edge !== built.externalEdges[0]) }, state), /reference was not connected/);
    if (p.copies) { assert.equal(built.nodes.filter((node) => node.type === "coverage").length, 2); assert.equal(built.externalEdges.length, 2); }
    if (p.workflowId === "music-video") { assert.equal(built.nodes[0].data.skillApproach, "music-video"); assert.equal(built.nodes[0].data.skillDirectorAudioMode, "full"); }
  }
});

test("duplicates preserve outputs, internal references, external incoming edges, groups and unique names", () => {
  const state = assetGraph();
  state.nodes[1].data = { ...state.nodes[1].data, resultItems: [{ url: "/outputs/full.png" }], locked: true };
  state.edges.push({ from: { nodeId: "park", port: "imageOut" }, to: { nodeId: "image", port: "imagePromptIn" } }, { from: { nodeId: "image", port: "imageOut" }, to: { nodeId: "preview", port: "sourceIn" } });
  state.groups = [{ id: "group", name: "Campaign", nodeIds: ["image", "preview"], x: 0, y: 0, width: 2000, height: 1300 }];
  state.selectedNodeIds = ["newt", "image", "preview"];
  for (const brief of ['Duplicate 2 copies of group "Campaign"', "Copy selected nodes 2 times"]) {
    const compiled = compile(brief, state, {}); assert.equal(compiled.route, "local");
    const built = buildMyNewtDuplicateGraph(state, compiled.action.payload.nodeIds, 2);
    assert.equal(built.nodes.length, 4); assert.equal(built.edges.length, 2); assert.equal(built.externalEdges.length, 2); assert.equal(built.groups.length, 2);
    assert.equal(new Set([...state.groups, ...built.groups].map((group) => group.name)).size, 3);
    assert.ok(built.groups[1].x > built.groups[0].x + built.groups[0].width);
    assert.equal(new Set(built.nodes.map((node) => node.data.title)).size, 4);
    assert.deepEqual(built.nodes[0].data.resultItems, state.nodes[1].data.resultItems);
    assert.equal(built.nodes[0].data.locked, true);
    assert.equal(verifyMyNewtLocalResult(compiled.action, { createdIds: built.nodes.map((node) => node.id) }, { ...state, nodes: [...state.nodes, ...built.nodes], edges: [...state.edges, ...built.edges, ...built.externalEdges] }, state).length, 4);
  }
  assert.equal(compile('Duplicate "My Newt"', state).route, "blocked");
  assert.equal(compile('Duplicate 99 copies of "Image Model"', state).route, "blocked");
  state.nodes[1].data.status = "generating";
  assert.equal(compile('Duplicate "Image Model"', state).route, "blocked");
});

test("planned source changes are detected even in compact action snapshots", () => {
  const state = myNewtSnapshot(assetGraph());
  const action = compile("Set up Coverage using @Park", state).action;
  const compact = structuredClone(myNewtActionSnapshot(state, action));
  assert.equal(compact.nodes.length, 1);
  assert.equal(myNewtLocalActionSignature(compact, action), myNewtLocalActionSignature(state, action));
  state.nodes.find((node) => node.id === "park").data.url = "/uploads/replacement.png";
  assert.notEqual(myNewtLocalActionSignature(compact, action), myNewtLocalActionSignature(state, action));
});

test("attached Storyboard frames retain their precise output ports and detach invalidates a plan", () => {
  const state = assetGraph();
  state.nodes.push({ id: "boards", type: "storyboard", data: { title: "Boards", storyboardFrames: [{ id: "one", resultUrl: "/outputs/one.png" }, { id: "two", resultUrl: "/outputs/two.png" }] } });
  state.edges = ["one", "two"].map((id) => ({ from: { nodeId: "boards", port: `frameOut:${id}` }, to: { nodeId: "newt", port: "imageIn" } }));
  const action = compile("Set up Coverage for each attached image", state).action;
  assert.equal(action.payload.copies.length, 2);
  const raw = buildMyNewtLocalWorkflow("coverage", { ...action.payload, catalog, sourceNodes: state.nodes, createData: (_, title) => ({ title }), nodeWidth: () => 500 });
  assert.deepEqual(raw.externalEdges.map((edge) => edge.from.port), ["frameOut:one", "frameOut:two"]);
  const compact = structuredClone(myNewtActionSnapshot(state, action));
  assert.equal(myNewtLocalActionSignature(compact, action), myNewtLocalActionSignature(state, action));
  state.edges.pop();
  assert.notEqual(myNewtLocalActionSignature(compact, action), myNewtLocalActionSignature(state, action));
});

async function fixture(t, settings = {}, brief = 'Set "Image Model" resolution to 2K', state = graph()) {
  const directory = await mkdtemp(path.join(tmpdir(), "my-newt-local-"));
  const calls = { key: 0, model: 0, relay: 0, usage: 0 };
  const dependencies = { directory, getKey: () => { calls.key++; return ""; }, invoke: async () => { calls.model++; throw new Error("No paid reasoning expected"); }, relay: async () => { calls.relay++; throw new Error("No paid generation expected"); }, recordUsage: async () => { calls.usage++; } };
  const service = new MyNewtService(dependencies); await service.ready;
  t.after(async () => { await wait(service); await Promise.all([...service.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  const started = await service.start({ ...owner, brief, executionRoute: "local", settings: { allowExisting: true, ...settings }, snapshot: state, checkpoint: { name: "Before local edit", graph: state } });
  await wait(service);
  return { service, job: service.jobs.get(started.id), calls, dependencies };
}

test("local tasks work without any API key, honor plan approval, persist history and cost exactly zero", async (t) => {
  const { service, job, calls } = await fixture(t);
  assert.equal(job.status, "plan-approval"); assert.equal(job.pending, null);
  await service.control(job.id, { ...owner, action: "resume" }); await wait(service);
  assert.equal(job.status, "plan-approval");
  await service.control(job.id, { ...owner, action: "approve-plan" }); await wait(service);
  const action = job.pending;
  assert.equal(action.operation, "update");
  assert.ok(await service.claim(job.id, { ...owner, actionId: action.id, clientId: "editor" }));
  const state = graph(); state.nodes[1].data.resolution = "2K";
  await service.complete(job.id, { ...owner, actionId: action.id, clientId: "editor", snapshot: state, result: { updatedId: "image" } }); await wait(service);
  assert.equal(job.status, "complete"); assert.equal(job.spent, 0); assert.deepEqual(job.reservations, {});
  assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
  assert.equal(service.public(job).execution, "local"); assert.equal((await service.history(owner)).length, 1);
  assert.match(job.message, /\$0.00/);
  const recovered = await service.recover(job.id, owner); assert.equal(recovered.checkpoint.name, "Before local edit");
});

test("unsupported requests and changed routes cannot silently become paid tasks", async (t) => {
  const { service, calls } = await fixture(t, {}, "Set up image workflow");
  await service.control([...service.jobs.keys()][0], { ...owner, action: "stop" });
  await assert.rejects(service.start({ ...owner, brief: "Make a lovely film", settings: { localOnly: true }, snapshot: graph() }), /No exact local shortcut/);
  await assert.rejects(service.start({ ...owner, brief: "Make a lovely film", executionRoute: "local", snapshot: graph() }), /route changed/);
  assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
});

test("failed or stale local edits pause instead of retrying or calling AI", async (t) => {
  for (const reason of ["failure", "changed", "note", "permissions"]) {
    await t.test(reason, async (t) => {
      const { service, job, calls } = await fixture(t, { approvePlan: false });
      const action = job.pending;
      if (reason === "failure") {
        await service.claim(job.id, { ...owner, actionId: action.id, clientId: "editor" });
        await service.complete(job.id, { ...owner, actionId: action.id, clientId: "editor", snapshot: graph(), result: { error: "Locked node" } });
      } else if (reason === "changed") {
        const state = graph(); state.nodes[1].data.resolution = "4K";
        await service.sync(job.id, { ...owner, snapshot: state });
      } else if (reason === "note") await service.control(job.id, { ...owner, action: "note", note: "Actually generate a poster" });
      else await service.control(job.id, { ...owner, action: "settings", settings: { allowExisting: false } });
      await wait(service);
      assert.equal(job.pending, null); assert.ok(["waiting", "paused"].includes(job.status));
      await service.control(job.id, { ...owner, action: "resume" }); await wait(service);
      assert.equal(job.status, "paused"); assert.equal(job.pending, null);
      assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
    });
  }
});

test("missing results fail verification and interrupted local actions are not replayed after restart", async (t) => {
  const { service, job, calls, dependencies } = await fixture(t, { approvePlan: false });
  const action = job.pending;
  await service.claim(job.id, { ...owner, actionId: action.id, clientId: "editor" });
  const restarted = new MyNewtService(dependencies); await restarted.ready;
  assert.equal(restarted.jobs.get(job.id).pending.interrupted, true);
  await restarted.control(job.id, { ...owner, action: "resume" }); await wait(restarted);
  assert.equal(restarted.jobs.get(job.id).status, "paused"); assert.equal(restarted.jobs.get(job.id).pending, null);
  await service.complete(job.id, { ...owner, actionId: action.id, clientId: "editor", snapshot: graph(), result: { updatedId: "image" } }); await wait(service);
  assert.equal(job.status, "paused"); assert.match(job.message, /not applied/);
  assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
});

test("even a claimed local action cannot use the generation relay", async (t) => {
  const { service, job, calls } = await fixture(t, { approvePlan: false });
  const action = job.pending;
  await service.claim(job.id, { ...owner, actionId: action.id, clientId: "editor" });
  await assert.rejects(service.request(job.id, { ...owner, actionId: action.id, clientId: "editor", sequence: 1, route: "/api/node/generate-image", body: { nodeId: "image" } }), /Paid requests are disabled/);
  assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
});

test("project save, rename, reports and asset recipes complete through the real service for zero cost", async (t) => {
  for (const brief of ["Save", 'Rename project to "Campaign"', "List attached assets", "Set up Coverage for each attached image", 'Duplicate "Image Model"']) {
    await t.test(brief, async (t) => {
      const state = assetGraph();
      const { service, job, calls } = await fixture(t, { approvePlan: false }, brief, state);
      const action = await service.claim(job.id, { ...owner, actionId: job.pending.id, clientId: "editor" });
      let result;
      if (action.operation === "save-project") result = { saved: true };
      else if (action.operation === "rename-project") { state.projectName = action.payload.name; result = { renamed: true }; }
      else if (action.operation === "report") result = { reported: true };
      else {
        const p = action.payload;
        const inserted = action.operation === "duplicate" ? buildMyNewtDuplicateGraph(state, p.nodeIds, p.count) : buildMyNewtLocalWorkflow(p.workflowId, { catalog, createData: (_, title) => ({ title }), nodeWidth: () => 500, sourceNodes: state.nodes, ...p });
        state.nodes.push(...inserted.nodes); state.edges.push(...inserted.edges, ...inserted.externalEdges);
        result = { createdIds: inserted.nodes.map((node) => node.id) };
      }
      await service.complete(job.id, { ...owner, actionId: action.id, clientId: "editor", snapshot: state, result }); await wait(service);
      assert.equal(job.status, "complete", job.message); assert.equal(job.spent, 0);
      assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
      if (action.operation === "report") assert.match(job.message, /Emma.*Park/);
      if (action.operation === "save-project") assert.match(job.message, /Project saved/);
    });
  }
});

test("a replaced source invalidates the planned asset workflow on the server", async (t) => {
  const state = assetGraph();
  const { service, job, calls } = await fixture(t, { approvePlan: false }, "Set up Coverage using @Park", state);
  const changed = structuredClone(state); changed.nodes.find((node) => node.id === "park").data.url = "/uploads/another.png";
  await service.sync(job.id, { ...owner, snapshot: changed }); await wait(service);
  assert.equal(job.pending, null); assert.equal(job.status, "waiting");
  assert.deepEqual(calls, { key: 0, model: 0, relay: 0, usage: 0 });
});

test("literal text and audio settings remain exact and honor locks", () => {
  assert.deepEqual(compile('Set "Image Model" prompt to "A quiet park"').action.payload.patch, { prompt: "A quiet park" });
  assert.deepEqual(compile('Set "Video Model" audio to off').action.payload.patch, { generateAudio: false });
  assert.deepEqual(compile('Set "Video Model" audio to on').action.payload.patch, { generateAudio: true });
  assert.equal(compile('Set "Image Model" prompt to "A park" and generate it').route, "ai");
  assert.equal(compile('Set "Preview" prompt to "A park"').route, "blocked");
});
