import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { registerImageEditRoutes } from "../server/routes/imageEdit.js";
import { generationProviderFromSettings } from "../src/generationPricing.js";

// Exercise the registered handler without sockets, credentials or remote requests.
async function editor(overrides = {}) {
  const source = await sharp({ create: { width: 64, height: 96, channels: 4, background: "#123456" } }).png().toBuffer();
  const calls = [], saves = [], histories = [];
  let handler;
  registerImageEditRoutes({ post: (path, ...handlers) => {
    assert.equal(path, "/api/node/edit-image");
    handler = handlers.at(-1);
  } }, {
    limiter: (_req, _res, next) => next(), hasFal: () => true,
    readSource: async () => ({ buffer: source }),
    generate: async (request) => { calls.push(request); return { endpoint: "test/sunburst/edit", remoteImage: { url: "mock-result" } }; },
    readGenerated: async () => source,
    save: async (req, buffer) => { saves.push({ body: req.body, buffer }); return { url: "/workflow-assets/test/outputs/edit.png", fileName: "edit.png" }; },
    recordHistory: async (item) => histories.push(item),
    sendError: (res, error) => res.status(error.status || 500).json({ error: error.message }),
    ...overrides
  });
  const post = async (changes = {}, layers = {}) => {
    const response = { status: 200, body: null };
    await handler({
      body: { sourceUrl: "/uploads/source.png", requestId: randomUUID(), prompt: "Make the jacket blue", projectId: "project", projectName: "Edit QA",
        workflowPackagePath: "/fixture/project", nodeId: "image1", mode: "edit", quality: "high", ...changes },
      files: Object.fromEntries(Object.entries(layers).map(([name, buffer]) => [name, [{ buffer }]]))
    }, {
      status(value) { response.status = value; return this; },
      json(value) { response.body = value; }
    });
    return response;
  };
  return { post, source, calls, saves, histories };
}

test("legacy hasFal routes retain native output, workflow context and unknown Fal cost", async () => {
  const state = await editor();
  const { status, body } = await state.post();
  assert.equal(status, 200);
  assert.equal(state.calls[0].provider, "fal");
  assert.equal(state.calls[0].model, "OpenAI Image 2.5 Sunburst");
  assert.equal(body.item.width, 64); assert.equal(body.item.height, 96);
  assert.equal(body.item.cost.amountUsd, null);
  assert.equal(body.item.cost.provider, "fal.ai");
  assert.equal(state.histories[0].provider, "fal.ai");
  assert.equal(state.histories[0].node.id, "image1");
  assert.equal(state.histories[0].localImage, body.item.url);
  assert.equal(state.saves[0].body.workflowPackagePath, "/fixture/project");
});

test("getProvider is captured once before source preparation and passed to masked Atlas generation", async () => {
  let provider = "atlas", reads = 0, submitted;
  const cost = { amountUsd: 0.12, currency: "USD", provider: "Atlas Cloud", pricingSource: "test-reported" };
  const state = await editor({
    hasFal: () => { throw new Error("Legacy provider lookup must not run"); },
    getProvider: () => { reads++; return provider; },
    readSource: async () => { provider = "fal"; return { buffer: state.source }; },
    generate: async (request) => { submitted = request; return { provider: "Atlas Cloud", cost, endpoint: "test/atlas/edit", remoteImage: { url: "mock-result" } }; }
  });
  const response = await state.post({ mode: "remove", prompt: "", provider: "krea" }, { selection: state.source });
  assert.equal(response.status, 200);
  assert.equal(reads, 1); assert.equal(submitted.provider, "atlas"); assert.ok(submitted.mask);
  assert.equal(submitted.images.length, 1);
  assert.equal(response.body.item.provider, "Atlas Cloud");
  assert.deepEqual(response.body.item.cost, cost);
  assert.equal(state.histories[0].provider, "Atlas Cloud");
  assert.equal(state.histories[0].endpoint, "test/atlas/edit");
  assert.equal(state.histories[0].settings.maskedEdit, true);
  assert.deepEqual(state.histories[0].cost, cost);
});

test("an explicit unavailable or unsupported provider never falls back to hasFal", async () => {
  for (const provider of ["", "krea", "unknown", undefined]) {
    const state = await editor({ getProvider: () => provider, hasFal: () => { throw new Error("Unexpected fallback"); },
      readSource: () => { throw new Error("Source should not be read"); } });
    const response = await state.post();
    assert.equal(response.status, 400);
    assert.match(response.body.error, /Enable Fal.*disable Krea.*Atlas Cloud/);
    assert.equal(state.calls.length, 0);
  }
  for (const hasFal of [() => false, undefined]) {
    const state = await editor({ hasFal });
    assert.equal((await state.post()).status, 400);
    assert.equal(state.calls.length, 0);
  }
});

