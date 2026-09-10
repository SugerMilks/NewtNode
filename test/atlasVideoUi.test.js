import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { videoModelOptions } from "../src/modelOptions.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({
  stdin: { contents: `${source}\nexport { NodeBody };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" }
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody } = module.exports;

function renderVideo(model, { provider = "atlas", data = {}, incoming = {} } = {}) {
  const saved = { model, prompt: "A quiet scene.", duration: "5 seconds", resolution: "720p", aspectRatio: "16:9", settingsOpen: true, ...data };
  const before = structuredClone(saved);
  const html = renderToStaticMarkup(React.createElement(NodeBody, {
    node: { id: "video", type: "videoModel", data: saved }, incoming, incomingByNode: {}, connectedPortKeys: new Set(), generationProvider: provider, videoModelOptions,
    onUpdate: () => assert.fail("Rendering must not change saved selections"), onRun: () => {}, sam3SegmentationModelsEnabled: true
  }));
  assert.deepEqual(saved, before);
  const elements = [];
  function visit(node) { if (node.tagName) elements.push(node); for (const child of node.childNodes || []) visit(child); }
  visit(parseFragment(html));
  return { html, elements };
}
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hasAttr = (node, name) => attr(node, name) !== undefined;
const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
const option = (view, label) => view.elements.find((node) => node.tagName === "option" && text(node) === label);
const sourceFrame = { startFrameIn: [{ source: { id: "frame", type: "image", data: { resultUrl: "/uploads/frame.png" } } }] };

test("Atlas grays unsupported video models and blocks their run without replacing the selected model", () => {
  const atlas = renderVideo("Kling O3 Pro");
  for (const model of ["Kling O3 Pro", "Kling O3 4K"]) assert.equal(hasAttr(option(atlas, model), "disabled"), true);
  assert.equal(hasAttr(option(atlas, "Kling O3 Pro"), "selected"), true);
  for (const model of ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"]) assert.equal(hasAttr(option(atlas, model), "disabled"), false);
  const run = atlas.elements.find((node) => node.tagName === "button" && attr(node, "class") === "run-node-button");
  assert.equal(hasAttr(run, "disabled"), true);
  for (const provider of ["fal", "krea"]) {
    const view = renderVideo("Kling O3 Pro", { provider });
    assert.equal(hasAttr(option(view, "Kling O3 Pro"), "disabled"), false);
    assert.equal(hasAttr(view.elements.find((node) => node.tagName === "button" && attr(node, "class") === "run-node-button"), "disabled"), false);
  }
});

test("Atlas retains disabled Seedance 2.5 legacy resolutions without native-4K substitution", () => {
  for (const resolution of ["1920p", "4k", "4K"]) {
    const selected = option(renderVideo("Seedance 2.5", { data: { resolution } }), resolution);
    assert.equal(hasAttr(selected, "disabled"), true);
    assert.equal(hasAttr(selected, "selected"), true);
  }
  assert.equal(hasAttr(option(renderVideo("Seedance 2.5", { data: { resolution: "1080p" } }), "1080p"), "disabled"), false);
  assert.equal(hasAttr(option(renderVideo("Seedance 2.0", { data: { resolution: "4k" } }), "4k"), "disabled"), false);
});

test("Atlas H3 disables 480P, 4K, seed and safety controls but preserves their saved values", () => {
  for (const provider of ["atlas", "fal", "krea"]) {
    const view = renderVideo("MiniMax H3", { provider, data: { resolution: "4K", seed: "123", enableSafetyChecker: false } });
    for (const resolution of ["480P", "4K"]) assert.equal(hasAttr(option(view, resolution), "disabled"), provider === "atlas");
    assert.equal(hasAttr(option(view, "4K"), "selected"), true);
    for (const resolution of ["768P", "2K"]) assert.equal(hasAttr(option(view, resolution), "disabled"), false);
    const seed = view.elements.find((node) => node.tagName === "input" && attr(node, "placeholder") === "Random");
    assert.equal(attr(seed, "value"), "123");
    assert.equal(hasAttr(seed, "disabled"), provider === "atlas");
    const safety = view.elements.find((node) => node.tagName === "button" && attr(node, "class")?.startsWith("node-toggle"));
    assert.equal(hasAttr(safety, "disabled"), provider === "atlas");
    assert.equal(attr(safety, "class").includes("enabled"), false);
  }
});

test("Atlas start frames display disabled Source frame aspect only for Seedance 2.5 and H3", () => {
  for (const model of ["Seedance 2.5", "MiniMax H3"]) {
    for (const provider of ["atlas", "fal", "krea"]) {
      const view = renderVideo(model, { provider, incoming: sourceFrame });
      const frameOption = option(view, "Source frame");
      assert.equal(Boolean(frameOption), provider === "atlas");
      if (frameOption) {
        assert.equal(hasAttr(frameOption, "selected"), true);
        assert.equal(hasAttr(frameOption.parentNode, "disabled"), true);
      }
    }
    assert.equal(Boolean(option(renderVideo(model), "Source frame")), false);
  }
  assert.equal(Boolean(option(renderVideo("Seedance 2.0", { incoming: sourceFrame }), "Source frame")), false);
});

test("Atlas Seedance 2.5 shows 30/10/10 reference limits without clamping visible counts", () => {
  const incoming = {
    referenceImageIn: Array.from({ length: 31 }, (_, index) => ({ source: { id: `image-${index}`, type: "image", data: { resultUrl: `/uploads/${index}.png` } } })),
    referenceVideoIn: [{ source: { id: "clip", type: "video", data: { resultUrl: "/uploads/clip.mp4" } } }],
    referenceAudioIn: [{ source: { id: "audio", type: "audio", data: { resultUrl: "/uploads/track.mp3" } } }]
  };
  const view = renderVideo("Seedance 2.5", { incoming });
  assert.match(view.html, /Add Images \( 31\/30 \)/);
  assert.match(view.html, /Add Videos \( 1\/10 \)/);
  assert.match(view.html, /Add Audio \( 1\/10 \)/);
  assert.doesNotMatch(renderVideo("Seedance 2.5", { provider: "fal", incoming }).html, /Add Images \( 31\/30 \)/);
});
