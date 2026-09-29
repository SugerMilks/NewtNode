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
import { instantiateNewtPreset } from "../src/myNewt/presets.js";
import { myNewtSnapshot } from "../src/myNewt/contract.js";
import { storyboardApproaches, storyboardApproachDetails, storyboardPlanningSettings } from "../src/storyboardWorkflow.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeEditorGraph, createDefaultNodeData };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeEditorGraph, createDefaultNodeData } = module.exports;
const frame = { id: "f1", number: 1, prompt: "Doorway", resultUrl: "/outputs/current.png", protected: true, versions: [{ resultUrl: "/outputs/previous.png", savedAt: 1, prompt: "Previous doorway" }] };

test("Storyboard approach labels and descriptions match selection without changing stored planning values", () => {
  const find = (node, predicate) => predicate(node) ? node : (node.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
  const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
  assert.deepEqual(storyboardApproaches.map(value => storyboardApproachDetails[value].label), ["Standard", "Dialogue", "Action", "Commercial", "Montage"]);
  for (const approach of [undefined, ...storyboardApproaches]) {
    const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardApproach: approach, storyboardTab: "setup", storyboardFrames: [frame] } };
    const original = structuredClone(node);
    const root = parseFragment(renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} })));
    const select = find(root, element => attr(element, "aria-label") === "Storyboard approach");
    const selected = find(select, element => element.tagName === "option" && attr(element, "selected") !== undefined);
    const value = approach || "Narrative";
    assert.equal(attr(selected, "value"), value);
    assert.equal(text(selected), storyboardApproachDetails[value].label);
    const description = find(root, element => attr(element, "id") === attr(select, "aria-describedby"));
    assert.equal(text(description), storyboardApproachDetails[value].description);
    assert.equal(attr(description, "aria-live"), "polite");
    assert.equal(storyboardPlanningSettings(node.data).approach, value);
    assert.deepEqual(node, original);
    const reopened = normalizeEditorGraph([node], [], []).nodes[0];
    assert.equal(storyboardPlanningSettings(reopened.data).approach, value);
    assert.equal(reopened.data.storyboardFrames[0].resultUrl, frame.resultUrl);
    assert.deepEqual(reopened.data.storyboardFrames[0].versions, frame.versions);
  }
});

test("running one panel keeps idle-panel controls editable and QC notes inside collapsed details", () => {
  const find = (node, predicate) => predicate(node) ? node : (node.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
  const frames = [
    { ...frame, protected: false, qcWarning: "QC warning: Check the partner", status: "complete" },
    { ...frame, id: "f2", number: 2, protected: false, status: "running" },
    { ...frame, id: "f3", number: 3, protected: false, status: "queued" }
  ];
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), sceneDescription: "Door opens", storyboardTab: "view", status: "running", storyboardFrames: frames, storyboardSelectedFrameIds: ["f1"] } };
  const root = parseFragment(renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} })));
  const idle = find(root, node => node.tagName === "article" && attr(node, "data-storyboard-frame-id") === "f1");
  assert.ok(idle);
  const shot = find(idle, node => attr(node, "aria-label") === "Panel 1 shot");
  assert.equal(attr(shot, "disabled"), undefined);
  assert.equal(attr(find(idle, node => node.tagName === "textarea"), "readonly"), undefined);
  assert.equal(attr(find(idle, node => attr(node, "title") === "Protect panel"), "disabled"), undefined);
  const warning = find(idle, node => node.tagName === "small" && attr(node, "class") === "upload-error");
  assert.equal(attr(warning.parentNode, "class"), "storyboard-panel-details");
  assert.equal(attr(warning.parentNode, "open"), undefined);
  assert.equal(attr(find(root, node => attr(node, "aria-label") === "Selected panel revision"), "disabled"), undefined);
  for (const number of [2, 3]) assert.equal(attr(find(root, node => attr(node, "aria-label") === `Panel ${number} shot`), "disabled"), "");
});

test("Storyboard gallery starts compact, exports without a lock, and keeps planning in Setup", () => {
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), sceneDescription: "Door opens.", storyboardFrames: [frame], storyboardTab: "view" } };
  const render = () => renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} }));
  const view = render();
  assert.doesNotMatch(view, /storyboard-board-lock|Create New Plan|Selected panel revision|Regenerate Selected/);
  assert.match(view, /aria-label="Export storyboard"[^>]*aria-expanded="false"[^>]*>/);
  assert.doesNotMatch(view.match(/<button[^>]*aria-label="Export storyboard"[^>]*>/)[0], /disabled/);
  assert.match(view, /<details class="storyboard-panel-details" name="storyboard-panel-details-b">/);
  assert.match(view, /aria-label="Edit panel 1"/);
  assert.match(view, /title="Unprotect panel"/);
  node.data.storyboardTab = "setup"; assert.match(render(), /Create New Plan/);
});