test("getProvider can select Fal without a legacy hasFal callback", async () => {
  const state = await editor({ getProvider: () => "fal", hasFal: undefined });
  assert.equal((await state.post()).status, 200);
  assert.equal(state.calls[0].provider, "fal");
});

test("duplicate requests retain their original provider and never generate again after settings change", async () => {
  let provider = "atlas";
  const state = await editor({ getProvider: () => provider });
  const requestId = randomUUID();
  const [first, duplicate] = await Promise.all([state.post({ requestId }), state.post({ requestId })]);
  assert.equal(first.status, 200); assert.deepEqual(first, duplicate);
  provider = "fal";
  assert.deepEqual(await state.post({ requestId }), first);
  assert.equal(first.body.item.provider, "Atlas Cloud");
  assert.equal(state.calls.length, 1); assert.equal(state.saves.length, 1);
  assert.equal(state.calls[0].provider, "atlas");
  assert.equal((await state.post({ requestId, prompt: "Different edit" })).status, 409);
  assert.equal(state.calls.length, 1);
});

test("Atlas provider failures stay cached and never retry or fall back", async () => {
  let runs = 0;
  const state = await editor({ getProvider: () => "atlas", generate: async ({ provider }) => {
    assert.equal(provider, "atlas"); runs++;
    throw Object.assign(new Error("Atlas content policy rejection"), { status: 422 });
  } });
  const requestId = randomUUID();
  for (let i = 0; i < 2; i++) {
    const response = await state.post({ requestId });
    assert.equal(response.status, 422); assert.match(response.body.error, /Atlas content policy/);
  }
  assert.equal(runs, 1); assert.equal(state.saves.length, 0);
});

test("save and download failures name the returned provider, preserving the legacy Fal warning", async () => {
  for (const stage of ["readGenerated", "save"]) {
    let runs = 0;
    const state = await editor({ getProvider: () => "atlas",
      generate: async () => { runs++; return { provider: "Atlas Cloud (test account)", remoteImage: { url: "mock-result" } }; },
      [stage]: async () => { throw new Error(`${stage} failed`); }
    });
    const requestId = randomUUID();
    for (let i = 0; i < 2; i++) {
      const response = await state.post({ requestId });
      assert.equal(response.status, 502);
      assert.match(response.body.error, /completed.*Check Atlas Cloud \(test account\) history/);
      assert.doesNotMatch(response.body.error, /Fal/);
    }
    assert.equal(runs, 1);
  }
  const legacy = await editor({ readGenerated: async () => { throw new Error("download failed"); } });
  assert.match((await legacy.post()).body.error, /Check Fal history/);
});

test("returned cost and provider remain authoritative, including zero and unknown costs", async () => {
  for (const amountUsd of [0, null]) {
    const cost = { amountUsd, currency: "USD", pricingSource: "test-reported" };
    const state = await editor({ getProvider: () => "atlas", generate: async () => ({ provider: "Atlas Cloud (test account)", cost, remoteImage: { url: "mock-result" } }) });
    const response = await state.post();
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.item.cost, cost);
    assert.deepEqual(state.histories[0].cost, cost);
    assert.equal(state.histories[0].provider, "Atlas Cloud (test account)");
  }
  const state = await editor({ getProvider: () => "atlas" });
  const response = await state.post();
  assert.equal(response.body.item.cost.amountUsd, null);
  assert.equal(response.body.item.cost.provider, "Atlas Cloud");
});

test("invalid edits do not reach Atlas and history failures still retain saved outputs", async () => {
  const state = await editor({ getProvider: () => "atlas" });
  for (const changes of [{ quality: "invented" }, { requestId: "bad" }, { prompt: "" }, { mode: "remove" }, { mode: "sketch", blank: "true" }]) {
    assert.equal((await state.post(changes)).status, 400);
  }
  assert.equal((await state.post({}, { selection: Buffer.from("bad-png") })).status, 400);
  assert.equal(state.calls.length, 0);
  const historyFailure = await editor({ getProvider: () => "atlas", recordHistory: async () => { throw new Error("History unavailable"); } });
  const response = await historyFailure.post();
  assert.equal(response.status, 200); assert.ok(response.body.item.url); assert.match(response.body.warning, /History/);
  assert.equal(historyFailure.saves.length, 1);
});

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/ImageEditStudio.jsx", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" }, loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { ImageEditStudio } = module.exports;

function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function studio(t, initialProps) {
  const states = [], refs = [];
  let stateIndex, refIndex;
  t.mock.method(React, "useState", (initial) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
  });
  t.mock.method(React, "useRef", (initial) => { const index = refIndex++; return refs[index] ||= { current: initial }; });
  t.mock.method(React, "useEffect", () => {});
  t.mock.method(React, "useLayoutEffect", () => {});
  const props = { item: { url: "/uploads/source.png", label: "Source" }, ...initialProps };
  const render = (patch = {}) => {
    Object.assign(props, patch); stateIndex = 0; refIndex = 0;
    return ImageEditStudio(props);
  };
  let tree = render();
  elements(tree).find((element) => element.type === "img").props.onLoad({ currentTarget: { naturalWidth: 64, naturalHeight: 96 } });
  elements(tree).find((element) => element.props["aria-label"] === "Edit prompt").props.onChange({ target: { value: "Make the jacket blue" } });
  return { render };
}

