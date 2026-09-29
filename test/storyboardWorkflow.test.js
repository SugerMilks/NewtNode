import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { storyboardFrameWithVersion, restoreStoryboardFrameVersion, storyboardBoardSignature, storyboardEditSignature, validateStoryboardRevision, storyboardRevisionTargets, storyboardPlanStructureIssues, storyboardFrameDirection, applyStoryboardCastRepair } from "../src/storyboardWorkflow.js";
import { storyboardPlannedCastPatch, resolveStoryboardFrameCast } from "../src/storyboardCast.js";
import { migrateStoryboardDirectors } from "../src/storyboardMigration.js";
import { registerStoryboardRoutes } from "../server/routes/storyboard.js";
import { validateCreativeResponse, openAiLlmBody, falLlmInput, creativeSchemas } from "../server/creative-llm.js";

function frame(number = 1, patch = {}) {
  const present = patch.cast?.length ? ["Lisa", "Sara"].map(tag => ({ tag, place: `${tag}'s seat` })) : [];
  const spatial = { spaceId: present.length ? "table" : "door", cameraSetupId: `camera-${number}`, view: "Camera south of axis; frame the specified subject and exclude the opposing seat for singles.", visiblePlaces: present.filter(member => patch.shot !== "CU" || member.tag === "Lisa").map(member => member.place), present, hidden: [], blockingChange: "" };
  return { id: `f${number}`, number, shotId: `s${number}`, phase: "single", purpose: "Reveal the empty doorway", beat: "Door opens", prompt: `Panel ${number}: the empty doorway opens.`, notes: "", shot: "WS", lens: "35mm", angle: "None", durationSeconds: 3, stateBefore: "Door closed", stateAfter: "Door open", cameraSide: "South of axis", cast: [], spatial, ...patch };
}
const continuity = { geography: "Door in north wall", axis: "North-south", lighting: "From east", props: [] };
const plan = () => ({ sceneTitle: "Door", analysis: "The doorway reveals the next action", continuity, frames: [frame()] });

test("revision scope rejects empty, duplicate, missing, protected and excessive selections", () => {
  const frames = Array.from({ length: 10 }, (_, i) => frame(i + 1));
  for (const ids of [[], ["f1", "f1"], ["missing"], frames.map(item => item.id)]) assert.throws(() => storyboardRevisionTargets(frames, ids));
  assert.throws(() => storyboardRevisionTargets([frame(1, { protected: true })], ["f1"]), /Unprotect/);
});

test("a selected revision preserves identity, numbering and unrelated panels", () => {
  const frames = [frame(), frame(2)];
  const before = structuredClone(frames);
  const revised = validateStoryboardRevision({ frames: [frame(2, { shot: "CU", prompt: "Closer on the opening door" })], affectedFrameIds: ["f1"] }, frames, ["f2"]);
  assert.equal(revised[0].id, "f2");
  assert.equal(revised[0].shot, "CU");
  assert.deepEqual(frames, before);
  for (const invalid of [[frame()], [frame(2), frame()], [frame(1, { id: "f2" })]]) assert.throws(() => validateStoryboardRevision({ frames: invalid }, frames, ["f2"]));
});

test("continuous-shot keyframes are validated independently of frame count", () => {
  assert.deepEqual(storyboardPlanStructureIssues([frame()]), []);
  const shot = [frame(1, { shotId: "s1", phase: "opening" }), frame(2, { shotId: "s1", phase: "ending" })];
  assert.deepEqual(storyboardPlanStructureIssues(shot), []);
  assert.ok(storyboardPlanStructureIssues([shot[0], frame(3), shot[1]]).length);
  assert.ok(storyboardPlanStructureIssues([shot[0]]).length);
});

