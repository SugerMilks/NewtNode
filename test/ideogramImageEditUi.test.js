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
import { nanoBanana21ModelName, nanoBanana21ResolutionOptions } from "../src/nanoBanana21.js";

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

test("Image Edit defaults to Ideogram, High quality and Regular precision, with Nano Banana and Sunburst available", (t) => {
  const state = studio(t);
  const tree = state.render();
  assert.equal(find(tree, "Edit model").props.value, ideogramImageEditModel);
  assert.deepEqual(options(find(tree, "Edit model")), [ideogramImageEditModel, nanoBanana21ModelName, openAiImage25Models.sunburst]);
  assert.equal(find(tree, "Edit quality").props.value, "high");
  assert.deepEqual(options(find(tree, "Edit quality")), ideogramImageEditQualityOptions);
  assert.equal(find(tree, "Edit precision").props.value, "regular");
  assert.equal(find(tree, "Edit prompt").props.maxLength, 10000);
  const sketchMethod = React.Children.toArray(find(tree, "Edit method").props.children).find(option => option.props.value === "sketch");
  assert.equal(sketchMethod.props.children, "Generate from Sketch");
  assert.match(renderToStaticMarkup(tree), /Ideogram 4.5 <span>Fal<\/span>/);
});

test("model switching updates controls without discarding the prompt, drawing or undo history", (t) => {
  const state = studio(t);
  state.paint();
  state.change("Edit model", openAiImage25Models.sunburst);
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
  state.change("Edit model", openAiImage25Models.sunburst);
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
  state.change("Edit model", openAiImage25Models.sunburst);
  state.resize(4000, 1000);
  await state.generate();
  assert.equal(state.requests.length, 0);
  assert.match(renderToStaticMarkup(state.render()), /between 1:3 and 3:1/);
  state.change("Edit model", ideogramImageEditModel);
  await state.generate();
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].get("model"), ideogramImageEditModel);
});

test("Nano Banana uses resolution controls and retains drawing, selections and prompt when switching models", async (t) => {
  const state = studio(t);
  state.paint();
  find(state.render(), "Selection layer").props.onClick();
  state.paint();
  state.change("Edit model", nanoBanana21ModelName);
  const tree = state.render();
  assert.equal(find(tree, "Edit resolution").props.value, "2K");
  assert.deepEqual(options(find(tree, "Edit resolution")), nanoBanana21ResolutionOptions);
  assert.equal(find(tree, "Edit quality"), undefined);
  assert.equal(find(tree, "Edit precision"), undefined);
  assert.equal(find(tree, "Undo stroke").props.disabled, false);
  state.change("Edit resolution", "4K");
  await state.generate();
  const form = state.requests[0];
  assert.equal(form.get("model"), nanoBanana21ModelName);
  assert.equal(form.get("resolution"), "4K");
  assert.equal(form.get("quality"), null);
  assert.equal(form.get("editPrecision"), null);
  assert.equal(form.get("drawing").type, "image/png");
  assert.equal(form.get("selection").type, "image/png");
  assert.equal(form.get("prompt"), "Keep the framing and make the jacket blue");
  state.change("Edit version", "-1");
  state.change("Edit model", ideogramImageEditModel);
  assert.equal(find(state.render(), "Edit quality").props.value, "high");
  assert.equal(find(state.render(), "Undo stroke").props.disabled, false);
  state.change("Edit model", nanoBanana21ModelName);
  assert.equal(find(state.render(), "Edit resolution").props.value, "4K");
});

test("Nano Banana editing requires Fal without silent provider or model fallback", async (t) => {
  const state = studio(t);
  state.change("Edit model", nanoBanana21ModelName);
  for (const provider of ["atlas", "krea", ""]) {
    assert.equal(generateButton(state.render({ provider })).props.disabled, true);
    await state.generate();
  }
  assert.equal(state.requests.length, 0);
  assert.equal(generateButton(state.render({ provider: "fal" })).props.disabled, false);
});

