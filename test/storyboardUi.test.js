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
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeEditorGraph, createDefaultNodeData, buildIncomingByNode, storyboardSceneTagMatches, activeConnectedCharacterSources, portColors };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeEditorGraph, createDefaultNodeData, buildIncomingByNode, storyboardSceneTagMatches, activeConnectedCharacterSources, portColors } = module.exports;
const frame = { id: "f1", number: 1, prompt: "Doorway", resultUrl: "/outputs/current.png", protected: true, versions: [{ resultUrl: "/outputs/previous.png", savedAt: 1, prompt: "Previous doorway" }] };

for (const [kind, description, expectedMarks] of [
  ["@tags", "@Woman and @man in @Courtyard with @Cup. @WomanExtra and @Unknown stay plain.", ["@Woman", "@man", "@Courtyard", "@Cup"]],
  ["script names", "Frame the woman right and man left in the courtyard with a cup. WomanExtra and @Unknown stay plain.", ["woman", "man", "courtyard", "cup"]]
]) test(`Storyboard ${kind} follow live input connections and port colors before media is generated`, () => {
  const board = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1),
    sceneDescription: description, storyboardFrames: [{ ...frame, protected: false, shotDescription: description, prompt: description }] } };
  const sources = [
    { id: "woman", type: "character", data: { title: "Character", characterName: "Woman", locked: false, activated: false } },
    { id: "man", type: "character", data: { title: "Character 2", characterName: "Man", locked: false, activated: false } },
    { id: "location", type: "image", data: { title: "Courtyard", resultUrl: "" } },
    { id: "prop", type: "image", data: { title: "Cup", resultUrl: "" } }
  ];
  const edges = sources.map(source => ({ from: { nodeId: source.id, port: source.type === "character" ? "characterOut" : "imageOut" },
    to: { nodeId: board.id, port: source.type === "character" ? "characterIn" : source.id === "prop" ? "propsIn" : "sceneReferenceIn" } }));
  const before = structuredClone({ board, sources, edges });
  const incoming = () => buildIncomingByNode([board, ...sources], edges);
  const matches = () => storyboardSceneTagMatches(description, board, incoming()[board.id], incoming());
  assert.deepEqual(matches().map(({ tag, color }) => [tag, color]), [["Woman", portColors.character], ["Man", portColors.character], ["Courtyard", portColors.image], ["Cup", portColors.image]]);
  assert.deepEqual(activeConnectedCharacterSources(incoming()[board.id].characterIn, incoming()), [], "UI color must not make unfinished characters usable for generation");
  assert.deepEqual(storyboardSceneTagMatches(description, board, {}), []);

  const collect = (element, predicate) => [...(predicate(element) ? [element] : []), ...(element.childNodes || []).flatMap(child => collect(child, predicate))];
  const attr = (element, name) => element.attrs?.find(attribute => attribute.name === name)?.value;
  const text = element => element.nodeName === "#text" ? element.value : (element.childNodes || []).map(text).join("");
  for (const [approach, tab, expectedEditors] of [["Shot List", "setup", 2], ["Dialogue", "setup", 1], ["Shot List", "view", 1]]) {
    const node = { ...board, data: { ...board.data, storyboardApproach: approach, storyboardTab: tab } };
    const render = connected => parseFragment(renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions,
      generationProvider: "fal", incoming: connected ? incoming()[board.id] : {}, incomingByNode: incoming(), connectedPortKeys: new Set(),
      onUpdate() { assert.fail("Highlighting must not change node data"); } })));
    assert.equal(collect(render(false), element => element.tagName === "mark").length, 0);
    const root = render(true);
    const editors = collect(root, element => attr(element, "class")?.includes("tagged-prompt-editor"));
    assert.equal(editors.length, expectedEditors);
    for (const editor of editors) {
      const marks = collect(editor, element => element.tagName === "mark");
      assert.deepEqual(marks.map(text), expectedMarks);
      assert.deepEqual(marks.map(mark => attr(mark, "style")), [portColors.character, portColors.character, portColors.image, portColors.image].map(color => `--tag-color:${color}`));
      const textarea = collect(editor, element => element.tagName === "textarea")[0];
      assert.equal(text(textarea), description);
    }
  }
  assert.deepEqual({ board, sources, edges }, before);
  sources[0].data.characterName = "Hero";
  assert.deepEqual(matches().map(match => match.tag), ["Man", "Courtyard", "Cup"]);
  edges.splice(1, 1);
  assert.deepEqual(matches().map(match => match.tag), ["Courtyard", "Cup"]);
  assert.equal(board.data.storyboardFrames[0].shotDescription, description);
});