test("saved versions retain original image directions, are bounded, and restore without losing the current version", () => {
  let current = frame(1, { resultUrl: "/outputs/old.png", generatedDirection: { prompt: "Original prompt" }, prompt: "Edited prompt" });
  current = storyboardFrameWithVersion(current, { resultUrl: "/outputs/new.png", prompt: "Revised", generatedDirection: { prompt: "Revised" } }, 1);
  assert.equal(current.versions[0].prompt, "Original prompt");
  const restored = restoreStoryboardFrameVersion(current, 0);
  assert.equal(restored.resultUrl, "/outputs/old.png");
  assert.equal(restored.versions.at(-1).resultUrl, "/outputs/new.png");
  assert.equal(restored.id, "f1");
  for (let i = 0; i < 12; i++) current = storyboardFrameWithVersion(current, { resultUrl: `/outputs/v${i}.png` }, i);
  assert.equal(current.versions.length, 8);
  assert.ok(current.versions.every(version => !Object.hasOwn(version, "versions")));
  assert.throws(() => restoreStoryboardFrameVersion({ ...current, protected: true }, 0), /Unprotect/);
});

test("queuing, errors and protection do not invalidate a compiled board; image and direction changes do", () => {
  const original = frame(1, { resultUrl: "/outputs/keep.png" });
  for (const patch of [{ status: "queued" }, { status: "error", error: "Provider failed" }, { protected: true }]) assert.equal(storyboardBoardSignature([original]), storyboardBoardSignature([{ ...original, ...patch }]));
  assert.notEqual(storyboardBoardSignature([original]), storyboardBoardSignature([{ ...original, prompt: "Changed" }]));
});

test("edit signatures catch changes to hidden blocking, protection and images, but ignore progress", () => {
  const original = frame();
  assert.equal(storyboardEditSignature([original]), storyboardEditSignature([{ ...original, status: "running", resultVersion: 2 }]));
  for (const patch of [{ protected: true }, { cast: [{ tag: "Changed" }] }, { resultUrl: "/outputs/new.png" }, { stateAfter: "Moved" }]) assert.notEqual(storyboardEditSignature([original]), storyboardEditSignature([{ ...original, ...patch }]));
});

test("legacy Director migration freezes scene, rewires active assets, preserves images and is idempotent", () => {
  const nodes = [{ id: "d", type: "skillDirector", data: { sceneName: "Inherited", sceneOverview: "Inherited scene" } }, { id: "b", type: "storyboard", data: { sceneDescription: "Old local text", storyboardFrames: [frame(1, { resultUrl: "/outputs/keep.png" })] } }, { id: "location", type: "image", data: {} }, { id: "unused", type: "image", data: {} }, { id: "text", type: "plainText", data: {} }];
  const edge = (id, from, to, port) => ({ id, from: { nodeId: from, port: "out" }, to: { nodeId: to, port } });
  const edges = [edge("control", "d", "b", "directorIn"), edge("asset", "location", "d", "locationIn"), edge("unused", "unused", "d", "imageIn"), edge("text", "text", "b", "sceneDescriptionIn")];
  const deps = { sceneText: node => node.data.sceneOverview, usesReference: (_director, node) => node.id === "location" };
  const migrated = migrateStoryboardDirectors(nodes, edges, deps);
  const board = migrated.nodes[1];
  assert.equal(board.data.sceneDescription, "Inherited scene");
  assert.equal(board.data.storyboardPlanSceneDescription, "Inherited scene");
  assert.equal(board.data.storyboardFrames[0].resultUrl, "/outputs/keep.png");
  assert.equal(board.data.storyboardLegacyDirector.originalSceneDescription, "Old local text");
  assert.deepEqual(migrated.edges.filter(item => item.to.nodeId === "b").map(item => [item.from.nodeId, item.to.port]), [["location", "sceneReferenceIn"]]);
  assert.deepEqual(migrateStoryboardDirectors(migrated.nodes, migrated.edges, deps), migrated);
  assert.equal(nodes[1].data.sceneDescription, "Old local text");
});

