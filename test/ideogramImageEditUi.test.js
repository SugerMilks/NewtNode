import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openAiImage25Models } from "../src/openAiImage25.js";
import { ideogramImageEditModel, ideogramImageEditQualityOptions } from "../src/ideogramImageEdit.js";

// Exercise controls and multipart construction with fake hooks/canvases. No provider calls.
const source = readFileSync(new URL("../src/components/ImageEditStudio.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { nodeApi as studioApi };`,
  resolveDir: fileURLToPath(new URL("../src/components", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" }, loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { ImageEditStudio, studioApi } = module.exports;

function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const find = (tree, label) => elements(tree).find((element) => element.props["aria-label"] === label || element.props.label === label);
const options = (select) => React.Children.toArray(select.props.children).map((option) => option.props.value);
const generateButton = (tree) => elements(tree).find((element) => element.type === "button" && element.props.className === "ies-primary");

function studio(t, initialProps = {}) {
  const states = [], refs = [], requests = [];
  let stateIndex, refIndex;
  t.mock.method(React, "useState", (initial) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  });
  t.mock.method(React, "useRef", (initial) => { const index = refIndex++; return refs[index] ||= { current: initial }; });
  t.mock.method(React, "useEffect", () => {});
  t.mock.method(React, "useLayoutEffect", () => {});
  t.mock.method(globalThis, "fetch", () => { throw new Error("No network in UI tests"); });
  t.mock.method(studioApi, "editImage", async (form) => {
    requests.push(form);
    return { item: { url: `/outputs/edit-${requests.length}.png`, type: "image", provider: "fal.ai", width: 64, height: 96 } };
  });
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => {
    assert.equal(tag, "canvas");
    let hasPixels = false;
    const context = { clearRect() { hasPixels = false; }, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
      fill() { hasPixels = true; }, stroke() { hasPixels = true; }, getImageData: () => ({ data: [0, 0, 0, hasPixels ? 255 : 0] }) };
    return { getContext: () => context, toBlob: (resolve) => resolve(new Blob(["mock layer"], { type: "image/png" })) };
  } };
  t.after(() => { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  const props = { item: { url: "/uploads/source.png", label: "Source", editContext: { nodeId: "source" } },
    provider: "fal", workflowContext: { projectId: "test-project" }, ...initialProps };
  const render = (patch = {}) => {
    Object.assign(props, patch); stateIndex = 0; refIndex = 0;
    return ImageEditStudio(props);
  };
  const change = (label, value) => find(render(), label).props.onChange({ target: { value } });
  const resize = (width, height) => elements(render()).find((element) => element.type === "img").props.onLoad({ currentTarget: { naturalWidth: width, naturalHeight: height } });
  resize(64, 96);
  change("Edit prompt", "Keep the framing and make the jacket blue");
  const paint = () => {
    const surface = elements(render()).find((element) => element.props.className?.startsWith("ies-surface"));
    surface.props.ref.current = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 96 }) };
    const event = { button: 0, clientX: 20, clientY: 30, pointerId: 1, preventDefault() {}, stopPropagation() {},
      currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} } };
    surface.props.onPointerDown(event);
    elements(render()).find((element) => element.props.className?.startsWith("ies-surface")).props.onPointerUp(event);
  };
  return { render, change, resize, paint, requests, generate: () => generateButton(render()).props.onClick() };
}

test("Image Edit keeps Sunburst, High quality and existing controls as its defaults", (t) => {
  const state = studio(t);
  const tree = state.render();
  assert.equal(find(tree, "Edit model").props.value, openAiImage25Models.sunburst);
  assert.deepEqual(options(find(tree, "Edit model")), [openAiImage25Models.sunburst, ideogramImageEditModel]);
  assert.equal(find(tree, "Edit quality").props.value, "high");
  assert.deepEqual(options(find(tree, "Edit quality")), ["high", "xhigh", "max"]);
  assert.equal(find(tree, "Edit precision"), undefined);
  assert.equal(find(tree, "Edit prompt").props.maxLength, 16000);
  assert.match(renderToStaticMarkup(tree), /Image 2.5 Sunburst <span>Fal<\/span>/);
});

