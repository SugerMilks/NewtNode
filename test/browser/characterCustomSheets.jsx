import React from "react";
import { createRoot } from "react-dom/client";
import NodeEditor, { createDefaultNodeData } from "virtual:storyboard-qa";
import { nodeDraftStorageKey } from "../../src/useNodeEditorDraft.js";
import "../../src/styles.css";

if (!localStorage.getItem(nodeDraftStorageKey)) {
  const data = createDefaultNodeData("character", "Character", 1);
  if (new URLSearchParams(location.search).has("recovery")) {
    const sheet = { id: "client", localUrl: "/uploads/custom-qa.png", fileName: "Custom.png" };
    Object.assign(data, { characterName: "Emma", activated: true, locked: true, characterTab: "sheet", activeCharacterSheetId: "custom:client",
      characterCustomSheets: [sheet], characterBaseSheet: sheet, resultUrl: "", resultItems: [],
      characterSheetVariants: [{ wardrobeId: "__default-wardrobe__", wardrobeFileName: "Existing wardrobe", wardrobeUrl: "", generated: sheet }] });
  }
  localStorage.setItem(nodeDraftStorageKey, JSON.stringify({ projectId: "character-custom-qa", projectName: "Custom Sheet QA",
    nodes: [{ id: "character-qa", type: "character", x: 40, y: 40, data },
      { id: "preview-qa", type: "preview", x: 960, y: 40, data: createDefaultNodeData("preview", "Preview", 1) }],
    edges: [], groups: [], viewport: { x: 0, y: 0, scale: 0.8 }
  }));
}
createRoot(document.getElementById("root")).render(<NodeEditor modelPreferencesReady={false} />);