function routes(options = {}) {
  const handlers = new Map(), calls = [], history = [];
  let response = options.response || plan();
  const run = async request => {
    calls.push(request);
    const value = typeof response === "function" ? await response(request) : response;
    const result = { text: JSON.stringify(value), provider: "test", model: "mock", usage: {}, usages: [] };
    try { validateCreativeResponse({}, { route: request.route, provider: "test", text: result.text }); }
    catch (error) { error.llmResult = result; throw error; }
    return result;
  };
  registerStoryboardRoutes({ post: (url, handler) => handlers.set(url, handler) }, { runTextLlm: run, runMediaDescriptionLlm: run, recordHistory: async item => history.push(item), estimateCost: options.estimateCost || (() => ({ amountUsd: 0.01, currency: "USD" })), readLocalAsset: async () => ({ buffer: Buffer.from(options.assetBytes || "test"), mimeType: "image/png" }), connection: () => ({ provider: "test", credential: "test" }) });
  return { calls, history, setResponse: value => { response = value; }, async request(mode, patch = {}) {
    let code = 200, body;
    await handlers.get(`/api/node/storyboard-${mode}`)({ body: { nodeId: "board", sceneDescription: "The empty door opens.", frameCount: "Auto", ...patch } }, { status(value) { code = value; return this; }, json(value) { body = value; } });
    return { code, body };
  } };
}

test("new planning returns structured continuity and native Auto, while custom counts are exact", async () => {
  const api = routes();
  const result = await api.request("plan-v2");
  assert.equal(result.code, 200);
  assert.equal(result.body.plan.continuity.axis, continuity.axis);
  assert.match(result.body.plan.frames[0].id, /^frame-/);
  assert.match(api.calls[0].prompt, /do not default to six/);
  assert.equal(result.body.cost.amountUsd, 0.01);
  assert.equal(api.calls.length, 1);
  assert.equal((await api.request("plan-v2", { frameCount: 9 })).code, 400);
  assert.equal(api.history.length, 2);
  assert.equal(api.calls.length, 2);
});

const castCharacters = ["Lisa", "Sara"].map(tag => ({ tag, name: tag, url: `/outputs/${tag}.png` }));
const castMember = (tag, visibility = "visible") => ({ tag, visibility, position: visibility === "visible" ? "screen-right midground" : "outside frame left", action: "Listening", eyeline: "Toward the other speaker" });
const castRepairPatch = (frame, cast) => ({ number: frame.number, prompt: frame.prompt, beat: frame.beat, notes: frame.notes, cast,
  spatial: { ...frame.spatial, hidden: cast.filter(member => member.visibility === "offscreen").map(member => ({ tag: member.tag, reason: "outside-frame", explanation: "The opposing seat is beyond the left edge of this tight single." })) } });
function missingCastPlan() {
  const draft = plan();
  draft.frames = [frame(1), frame(2), frame(3),
    frame(4, { shot: "CU", prompt: "Close-up of @Lisa looking toward @Sara offscreen left.", beat: "@Lisa replies to @Sara.", cast: [castMember("Lisa")] }),
    frame(5, { shot: "MS", prompt: "Over @Lisa's screen-left foreground shoulder toward @Sara in screen-right midground.", beat: "@Sara responds to @Lisa.", cast: [castMember("Sara")] })];
  return draft;
}
function castRepair(draft = missingCastPlan()) {
  return { frames: [castRepairPatch(draft.frames[3], [castMember("Lisa"), castMember("Sara", "offscreen")]),
    castRepairPatch(draft.frames[4], [castMember("Sara"), { ...castMember("Lisa"), position: "screen-left foreground shoulder" }])] };
}

