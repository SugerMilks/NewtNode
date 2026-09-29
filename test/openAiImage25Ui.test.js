import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { imageModelOptions, coverageModelOptions } from "../src/modelOptions.js";
import { openAiImage25Models, openAiImage25KreaAspectRatios, openAiImage25KreaResolutionOptions } from "../src/openAiImage25.js";

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

test("Storyboard QC defaults to Balanced while saved Deep and explicit Off survive reopening", () => {
  assert.equal(createDefaultNodeData("storyboard", "Board", 1).storyboardQcMode, "balanced");
  for (const [saved, mode, enabled] of [[{}, "balanced", true], [{ storyboardAutoQc: false }, "balanced", false], [{ storyboardQcMode: "deep", storyboardAutoQc: true }, "deep", true], [{ storyboardQcMode: "unknown" }, "balanced", true]]) {
    const data = normalizeCurrentNode({ id: "board", type: "storyboard", data: { ...saved, storyboardTab: "advanced" } }).data;
    assert.equal(data.storyboardAutoQc, enabled);
    assert.equal(data.storyboardQcMode, mode);
    const html = renderToStaticMarkup(React.createElement(NodeBody, {
      node: { id: "board", type: "storyboard", data }, incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(),
      imageModelOptions, generationProvider: "fal", onUpdate: () => {}
    }));
    assert.match(html, /aria-label="Storyboard quality control"/);
    assert.match(html, new RegExp(`<option value="${enabled ? mode : "off"}" selected="">`));
  }
});

test("Seedream Pro controls keep defaults, formats and saved content consistent across image tools", () => {
  const model = "Seedream 5.0 Pro";
  for (const provider of ["fal", "krea", "atlas"]) {
    const html = renderModel(model, provider);
    assert.match(html, /selected="">Seedream 5\.0 Pro/);
    assert.match(html, />2K</);
    assert.match(html, />1K</);
    assert.match(html, />16:9</);
    assert.match(html, />21:9</);
    assert.doesNotMatch(html, />4K<|>Maximum<|>Transparent</);
    const patch = imageModelSelectionPatch({ model: "OpenAI Image 2.5 Flare", resolution: "4K", aspectRatio: "21:9", background: "transparent" }, model, provider);
    assert.equal(patch.resolution, "2K");
    assert.equal(patch.background, "auto");
    assert.equal(patch.aspectRatio, "21:9");
    for (const type of ["character", "storyboard", "coverage", "autoAspect", "utility"]) {
      const field = type === "character" ? "characterSheetModel" : "model";
      const node = normalizeCurrentNode({ id: type, type, data: { ...createDefaultNodeData(type, type, 1),
        [field]: model, resolution: "2K", aspectRatio: "16:9", advancedOpen: true,
        utilityMode: "image", utilityImageModel: "Coverage", storyboardTab: "advanced", prompt: "Keep my prompt" } });
      assert.equal(node.data[type === "autoAspect" ? "autoAspectModel" : field], model, `${type} restores Pro`);
      const rendered = renderToStaticMarkup(React.createElement(NodeBody, { node,
        incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: provider,
        onUpdate: () => {}, onRun: () => {}
      }));
      assert.ok(rendered.includes(`selected="">${model}`), `${type} ${provider} retains selected Pro`);
    }
  }
});

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
    for (const option of [...openAiImage25KreaAspectRatios, ...openAiImage25KreaResolutionOptions]) {
      assert.ok(krea.includes(`>${option}<`), `Krea ${model} includes ${option}`);
    }
    assert.doesNotMatch(krea, />21:9</);
    assert.equal(krea.includes(">Transparent<"), model === openAiImage25Models.flare);
  }
  const legacy = renderModel("OpenAI Image 2");
  assert.doesNotMatch(legacy, />Maximum<|>Extra High<|>Transparent<|Variable cost/);
  assert.match(legacy, /High \(Professional\)/);
});

test("new Storyboard defaults to Flare while Character keeps Nano Banana Pro and Coverage keeps Sunburst", () => {
  for (const type of ["character", "coverage", "storyboard"]) {
    const data = createDefaultNodeData(type, type, 1);
    const field = type === "character" ? "characterSheetModel" : "model";
    const expectedModel = type === "character" ? "Nano Banana Pro" : type === "storyboard" ? openAiImage25Models.flare : openAiImage25Models.sunburst;
    assert.equal(data[field], expectedModel);
    const html = renderToStaticMarkup(React.createElement(NodeBody, {
      node: { id: "creative", type, data: { ...data, storyboardTab: "advanced" } },
      incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), imageModelOptions, generationProvider: "fal",
      onUpdate: () => {}, onRun: () => {}
    }));
    assert.ok(html.includes(`selected="">${expectedModel}`));
    if (type === "storyboard") {
      assert.match(html, /OpenAI Image 2\.5 Sunburst/);
      assert.equal(data.quality, "high");
      assert.equal(data.resolution, "1K");
      assert.equal(data.storyboardAutoQc, true);
    } else assert.doesNotMatch(html, /Flare/);
  }
});

