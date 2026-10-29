import React from "react";
import { createRoot } from "react-dom/client";
import NodeEditor, { createDefaultNodeData } from "virtual:storyboard-connections-qa";
import { nodeDraftStorageKey } from "../../src/useNodeEditorDraft.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Use an isolated browser context with mocked API routes. No project or media
// requests are required to exercise the real canvas and its connection geometry.
if (window.__STORYBOARD_CONNECTION_QA__) {
  const board = { id: "board", type: "storyboard", x: 410, y: 70, data: {
    ...createDefaultNodeData("storyboard", "Storyboard", 1), storyboardTab: "setup", storyboardApproach: "Shot List",
    storyboardFrames: Array.from({ length: 20 }, (_, i) => ({ id: `f${i + 1}`, number: i + 1, shotDescription: `Shot ${i + 1}: The character crosses the courtyard.`, shot: "MS", lens: "35mm", angle: "None", prompt: "", status: "idle" }))
  } };
  const nodes = [
    { id: "image", type: "image", x: 20, y: 150, data: { ...createDefaultNodeData("image", "Location", 1) } },
    { id: "character", type: "character", x: -400, y: 450, data: { ...createDefaultNodeData("character", "Character", 1) } }, board
  ];
  const edges = [
    { id: "location-wire", from: { nodeId: "image", port: "imageOut" }, to: { nodeId: "board", port: "sceneReferenceIn" }, color: "#3986ff" },
    { id: "character-wire", from: { nodeId: "character", port: "characterOut" }, to: { nodeId: "board", port: "characterIn" }, color: "#27d5e8" }
  ];
  if (!window.localStorage.getItem(nodeDraftStorageKey)) window.localStorage.setItem(nodeDraftStorageKey, JSON.stringify({ nodes, edges, groups: [], viewport: { x: 0, y: 0, scale: 0.85 }, projectName: "Connector QA" }));
  createRoot(document.getElementById("root")).render(<NodeEditor modelPreferencesReady={false} />);
}