test("planner automatically resolves the reported Sara/Lisa omissions in one targeted text pass", async () => {
  const draft = missingCastPlan(), before = structuredClone(draft);
  const api = routes({ response: request => request.route === "storyboard-cast-repair" ? castRepair(draft) : draft });
  const result = await api.request("plan-v2", { characters: castCharacters, sceneDescription: "@Lisa and @Sara speak across a table; close-up then over-the-shoulder coverage." });
  assert.equal(result.code, 200);
  assert.equal(result.body.error, undefined);
  assert.deepEqual(api.calls.map(call => call.route), ["storyboard-plan-v2", "storyboard-cast-repair"]);
  assert.match(api.calls[1].prompt, /Frame 4: specify whether @Sara/);
  assert.match(api.calls[1].prompt, /Frame 5: specify whether @Lisa/);
  assert.match(api.calls[1].prompt, /Reference observations/);
  assert.match(api.calls[1].systemPrompt, /Own routine directing decisions/);
  assert.equal(api.calls[1].reasoningEffort, "high");
  assert.equal(api.calls[1].inputs, undefined);
  assert.equal(result.body.cost.amountUsd, 0.02);
  assert.equal(api.history.length, 2);
  assert.deepEqual(draft, before);
  const repaired = result.body.plan.frames;
  const visible = index => resolveStoryboardFrameCast({ ...repaired[index], ...storyboardPlannedCastPatch(repaired[index]) }, castCharacters).references.map(item => item.tag);
  assert.deepEqual(visible(3), ["Lisa"]);
  assert.deepEqual(visible(4), ["Sara", "Lisa"]);
  for (const key of ["number", "shot", "lens", "angle", "shotId", "phase", "durationSeconds", "stateBefore", "stateAfter", "cameraSide"]) assert.deepEqual(repaired.map(frame => frame[key]), before.frames.map(frame => frame[key]));
  assert.deepEqual(repaired.slice(0, 3).map(({ id, ...rest }) => rest), before.frames.slice(0, 3).map(({ id, ...rest }) => rest));
});

test("cast repair only merges permitted staging fields and leaves the original draft untouched", () => {
  const draft = missingCastPlan(), before = structuredClone(draft);
  const repair = castRepair(draft);
  Object.assign(repair.frames[0], { id: "wrong", number: 4, shot: "EWS", durationSeconds: 99, resultUrl: "/outputs/wrong.png", protected: false });
  const fixed = applyStoryboardCastRepair(draft, repair, castCharacters);
  assert.deepEqual(draft, before);
  assert.equal(fixed.frames[0], draft.frames[0]);
  assert.equal(fixed.frames[3].id, "f4");
  assert.equal(fixed.frames[3].shot, "CU");
  assert.equal(fixed.frames[3].durationSeconds, 3);
  assert.equal(fixed.frames[3].resultUrl, undefined);
  assert.equal(fixed.frames[3].protected, undefined);
  assert.deepEqual(applyStoryboardCastRepair(draft, castRepair(draft), castCharacters.map(character => ({ ...character, tag: `@${character.tag}` }))), applyStoryboardCastRepair(draft, castRepair(draft), castCharacters));
});

test("cast repair shares strict response validation across the reasoning provider adapters", () => {
  const route = "storyboard-cast-repair";
  const openAi = openAiLlmBody({ model: "gpt-6-astra", route, prompt: "Repair staging", reasoningEffort: "high", responseMimeType: "application/json" });
  assert.equal(openAi.text.format.strict, true);
  assert.deepEqual(openAi.text.format.schema, creativeSchemas[route]);
  assert.equal(openAi.reasoning.effort, "high");
  assert.equal(openAi.max_output_tokens, 24000);
  const fal = falLlmInput({ model: "openai/gpt-6-astra", route, prompt: "Repair staging" });
  assert.equal(fal.reasoning, true);
  assert.equal(fal.max_tokens, openAi.max_output_tokens);
  assert.deepEqual(validateCreativeResponse({}, { route, provider: "test", text: JSON.stringify(castRepair()) }), castRepair());
});

