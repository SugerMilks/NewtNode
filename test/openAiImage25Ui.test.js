import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { imageModelOptions } from "../src/modelOptions.js";
import { openAiImage25Models } from "../src/openAiImage25.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeImageModelData, imageModelSelectionPatch, createDefaultNodeData, normalizeCurrentNode, storyboardAspectRatioForNode };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeImageModelData, imageModelSelectionPatch, createDefaultNodeData, normalizeCurrentNode, storyboardAspectRatioForNode } = module.exports;
function renderModel(model, provider = "fal") {
  return renderToStaticMarkup(React.createElement(NodeBody, {
    node: { id: "test", type: "imageModel", data: { ...normalizeImageModelData({ model, quality: "max", background: "transparent", batchCount: "4" }), ...imageModelSelectionPatch({}, model, provider) } },
    incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: provider, showApiCosts: true,
    onUpdate: () => {}, onRun: () => {}
  }));
}

test("2.5 image controls display new quality levels, provider sizes and variable cost", () => {
  for (const model of Object.values(openAiImage25Models)) {
    const fal = renderModel(model);
    assert.match(fal, />Extra High</);
    assert.match(fal, />Maximum</);
    assert.match(fal, />Transparent</);
    assert.match(fal, />4K</);
    assert.match(fal, />21:9</);
    assert.match(fal, /Run Image \(Variable cost\)/);
    const krea = renderModel(model, "krea");
    assert.match(krea, />Maximum</);
    assert.doesNotMatch(krea, />4K<|>2K<|>16:9<|>21:9</);
    assert.match(krea, />3:2</);
    assert.equal(krea.includes(">Transparent<"), model === openAiImage25Models.flare);
  }
  const legacy = renderModel("OpenAI Image 2");
  assert.doesNotMatch(legacy, />Maximum<|>Extra High<|>Transparent<|Variable cost/);
  assert.match(legacy, /High \(Professional\)/);
});

test("new Character defaults to Nano Banana Pro while Coverage and Storyboard retain Sunburst", () => {
  for (const type of ["character", "coverage", "storyboard"]) {
    const data = createDefaultNodeData(type, type, 1);
    const field = type === "character" ? "characterSheetModel" : "model";
    const expectedModel = type === "character" ? "Nano Banana Pro" : openAiImage25Models.sunburst;
    assert.equal(data[field], expectedModel);
    const html = renderToStaticMarkup(React.createElement(NodeBody, {
      node: { id: "creative", type, data: { ...data, storyboardTab: "advanced" } },
      incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: "fal",
      onUpdate: () => {}, onRun: () => {}
    }));
    assert.ok(html.includes(`selected="">${expectedModel}`));
    assert.doesNotMatch(html, /Flare/);
  }
});

test("saved creative models and full-resolution results survive restoration; legacy defaults stay put", () => {
  for (const type of ["character", "coverage", "storyboard"]) {
    const field = type === "character" ? "characterSheetModel" : "model";
    for (const model of [openAiImage25Models.sunburst, "OpenAI Image 2"]) {
      const node = { id: type, type, data: { ...createDefaultNodeData(type, type, 1), [field]: model, resultUrl: "/outputs/saved.png", characterBaseSheet: { url: "/outputs/base.png" }, characterBaseVideoSheet: { url: "/outputs/cu-base.png" }, storyboardFrames: [{ id: "frame", prompt: "Saved direction", resultUrl: "/outputs/saved.png" }], coverageResults: [{ url: "/outputs/saved.png", shotId: "standard-1" }] } };
      const restored = normalizeCurrentNode(JSON.parse(JSON.stringify(node))).data;
      assert.equal(restored[field], model);
      assert.equal(restored.resultUrl, "/outputs/saved.png");
      if (type === "character") {
        assert.deepEqual(restored.characterBaseSheet, node.data.characterBaseSheet);
        assert.deepEqual(restored.characterBaseVideoSheet, node.data.characterBaseVideoSheet);
      }
    }
    const legacy = normalizeCurrentNode({ id: "old", type, data: {} }).data;
    assert.equal(legacy[field], type === "character" ? "Nano Banana 2" : "OpenAI Image 2");
  }
  for (const aspectRatio of ["3:2", "2:3"]) {
    const restored = normalizeCurrentNode({ id: "board", type: "storyboard", data: { model: openAiImage25Models.sunburst, aspectRatio } });
    assert.equal(storyboardAspectRatioForNode(restored), aspectRatio);
  }
});

test("saved 2.5 selections retain maximum quality, alpha and prior full-resolution results", () => {
  for (const model of Object.values(openAiImage25Models)) {
    const data = { model, quality: "max", background: "transparent", resolution: "4K", aspectRatio: "21:9", resultUrl: "/outputs/old.png", resultItems: [{ url: "/outputs/old.png" }] };
    const restored = normalizeImageModelData(JSON.parse(JSON.stringify(data)));
    for (const key of Object.keys(data)) assert.deepEqual(restored[key], data[key]);
    const krea = imageModelSelectionPatch(restored, model, "krea");
    assert.equal(krea.quality, "max");
    assert.equal(krea.resolution, "1K");
    assert.equal(krea.aspectRatio, "3:2");
  }
});
