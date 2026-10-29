import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { videoDefaultModel, videoModelNames, videoModelOptions, enabledVideoModelOptions, firstEnabledVideoModel, normalizeModelPreferences } from "../src/modelOptions.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({
  stdin: { contents: `${source}\nexport { NodeBody, connectedAssetItems, runVideoModelGeneration, videoModelSelectionPatch, normalizeCurrentNode, createDefaultNodeData };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" }
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody } = module.exports;

test("fresh video defaults select Seedance 2.5 without enabling Draft or editing", () => {
  const { createDefaultNodeData } = module.exports;
  assert.equal(videoDefaultModel, videoModelNames.seedance25);
  const data = createDefaultNodeData("videoModel", "Video Model", 1);
  assert.equal(data.model, videoDefaultModel);
  assert.equal(data.duration, "15 seconds");
  assert.equal(data.resolution, "720p");
  assert.equal(data.aspectRatio, "16:9 (Landscape)");
  assert.equal(data.generateAudio, true);
  assert.equal(data.seedanceDraft === true, false);
  assert.equal(data.seedanceTask || "reference", "reference");
  assert.equal(createDefaultNodeData("frameIt", "Frame It", 1).frameItVideoModel, videoDefaultModel);
  assert.equal(createDefaultNodeData("skillDirector", "Director", 1).skillVideoModel, videoDefaultModel);
  for (const provider of ["fal", "krea", "atlas"]) {
    const view = renderVideo(data.model, { provider, data });
    assert.equal(hasAttr(option(view, videoDefaultModel), "selected"), true);
    assert.equal(attr(view.elements.find(element => attr(element, "aria-label") === "Seedance Draft mode"), "aria-checked"), "false");
  }
});

test("video creation prefers Seedance 2.5 while respecting disabled models", () => {
  const start = source.indexOf("  function createNodeData(");
  const end = source.indexOf("\n  function ", start + 1);
  assert.ok(start >= 0 && end > start);
  const onlyKling = { video: Object.fromEntries(videoModelOptions.map(model => [model, model === videoModelNames.klingO3Pro])) };
  const disabled25 = { video: { [videoDefaultModel]: false } };
  const allDisabled = { video: Object.fromEntries(videoModelOptions.map(model => [model, false])) };
  for (const [preferences, expected] of [[{}, videoDefaultModel], [disabled25, videoModelNames.seedance], [onlyKling, videoModelNames.klingO3Pro], [allDisabled, videoDefaultModel]]) {
    const enabled = enabledVideoModelOptions(preferences);
    const create = new Function("createDefaultNodeData", "enabledVideoModels", "videoDefaultModel", "videoModelSelectionPatch", `${source.slice(start, end)}\nreturn createNodeData;`)(module.exports.createDefaultNodeData, enabled, videoDefaultModel, module.exports.videoModelSelectionPatch);
    assert.equal(create("videoModel", "Video Model", 1).model, expected);
    assert.equal(firstEnabledVideoModel(preferences), expected);
  }
  assert.equal(normalizeModelPreferences(disabled25).video[videoDefaultModel], false);
});

test("new video defaults do not migrate saved models or legacy missing-model choices", () => {
  const { normalizeCurrentNode } = module.exports;
  for (const model of videoModelOptions) {
    const node = { id: "saved", type: "videoModel", data: { model, prompt: "Keep this scene", resultUrl: "/outputs/existing.mp4", resultItems: [{ url: "/outputs/existing.mp4", type: "video" }] } };
    const before = structuredClone(node);
    const reopened = normalizeCurrentNode(node);
    assert.equal(reopened.data.model, model);
    assert.equal(reopened.data.prompt, before.data.prompt);
    assert.equal(reopened.data.resultUrl, before.data.resultUrl);
    assert.deepEqual(reopened.data.resultItems, before.data.resultItems);
    assert.deepEqual(node, before);
    assert.equal(normalizeCurrentNode({ id: "frame", type: "frameIt", data: { frameItVideoModel: model } }).data.frameItVideoModel, model);
  }
  assert.equal(normalizeCurrentNode({ id: "old", type: "videoModel", data: {} }).data.model, videoModelNames.seedance);
  assert.equal(normalizeCurrentNode({ id: "old-frame", type: "frameIt", data: {} }).data.frameItVideoModel, videoModelNames.seedance);
});

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

test("Draft UI fixes preview resolution, preserves normal resolution and disables unsupported providers", () => {
  const data = { resolution: "1080p", seedanceDraft: true };
  for (const provider of ["fal", "atlas", "krea"]) {
    const view = renderVideo("Seedance 2.5", { provider, data });
    const toggle = view.elements.find(node => attr(node, "aria-label") === "Seedance Draft mode");
    assert.equal(attr(toggle, "aria-checked"), "true");
    assert.equal(hasAttr(toggle, "disabled"), false, "Can always turn an unsupported draft off");
    const resolution = option(view, "480p");
    assert.equal(hasAttr(resolution, "selected"), true); assert.equal(hasAttr(resolution.parentNode, "disabled"), true);
    const run = view.elements.find(node => attr(node, "class") === "run-node-button");
    assert.equal(hasAttr(run, "disabled"), false);
    const off = renderVideo("Seedance 2.5", { provider, data: { seedanceDraft: false } });
    assert.equal(hasAttr(off.elements.find(node => attr(node, "aria-label") === "Seedance Draft mode"), "disabled"), false);
    if (provider === "krea") assert.match(view.html, /Krea preview only/);
  }
  assert.equal(data.resolution, "1080p");
  assert.ok(!renderVideo("Seedance 2.0", { provider: "fal" }).html.includes("Seedance Draft mode"));
});

test("Atlas draft finishing uses the saved provider, while Krea previews cannot be finished", () => {
  const draft = { receiptId: "atlas-test", draftId: "atlas-draft", provider: "atlas", expiresAt: new Date(Date.now() + 86400000).toISOString() };
  const data = { resultItems: [{ url: "/outputs/draft.mp4", type: "video", seedanceDraft: draft }], selectedResultIndex: 0 };
  const atlas = renderVideo("Seedance 2.5", { provider: "fal", data });
  assert.match(atlas.html, /original Atlas Cloud key/); assert.match(atlas.html, /Finish at 1080p/);
  const krea = renderVideo("Seedance 2.5", { provider: "atlas", data: { ...data,
    resultItems: [{ ...data.resultItems[0], seedanceDraft: { provider: "krea", completionSupported: false } }] } });
  assert.match(krea.html, /Krea draft \/ Preview only/); assert.doesNotMatch(krea.html, /Finish at 1080p/);
});

test("draft results retain Finish after model changes and save/reopen", () => {
  const draft = { receiptId: "test", draftId: "fal-draft", expiresAt: new Date(Date.now() + 86400000).toISOString() };
  const node = { id: "v", type: "videoModel", data: { model: "Seedance 2.5", seedanceDraft: true,
    resultItems: [{ url: "/outputs/preview.mp4", type: "video", seedanceDraft: draft }], selectedResultIndex: 0, resolution: "1080p" } };
  const normalized = module.exports.normalizeCurrentNode(JSON.parse(JSON.stringify(node)));
  assert.equal(normalized.data.seedanceDraft, true); assert.deepEqual(normalized.data.resultItems[0].seedanceDraft, draft);
  const view = renderVideo("MiniMax H3", { provider: "fal", data: { ...normalized.data, model: "MiniMax H3" } });
  assert.match(view.html, /Finish at 1080p/); assert.match(view.html, /Draft \/ 480p/);
});

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

test("Seedance edit controls match the source without mutating stored generation choices", () => {
  for (const provider of ["atlas", "fal", "krea"]) {
    const view = renderVideo("Seedance 2.5", { provider, data: { seedanceTask: "edit", duration: "9 seconds", aspectRatio: "21:9" } });
    const sources = view.elements.filter(node => node.tagName === "option" && text(node) === "Source video");
    assert.equal(sources.length, 2);
    for (const node of sources) assert.equal(hasAttr(node.parentNode, "disabled"), true);
    assert.equal(hasAttr(option(view, "Edit Existing Video"), "selected"), true);
    assert.equal(hasAttr(option(view, "Edit Existing Video"), "disabled"), provider === "krea");
    assert.equal(hasAttr(view.elements.find(node => attr(node, "class") === "run-node-button"), "disabled"), provider === "krea");
    assert.match(view.html, /Source video \( 0\/1 \)/);
  }
  const normal = renderVideo("Seedance 2.5", { data: { duration: "9 seconds", aspectRatio: "21:9" } });
  assert.equal(hasAttr(option(normal, "Generate Video"), "selected"), true);
  assert.equal(hasAttr(option(normal, "9 seconds"), "selected"), true);
  assert.equal(hasAttr(option(normal, "21:9"), "selected"), true);
  assert.equal(option(renderVideo("Seedance 2.0"), "Edit Existing Video"), undefined);
});

test("connected video-run assets use the same named tags shown on the node", () => {
  const connection = (type, title, file) => ({ source: { id: title, type, data: { title,
    resultUrl: `/uploads/${file}`, resultItems: [{ url: `/uploads/${file}`, type, label: file }], selectedResultIndex: 0 } } });
  const image = connection("image", "Plate", "timestamp-plate.png");
  const video = connection("video", "Clip", "timestamp-clip.mov");
  const audio = connection("audio", "Music", "timestamp-music.wav");
  const prompt = "Edit @Clip using @Plate and @Music.";
  for (const item of [image, video, audio]) {
    assert.equal(module.exports.connectedAssetItems([item], { prompt })[0].label, `@${item.source.data.title}`);
    assert.notEqual(module.exports.connectedAssetItems([item])[0].label, `@${item.source.data.title}`);
  }
});

test("actual video runner submits named references, retains outputs, and checks edit capability before POST", async (t) => {
  const requests = [];
  const node = { id: "video", type: "videoModel", data: { model: "Seedance 2.5", seedanceTask: "edit",
    duration: "5 seconds", aspectRatio: "16:9", resolution: "1080p", resultUrl: "/outputs/old.mp4" } };
  const incoming = { referenceImageIn: [{ source: { id: "image", type: "image", data: { title: "Plate", resultUrl: "/uploads/timestamp.png" } } }],
    referenceVideoIn: [{ source: { id: "clip", type: "video", data: { title: "Clip", resultUrl: "/uploads/timestamp.mov" } } }] };
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requests.push({ url, body: options.body && JSON.parse(options.body) });
    return new Response(JSON.stringify(String(url).endsWith("/api/health") ? { routes: { seedanceVideoEditing: true } }
      : { video: { localUrl: "/outputs/edited.mp4" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const before = JSON.stringify({ node, incoming });
  const result = await module.exports.runVideoModelGeneration({ node, incoming, incomingByNode: {}, prompt: "Edit @Clip with @Plate.", index: 0 });
  assert.equal(result.url, "/outputs/edited.mp4");
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /api\/health$/);
  assert.equal(requests[1].body.seedanceTask, "edit");
  assert.equal(requests[1].body.duration, "Auto");
  assert.equal(requests[1].body.aspectRatio, "Auto");
  assert.deepEqual(requests[1].body.referenceImageLabels, ["@Plate"]);
  assert.deepEqual(requests[1].body.referenceVideoLabels, ["@Clip"]);
  assert.equal(JSON.stringify({ node, incoming }), before);
  requests.length = 0;
  globalThis.fetch = async (url) => { requests.push({ url }); return new Response(JSON.stringify({ routes: {} })); };
  await assert.rejects(module.exports.runVideoModelGeneration({ node, incoming, incomingByNode: {}, prompt: "Edit @Clip", index: 0 }), /Restart.*backend/);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /api\/health$/);
});

test("edit choice survives workflow serialization and restoration without changing default models", () => {
  const original = { id: "video", type: "videoModel", position: { x: 10, y: 20 }, data: { model: "Seedance 2.5", seedanceTask: "edit", duration: "9 seconds", aspectRatio: "21:9", resolution: "1080p" } };
  const restored = module.exports.normalizeCurrentNode(JSON.parse(JSON.stringify(original)));
  assert.equal(restored.data.seedanceTask, "edit");
  assert.equal(restored.data.duration, "9 seconds");
  assert.equal(restored.data.aspectRatio, "21:9");
  assert.equal(module.exports.videoModelSelectionPatch(original.data, "Seedance 2.5").seedanceTask, "edit");
  assert.equal(module.exports.videoModelSelectionPatch({ model: "Seedance 2.0" }, "Seedance 2.5").seedanceTask, "reference");
});