test("selected revision cast correction keeps neighbors/protected boards and selected image context intact", async () => {
  const original = missingCastPlan().frames.map((item, i) => ({ ...item, resultUrl: `/outputs/original-${i}.png`, protected: i !== 3 }));
  const before = structuredClone(original);
  const revised = { ...frame(4, { ...original[3], prompt: "Close on @Lisa listening to @Sara offscreen.", cast: [castMember("Lisa")] }) };
  const direction = storyboardFrameDirection(revised);
  const api = routes({ response: request => request.route === "storyboard-cast-repair"
    ? { frames: [castRepairPatch(direction, [castMember("Lisa"), castMember("Sara", "offscreen")])] }
    : { summary: "Focus on listening", frames: [direction], affectedFrameIds: [], warnings: [] } });
  const result = await api.request("revise", { frames: original, frameIds: ["f4"], characters: castCharacters, instruction: "Focus on Lisa listening; keep Sara offscreen.", continuity });
  assert.equal(result.code, 200);
  assert.deepEqual(result.body.revision.frames.map(frame => frame.id), ["f4"]);
  assert.equal(result.body.revision.frames[0].cast[1].visibility, "offscreen");
  assert.match(api.calls[1].prompt, /Focus on Lisa listening; keep Sara offscreen/);
  assert.match(api.calls[1].prompt, /All panels \(unselected are read-only\)/);
  assert.deepEqual(api.calls[1].inputs, api.calls[0].inputs);
  assert.deepEqual(api.calls[1].inputs.map(item => item.url), ["/outputs/original-3.png"]);
  assert.deepEqual(original, before);
  assert.deepEqual(result.body.revision.warnings, []);
  assert.equal(result.body.cost.amountUsd, 0.02);
});

for (const invalid of ["unresolved", "missing", "extra", "duplicate", "unknown", "camera change", "erased mention"]) {
  test(`cast correction rejects ${invalid} results without another retry or partial success`, async () => {
    const draft = missingCastPlan();
    const repair = castRepair(draft);
    if (invalid === "unresolved") repair.frames[0].cast = [castMember("Lisa")];
    if (invalid === "missing") repair.frames.pop();
    if (invalid === "extra") repair.frames.push(castRepairPatch(draft.frames[0], []));
    if (invalid === "duplicate") repair.frames[1] = repair.frames[0];
    if (invalid === "unknown") repair.frames[0].cast.push(castMember("Unknown", "offscreen"));
    if (invalid === "camera change") repair.frames[0].shot = "WS";
    if (invalid === "erased mention") repair.frames[0] = { number: 4, prompt: "Close-up of @Lisa.", beat: "@Lisa replies.", notes: "", cast: [castMember("Lisa")] };
    const api = routes({ response: request => request.route === "storyboard-cast-repair" ? repair : draft });
    const result = await api.request("plan-v2", { characters: castCharacters });
    assert.equal(result.code, 400);
    assert.equal(result.body.plan, undefined);
    assert.match(result.body.error, /preserved/);
    assert.equal(api.calls.length, 2);
    assert.equal(api.history.length, 2);
    assert.ok(api.history[1].error);
    assert.equal(result.body.cost.amountUsd, 0.02);
  });
}

test("cast repair provider failure is not replayed and unknown usage stays unknown", async () => {
  const api = routes({ estimateCost: () => ({ amountUsd: null, currency: "USD" }), response: request => {
    if (request.route === "storyboard-cast-repair") {
      const error = new Error("Provider unavailable");
      error.llmResult = { text: "", provider: "test", usage: {} };
      throw error;
    }
    return missingCastPlan();
  } });
  const result = await api.request("plan-v2", { characters: castCharacters });
  assert.equal(result.code, 400);
  assert.match(result.body.error, /Provider unavailable/);
  assert.equal(api.calls.length, 2);
  assert.equal(api.history.length, 2);
  assert.equal(result.body.cost.amountUsd, null);
});

test("the running-task guard remains held during automatic cast correction", async () => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const api = routes({ response: async request => {
    if (request.route !== "storyboard-cast-repair") return missingCastPlan();
    began();
    await pending;
    return castRepair();
  } });
  const first = api.request("plan-v2", { characters: castCharacters });
  try {
    await started;
    assert.equal((await api.request("plan-v2", { characters: castCharacters })).code, 409);
  } finally { release(); }
  assert.equal((await first).code, 200);
  assert.equal(api.calls.length, 2);
});

test("cached reference analysis is reused and its charge is not counted twice", async () => {
  const api = routes({ response: request => request.route === "storyboard-reference-analysis" ? { assets: [{ tag: "Room", description: "Door in north wall" }] } : plan() });
  const refs = { locations: [{ tag: "Room", label: "Room", url: "/uploads/room.png" }] };
  const first = await api.request("plan-v2", refs), second = await api.request("plan-v2", refs);
  assert.equal(first.code, 200);
  assert.equal(first.body.cost.amountUsd, 0.02);
  assert.equal(second.body.cost.amountUsd, 0.01);
  assert.equal(api.calls.filter(call => call.route === "storyboard-reference-analysis").length, 1);
  assert.equal(api.history.length, 3);
});

