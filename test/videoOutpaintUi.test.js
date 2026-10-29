import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { imageModelOptions, videoModelOptions } from "../src/modelOptions.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeEditorGraph, normalizeCurrentNode, createDefaultNodeData, previewSourceResultItems, visiblePortIdsForNode };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeEditorGraph, normalizeCurrentNode, createDefaultNodeData, previewSourceResultItems, visiblePortIdsForNode } = module.exports;
const item = { url: "/outputs/final.mov", type: "video", videoOutpaint: { rawVideoUrl: "/outputs/raw.mp4" }, warning: "Inspect the edge motion." };
const fixture = () => normalizeCurrentNode({ id: "outpaint", type: "utility", data: { ...createDefaultNodeData("utility", "Utility", 1), utilityMode: "video", utilityVideoModel: "Video Outpaint", settingsOpen: true, prompt: "Continue the garden", videoOutpaint: { model: "seedance-2.5", aspectRatio: "9:16", frame: { x: -0.2, y: 0, width: 1.4 } }, resultItems: [item], resultUrl: item.url } });
const incoming = { referenceVideoIn: [{ source: { id: "source", type: "video", data: { title: "Footage", resultUrl: "/uploads/footage.mp4" } } }] };
const render = node => renderToStaticMarkup(React.createElement(NodeBody, { node, incoming, incomingByNode: {}, imageModelOptions, videoModelOptions, generationProvider: "fal", connectedPortKeys: new Set(), onUpdate() {}, onRun() {}, onConnectStart() {}, onDisconnectInput() {} }));

test("Video Outpaint has one run, both engines, framing, typed optional canvas and reference ports", () => {
  const node = fixture(), html = render(node);
  assert.match(html, /Run Outpaint/); assert.doesNotMatch(html, /Run Wan Fun Control|>Generations</);
  assert.match(html, /Canvas Edit/); assert.match(html, /Seedance Edit/); assert.match(html, /Wan VACE 14B/);
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>[^<]*(?:<svg[\s\S]*?<\/svg>)? Canvas Edit<\/button>/);
  assert.match(html, /Outpaint target ratio/); assert.match(html, /Restore original source footage/);
  assert.match(html, /api\/video-preview/); assert.match(html, /Raw video/);
  assert.deepEqual(visiblePortIdsForNode(node), ["promptIn", "referenceImageIn", "referenceVideoIn", "canvasVideoIn", "utilityOut"]);
});

test("Outpaint survives save/reopen with canonical results, framing, engine, references, and outgoing Preview intact", () => {
  const node = fixture(); node.data.outpaintBusy = true;
  const nodes = [{ id: "source", type: "video", data: { title: "Footage", resultUrl: "/uploads/footage.mp4" } }, node, { id: "preview", type: "preview", data: {} }];
  const edges = [{ id: "source-edge", from: { nodeId: "source", port: "videoOut" }, to: { nodeId: node.id, port: "referenceVideoIn" } },
    { id: "canvas-edge", from: { nodeId: "source", port: "videoOut" }, to: { nodeId: node.id, port: "canvasVideoIn" } },
    { id: "preview-edge", from: { nodeId: node.id, port: "utilityOut" }, to: { nodeId: "preview", port: "sourceIn" } }];
  const graph = normalizeEditorGraph(JSON.parse(JSON.stringify(nodes)), edges, []);
  const restored = graph.nodes.find(n => n.id === node.id);
  assert.equal(graph.edges.length, 3); assert.equal(restored.data.utilityVideoModel, "Video Outpaint");
  assert.equal(restored.data.outpaintBusy, false); assert.equal(restored.data.videoOutpaint.frame.width, 1.4);
  assert.equal(restored.data.resultItems[0].videoOutpaint.rawVideoUrl, item.videoOutpaint.rawVideoUrl);
  assert.equal(previewSourceResultItems(restored, graph.edges[2], "video")[0].url, item.url);
  assert.deepEqual(normalizeEditorGraph(graph.nodes, graph.edges, graph.groups), graph);
  const legacy = normalizeCurrentNode({ id: "old", type: "utility", data: { utilityMode: "video", utilityVideoModel: "RIFE Video", resultItems: [item], resultUrl: item.url } });
  assert.equal(legacy.data.utilityVideoModel, "RIFE Video"); assert.equal(legacy.data.resultUrl, item.url);
});

test("collapsed settings retain Outpaint connector handles and active preparation disables Run", () => {
  const node = fixture(); node.data.settingsOpen = false; node.data.outpaintBusy = true;
  const html = render(node);
  assert.match(html, /utility-input-port-stack/);
  assert.match(html, /class="run-node-button" disabled=""/);
  assert.doesNotMatch(html, /OutpaintQcStatus|generation-progress/);
});