test("real Storyboard views render, with independent Character inputs and protected revision controls", () => {
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), sceneDescription: "Door opens.", storyboardFrames: [frame], storyboardSelectedFrameIds: ["f1"] } };
  assert.equal(node.data.frameCount, "Auto");
  const render = tab => renderToStaticMarkup(React.createElement(NodeBody, { node: { ...node, data: { ...node.data, storyboardTab: tab } }, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} }));
  const setup = render("setup"), view = render("view"), advanced = render("advanced");
  assert.doesNotMatch(setup, /directorIn|Director is controlling/);
  assert.match(setup, /data-port-id="characterIn"/); assert.match(setup, /Approach/); assert.match(setup, /Pacing/); assert.match(setup, /Duration \(sec\)/);
  assert.match(view, /Selected panel revision/); assert.match(view, /Previous versions \(1\)/); assert.match(view, /disabled=""[^>]*>Restore 1/);
  assert.match(advanced, /Storyboard Style/); assert.doesNotMatch(advanced, /data-port-id="characterIn"/);
});

test("open, preset insertion, and repeated normalization preserve inherited scene, connected assets, images and versions", () => {
  const nodes = [
    { id: "d", type: "skillDirector", x: 0, y: 0, data: { sceneName: "Entry", sceneOverview: "The door in @Hallway opens.", shotList: "CUT 1: A door in @Hallway opens.", resultText: "CUT 1: @Hallway opens.", skillDirectorBuilt: true } },
    { id: "b", type: "storyboard", x: 1, y: 1, data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardFrames: [frame] } },
    { id: "i", type: "image", x: 2, y: 2, data: { title: "Hallway", url: "/uploads/hallway.png" } }
  ];
  const edges = [{ id: "control", from: { nodeId: "d", port: "directorOut" }, to: { nodeId: "b", port: "directorIn" } }, { id: "location", from: { nodeId: "i", port: "imageOut" }, to: { nodeId: "d", port: "locationIn" } }];
  for (const graph of [{ nodes, edges, groups: [] }, instantiateNewtPreset({ nodes, edges, groups: [] })]) {
    const normalized = normalizeEditorGraph(graph.nodes, graph.edges, graph.groups);
    const board = normalized.nodes.find(node => node.type === "storyboard");
    assert.match(board.data.sceneDescription, /The door in @Hallway opens/);
    assert.equal(board.data.storyboardFrames[0].resultUrl, frame.resultUrl);
    assert.deepEqual(board.data.storyboardFrames[0].versions, frame.versions);
    assert.equal(board.data.storyboardFrames[0].protected, true);
    assert.equal(normalized.edges.filter(edge => edge.to.nodeId === board.id && edge.to.port === "sceneReferenceIn").length, 1);
    assert.ok(normalized.edges.every(edge => edge.to.port !== "directorIn"));
    assert.deepEqual(normalizeEditorGraph(normalized.nodes, normalized.edges, normalized.groups), normalized);
  }
});

test("Storyboard Setup places Character directly below Props without an upload section", () => {
  const find = (node, predicate) => predicate(node) ? node : (node.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
  for (const connected of [false, true]) {
    const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardTab: "setup" } };
    const setup = renderToStaticMarkup(React.createElement(NodeBody, {
      node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: connected ? { characterIn: [{ source: { id: "c", type: "character", data: { title: "Hero" } } }] } : {},
      incomingByNode: {}, connectedPortKeys: new Set(connected ? ["b:characterIn"] : []), onUpdate() {}
    }));
    assert.doesNotMatch(setup, /Uploaded characters|storyboard-character-zone|type="file"|Upload character image/);
    const grid = find(parseFragment(setup), element => attr(element, "class") === "storyboard-settings-grid");
    assert.ok(grid);
    const rows = grid.childNodes.filter(element => element.tagName);
    const inputIds = rows.map(row => attr(find(row, element => Boolean(attr(element, "data-port-id"))) || {}, "data-port-id")).filter(Boolean);
    assert.deepEqual(inputIds, ["sceneDescriptionIn", "sceneReferenceIn", "propsIn", "characterIn"]);
    const characterRow = rows.at(-1);
    const port = find(characterRow, element => attr(element, "data-port-id") === "characterIn");
    assert.ok(port);
    assert.equal(attr(port, "disabled"), undefined);
    assert.equal(attr(port, "class").split(/\s+/).includes("connected"), connected);
    const summary = find(characterRow, element => element.tagName === "button" && !attr(element, "data-port-id"));
    assert.ok(summary);
    assert.equal(attr(summary, "class"), connected ? "connected-field" : "");
  }
});