test("protected, invalid and missing revision selections never reach an LLM", async () => {
  const api = routes();
  for (const frameIds of [[], ["missing"], ["f1"]]) {
    const result = await api.request("revise", { frames: [frame(1, { protected: true })], frameIds, instruction: "Closer" });
    assert.equal(result.code, 400);
  }
  assert.equal(api.calls.length, 0);
});

test("revision sends selected images as preservation references and rejects attempts to change other panels", async () => {
  const api = routes({ response: { summary: "Closer", frames: [frame(2, { shot: "CU" })], affectedFrameIds: ["f1"], warnings: ["Check previous eyeline"] } });
  const frames = [frame(), frame(2, { resultUrl: "/outputs/current.png" })];
  const before = structuredClone(frames);
  const result = await api.request("revise", { frames, frameIds: ["f2"], instruction: "Closer" });
  assert.equal(result.code, 200);
  assert.deepEqual(api.calls[0].inputs.map(item => item.url), ["/outputs/current.png"]);
  assert.deepEqual(frames, before);
  api.setResponse({ summary: "Wrong target", frames: [frame()], affectedFrameIds: [], warnings: [] });
  assert.equal((await api.request("revise", { frames, frameIds: ["f2"], instruction: "Closer" })).code, 400);
  assert.equal(api.history.length, 2);
});

test("sequence review is advisory and never invents panel IDs or claims unseen images were reviewed", async () => {
  const api = routes({ response: { summary: "Direction review", issues: [{ frameIds: ["f1"], severity: "minor", message: "Clarify action" }] } });
  assert.equal((await api.request("review", { frames: [frame()] })).code, 200);
  assert.match(api.calls[0].prompt, /review written directions only/);
  api.setResponse({ summary: "Bad review", issues: [{ frameIds: ["missing"], severity: "major", message: "Not a real frame" }] });
  assert.equal((await api.request("review", { frames: [frame()] })).code, 400);
});

test("invalid provider output is charged once and does not become a fallback plan", async () => {
  const api = routes({ response: { frames: [] } });
  const result = await api.request("plan-v2");
  assert.equal(result.code, 400);
  assert.match(result.body.error, /preserved/);
  assert.equal(result.body.plan, undefined);
  assert.equal(api.history.length, 1);
  assert.equal(result.body.cost.amountUsd, 0.01);
});

test("the actual frame-state writer preserves board outputs on queue/failure and clears them on successful replacement", async () => {
  const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("  function updateStoryboardNodeFrames("), source.indexOf("  function patchStoryboardFrame("));
  const ref = { current: [{ id: "board", data: { storyboardFrames: [frame(1, { resultUrl: "/outputs/old.png" })], storyboardBoardUrl: "/outputs/board.png" } }] };
  const deps = { nodesRef: ref, normalizedStoryboardFrames: value => value, storyboardBoardSignature, clearStoryboardBoardPatch: () => ({ storyboardBoardUrl: "" }), storyboardResultItems: frames => frames.map(frame => ({ url: frame.resultUrl })), syncConnectedPreviewNodes: nodes => nodes, edgesRef: { current: [] }, setNodes: () => {} };
  const update = new Function(...Object.keys(deps), `${body};return updateStoryboardNodeFrames;`)(...Object.values(deps));
  update("board", frames => frames.map(frame => ({ ...frame, status: "queued" })));
  assert.equal(ref.current[0].data.storyboardBoardUrl, "/outputs/board.png");
  update("board", frames => frames.map(frame => ({ ...frame, status: "error", error: "Provider failed" })));
  assert.equal(ref.current[0].data.storyboardBoardUrl, "/outputs/board.png");
  update("board", frames => frames.map(frame => ({ ...frame, resultUrl: "/outputs/new.png" })));
  assert.equal(ref.current[0].data.storyboardBoardUrl, "");
});
