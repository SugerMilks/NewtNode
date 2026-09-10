import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { characterSheetChoices, characterOutputReference, characterOutputState, assertCharacterOutputReferences, generatedCharacterSheetId, characterDefaultWardrobeId } from "../src/characterSheetLibrary.js";
import { preferredCharacterReferenceForVideo } from "../src/characterVideoSheets.js";
import { runSkillDirectorNode } from "../src/nodeRunners/skillDirector.js";
import { nodeApi } from "../src/api/newtApi.js";

const source = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeCurrentNode, connectedOutputItem, connectedImagePromptItems, connectedCharacterReferences, directorPackageForVideo, storyboardCharacterReferenceItems };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const editor = module.exports;

function character(patch = {}) {
  return { id: "emma", type: "character", data: {
    title: "Character", characterName: "Emma", locked: true, activated: true,
    characterTab: "sheet", activeCharacterSheetId: generatedCharacterSheetId(characterDefaultWardrobeId),
    cuVideoGeneration: true,
    resultUrl: "/base.png", resultItems: [{ url: "/base.png", type: "image" }],
    characterBaseSheet: { url: "/base.png" }, characterBaseVideoSheet: { url: "/base-cu.png" },
    characterSheetVariants: [
      { wardrobeId: characterDefaultWardrobeId, isBase: true, generated: { url: "/base.png" }, videoGenerated: { url: "/base-cu.png" } },
      { wardrobeId: "blue", wardrobeFileName: "Blue jacket", generated: { localUrl: "/blue.png" }, videoGenerated: { localUrl: "/blue-cu.png" } },
      { wardrobeId: "red", generated: { url: "/red.png" }, videoGenerated: { url: "/red-cu.png" } }
    ],
    characterCustomSheets: [{ id: "client", localUrl: "/client.png", fileName: "Client.png" }],
    ...patch
  } };
}
const edge = { from: { nodeId: "emma", port: "characterOut" }, to: { nodeId: "target", port: "characterIn" } };

test("Base is inspectable but regular and CU output always use the next completed sheet", () => {
  const node = character(), before = structuredClone(node);
  assert.deepEqual(characterSheetChoices(node.data).map((choice) => choice.tabLabel), ["Base", "Sheet 1", "Sheet 2", "Sheet 3"]);
  assert.equal(characterOutputReference(node.data).url, "/blue.png");
  assert.equal(preferredCharacterReferenceForVideo(node).url, "/blue-cu.png");
  assert.deepEqual(node, before);
});

test("explicit sheet choices stay authoritative and CU falls back only to the same regular wardrobe", () => {
  const red = character({ activeCharacterSheetId: generatedCharacterSheetId("red") });
  assert.equal(characterOutputReference(red.data).url, "/red.png");
  assert.equal(preferredCharacterReferenceForVideo(red).url, "/red-cu.png");
  delete red.data.characterSheetVariants[2].videoGenerated;
  assert.equal(preferredCharacterReferenceForVideo(red).url, "/red.png");
  assert.equal(preferredCharacterReferenceForVideo(red).usesCuVideoSheet, false);
  const custom = character({ activeCharacterSheetId: "custom:client" });
  assert.equal(preferredCharacterReferenceForVideo(custom).url, "/client.png");
  assert.equal(preferredCharacterReferenceForVideo(character({ cuVideoGeneration: false })).url, "/blue.png");
});

test("base-only nodes have no outgoing reference even with stale resultUrl or CU state", () => {
  const node = character();
  node.data.characterSheetVariants = node.data.characterSheetVariants.slice(0, 1);
  node.data.characterCustomSheets = [];
  assert.equal(characterOutputReference(node.data), null);
  assert.equal(preferredCharacterReferenceForVideo(node), null);
  const state = characterOutputState(node.data);
  assert.equal(state.resultUrl, "");
  assert.deepEqual(state.resultItems, []);
  assert.throws(() => assertCharacterOutputReferences([{ source: node, edge }]), /non-base sheet/);
  assert.equal(node.data.locked, true);
  assert.equal(node.data.characterBaseSheet.url, "/base.png");
});

test("known base URLs cannot leak through custom aliases or a stale CU wardrobe result", () => {
  const node = character({ activeCharacterSheetId: "custom:base-copy" });
  node.data.characterCustomSheets.unshift({ id: "base-copy", localUrl: "/base.png" });
  assert.notEqual(characterOutputReference(node.data).url, "/base.png");
  node.data.activeCharacterSheetId = generatedCharacterSheetId("blue");
  node.data.characterSheetVariants[1].videoGenerated = { url: "/base-cu.png" };
  assert.equal(preferredCharacterReferenceForVideo(node).url, "/blue.png");
});

test("fallback skips incomplete and explicitly marked bases, wraps, and supports custom-only sheets", () => {
  const node = character({ characterCustomSheets: [] });
  node.data.characterSheetVariants.unshift(node.data.characterSheetVariants.pop());
  node.data.characterSheetVariants[2].isBase = true;
  assert.equal(characterOutputReference(node.data).url, "/red.png");
  node.data.characterSheetVariants[0].generated = null;
  assert.equal(characterOutputReference(node.data), null);
  node.data.characterCustomSheets = [{ id: "client", localUrl: "/client.png" }];
  assert.equal(characterOutputReference(node.data).url, "/client.png");
  assert.equal(characterOutputReference({ resultUrl: "/legacy-complete.png" }).url, "/legacy-complete.png");
});

