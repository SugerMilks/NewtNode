import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { imageModelOptions, imageWorkspaceModelOptions, defaultModelPreferences, normalizeModelPreferences, enabledImageModelOptions, coverageModelOptions, storyboardImageModelOptions } from "../src/modelOptions.js";
import { ideogramImageModelName, ideogramImageQualityOptions, ideogramImageResolutionOptions, ideogramImageAspectRatios } from "../src/ideogramImage.js";
import { characterSheetModelOptions } from "../src/characterSheetModels.js";
import { exploreModels, normalizeExploreData } from "../src/explore.js";
import { openAiImage25Models } from "../src/openAiImage25.js";
import { nodeEditorDraftSnapshot, loadNodeEditorDraft } from "../src/useNodeEditorDraft.js";
import { appendedNodeResultState, batchRunError, resultTextFromItems } from "../src/nodeRunner.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeImageModelData, imageModelSelectionPatch, imageModelRunIssue, createDefaultNodeData, normalizeCurrentNode, normalizeEditorGraph };`,
  resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeImageModelData, imageModelSelectionPatch, imageModelRunIssue, createDefaultNodeData, normalizeCurrentNode, normalizeEditorGraph } = module.exports;
const model = ideogramImageModelName;

function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const control = (tree, name) => elements(tree).find((element) => element.props["aria-label"] === name);
const options = (select) => React.Children.toArray(select.props.children).map((option) => option.props.value || option.props.children);
function editor(t, data = {}, extra = {}) {
  t.mock.method(React, "useEffect", () => {});
  let node = { id: "image-qa", type: "imageModel", data: normalizeImageModelData({ model, prompt: "A sign reading NEON", ...data }) };
  const props = { incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: "fal", onRun() {}, ...extra };
  return {
    get node() { return node; },
    render(patch = {}) { Object.assign(props, patch); return NodeBody({ ...props, node, onUpdate: (_id, update) => { node = { ...node, data: { ...node.data, ...update } }; } }); }
  };
}

test("Ideogram is enabled by default in Settings and limited to the Image Model node catalog", () => {
  assert.equal(imageModelOptions.includes(model), true);
  assert.equal(defaultModelPreferences.image[model], true);
  assert.equal(normalizeModelPreferences({ image: { [model]: false } }).image[model], false);
  assert.equal(enabledImageModelOptions({}).includes(model), true);
  for (const catalog of [imageWorkspaceModelOptions, exploreModels, coverageModelOptions, storyboardImageModelOptions, characterSheetModelOptions]) assert.equal(catalog.includes(model), false);
  assert.equal(enabledImageModelOptions({}, { workspaceOnly: true }).includes(model), false);
  const onlyIdeogram = { image: Object.fromEntries(imageModelOptions.map((name) => [name, name === model])) };
  assert.deepEqual(enabledImageModelOptions(onlyIdeogram), [model]);
  assert.deepEqual(enabledImageModelOptions(onlyIdeogram, { workspaceOnly: true }), []);
  assert.notEqual(normalizeExploreData({ model }).model, model);
  const app = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /enabledImageModelOptions\(modelPreferences, \{ workspaceOnly: true \}\)/);
});

test("Ideogram exposes supported quality, formats and persistent prompt expansion without edit controls", (t) => {
  const state = editor(t);
  const tree = state.render();
  assert.equal(control(tree, "Image model").props.value, model);
  assert.deepEqual(options(control(tree, "Image quality")), ideogramImageQualityOptions);
  assert.deepEqual(options(control(tree, "Image resolution")), ideogramImageResolutionOptions);
  assert.deepEqual(options(control(tree, "Image aspect ratio")), ideogramImageAspectRatios);
  assert.equal(control(tree, "Image quality").props.value, "high");
  assert.equal(control(tree, "Prompt expansion").props.checked, true);
  control(tree, "Prompt expansion").props.onChange({ target: { checked: false } });
  assert.equal(state.node.data.enablePromptExpansion, false);
  assert.equal(control(state.render(), "Prompt expansion").props.checked, false);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Text to image/);
  assert.doesNotMatch(html, />4K<|>21:9<|>Auto<|Extra High|Maximum|Edit precision/);
});

