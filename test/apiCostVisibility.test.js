import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { imageModelOptions, videoModelOptions } from "../src/modelOptions.js";
import { estimateImageRunCost, estimateVideoRunCost } from "../src/generationPricing.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, createDefaultNodeData };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" },
  external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, createDefaultNodeData } = module.exports;
const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");

function buttonLabel(node, showApiCosts, generationProvider = "fal") {
  const before = structuredClone(node);
  const html = renderToStaticMarkup(React.createElement(NodeBody, {
    node, showApiCosts, generationProvider, imageModelOptions, videoModelOptions, running: node.data.status === "running",
    incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate: () => assert.fail("Visibility must not mutate a node"), onRun: () => {}
  }));
  assert.deepEqual(node, before);
  const buttons = [];
  function visit(item) {
    if (item.tagName === "button") buttons.push(text(item));
    for (const child of item.childNodes || []) visit(child);
  }
  visit(parseFragment(html));
  return buttons.find((value) => /^(Run (Image|Video|Audio)|Generate Coverage|Running|Generating 9)/.test(value));
}

test("API Cost gates exact and variable button prices without changing models or batches", () => {
  for (const [type, model, provider, label] of [
    ["imageModel", "Nano Banana 2", "fal", "Run Image"],
    ["imageModel", "OpenAI Image 2.5 Sunburst", "fal", "Run Image"],
    ["videoModel", "Seedance 2.0", "fal", "Run Video"],
    ["videoModel", "Seedance 2.5", "atlas", "Run Video"],
    ["audioModel", undefined, "fal", "Run Audio"],
    ["coverage", "OpenAI Image 2.5 Sunburst", "fal", "Generate Coverage"]
  ]) {
    const node = { id: "test", type, data: { ...createDefaultNodeData(type, type, 1), ...(model ? { model } : {}), prompt: "A quiet room", batchCount: "4", duration: "8 seconds", resolution: "720p" } };
    if (type === "imageModel") node.data.resolution = "2K";
    for (const value of [undefined, false]) assert.equal(buttonLabel(node, value, provider), label);
    const shown = buttonLabel(node, true, provider);
    assert.ok(shown.startsWith(`${label} (`), shown);
    assert.match(shown, /\$|[Vv]ariable|varies/);
    assert.equal(buttonLabel(node, false, provider), label);
  }
});

test("API Cost leaves in-progress button labels unchanged", () => {
  for (const type of ["imageModel", "videoModel", "audioModel", "coverage"]) {
    const node = { id: "busy", type, data: { ...createDefaultNodeData(type, type, 1), prompt: "A quiet room", status: "running", batchCount: "4" } };
    assert.equal(buttonLabel(node, false), buttonLabel(node, true));
    assert.match(buttonLabel(node, false), /Running|Generating/);
  }
});

test("price visibility is display-only and cannot change estimates used for budgets", () => {
  const image = { model: "Nano Banana 2", resolution: "2K", batchCount: "4", provider: "fal" };
  const video = { model: "Seedance 2.0", resolution: "720p", duration: "8 seconds", provider: "fal" };
  assert.equal(estimateImageRunCost({ ...image, showApiCosts: false }), estimateImageRunCost({ ...image, showApiCosts: true }));
  assert.equal(estimateVideoRunCost({ ...video, showApiCosts: false }), estimateVideoRunCost({ ...video, showApiCosts: true }));
  assert.match(source, /showApiCosts=\{nodePreferences\?\.showApiCosts === true\}/);
  assert.match(source, /showApiCosts=\{showApiCosts\}/);
});
