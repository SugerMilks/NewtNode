import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { exploreDefaults } from "../src/explore.js";

let hooks;
const require = createRequire(import.meta.url);
const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/ExploreNodeBody.jsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" } });
const module = { exports: {} };
const react = { ...React, useRef: () => ({ current: hooks.refs.shift() }), useState: initial => [
  initial && typeof initial === "object" && "maximum" in initial ? hooks.scroll : initial,
  next => { if (typeof next === "function") hooks.scroll = next(hooks.scroll); }
], useCallback: callback => callback, useEffect: callback => hooks.effects.push(callback) };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(name => name === "react" ? react : require(name), module, module.exports);
const { ExploreNodeBody, handleExploreGalleryWheel } = module.exports;

function wheel(patch = {}) {
  return { deltaX: 0, deltaY: 0, deltaMode: 0, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...patch };
}
const gallery = (patch = {}) => ({ scrollLeft: 0, scrollWidth: 2000, clientWidth: 600, ...patch });

test("Explore scrolls vertically or horizontally using the dominant wheel axis, not their sum", () => {
  for (const [input, expected] of [[{ deltaY: 120 }, 120], [{ deltaX: 100, deltaY: 30 }, 100], [{ deltaX: 30, deltaY: 100 }, 100], [{ deltaY: 2, deltaMode: 1 }, 48], [{ deltaY: 1, deltaMode: 2 }, 600]]) {
    const element = gallery(), event = wheel(input);
    handleExploreGalleryWheel(event, element);
    assert.equal(element.scrollLeft, expected);
    assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  }
});

test("Explore contains gestures at either end and when all thumbnails fit", () => {
  for (const [element, deltaY, expected] of [[gallery(), -100, 0], [gallery({ scrollLeft: 1390 }), 100, 1400], [gallery({ scrollWidth: 400 }), 100, 0]]) {
    const event = wheel({ deltaY }); handleExploreGalleryWheel(event, element);
    assert.equal(element.scrollLeft, expected); assert.equal(event.stopped, true);
  }
});

test("Explore leaves modified zoom and pinch gestures for the canvas", () => {
  for (const key of ["ctrlKey", "metaKey", "altKey"]) {
    const element = gallery(), event = wheel({ deltaY: 100, [key]: true });
    handleExploreGalleryWheel(event, element);
    assert.equal(element.scrollLeft, 0); assert.equal(event.prevented, undefined); assert.equal(event.stopped, undefined);
  }
  assert.doesNotThrow(() => handleExploreGalleryWheel(wheel(), null));
});

function render(scroll = { left: 0, maximum: 1400 }, count = 12, busy = false, data = {}) {
  const element = gallery({ scrollLeft: scroll.left }), browser = { addEventListener() {}, removeEventListener() {} };
  hooks = { refs: [element, browser], effects: [], scroll };
  const updates = [];
  const tree = ExploreNodeBody({ node: { id: "explore", data: { status: busy ? "running" : "complete", model: "Nano Banana Pro", aspectRatio: "16:9", resolution: "1K", ...data,
    resultItems: Array.from({ length: count }, (_, index) => ({ url: `/result-${index}.png`, label: `Direction ${index + 1}` })) } },
    config: { input: [{ id: "promptIn" }], output: [] }, incoming: {}, imageModels: ["Nano Banana Pro", "OpenAI Image 2.5 Flare"], ratios: ["16:9"], resolutions: ["1K", "2K"], qualities: ["low", "medium", "high"], prompt: "A perfume bottle",
    onUpdate: (...args) => updates.push(args), modelPatch: model => ({ model }) });
  const find = (predicate, value = tree) => {
    if (!value || typeof value !== "object") return null;
    if (predicate(value)) return value;
    return [value.props?.children].flat(Infinity).filter(child => child && typeof child === "object").map(child => find(predicate, child)).find(Boolean) || null;
  };
  return { element, browser, updates, find, effects: hooks.effects, label: name => find(item => item.props?.["aria-label"] === name) };
}