test("Studio cost hint defaults hidden and follows API Cost without clearing the edit", (t) => {
  const view = studio(t, { provider: "atlas" });
  const hint = (tree) => elements(tree).some((element) => element.props.className === "ies-cost");
  assert.equal(hint(view.render()), false);
  assert.equal(hint(view.render({ showApiCosts: true })), true);
  const hidden = view.render({ showApiCosts: false });
  assert.equal(hint(hidden), false);
  assert.equal(elements(hidden).find((element) => element.props["aria-label"] === "Edit prompt").props.value, "Make the jacket blue");
});

test("Studio follows provider changes, enables Fal and Atlas, and blocks Krea or unavailable providers", async (t) => {
  const state = studio(t, { provider: "atlas", falAvailable: false });
  const network = t.mock.method(globalThis, "fetch", () => { throw new Error("No network in UI tests"); });
  for (const [provider, label, available] of [["atlas", "Atlas Cloud", true], ["fal", "Fal", true], ["krea", "Krea", false], ["", "Unavailable", false]]) {
    const tree = state.render({ provider });
    const button = elements(tree).find((element) => element.type === "button" && element.props.className === "ies-primary");
    assert.equal(button.props.disabled, !available);
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes(`Image 2.5 Sunburst <span>${label}</span>`));
    if (available) assert.doesNotMatch(html, /Enable Fal,/);
    else {
      assert.match(html, /disable Krea and enable Atlas Cloud/);
      assert.match(html, /Krea does not support masked edits/);
      await button.props.onClick();
      assert.doesNotMatch(renderToStaticMarkup(state.render()), /role="alert"/);
    }
  }
  assert.equal(network.mock.callCount(), 0);
});

test("Studio keeps falAvailable compatibility but explicit provider availability wins", (t) => {
  const state = studio(t, { falAvailable: true });
  const enabled = (tree) => !elements(tree).find((element) => element.type === "button" && element.props.className === "ies-primary").props.disabled;
  assert.equal(enabled(state.render()), true);
  assert.match(renderToStaticMarkup(state.render()), /Sunburst <span>Fal<\/span>/);
  assert.equal(enabled(state.render({ falAvailable: false })), false);
  assert.equal(enabled(state.render({ falAvailable: true, provider: "" })), false);
  assert.equal(enabled(state.render({ falAvailable: false, provider: "atlas" })), true);
});

test("NodeEditor Studio wiring preserves Fal > Krea > Atlas precedence and requires a real enabled key", () => {
  const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const refresh = source.match(/\.then\(\(settings\) => \{([\s\S]*?setImageEditProvider[\s\S]*?)\n      \}\)/)?.[1];
  assert.ok(refresh);
  const select = new Function("settings", "cancelled", "generationProviderFromSettings", "setGenerationProvider", "setImageEditProvider", refresh);
  const cases = [
    [{}, ""],
    [{ falKeyConfigured: true, kreaApiKeyConfigured: true, atlasApiKeyConfigured: true }, "fal"],
    [{ falKeyConfigured: true, kreaApiKeyConfigured: true, atlasApiKeyConfigured: true, providerPreferences: { fal: false } }, ""],
    [{ kreaApiKeyConfigured: true, atlasApiKeyConfigured: true }, ""],
    [{ kreaApiKeyConfigured: true, atlasApiKeyConfigured: true, providerPreferences: { krea: false } }, "atlas"],
    [{ atlasApiKeyConfigured: true }, "atlas"],
    [{ falKeyConfigured: true, atlasApiKeyConfigured: true, providerPreferences: { fal: false, atlas: false } }, ""],
    [{ providerPreferences: { fal: true, atlas: true } }, ""]
  ];
  for (const [settings, expected] of cases) {
    let selected, globalProvider;
    select(settings, false, generationProviderFromSettings, (value) => { globalProvider = value; }, (value) => { selected = value; });
    assert.equal(selected, expected);
    assert.equal(globalProvider, generationProviderFromSettings(settings));
  }
  select({}, true, generationProviderFromSettings, () => assert.fail("Cancelled refresh changed provider"), () => assert.fail("Cancelled refresh changed Studio"));
  assert.match(source, /imageEditProvider=\{imageEditProvider\}/);
  const media = readFileSync(new URL("../src/components/MediaViews.jsx", import.meta.url), "utf8");
  assert.match(media, /<LazyImageEditStudio[^>]*falAvailable=\{falAvailable\} provider=\{imageEditProvider\}/);
});
