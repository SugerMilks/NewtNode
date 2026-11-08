import React from "react";
import { createRoot } from "react-dom/client";
import NodeEditor, { createDefaultNodeData } from "virtual:storyboard-qa";
import { nodeDraftStorageKey } from "../../src/useNodeEditorDraft.js";
import { fadeTimeline } from "../fixtures/editorTransitions.js";
import "../../src/styles.css";

if (!localStorage.getItem(nodeDraftStorageKey)) {
  const viewport = { x: 0, y: 0, scale: window.innerWidth < 600 ? 0.18 : 0.6 };
  localStorage.setItem(nodeDraftStorageKey, JSON.stringify({
    projectId: "editor-stills-qa", projectName: "Editor Still QA", activeCanvasId: "edit-canvas", viewport,
    canvases: [{ id: "edit-canvas", name: "Editing", viewport }, { id: "other-canvas", name: "Other", viewport }],
    nodes: [{ id: "editor-still-qa", type: "editor", canvasId: "edit-canvas", x: 50, y: 100, data: {
      ...createDefaultNodeData("editor", "Editor", 1), editorNodeWidth: 900, editorTimeline: fadeTimeline(),
      resultUrl: "/uploads/editor-qa/red.mp4", resultItems: [{ type: "video", url: "/uploads/editor-qa/red.mp4" }]
    } }, { id: "blocker", type: "image", canvasId: "edit-canvas", x: 1030, y: 100, data: { title: "Existing image" } }],
    edges: [], groups: []
  }));
}
createRoot(document.getElementById("root")).render(<NodeEditor modelPreferencesReady={false} />);
