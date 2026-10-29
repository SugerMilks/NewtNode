import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { loadNodeEditorDraft } from "../src/useNodeEditorDraft.js";
import { useWorkflowPersistence } from "../src/useWorkflowPersistence.js";
import { normalizeProjectCanvases } from "../src/projectCanvases.js";

const normalizeEditorGraph = (nodes, edges, groups = []) => ({ nodes, edges, groups });
const blank = {
  nodes: [], edges: [], groups: [], viewport: { x: 0, y: 0, scale: 1 },
  canvases: [{ id: "canvas-1", name: "Canvas 1", viewport: { x: 0, y: 0, scale: 1 } }], activeCanvasId: "canvas-1",
  projectId: null, projectName: "Untitled node project", savedProjectName: null,
  projectPackagePath: "", workflowFilePath: ""
};

function withStorage(getItem, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    globalThis.window = { localStorage: { getItem } };
    return run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

test("first launch and invalid drafts start blank without a starter workflow", () => {
  for (const value of [null, "broken json", "{}", '{"nodes":[],"edges":null}']) {
    withStorage(() => value, () => assert.deepEqual(loadNodeEditorDraft({ normalizeEditorGraph }), blank));
  }
  withStorage(() => { throw new Error("Storage blocked"); }, () => {
    assert.deepEqual(loadNodeEditorDraft({ normalizeEditorGraph }), blank);
  });
});

test("saved populated and intentionally empty drafts retain their graph and project context", () => {
  for (const nodes of [[], [{ id: "existing", type: "plainText", data: { text: "Keep my work" } }]]) {
    const draft = {
      ...blank, nodes, viewport: { x: 40, y: 20, scale: 0.6 },
      projectId: "saved-project", projectName: "My project", savedProjectName: "My project",
      projectPackagePath: "/projects/My project", workflowFilePath: "/projects/My project/My project.json"
    };
    withStorage(() => JSON.stringify(draft), () => assert.deepEqual(loadNodeEditorDraft({ normalizeEditorGraph }), { ...draft, ...normalizeProjectCanvases(draft) }));
  }
});

test("New Project clears the graph, selection and project association without mutating the saved draft", async () => {
  const draft = {
    ...blank,
    nodes: [{ id: "prompt", type: "plainText", data: { text: "Existing scene" } }, { id: "preview", type: "preview", data: {} }],
    edges: [{ id: "edge", from: { nodeId: "prompt", port: "promptOut" }, to: { nodeId: "preview", port: "sourceIn" } }],
    groups: [{ id: "group", nodeIds: ["prompt", "preview"] }],
    viewport: { x: 50, y: 70, scale: 0.5 }, projectId: "existing-project",
    projectName: "Saved scene", savedProjectName: "Saved scene", projectPackagePath: "/projects/Saved scene"
  };
  const original = structuredClone(draft), updates = {};
  let persistence, undoCleared = false;
  const setters = Object.fromEntries([
    "nodes", "edges", "groups", "viewport", "projectId", "projectName", "savedProjectName",
    "projectPackagePath", "workflowFilePath", "selectedNodeIds", "selectedEdgeId", "projectMenuOpen", "fileMenuOpen", "canvases", "activeCanvasId"
  ].map(key => [`set${key[0].toUpperCase()}${key.slice(1)}`, value => { updates[key] = value; }]));
  function Probe() {
    persistence = useWorkflowPersistence({
      ...draft, savedDraft: draft, ...setters, normalizeEditorGraph,
      clearUndoStack: () => { undoCleared = true; }
    });
    return null;
  }
  renderToString(React.createElement(Probe));
  assert.equal(await persistence.startNewProject(), true);
  for (const [key, value] of Object.entries(blank)) assert.deepEqual(updates[key], value, key);
  assert.deepEqual(updates.selectedNodeIds, []);
  assert.equal(updates.selectedEdgeId, null);
  assert.equal(updates.projectMenuOpen, false);
  assert.equal(updates.fileMenuOpen, false);
  assert.equal(undoCleared, true);
  assert.deepEqual(draft, original);
});

test("the editor uses blank defaults for both startup and New Project", () => {
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.match(editor, /loadNodeEditorDraft\(\{ normalizeEditorGraph \}\)/);
  assert.doesNotMatch(editor, /\b(?:initialNodes|initialEdges|newProjectNodes|newProjectEdges|newProjectGroups|newProjectViewport)\b/);
});
