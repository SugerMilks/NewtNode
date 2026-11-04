import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { myNewtRunInputDigest } from "../src/myNewt/runReuse.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { normalizeEditorGraph, buildIncomingByNode, connectedAssetItems, outputPortIdsForNode, inputPortIdsForNode, isVideoModelUnsupportedInput, getPortCompatibilityError, isReframeNode, isCoverageNode, isModel3DNode, utilityOutputType, connectedOutputItem };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: _NodeEditor, ...editor } = module.exports;
const validatorSource = source.slice(source.indexOf("  function getConnectionError("), source.indexOf("  function getPortPoint("));
const validate = new Function(...Object.keys(editor), `${validatorSource};return getConnectionError;`)(...Object.values(editor));
const smart = { id: "smart", type: "text", data: { text: "Describe the staging", resultText: "Saved good output" } };
const edge = (node, port = "videoIn") => ({ id: "reference", from: { nodeId: node.id, port: node.type === "utility" ? "utilityOut" : node.type === "image" ? "imageOut" : "videoOut" }, to: { nodeId: smart.id, port } });

test("canvas accepts uploaded/generated/Utility videos and exported Editor sequences", () => {
  for (const type of ["video", "videoModel", "utility", "editor"]) {
    const clip = { id: "clip", type, data: { resultUrl: "/outputs/clip.mp4", utilityMode: "video", utilityVideoModel: "RIFE Video", editorTimeline: {}, editorExportTimeline: {} } };
    const wire = edge(clip);
    assert.equal(validate(wire.from, wire.to, [clip, smart]), "", type);
    const items = editor.connectedAssetItems([{ source: clip, edge: wire }]);
    assert.equal(items.length, 1); assert.equal(items[0].type, "video"); assert.equal(items[0].url, clip.data.resultUrl);
    if (type === "editor") {
      delete clip.data.editorExportTimeline;
      assert.match(validate(wire.from, wire.to, [clip, smart]), /Export/);
      assert.deepEqual(editor.connectedAssetItems([{ source: clip, edge: wire }]), []);
    }
  }
});

test("Smart Text media sockets reject mismatched types and cross-canvas connections", () => {
  const image = { id: "image", type: "image", data: { resultUrl: "/uploads/image.png" } };
  const wire = edge(image);
  assert.notEqual(validate(wire.from, wire.to, [image, smart]), "");
  wire.to.port = "imageIn";
  assert.equal(validate(wire.from, wire.to, [image, smart]), "");
  assert.match(validate(wire.from, wire.to, [{ ...image, canvasId: "one" }, { ...smart, canvasId: "two" }]), /between canvases/);
});

test("saved/reopened graph retains video inputs and media changes invalidate Newt reuse", async () => {
  const clip = { id: "clip", type: "video", data: { title: "Clip", resultUrl: "/uploads/clip.mov" } };
  const graph = { nodes: [clip, smart], edges: [edge(clip)], groups: [] };
  const restored = editor.normalizeEditorGraph(...[graph.nodes, graph.edges, graph.groups].map(value => JSON.parse(JSON.stringify(value))));
  assert.equal(restored.edges.length, 1); assert.equal(restored.edges[0].to.port, "videoIn");
  const savedSmart = restored.nodes.find(node => node.id === "smart");
  assert.equal(savedSmart.data.text, smart.data.text); assert.equal(savedSmart.data.resultText, smart.data.resultText);
  const incoming = editor.buildIncomingByNode(restored.nodes, restored.edges).smart;
  assert.equal(editor.connectedAssetItems(incoming.videoIn)[0].url, clip.data.resultUrl);
  const before = await myNewtRunInputDigest(graph, "smart");
  clip.data.resultUrl = "/uploads/new-clip.mov";
  assert.notEqual(await myNewtRunInputDigest(graph, "smart"), before);
});