test("model switching updates controls without discarding the prompt, drawing or undo history", (t) => {
  const state = studio(t);
  state.paint();
  state.change("Edit quality", "max");
  state.change("Edit model", ideogramImageEditModel);
  let tree = state.render();
  assert.equal(find(tree, "Edit quality").props.value, "high");
  assert.deepEqual(options(find(tree, "Edit quality")), ideogramImageEditQualityOptions);
  assert.equal(find(tree, "Edit precision").props.value, "regular");
  assert.deepEqual(options(find(tree, "Edit precision")), ["regular", "high"]);
  assert.equal(find(tree, "Edit prompt").props.maxLength, 10000);
  assert.equal(find(tree, "Undo stroke").props.disabled, false);
  state.change("Edit quality", "very_low");
  state.change("Edit model", openAiImage25Models.sunburst);
  tree = state.render();
  assert.equal(find(tree, "Edit quality").props.value, "high");
  assert.equal(find(tree, "Edit precision"), undefined);
  assert.equal(find(tree, "Edit prompt").props.value, "Keep the framing and make the jacket blue");
  assert.equal(find(tree, "Undo stroke").props.disabled, false);
});

test("both models submit explicit model and quality, while precision is Ideogram-only", async (t) => {
  const state = studio(t);
  await state.generate();
  assert.equal(state.requests[0].get("model"), openAiImage25Models.sunburst);
  assert.equal(state.requests[0].get("quality"), "high");
  assert.equal(state.requests[0].get("editPrecision"), null);
  state.change("Edit version", "-1");
  state.paint();
  state.change("Edit model", ideogramImageEditModel);
  state.change("Edit quality", "medium");
  state.change("Edit precision", "high");
  await state.generate();
  const form = state.requests[1];
  assert.equal(form.get("model"), ideogramImageEditModel);
  assert.equal(form.get("quality"), "medium");
  assert.equal(form.get("editPrecision"), "high");
  assert.equal(form.get("sourceUrl"), "/uploads/source.png");
  assert.equal(form.get("projectId"), "test-project");
  assert.equal(form.get("nodeId"), "source");
  assert.equal(form.get("drawing").type, "image/png");
  assert.notEqual(form.get("requestId"), state.requests[0].get("requestId"));
  assert.match(renderToStaticMarkup(state.render()), /Ideogram 4.5 <span>Fal<\/span>/);
  state.change("Edit version", "0");
  assert.match(renderToStaticMarkup(state.render()), /Image 2.5 Sunburst <span>Fal<\/span>/);
  state.change("Edit version", "-1");
  assert.equal(find(state.render(), "Edit model").props.value, ideogramImageEditModel);
  assert.equal(find(state.render(), "Undo stroke").props.disabled, false);
  assert.equal(find(state.render(), "Edit prompt").props.value, form.get("prompt"));
});

test("Ideogram needs Fal and never submits through Atlas, Krea or an unavailable provider", async (t) => {
  const state = studio(t);
  state.change("Edit model", ideogramImageEditModel);
  for (const provider of ["atlas", "krea", ""]) {
    const tree = state.render({ provider, falAvailable: true });
    assert.equal(generateButton(tree).props.disabled, true);
    assert.match(renderToStaticMarkup(tree), /Enable Fal in Settings to use Ideogram 4.5 image editing/);
    assert.match(renderToStaticMarkup(tree), /Ideogram 4.5 <span>Fal required<\/span>/);
    await state.generate();
  }
  assert.equal(state.requests.length, 0);
  assert.equal(generateButton(state.render({ provider: "fal" })).props.disabled, false);
  state.change("Edit model", openAiImage25Models.sunburst);
  assert.equal(generateButton(state.render({ provider: "atlas" })).props.disabled, false);
});

test("Ideogram permits its wider edit aspect ratios while Sunburst validation is preserved", async (t) => {
  const state = studio(t);
  state.resize(4000, 1000);
  await state.generate();
  assert.equal(state.requests.length, 0);
  assert.match(renderToStaticMarkup(state.render()), /between 1:3 and 3:1/);
  state.change("Edit model", ideogramImageEditModel);
  await state.generate();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].get("model"), ideogramImageEditModel);
});