test("saved projects retain Base preview selection but normalize outgoing output to a wardrobe", () => {
  const node = character();
  const restored = editor.normalizeCurrentNode(JSON.parse(JSON.stringify(node)));
  assert.equal(restored.data.resultUrl, "/blue.png");
  assert.equal(restored.data.activeCharacterSheetId, node.data.activeCharacterSheetId);
  assert.equal(restored.data.characterTab, "sheet");
  assert.deepEqual(restored.data.characterBaseSheet, node.data.characterBaseSheet);
  const baseOnly = character({ characterCustomSheets: [] });
  baseOnly.data.characterSheetVariants = baseOnly.data.characterSheetVariants.slice(0, 1);
  const first = editor.normalizeCurrentNode(baseOnly);
  const reopened = editor.normalizeCurrentNode(JSON.parse(JSON.stringify(first)));
  assert.equal(reopened.data.resultUrl, "");
  assert.equal(reopened.data.characterTab, "sheet");
  assert.equal(reopened.data.locked, true);
});

test("actual image, video, Director package and Storyboard connections all exclude Base", () => {
  const node = character(), items = [{ source: node, edge }];
  assert.equal(editor.connectedOutputItem(node, edge).url, "/blue.png");
  assert.deepEqual(editor.connectedImagePromptItems(items).map((item) => item.url), ["/blue.png"]);
  assert.deepEqual(editor.connectedCharacterReferences(items).map((item) => item.url), ["/blue-cu.png"]);
  assert.deepEqual(editor.storyboardCharacterReferenceItems({ data: { useInternalStoryboardCharacters: false } }, items).map((item) => item.url), ["/blue.png"]);
  const director = { id: "director", type: "skillDirector", data: { skillDirectorBuilt: true, resultText: "@Emma walks home", skillDirectorActiveReferenceTags: ["Emma"] } };
  assert.deepEqual(editor.directorPackageForVideo(director, { director: { characterIn: items } }).references.map((item) => item.url), ["/blue-cu.png"]);
});

test("Director LLM receives the usable sheet, never the selected base", async (t) => {
  const call = t.mock.method(nodeApi, "runSkillDirector", async () => ({ response: { ok: true }, data: { text: "@Emma walks home" } }));
  await runSkillDirectorNode({ node: { id: "director", data: { sceneOverview: "@Emma walks home", skillDirectorAction: "build" } }, incoming: { characterIn: [{ source: character(), edge }] }, sourceLabel: () => "Emma" });
  assert.equal(call.mock.calls[0].arguments[0].characterInputs[0].url, "/blue.png");
});

test("actual Character tabs are Base, Sheet 1 onward and clicking Base preserves safe output", () => {
  let node = character();
  const updateSource = source.slice(source.indexOf("  function updateNode("), source.indexOf("  async function uploadMediaAsset("));
  const nodesRef = { current: [node] };
  const deps = {
    nodesRef, edgesRef: { current: [edge] }, characterOutputState,
    setNodes: (update) => { node = update([node])[0]; },
    syncConnectedPreviewNodes: (nodes) => nodes
  };
  const updateNode = new Function(...Object.keys(deps), `${updateSource}\nreturn updateNode;`)(...Object.values(deps));
  const props = () => ({ node, incoming: {}, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate: updateNode });
  const html = renderToStaticMarkup(React.createElement(editor.NodeBody, props()));
  assert.match(html, />Base<\/button>/);
  assert.match(html, />Sheet 1<\/button>/);
  assert.match(html, />Sheet 3<\/button>/);
  assert.doesNotMatch(html, />Sheet 4<\/button>/);
  function buttons(element) {
    if (!element || typeof element !== "object") return [];
    return [...(element.type === "button" && element.props.role === "tab" ? [element] : []),
      ...React.Children.toArray(element.props?.children).flatMap(buttons)];
  }
  function renderTree() {
    let tree;
    function Capture() { tree = editor.NodeBody(props()); return tree; }
    renderToStaticMarkup(React.createElement(Capture));
    return tree;
  }
  const tabs = buttons(renderTree());
  tabs.find((button) => button.props.children === "Sheet 2").props.onClick();
  assert.equal(node.data.resultUrl, "/red.png");
  buttons(renderTree()).find((button) => button.props.children === "Base").props.onClick();
  assert.equal(node.data.activeCharacterSheetId, generatedCharacterSheetId(characterDefaultWardrobeId));
  assert.equal(node.data.resultUrl, "/blue.png");
  assert.equal(nodesRef.current[0].data.resultUrl, "/blue.png");
  updateNode(node.id, { characterSheetVariants: node.data.characterSheetVariants.slice(0, 1), characterCustomSheets: [] });
  assert.equal(node.data.resultUrl, "");
  assert.equal(node.data.locked, true);
  assert.equal(editor.connectedOutputItem(node, edge), null);
});