test("Explore controls show Flare medium with nine directions and an enabled run button", () => {
  const fixture = render(undefined, 0, false, { ...exploreDefaults(), settingsOpen: true });
  assert.equal(fixture.label("Explore image model").props.value, "OpenAI Image 2.5 Flare");
  assert.equal(fixture.label("Quality").props.value, "medium");
  assert.equal(fixture.label("Directions").props.value, 9);
  assert.equal(fixture.label("Directions").props.max, 25);
  assert.equal(fixture.find(item => item.props?.className === "primary-button explore-run").props.disabled, false);
});

test("Explore accepts a saved 25-direction selection and enables its run button", () => {
  const fixture = render(undefined, 0, false, { ...exploreDefaults(), directionCount: 25, settingsOpen: true });
  assert.equal(fixture.label("Directions").props.value, 25);
  assert.equal(fixture.find(item => item.props?.className === "primary-button explore-run").props.disabled, false);
});

test("Explore exposes independent Random selectors and a persistent default-on mode checkbox", () => {
  const fixture = render(undefined, 0, false, { ...exploreDefaults(), settingsOpen: true });
  assert.equal(fixture.label("Explore Mode").props.checked, true);
  fixture.label("Explore Mode").props.onChange({ target: { checked: false } });
  for (const label of ["Style family", "Grade"]) {
    const control = fixture.label(label);
    assert.ok(control.props.children.some(option => option.props.children === "Random"));
    control.props.onChange({ target: { value: "Random" } });
  }
  assert.deepEqual(fixture.updates, [["explore", { exploreMode: false }], ["explore", { styleFamily: "Random" }], ["explore", { gradePreset: "Random" }]]);
  const closed = render(undefined, 0, false, { settingsOpen: false, exploreMode: false });
  assert.equal(closed.label("Explore Mode").props.checked, false);
  assert.equal(closed.label("Style family"), null);
  assert.equal(render(undefined, 0, true).label("Explore Mode").props.disabled, true);
});

test("persistent controls page through results, scrub directly and respect endpoints without changing the selected output", () => {
  const fixture = render();
  assert.equal(fixture.label("Scroll thumbnails left").props.disabled, true);
  fixture.label("Scroll thumbnails right").props.onClick();
  assert.equal(fixture.element.scrollLeft, 422);
  fixture.label("Scroll thumbnails").props.onChange({ target: { value: "900" } });
  assert.equal(fixture.element.scrollLeft, 900);
  assert.deepEqual(fixture.updates, []);
  assert.equal(render({ left: 1400, maximum: 1400 }).label("Scroll thumbnails right").props.disabled, true);
  assert.equal(render({ left: 0, maximum: 0 }, 1).label("Scroll thumbnails"), null);
  assert.equal(render({ left: 0, maximum: 0 }, 0).label("Creative directions"), null);
  assert.equal(render(undefined, 12, true).label("Scroll thumbnails right").props.disabled, false, "browsing remains available during generation");
});

test("native wheel routing and resize observation are attached and cleaned up with the gallery", t => {
  const fixture = render(), listeners = [], removed = [], observed = [];
  fixture.browser.addEventListener = (...args) => listeners.push(args);
  fixture.browser.removeEventListener = (...args) => removed.push(args);
  const previousObserver = globalThis.ResizeObserver;
  let disconnected = false;
  globalThis.ResizeObserver = class { observe(element) { observed.push(element); } disconnect() { disconnected = true; } };
  t.after(() => { if (previousObserver) globalThis.ResizeObserver = previousObserver; else delete globalThis.ResizeObserver; });
  const cleanup = fixture.effects[0]();
  assert.equal(listeners[0][0], "wheel"); assert.deepEqual(listeners[0][2], { passive: false });
  assert.deepEqual(observed, [fixture.element]);
  listeners[0][1](wheel({ deltaY: 100 })); assert.equal(fixture.element.scrollLeft, 100);
  cleanup(); assert.equal(removed[0][1], listeners[0][1]); assert.equal(disconnected, true);
});
