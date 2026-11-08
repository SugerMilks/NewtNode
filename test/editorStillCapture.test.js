import assert from "node:assert/strict";
import test from "node:test";
import { completeEditorStillCapture } from "../src/editorStillCapture.js";

const result = { url: "/outputs/project/still%20one.png", thumbnailUrl: "/outputs/thumb.jpg", label: "Still 00:00:01:00", width: 1920, height: 1080, cost: 0 };
const makeEditor = () => ({ id: "edit", type: "editor", canvasId: "cut", x: 120, y: 240, data: {
  title: "Assembly", editorNodeWidth: 1400, editorExportJob: { id: "capture", frame: 30, fps: 30 },
  editorStills: [], resultUrl: "/outputs/sequence.mp4", resultItems: [{ url: "/outputs/sequence.mp4", type: "video" }],
  editorTimeline: { clips: ["unchanged"] }, status: "running", error: ""
} });
const capture = (nodes, options) => completeEditorStillCapture(nodes, "edit", "capture", result, options);

test("a still becomes a ready Image node beside its Editor using the same full-resolution saved asset", () => {
  const source = makeEditor(), before = structuredClone(source), completed = capture([source]);
  const image = completed.imageNode, editor = completed.nodes[0];
  assert.equal(image.type, "image"); assert.equal(image.canvasId, "cut");
  assert.equal(image.x, 1600); assert.equal(image.y, 240);
  assert.equal(image.data.title, "Assembly - Still 00:00:01:00");
  assert.equal(image.data.fileName, "still one.png"); assert.equal(image.data.mimeType, "image/png");
  assert.equal(image.data.resultUrl, result.url); assert.equal(image.data.thumbnailUrl, result.thumbnailUrl);
  assert.equal(image.data.selectedResultIndex, 0); assert.equal(image.data.status, "complete");
  assert.equal(image.data.resultItems[0].width, 1920); assert.equal(image.data.resultItems[0].type, "image");
  assert.equal(editor.data.editorStills[0].url, result.url); assert.equal(editor.data.editorExportJob, null);
  assert.equal(editor.data.resultUrl, before.data.resultUrl); assert.deepEqual(editor.data.resultItems, before.data.resultItems);
  assert.deepEqual(editor.data.editorTimeline, before.data.editorTimeline); assert.deepEqual(source, before);
});

test("placement uses measured Editor size and avoids nodes/groups without moving existing nodes", () => {
  const source = makeEditor();
  const completed = capture([source], { editorRect: { left: 120, top: 240, right: 2120, bottom: 800 },
    occupied: [{ left: 2200, right: 2580, top: 200, bottom: 900 }] });
  assert.equal(completed.imageNode.x, 2660); assert.equal(completed.imageNode.y, 240);
  assert.equal(completed.nodes[0].x, 120);
});

test("other canvases do not obstruct capture placement", () => {
  const other = { id: "other", type: "image", canvasId: "other-canvas", x: 1600, y: 240, data: {} };
  const completed = capture([makeEditor(), other]);
  assert.equal(completed.imageNode.x, 1600); assert.equal(completed.nodes[1], other);
});

test("completion is idempotent and ignores deleted sources, replaced jobs and video exports", () => {
  const completed = capture([makeEditor()]);
  assert.equal(capture(completed.nodes), null);
  assert.equal(capture([]), null);
  for (const patch of [{ type: "image" }, { data: { editorExportJob: { id: "new-job", frame: 30 } } }, { data: { editorExportJob: { id: "capture", frame: null } } }]) {
    assert.equal(capture([{ ...makeEditor(), ...patch }]), null);
  }
  assert.equal(completeEditorStillCapture([makeEditor()], "edit", "capture", {}), null);
});

test("Undo retains the saved still and cleared job without recreating the Image node", () => {
  const completed = capture([makeEditor()]);
  assert.equal(completed.completedNodes.length, 1);
  assert.equal(completed.completedNodes[0].data.editorStills.length, 1);
  assert.equal(capture(completed.completedNodes), null);
  const recovered = { ...completed.completedNodes[0], data: { ...completed.completedNodes[0].data, editorExportJob: { id: "capture", frame: 30 } } };
  const retried = capture([recovered]);
  assert.equal(retried.imageNode, null); assert.equal(retried.nodes.length, 1);
  assert.equal(retried.nodes[0].data.editorExportJob, null); assert.equal(retried.nodes[0].data.editorStills.length, 1);
});

test("each new grab adds its own node and both the history and Image nodes survive serialization", () => {
  const first = capture([makeEditor()]);
  const nextNodes = first.nodes.map(node => node.type === "editor" ? { ...node, data: { ...node.data, editorExportJob: { id: "next", frame: 60 } } } : node);
  const second = completeEditorStillCapture(nextNodes, "edit", "next", { ...result, url: "/outputs/still-two.png", label: "Still 00:00:02:00" });
  assert.equal(second.nodes.length, 3); assert.equal(second.nodes[0].data.editorStills.length, 2);
  assert.notEqual(second.imageNode.id, first.imageNode.id); assert.ok(second.imageNode.x > first.imageNode.x);
  assert.deepEqual(JSON.parse(JSON.stringify(second.nodes)), second.nodes);
});