test("retired image choices reopen safely without losing media or reviving controls", () => {
  for (const model of ["Krea 2 Large", "REVE 2.1"]) {
    const saved = { model, prompt: "Saved creative direction", aspectRatio: "4:1", resolution: "4K",
      kreaCreativity: "raw", resultUrl: "/outputs/old.png", resultItems: [{ url: "/outputs/old.png" }] };
    const restored = normalizeCurrentNode({ id: "legacy", type: "imageModel", data: saved }).data;
    assert.equal(restored.model, "Nano Banana Pro");
    assert.equal(restored.aspectRatio, "16:9");
    assert.equal(restored.resolution, "4K");
    for (const field of ["prompt", "resultUrl", "resultItems"]) assert.deepEqual(restored[field], saved[field]);
    assert.equal("kreaCreativity" in restored, false);
    const html = renderToStaticMarkup(React.createElement(NodeBody, {
      node: { id: "legacy", type: "imageModel", data: restored }, incoming: {}, incomingByNode: {},
      connectedPortKeys: new Set(), imageModelOptions, generationProvider: "fal", onUpdate: () => {}, onRun: () => {}
    }));
    assert.doesNotMatch(html, /Krea 2 Large|REVE 2.1|Creativity/);
    assert.match(html, /Mood Board/);
    assert.match(html, /Character/);
    for (const type of ["explore", "coverage", "utility"]) {
      const data = normalizeCurrentNode({ id: type, type, data: { ...saved, utilityMode: "image", utilityImageModel: "Coverage" } }).data;
      assert.ok((type === "explore" ? imageModelOptions : coverageModelOptions).includes(data.model));
      assert.equal(data.resultUrl, saved.resultUrl);
    }
  }
});

test("new Image Model nodes prefer Nano Banana Pro and respect disabled models", () => {
  const start = source.indexOf("  function createNodeData(");
  const end = source.indexOf("\n  function defaultNodePosition(", start);
  assert.ok(start >= 0 && end > start);
  const createImageNode = new Function("enabledImageModels", "createDefaultNodeData", "imageModelSelectionPatch",
    `${source.slice(start, end)}\nreturn createNodeData("imageModel", "Image Model", 1);`);
  for (const [enabled, expected] of [[imageModelOptions, "Nano Banana Pro"], [["OpenAI Image 2"], "OpenAI Image 2"], [[], "Nano Banana Pro"]]) {
    const data = createImageNode(enabled, createDefaultNodeData, imageModelSelectionPatch);
    assert.equal(data.model, expected);
    assert.equal(data.aspectRatio, "16:9");
    assert.equal(data.resolution, "2K");
    assert.equal(data.batchCount, "1");
    const html = renderToStaticMarkup(React.createElement(NodeBody, {
      node: { id: "fresh-image", type: "imageModel", data }, incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(),
      imageModelOptions, generationProvider: "fal", onUpdate: () => {}, onRun: () => {}
    }));
    assert.ok(html.includes(`selected="">${expected}`));
  }
});

test("Image Model default changes do not replace saved selections or legacy missing-model fallbacks", () => {
  for (const model of imageModelOptions) {
    const data = { model, prompt: "Saved prompt", resolution: "4K", aspectRatio: "9:16", resultUrl: "/outputs/saved.png" };
    const restored = normalizeCurrentNode({ id: "saved-image", type: "imageModel", data }).data;
    for (const key of ["model", "prompt", "resultUrl"]) assert.equal(restored[key], data[key]);
  }
  assert.equal(normalizeImageModelData({}).model, "OpenAI Image 2");
});

test("saved creative models and full-resolution results survive restoration; legacy defaults stay put", () => {
  for (const type of ["character", "coverage", "storyboard"]) {
    const field = type === "character" ? "characterSheetModel" : "model";
    const models = [openAiImage25Models.sunburst, "OpenAI Image 2", ...(type === "storyboard" ? [openAiImage25Models.flare] : [])];
    for (const model of models) {
      const node = { id: type, type, data: { ...createDefaultNodeData(type, type, 1), [field]: model, resultUrl: "/outputs/saved.png", characterBaseSheet: { url: "/outputs/base.png" }, characterBaseVideoSheet: { url: "/outputs/cu-base.png" }, storyboardFrames: [{ id: "frame", prompt: "Saved direction", resultUrl: "/outputs/saved.png" }], coverageResults: [{ url: "/outputs/saved.png", shotId: "standard-1" }] } };
      const restored = normalizeCurrentNode(JSON.parse(JSON.stringify(node))).data;
      assert.equal(restored[field], model);
      assert.equal(restored.resultUrl, "/outputs/saved.png");
      if (type === "storyboard") {
        assert.equal(restored.storyboardFrames[0].prompt, "Saved direction");
        assert.equal(restored.storyboardFrames[0].resultUrl, "/outputs/saved.png");
      }
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
    assert.equal(krea.resolution, "4K");
    assert.equal(krea.aspectRatio, "2:1");
  }
});