test("Storyboard approach labels and descriptions match selection without changing stored planning values", () => {
  const find = (node, predicate) => predicate(node) ? node : (node.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const attr = (node, name) => node.attrs?.find(attribute => attribute.name === name)?.value;
  const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
  assert.deepEqual(storyboardApproaches.map(value => storyboardApproachDetails[value].label), ["Shot List", "Dialogue", "Action", "Commercial", "Montage"]);
  for (const approach of [undefined, "Narrative", ...storyboardApproaches]) {
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

test("Camera Personality defaults to Expressive; saved personality and Dutch cameras survive reopening without rewriting panels", () => {
  assert.equal(createDefaultNodeData("storyboard", "Storyboard", 1).storyboardCameraPersonality, "Expressive");
  for (const personality of [undefined, "Restrained", "Expressive", "Bold", "invalid"]) {
    const node = { id: "b", type: "storyboard", data: { storyboardTab: "setup", storyboardCameraPersonality: personality, storyboardFrames: [{ ...frame, angle: "Dutch Angle" }] } };
    const before = structuredClone(node);
    const reopened = normalizeEditorGraph(JSON.parse(JSON.stringify([node])), [], []).nodes[0];
    assert.equal(reopened.data.storyboardCameraPersonality, ["Restrained", "Bold"].includes(personality) ? personality : "Expressive");
    assert.equal(reopened.data.storyboardFrames[0].angle, "Dutch Angle");
    assert.equal(reopened.data.storyboardFrames[0].resultUrl, frame.resultUrl);
    assert.deepEqual(reopened.data.storyboardFrames[0].versions, frame.versions);
    assert.equal(reopened.data.storyboardFrames[0].prompt, frame.prompt);
    const markup = renderToStaticMarkup(React.createElement(NodeBody, { node: reopened, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} }));
    assert.match(markup, /aria-label="Camera personality"/);
    assert.match(markup, new RegExp(`<option selected="">${reopened.data.storyboardCameraPersonality}</option>`));
    assert.deepEqual(node, before);
  }
});

test("new Storyboards start with one Shot List row; authored rows and legacy summaries survive reopening", () => {
  const node = { id: "shots", type: "storyboard", data: createDefaultNodeData("storyboard", "Storyboard", 1) };
  assert.equal(node.data.storyboardApproach, "Shot List");
  assert.equal(node.data.storyboardFrames.length, 1);
  const render = () => renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} }));
  const markup = render();
  assert.match(markup, /Plan Shots/);
  assert.match(markup, /aria-label="Shot 1 description"/);
  assert.match(markup, /aria-label="Shot 1 framing"/);
  assert.doesNotMatch(markup, /storyboard-scene-field/);
  node.data.storyboardFrames[0] = { ...node.data.storyboardFrames[0], shotDescription: "A door opens", shot: "CU", lens: "85mm", angle: "Low Angle", resultUrl: "/outputs/existing.png" };
  const saved = JSON.parse(JSON.stringify(node));
  const reopened = normalizeEditorGraph([saved], [], []).nodes[0];
  for (const key of ["shotDescription", "shot", "lens", "angle", "resultUrl"]) assert.equal(reopened.data.storyboardFrames[0][key], node.data.storyboardFrames[0][key]);
  assert.equal(reopened.data.storyboardApproach, "Shot List");
  for (const approach of ["Dialogue", "Action", "Commercial", "Montage"]) {
    node.data.storyboardApproach = approach;
    assert.match(render(), /storyboard-scene-field/);
    assert.doesNotMatch(render(), /aria-label="Shot 1 description"/);
  }
  delete saved.data.storyboardApproach;
  assert.equal(normalizeEditorGraph([saved], [], []).nodes[0].data.storyboardApproach, "Narrative");
});

