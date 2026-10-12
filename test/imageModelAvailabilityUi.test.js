import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { imageModelOptions } from "../src/modelOptions.js";
import { nanoBanana21Ratios } from "../src/nanoBanana21.js";
import { nodeEditorDraftSnapshot, loadNodeEditorDraft } from "../src/useNodeEditorDraft.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeImageModelData, createDefaultNodeData, normalizeCurrentNode, normalizeEditorGraph };`,
  resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeImageModelData, createDefaultNodeData, normalizeCurrentNode, normalizeEditorGraph } = module.exports;
const model = "Nano Banana 2.1";
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const control = (tree, name) => elements(tree).find(element => element.props["aria-label"] === name);
const options = select => React.Children.toArray(select.props.children).map(option => option.props.value || option.props.children);
function editor(t, data = {}, provider = "fal") {
  t.mock.method(React, "useEffect", () => {});
  let node = { id: "image-qa", type: "imageModel", data: normalizeImageModelData({ model, prompt: "A cinematic room", ...data }) };
  return { get node() { return node; }, render() { return NodeBody({ node, incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: provider, onRun() {},
    onUpdate: (_id, patch) => { node = { ...node, data: { ...node.data, ...patch } }; } }); } };
}

test("2.1 offers exact provider formats; retired choices and generation controls are absent", t => {
  for (const provider of ["fal", "krea"]) {
    const tree = editor(t, {}, provider).render();
    assert.equal(control(tree, "Image model").props.value, model);
    assert.deepEqual(options(control(tree, "Image resolution")), ["2K", "1K", "4K"]);
    assert.deepEqual(options(control(tree, "Image aspect ratio")), ["Auto", ...nanoBanana21Ratios(provider)]);
    assert.ok(options(control(tree, "Image model")).includes("Nano Banana Pro"));
    assert.ok(!options(control(tree, "Image model")).includes("Nano Banana 2"));
    assert.ok(!options(control(tree, "Image model")).includes("Ideogram 4.5"));
    assert.equal(control(tree, "Prompt expansion"), undefined);
    assert.equal(control(tree, "Ideogram source image"), undefined);
  }
  const unavailable = editor(t, {}, "atlas").render();
  assert.equal(elements(unavailable).find(element => element.props.className === "run-node-button").props.disabled, true);
  assert.match(renderToStaticMarkup(unavailable), /Enable Fal or Krea/);
  const unsupportedRatio = editor(t, { aspectRatio: "8:1" }, "krea").render();
  assert.equal(control(unsupportedRatio, "Image aspect ratio").props.value, "8:1");
  assert.match(renderToStaticMarkup(unsupportedRatio), /8:1 \(unavailable\)/);
  assert.equal(elements(unsupportedRatio).find(element => element.props.className === "run-node-button").props.disabled, true);
});

test("changing models preserves creative work and resets unsupported transparent output", t => {
  const saved = { model: "OpenAI Image 2.5 Sunburst", quality: "max", background: "transparent", resolution: "4K", aspectRatio: "Auto", prompt: "Keep my prompt",
    resultUrl: "/outputs/old.png", resultItems: [{ url: "/outputs/old.png", type: "image" }], batchCount: "3" };
  const state = editor(t, saved);
  control(state.render(), "Image model").props.onChange({ target: { value: model } });
  assert.equal(state.node.data.model, model);
  assert.equal(state.node.data.background, "auto");
  for (const key of ["prompt", "resultUrl", "resultItems", "batchCount", "resolution", "aspectRatio"]) assert.deepEqual(state.node.data[key], saved[key]);
});

test("saved 2.1 and retired generation nodes reload without losing media, edges or prompts", t => {
  for (const [savedModel, restoredModel] of [[model, model], ["Nano Banana 2", model], ["Ideogram 4.5", "Nano Banana Pro"]]) {
    const node = { id: "image-qa", type: "imageModel", x: 100, y: 50, data: { model: savedModel, prompt: "Saved prompt", resolution: "4K", aspectRatio: "16:9", enablePromptExpansion: true, ideogramSourceUrl: "/uploads/ref.png",
      resultUrl: "/outputs/prior.png", resultItems: [{ url: "/outputs/prior.png", type: "image", model: savedModel }], selectedResultIndex: 0 } };
    const image = { id: "ref", type: "image", x: 0, y: 0, data: { resultUrl: "/uploads/ref.png" } };
    const edges = [{ id: "edge", from: { nodeId: image.id, port: "imageOut" }, to: { nodeId: node.id, port: "imagePromptIn" } }];
    const snapshot = nodeEditorDraftSnapshot({ nodes: [image, node], edges, groups: [], viewport: { x: 0, y: 0, scale: 1 }, projectName: "Model migration", projectId: "qa" });
    const oldWindow = globalThis.window;
    try {
      globalThis.window = { localStorage: { getItem: () => JSON.stringify(snapshot) } };
      const restored = loadNodeEditorDraft({ normalizeEditorGraph });
      const actual = restored.nodes.find(item => item.id === node.id).data;
      assert.equal(actual.model, restoredModel);
      for (const key of ["prompt", "resultUrl", "resultItems", "selectedResultIndex", "resolution", "aspectRatio"]) assert.deepEqual(actual[key], node.data[key]);
      for (const key of ["enablePromptExpansion", "ideogramSourceUrl"]) assert.equal(key in actual, false);
      assert.deepEqual(restored.edges, edges);
    } finally { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; }
  }
  assert.equal(normalizeImageModelData({ model: "Nano Banana 2", resolution: "0.5K" }).resolution, "2K");
});

test("defaults remain unchanged and Character retirement preserves saved sheets", () => {
  for (const [type, field, expected] of [["imageModel", "model", "Nano Banana Pro"], ["character", "characterSheetModel", "Nano Banana Pro"],
    ["storyboard", "model", "OpenAI Image 2.5 Flare"], ["explore", "model", "OpenAI Image 2.5 Flare"]]) assert.equal(createDefaultNodeData(type, type, 1)[field], expected);
  const sheets = [{ id: "wardrobe", url: "/outputs/sheet.png" }];
  const restored = normalizeCurrentNode({ id: "char", type: "character", data: { characterSheetModel: "Nano Banana 2", characterWardrobeSheets: sheets } });
  assert.equal(restored.data.characterSheetModel, model);
  assert.deepEqual(restored.data.characterWardrobeSheets, sheets);
  for (const currentModel of ["OpenAI Image 2.5 Sunburst", "OpenAI Image 2.5 Flare"]) {
    const data = normalizeImageModelData({ model: currentModel, quality: "max", resolution: "4K", aspectRatio: "21:9" });
    assert.equal(data.quality, "max"); assert.equal(data.resolution, "4K"); assert.equal(data.aspectRatio, "21:9");
  }
});
