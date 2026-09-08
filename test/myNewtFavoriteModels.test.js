import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as models from "../src/modelOptions.js";
import { isSeedance25Model } from "../src/seedance25.js";
import { isMiniMaxH3Model } from "../src/minimaxH3.js";
import { myNewtSettings, myNewtDefaults, myNewtSnapshot } from "../src/myNewt/contract.js";
import { normalizeMyNewtFavoriteModels, myNewtFavoriteCreationPatch } from "../src/myNewt/favoriteModels.js";
import { buildMyNewtLocalWorkflow, myNewtLocalAction } from "../src/myNewt/localActions.js";
import { instantiateNewtPreset } from "../src/myNewt/presets.js";
import { buildMyNewtDuplicateGraph } from "../src/myNewt/localCopies.js";
import { MyNewtService } from "../server/my-newt.js";

const favorites = { favoriteImageModel: "Nano Banana Pro", favoriteVideoModel: "Kling O3 Pro" };
const catalog = [
  { type: "imageModel", options: { model: models.imageModelOptions }, ports: { input: [{ id: "promptIn" }], output: [{ id: "imageOut" }] } },
  { type: "videoModel", options: { model: models.videoModelOptions }, ports: { input: [{ id: "promptIn" }, { id: "directorIn" }], output: [{ id: "videoOut" }] } },
  { type: "coverage", options: { model: ["OpenAI Image 2", "Nano Banana Pro", "REVE 2.1"] } },
  { type: "character", options: { characterSheetModel: ["Nano Banana 2", "Nano Banana Pro", "OpenAI Image 2"] } },
  { type: "skillDirector", options: { skillVideoModel: models.videoModelOptions }, ports: { input: [], output: [{ id: "directorOut" }] } },
  { type: "plainText", ports: { input: [], output: [{ id: "promptOut" }] } },
  { type: "preview", ports: { input: [{ id: "sourceIn" }], output: [] } }
].map((item) => ({ ...item, label: item.type }));

test("favorite models are optional, normalized, and retained with other saved settings", () => {
  assert.equal(myNewtDefaults.favoriteImageModel, ""); assert.equal(myNewtDefaults.favoriteVideoModel, "");
  assert.deepEqual(normalizeMyNewtFavoriteModels(), { favoriteImageModel: "", favoriteVideoModel: "" });
  for (const value of [null, 1, {}, "unknown", "Seedream 5.0 Pro", "Luma Dream Machine"]) {
    assert.deepEqual(normalizeMyNewtFavoriteModels({ favoriteImageModel: value, favoriteVideoModel: value }), { favoriteImageModel: "", favoriteVideoModel: "" });
  }
  const saved = myNewtSettings(JSON.parse(JSON.stringify({ ...favorites, autoReview: true, budget: 20, allowImages: true })));
  assert.equal(saved.favoriteImageModel, favorites.favoriteImageModel); assert.equal(saved.favoriteVideoModel, favorites.favoriteVideoModel);
  assert.equal(saved.autoReview, true); assert.equal(saved.budget, 20); assert.equal(saved.allowImages, true);
  assert.equal(myNewtSettings({ ...saved, favoriteImageModel: "" }).favoriteImageModel, "");
});

test("favorites apply only to supported fresh node choices and explicit models win", () => {
  for (const type of ["imageModel", "coverage", "character", "videoModel", "skillDirector"]) {
    const field = type === "character" ? "characterSheetModel" : type === "skillDirector" ? "skillVideoModel" : "model";
    const model = ["videoModel", "skillDirector"].includes(type) ? favorites.favoriteVideoModel : favorites.favoriteImageModel;
    assert.deepEqual(myNewtFavoriteCreationPatch(type, favorites, catalog), { [field]: model });
    assert.deepEqual(myNewtFavoriteCreationPatch(type, favorites, catalog, { [field]: "Explicit model" }), {});
  }
  for (const type of ["storyboard", "text", "utility", "composer", "myNewt", "preview"]) assert.deepEqual(myNewtFavoriteCreationPatch(type, favorites, catalog), {});
  assert.deepEqual(myNewtFavoriteCreationPatch("character", { favoriteImageModel: "REVE 2.1" }, catalog), {});
  assert.deepEqual(myNewtFavoriteCreationPatch("coverage", { favoriteImageModel: "Krea 2 Large" }, catalog), {});
  assert.deepEqual(myNewtFavoriteCreationPatch("imageModel", {}, catalog), {});
});