test("removing the upload UI does not discard characters saved in older Storyboards", () => {
  const character = { id: "legacy", name: "Hero", portrait: { localUrl: "/uploads/hero.png" }, sheetUrl: "/outputs/hero-sheet.png", sheetVersion: 2 };
  const graph = normalizeEditorGraph([{ id: "b", type: "storyboard", x: 0, y: 0, data: { storyboardCharacters: [character], useInternalStoryboardCharacters: true, storyboardFrames: [frame] } }], [], []);
  const saved = graph.nodes[0].data;
  assert.equal(saved.storyboardCharacters[0].sheetUrl, character.sheetUrl);
  assert.deepEqual(saved.storyboardCharacters[0].portrait, character.portrait);
  assert.equal(saved.useInternalStoryboardCharacters, true);
  assert.equal(saved.storyboardFrames[0].resultUrl, frame.resultUrl);
  assert.deepEqual(normalizeEditorGraph(graph.nodes, graph.edges, graph.groups), graph);
});

test("Setup preserves long local descriptions and notes while connected Scene Text is read-only", () => {
  const localText = "Local scene at @CoffeeShop.\n".repeat(80);
  const connectedText = "Connected scene with its own pacing.\n".repeat(60);
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardTab: "setup", sceneDescription: localText, storyboardNotes: "Keep the eyeline.", storyboardFrames: [frame] } };
  const find = (element, predicate) => predicate(element) ? element : (element.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const attr = (element, name) => element.attrs?.find(attribute => attribute.name === name)?.value;
  for (const connected of [false, true, false]) {
    const markup = renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: connected ? { sceneDescriptionIn: [{ source: { type: "plainText", data: { text: connectedText } } }] } : {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} }));
    const root = parseFragment(markup);
    const scene = find(root, element => attr(element, "class") === "storyboard-scene-field");
    const textarea = find(scene, element => element.tagName === "textarea");
    assert.equal(attr(textarea, "readonly"), connected ? "" : undefined);
    assert.equal(textarea.childNodes[0].value, connected ? connectedText : localText);
    const notes = find(root, element => attr(element, "class") === "storyboard-notes-field");
    assert.equal(find(notes, element => element.tagName === "textarea").childNodes[0].value, "Keep the eyeline.");
    assert.equal(node.data.sceneDescription, localText);
    assert.deepEqual(node.data.storyboardFrames, [frame]);
  }
});

test("workflow packaging includes and rewrites previous image versions", () => {
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const block = server.slice(server.indexOf("function collectWorkflowAssetUrls("), server.indexOf("function rewriteWorkflowPackageAssetReferences("));
  const { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls } = new Function("tryLocalPublicPath", `${block}; return { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls };`)(value => value.startsWith("/outputs/") ? value : "");
  assert.deepEqual([...collectWorkflowAssetUrls(frame)], ["/outputs/current.png", "/outputs/previous.png"]);
  const rewritten = rewriteWorkflowAssetUrls(frame, new Map([["/outputs/previous.png", "/workflow-assets/test/previous.png"]]));
  assert.equal(rewritten.versions[0].resultUrl, "/workflow-assets/test/previous.png");
  assert.equal(frame.versions[0].resultUrl, "/outputs/previous.png");
});

test("Newt sees current panel directions and protection without repeatedly paying for version history context", () => {
  const snapshot = myNewtSnapshot({ nodes: [{ id: "board", type: "storyboard", data: { storyboardFrames: [frame] } }] });
  const current = snapshot.nodes[0].data.storyboardFrames[0];
  assert.equal(current.prompt, frame.prompt); assert.equal(current.protected, true); assert.equal(current.resultUrl, frame.resultUrl);
  assert.equal(current.versions, undefined); assert.equal(frame.versions.length, 1);
  assert.deepEqual(myNewtSnapshot(snapshot), snapshot);
});