test("switching model normalizes unsupported options and preserves saved creative work", (t) => {
  const saved = { model: openAiImage25Models.sunburst, prompt: "Keep this prompt", quality: "max", resolution: "4K", aspectRatio: "Auto",
    background: "transparent", resultUrl: "/outputs/old.png", resultItems: [{ url: "/outputs/old.png", type: "image" }], batchCount: "3" };
  const state = editor(t, saved);
  control(state.render(), "Image model").props.onChange({ target: { value: model } });
  assert.equal(state.node.data.model, model);
  assert.equal(state.node.data.quality, "high");
  assert.equal(state.node.data.resolution, "2K");
  assert.equal(state.node.data.aspectRatio, "16:9");
  assert.equal(state.node.data.enablePromptExpansion, true);
  assert.equal(state.node.data.background, "auto");
  assert.equal(normalizeImageModelData({ model, background: "transparent" }).background, "auto");
  for (const key of ["prompt", "resultUrl", "resultItems", "batchCount"]) assert.deepEqual(state.node.data[key], saved[key]);
  for (const quality of ["low", "medium", "high"]) assert.equal(imageModelSelectionPatch({ quality, resolution: "1K", aspectRatio: "4:5" }, model).quality, quality);
  assert.equal(normalizeImageModelData({ model, quality: "very_low" }).quality, "low");
  assert.equal(normalizeImageModelData({ model, quality: "xhigh" }).quality, "high");
});

test("save/reload retains Ideogram, prompt expansion, media, reference edges and supported formats", (t) => {
  const node = { id: "image-qa", type: "imageModel", x: 100, y: 50, data: { model, prompt: "Saved prompt", resolution: "1K", aspectRatio: "2:1", quality: "low", enablePromptExpansion: false, ideogramSourceUrl: "/uploads/reference.png", resultUrl: "/outputs/prior.png", resultItems: [{ url: "/outputs/prior.png", type: "image" }] } };
  const image = { id: "reference", type: "image", x: 0, y: 0, data: { resultUrl: "/uploads/reference.png" } };
  const edges = [{ id: "reference-edge", from: { nodeId: image.id, port: "imageOut" }, to: { nodeId: node.id, port: "imagePromptIn" } }];
  const snapshot = nodeEditorDraftSnapshot({ nodes: [image, node], edges, groups: [], viewport: { x: 0, y: 0, scale: 1 }, projectName: "Ideogram draft", projectId: "qa" });
  const oldWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(snapshot) } };
  t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; });
  const restored = loadNodeEditorDraft({ normalizeEditorGraph });
  const actual = restored.nodes.find((item) => item.id === node.id);
  for (const key of Object.keys(node.data)) assert.deepEqual(actual.data[key], node.data[key]);
  assert.deepEqual(restored.edges, edges);
  assert.equal(restored.projectName, snapshot.projectName);
});

test("unavailable providers block run while ready references enable edit mode without changing connections", (t) => {
  const state = editor(t);
  const run = (tree) => elements(tree).find((element) => element.props.className === "run-node-button");
  assert.equal(run(state.render()).props.disabled, false);
  for (const generationProvider of ["atlas", "krea", ""]) {
    const tree = state.render({ generationProvider });
    assert.equal(run(tree).props.disabled, true);
    assert.match(renderToStaticMarkup(tree), /Enable Fal in Settings/);
  }
  for (const port of ["imagePromptIn", "characterIn", "transferIn"]) {
    const incoming = { [port]: [{ source: { id: "source", type: "image", data: { title: "Reference", resultUrl: "/uploads/reference.png" } } }] };
    const tree = state.render({ generationProvider: "fal", incoming });
    assert.equal(run(tree).props.disabled, false);
    assert.match(renderToStaticMarkup(tree), /Image edit/);
    assert.ok(control(tree, "Ideogram source image"));
    assert.equal(control(tree, "Ideogram output size").props.children, "Auto (source proportions)");
    for (const name of ["Image aspect ratio", "Image resolution", "Prompt expansion"]) assert.equal(control(tree, name), undefined);
    assert.equal(incoming[port].length, 1);
  }
});

test("runNode rejects unsupported Ideogram requests before status, reference preparation or API work", async () => {
  const runSource = source.slice(source.indexOf("  async function runNode(node) {"), source.indexOf("\n  function playSelectedPreviewVideos(", source.indexOf("  async function runNode(node) {")));
  for (const [provider, incoming, expected] of [["atlas", {}, /Enable Fal/], ["krea", {}, /Enable Fal/]]) {
    const node = { id: "image", type: "imageModel", data: { model, prompt: "Saved prompt", resultUrl: "/outputs/prior.png" } }, updates = [];
    const deps = { nodesRef: { current: [node] }, edgesRef: { current: [] }, isRunnableNode: () => true,
      buildIncomingByNode: () => ({ image: incoming }), connectedText: () => "", isSam3ImageModel: () => false,
      nodeBatchCount: () => 1, existingResultItemsForNode: () => [], workflowRequestContext: () => ({}),
      imageModelRunIssue, generationProvider: provider, updateNode: (_id, patch) => updates.push(patch), exploreRunsRef: { current: new Set() } };
    const run = new Function(...Object.keys(deps), `${runSource}\nreturn runNode;`)(...Object.values(deps));
    const result = await run(node);
    assert.equal(result.status, "error");
    assert.match(result.error.message, expected);
    assert.deepEqual(updates, [{ status: "error", error: result.error.message }]);
    assert.equal(node.data.resultUrl, "/outputs/prior.png");
  }
});