test("disabled favorites stay saved but are not selected, even in secondary image tools", () => {
  const disabled = catalog.map((entry) => entry.type === "imageModel" ? { ...entry, options: { model: ["OpenAI Image 2"] } } : entry);
  for (const type of ["imageModel", "coverage", "character"]) assert.deepEqual(myNewtFavoriteCreationPatch(type, favorites, disabled), {});
  assert.equal(myNewtSettings(favorites).favoriteImageModel, "Nano Banana Pro");
  assert.deepEqual(myNewtFavoriteCreationPatch("imageModel", favorites, []), {});
});

test("music workflows do not select a favorite that cannot accept the track", () => {
  for (const type of ["skillDirector", "videoModel"]) assert.deepEqual(myNewtFavoriteCreationPatch(type, favorites, catalog, {}, { musicRequired: true }), {});
  assert.deepEqual(myNewtFavoriteCreationPatch("skillDirector", favorites, catalog, { skillApproach: "music-video" }), {});
  assert.deepEqual(myNewtFavoriteCreationPatch("skillDirector", { favoriteVideoModel: "MiniMax H3" }, catalog, {}, { musicRequired: true }), { skillVideoModel: "MiniMax H3" });
});

const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
function editorFunctionSource(name) {
  const start = editor.indexOf(`function ${name}(`), end = editor.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0 && end > start); return editor.slice(start, end);
}
function createDataFactory(settings = favorites) {
  const start = editor.indexOf("  const newtCreationData ="), end = editor.indexOf("  const myNewtTaskController =", start);
  assert.ok(start >= 0 && end > start);
  const deps = { ...models, isSeedance25Model, isMiniMaxH3Model, myNewtFavoriteCreationPatch,
    nodesRef: { current: [{ type: "myNewt", data: settings }] }, myNewtCatalog: catalog,
    validateMyNewtOptions: (type, patch) => { const choices = catalog.find((entry) => entry.type === type)?.options || {}; for (const [key, value] of Object.entries(patch)) if (choices[key]) assert.ok(choices[key].includes(value)); },
    imageModelSelectionPatch: (data, model) => ({ model, resolution: data.resolution || "2K", quality: data.quality || "high" }),
    normalizeImageModelResolutionForModel: (value) => value || "2K", normalizeImageModelAspectRatio: (value) => value || "16:9"
  };
  const functions = ["isKlingO3Model", "isKlingO34kModel", "videoModelSelectionPatch"].map(editorFunctionSource).join("\n");
  return new Function(...Object.keys(deps), `${functions}\n${editor.slice(start, end)}\nreturn newtCreationData;`)(...Object.values(deps));
}

test("actual Newt creation uses favorite selections and normalizes dependent video settings", () => {
  const create = createDataFactory();
  const data = { model: "Seedance 2.0", resolution: "720p", duration: "30 seconds", aspectRatio: "21:9", prompt: "Keep this", generateAudio: false };
  const original = structuredClone(data);
  const next = create("videoModel", data);
  assert.equal(next.model, "Kling O3 Pro"); assert.equal(next.resolution, "1080p"); assert.equal(next.duration, "15 seconds");
  assert.equal(next.aspectRatio, "16:9"); assert.equal(next.generateAudio, false); assert.equal(next.prompt, "Keep this");
  assert.deepEqual(data, original);
  assert.equal(create("imageModel", { model: "OpenAI Image 2" }).model, "Nano Banana Pro");
  const explicit = create("videoModel", data, { model: "MiniMax H3", duration: "8 seconds", resolution: "2K" });
  assert.equal(explicit.model, "MiniMax H3"); assert.equal(explicit.duration, "8 seconds");
  assert.deepEqual(createDataFactory({})("videoModel", data), data);
});