function comparison(state, rect = { left: 100, top: 50, width: 400, height: 240 }) {
  const surface = elements(state.render()).find(element => element.props.className?.startsWith("ies-surface"));
  surface.props.ref.current = { getBoundingClientRect: () => rect };
  const captured = new Set();
  const element = { focus() {}, setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id) };
  const divider = () => find(state.render(), "Comparison divider");
  const event = (clientX, type = "pointermove", pointerId = 1) => ({ clientX, clientY: 120, type, pointerId, button: 0,
    currentTarget: element, preventDefault() {}, stopPropagation() {} });
  const keyboard = (key, shiftKey = false) => state.render().props.onKeyDownCapture({ key, shiftKey, target: { closest: selector => selector === ".ies-split-line" }, preventDefault() {}, stopPropagation() {} });
  return { divider, event, keyboard, captured, value: () => divider().props["aria-valuenow"], transform: () => elements(state.render()).find(element => element.props.className?.startsWith("ies-surface")).props.style.transform };
}

test("comparison is dragged on the image without a separate range, pan, marks or extra generation", async t => {
  const state = studio(t); state.paint(); await state.generate();
  const compare = comparison(state);
  assert.equal(find(state.render(), "Comparison split"), undefined);
  assert.equal(compare.value(), 50);
  assert.equal(compare.divider().props.role, "slider");
  const transform = compare.transform();
  compare.divider().props.onPointerDown(compare.event(308, "pointerdown"));
  assert.equal(compare.value(), 50, "grabbing the wide hit area does not jump the divider");
  assert.ok(compare.captured.has(1));
  compare.divider().props.onPointerMove(compare.event(408));
  assert.equal(compare.value(), 75);
  assert.equal(compare.transform(), transform);
  compare.divider().props.onPointerMove(compare.event(200, "pointermove", 2));
  assert.equal(compare.value(), 75, "a second pointer cannot steal the drag");
  compare.divider().props.onPointerUp(compare.event(448, "pointerup"));
  assert.equal(compare.value(), 85); assert.equal(compare.captured.size, 0);
  assert.equal(state.requests.length, 1);
  const result = elements(state.render()).find(element => element.props.className === "ies-result");
  assert.equal(result.props.style.clipPath, "inset(0 0 0 85%)");
  state.change("Edit version", "-1");
  assert.equal(find(state.render(), "Undo stroke").props.disabled, false);
});

test("divider follows zoomed/panned bounds, clamps at edges and supports keyboard adjustment", async t => {
  const state = studio(t); await state.generate();
  const compare = comparison(state, { left: -200, top: -100, width: 800, height: 480 });
  compare.divider().props.onPointerDown(compare.event(200, "pointerdown"));
  compare.divider().props.onPointerMove(compare.event(400));
  assert.equal(compare.value(), 75);
  compare.divider().props.onPointerMove(compare.event(900));
  assert.equal(compare.value(), 100);
  compare.divider().props.onPointerUp(compare.event(-400, "pointerup"));
  assert.equal(compare.value(), 0);
  compare.keyboard("ArrowRight"); assert.equal(compare.value(), 1);
  compare.keyboard("ArrowRight", true); assert.equal(compare.value(), 11);
  compare.keyboard("End"); assert.equal(compare.value(), 100);
  compare.keyboard("ArrowRight"); assert.equal(compare.value(), 100);
  compare.keyboard("Home"); assert.equal(compare.value(), 0);
  assert.equal(state.requests.length, 1);
});

for (const cancellation of ["pointercancel", "lostpointercapture", "blur", "Escape"]) test(`comparison ${cancellation} restores the split and releases the pointer without closing`, async t => {
  const state = studio(t); await state.generate();
  const compare = comparison(state);
  compare.divider().props.onPointerDown(compare.event(300, "pointerdown"));
  compare.divider().props.onPointerMove(compare.event(400));
  assert.equal(compare.value(), 75);
  if (cancellation === "Escape") compare.keyboard("Escape");
  else if (cancellation === "blur") compare.divider().props.onBlur();
  else compare.divider().props[cancellation === "pointercancel" ? "onPointerCancel" : "onLostPointerCapture"](compare.event(400, cancellation));
  assert.equal(compare.value(), 50); assert.equal(compare.captured.size, 0);
  assert.equal(find(state.render(), "Discard edit draft"), undefined);
  compare.divider().props.onPointerMove(compare.event(450));
  assert.equal(compare.value(), 50);
});