test("source selection persists, stale or missing images block run, and disconnect restores text controls", (t) => {
  const state = editor(t, { enablePromptExpansion: false });
  const connection = (n) => ({ source: { id: `ref-${n}`, type: "image", data: { title: `Reference ${n}`, resultUrl: `/uploads/${n}.png` } } });
  const refs = [connection(1), connection(2)];
  const run = (tree) => elements(tree).find(element => element.props.className === "run-node-button");
  let tree = state.render({ incoming: { imagePromptIn: refs } });
  assert.equal(run(tree).props.disabled, false);
  control(tree, "Ideogram source image").props.onChange({ target: { value: "/uploads/2.png" } });
  assert.equal(control(state.render(), "Ideogram source image").props.value, "/uploads/2.png");
  tree = state.render({ incoming: { imagePromptIn: [refs[0]] } });
  assert.equal(run(tree).props.disabled, true);
  assert.match(renderToStaticMarkup(tree), /no longer connected/);
  control(tree, "Ideogram source image").props.onChange({ target: { value: "" } });
  assert.equal(run(state.render()).props.disabled, false);
  tree = state.render({ incoming: { imagePromptIn: [{ source: { type: "image", data: {} } }] } });
  assert.equal(run(tree).props.disabled, true);
  assert.match(renderToStaticMarkup(tree), /no image ready/);
  tree = state.render({ incoming: { imagePromptIn: Array.from({ length: 6 }, (_, i) => connection(i)) } });
  assert.equal(run(tree).props.disabled, true);
  assert.match(renderToStaticMarkup(tree), /five images total/);
  tree = state.render({ incoming: {} });
  assert.equal(run(tree).props.disabled, false);
  assert.equal(control(tree, "Prompt expansion").props.checked, false);
  assert.ok(control(tree, "Image aspect ratio")); assert.ok(control(tree, "Image resolution"));
});

test("existing model defaults and Image 2.5 quality controls remain unchanged", () => {
  assert.equal(createDefaultNodeData("imageModel", "Image Model", 1).model, "Nano Banana Pro");
  assert.equal(normalizeImageModelData({}).model, "OpenAI Image 2");
  for (const currentModel of Object.values(openAiImage25Models)) {
    const restored = normalizeCurrentNode({ id: "saved", type: "imageModel", data: { model: currentModel, quality: "max", resolution: "4K", aspectRatio: "21:9", resultUrl: "/outputs/saved.png" } });
    assert.equal(restored.data.model, currentModel);
    assert.equal(restored.data.quality, "max");
    assert.equal(restored.data.resolution, "4K");
    assert.equal(restored.data.aspectRatio, "21:9");
    const html = renderToStaticMarkup(React.createElement(NodeBody, { node: restored, incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: "fal", onUpdate() {}, onRun() {} }));
    assert.match(html, /Extra High|Maximum/);
    assert.doesNotMatch(html, /aria-label="Prompt expansion"/);
  }
});


test("successful Image Model results retain provider warnings without losing media", () => {
  const start = source.indexOf('      if (currentNode.type === "imageModel") {', source.indexOf('      if (currentNode.type === "audioModel") {', source.indexOf('  async function runNode(node) {')));
  const end = source.indexOf('      if (currentNode.type === "model3d") {', start);
  const branch = source.slice(start, end);
  const completionStart = branch.indexOf('        const { resultItems, firstNewIndex } = appendedNodeResultState([], successes, "image");');
  const completionEnd = branch.indexOf('        return { status: "complete" };', completionStart);
  assert.ok(completionStart >= 0 && completionEnd > completionStart);
  const updates = [];
  const warning = "Image saved, but History could not be updated.";
  const successes = [{ url: "/outputs/one.png", type: "image", warning }, { url: "/outputs/two.png", type: "image", warning }];
  const deps = { appendedNodeResultState, batchRunError, resultTextFromItems, successes, failures: [], batchCount: 2,
    currentNode: { id: "image" }, updateNode: (_id, patch) => updates.push(patch), loadOutputHistory() {} };
  new Function(...Object.keys(deps), branch.slice(completionStart, completionEnd))(...Object.values(deps));
  assert.equal(updates[0].status, "complete");
  assert.equal(updates[0].resultUrl, successes[0].url);
  assert.deepEqual(updates[0].resultItems.map((item) => item.url), successes.map((item) => item.url));
  assert.equal(updates[0].error, warning);
});