test("fresh free workflows use favorites without modifying existing nodes, presets or duplicates", () => {
  const create = createDataFactory();
  const options = { catalog, nodeWidth: () => 300, createData: (type, title) => create(type, { title, model: type === "videoModel" ? "Seedance 2.0" : "OpenAI Image 2" }) };
  for (const id of ["image", "video", "director"]) {
    const graph = buildMyNewtLocalWorkflow(id, options);
    const modelNode = graph.nodes.find((node) => node.type === (id === "image" ? "imageModel" : "videoModel"));
    assert.equal(modelNode.data.model, id === "image" ? favorites.favoriteImageModel : favorites.favoriteVideoModel);
    if (id === "director") assert.equal(graph.nodes[0].data.skillVideoModel, favorites.favoriteVideoModel);
  }
  const graph = { nodes: [{ id: "image", type: "imageModel", x: 0, y: 0, data: { title: "Saved image", model: "REVE 2.1", resolution: "2K" } }], edges: [], groups: [] };
  const original = structuredClone(graph);
  const copy = instantiateNewtPreset(graph, { x: 10, y: 10 }); assert.equal(copy.nodes[0].data.model, "REVE 2.1");
  const duplicate = buildMyNewtDuplicateGraph(graph, ["image"], 1); assert.equal(duplicate.nodes[0].data.model, "REVE 2.1");
  assert.deepEqual(graph, original);
  const action = myNewtLocalAction('Set "Saved image" model to OpenAI Image 2', { ...graph, catalog }, { ...favorites, allowExisting: true });
  assert.equal(action.route, "local"); assert.equal(action.action.payload.patch.model, "OpenAI Image 2");
  const update = editor.slice(editor.indexOf("    update: (id, patch) => {"), editor.indexOf("    create: (type, request) => {"));
  assert.doesNotMatch(update, /newtCreationData|Favorite/);
});

test("the planner receives saved favorites and the strict existing-model/preset precedence policy", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-favorites-"));
  let request;
  const service = new MyNewtService({ directory, getKey: () => "mock", invoke: async (body) => {
    request = body;
    return { usage: { input_tokens: 100, output_tokens: 100 }, output: [{ type: "function_call", name: "project_action", call_id: "plan", arguments: JSON.stringify({ operation: "plan", payload: JSON.stringify({ summary: "Image setup", steps: [{ title: "Create setup" }], deliverables: [{ kind: "workflow", label: "Setup", count: 1 }], runs: [] }), reason: "Plan" }) }] };
  } });
  await service.ready;
  t.after(async () => { await Promise.all([...service.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  const owner = { projectId: "favorite-test", nodeId: "newt" };
  const graph = myNewtSnapshot({ ...owner, catalog, nodes: [{ id: "newt", type: "myNewt", data: {} }], edges: [] });
  const started = await service.start({ ...owner, brief: "Design a new image layout for this campaign", settings: favorites, snapshot: graph });
  for (let i = 0; i < 1000 && service.loops.size; i++) await new Promise((resolve) => setTimeout(resolve, 3));
  assert.equal(service.loops.size, 0); assert.equal(service.jobs.get(started.id).status, "plan-approval");
  const context = JSON.parse(request.input.findLast((item) => item.content?.startsWith?.("Current project data")).content.split("\n").slice(1).join("\n"));
  assert.equal(context.permissions.favoriteImageModel, favorites.favoriteImageModel);
  assert.equal(context.permissions.favoriteVideoModel, favorites.favoriteVideoModel);
  assert.match(request.instructions, /soft preferences for NEW nodes/);
  assert.match(request.instructions, /Never change those models just to match a favorite/);
  assert.match(request.instructions, /including presets inserted during this task/);
  const stored = JSON.parse(await readFile(path.join(directory, `${started.id}.json`), "utf8"));
  assert.equal(stored.settings.favoriteVideoModel, favorites.favoriteVideoModel);
  await service.control(started.id, { ...owner, action: "settings", settings: { ...stored.settings, favoriteImageModel: "REVE 2.1" } });
  assert.equal(service.jobs.get(started.id).settings.favoriteImageModel, "REVE 2.1");
  assert.deepEqual(service.jobs.get(started.id).snapshot, graph);
});