test("Storyboard activity spinner shows planning and running work and clears on success or failure", () => {
  const attr = (element, name) => element.attrs?.find(attribute => attribute.name === name)?.value;
  const find = (element, predicate) => predicate(element) ? element : (element.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const cases = [
    ["planning", "Shot List", "Planning shots"], ["planning", "Dialogue", "Planning storyboard"],
    ["running", "Shot List", "Generating storyboard frames"], ["compiling-characters", "Shot List", "Generating character sheets"],
    ["compiling-board", "Shot List", "Preparing storyboard output"], ["exporting", "Shot List", "Exporting storyboard boards"],
    ["ready", "Shot List", ""], ["complete", "Shot List", ""], ["error", "Shot List", ""]
  ];
  for (const [status, approach, label] of cases) {
    const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), status,
      storyboardApproach: approach, sceneDescription: "A door opens", storyboardTab: "setup",
      storyboardFrames: [{ ...frame, protected: false, shotDescription: "A door opens" }] } };
    const before = structuredClone(node);
    const root = parseFragment(renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions,
      generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() { assert.fail("render must not change state"); } })));
    const spinner = find(root, element => attr(element, "class") === "storyboard-action-busy");
    if (label) {
      assert.ok(spinner, status);
      assert.equal(attr(spinner, "role"), "status");
      assert.equal(attr(spinner, "aria-label"), label);
      assert.equal(attr(spinner, "title"), label);
      assert.equal(attr(find(spinner, element => element.tagName === "svg"), "aria-hidden"), "true");
      if (status === "planning") {
        const button = spinner.parentNode.childNodes.find(element => element.tagName === "button");
        assert.equal(attr(button, "disabled"), "");
      }
    } else assert.equal(spinner, undefined, status);
    assert.deepEqual(node, before);
  }
});

test("Storyboard Shot List scrolls separately from its typed setup inputs", () => {
  const attr = (element, name) => element.attrs?.find(attribute => attribute.name === name)?.value;
  const find = (element, predicate) => predicate(element) ? element : (element.childNodes || []).map(child => find(child, predicate)).find(Boolean);
  const hasClass = (element, name) => (attr(element, "class") || "").split(/\s+/).includes(name);
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardFrames: Array.from({ length: 20 }, (_, index) => ({ id: `f${index}`, number: index + 1, shotDescription: "A door opens", prompt: "" })) } };
  const root = parseFragment(renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} })));
  const setup = find(root, element => hasClass(element, "shot-list-setup"));
  const list = find(setup, element => hasClass(element, "storyboard-shot-list"));
  const settings = find(setup, element => hasClass(element, "storyboard-settings-grid"));
  assert.ok(hasClass(list, "storyboard-scroll-surface"));
  assert.equal(list.parentNode, settings.parentNode);
  assert.equal(find(list, element => attr(element, "data-port-key") !== undefined), undefined);
  for (const port of ["sceneDescriptionIn", "sceneReferenceIn", "propsIn", "characterIn"]) {
    assert.ok(find(settings, element => attr(element, "data-port-id") === port), port);
  }
});

test("PDF import and source metadata survive project normalization without creating images", () => {
  const sourceScript = { url: "/uploads/script.pdf", fileName: "Script.pdf", title: "Cafe", scene: "Cafe", pages: [3], dialogue: "MAYA: Let's go.", voiceover: "", onScreenText: "", timing: "5s", productionNotes: "" };
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardScriptImport: { document: { url: sourceScript.url, fileName: sourceScript.fileName, pageCount: 70 } }, storyboardFrames: [{ ...frame, shotDescription: "Maya stands", sourceScript }] } };
  const reopened = normalizeEditorGraph(JSON.parse(JSON.stringify([node])), [], []).nodes[0];
  assert.deepEqual(reopened.data.storyboardFrames[0].sourceScript, sourceScript);
  assert.equal(reopened.data.storyboardFrames[0].resultUrl, frame.resultUrl);
  const markup = renderToStaticMarkup(React.createElement(NodeBody, { node: reopened, imageModelOptions, videoModelOptions, generationProvider: "fal", incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {} }));
  assert.match(markup, /Import Script PDF/);
  assert.doesNotMatch(markup, /Analyze pages|Preview page|Maximum shots|Choose script pages manually|Find Scripts|Allow AI analysis|Imported shot list review|Apply imported shots/);
  assert.match(markup, /href="\/uploads\/script.pdf#page=3"/);
  assert.match(markup, /MAYA: Let/);
  assert.doesNotMatch(markup, /role="status"[^>]*>Building/);
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
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardApproach: "Narrative", sceneDescription: "Door opens.", storyboardFrames: [frame], storyboardTab: "view" } };
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
    assert.doesNotMatch(setup, /Uploaded characters|storyboard-character-zone|Upload character image/);
    assert.match(setup, /type="file" accept="application\/pdf,.pdf"/);
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
  const node = { id: "b", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardApproach: "Narrative", storyboardTab: "setup", sceneDescription: localText, storyboardNotes: "Keep the eyeline.", storyboardFrames: [frame] } };
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
