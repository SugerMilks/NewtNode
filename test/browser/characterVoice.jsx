import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData, normalizeCurrentNode, buildVideoModelPrompt } from "virtual:storyboard-qa";
import { cloneNode } from "../../src/workflowState.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const fixture = () => ({ id: "voice-qa", type: "character", x: 0, y: 0, data: {
  ...createDefaultNodeData("character", "Character", 1), characterName: "Newt", locked: true, activated: true,
  resultUrl: "/newt-mark.png", characterPortrait: { localUrl: "/newt-mark.png", fileName: "Portrait.png" },
  characterCustomSheets: [{ id: "custom", localUrl: "/newt-mark.png", fileName: "Custom sheet.png" }], activeCharacterSheetId: "custom:custom",
  activeVoiceId: "sample", characterVoices: [{ id: "sample", localUrl: "/voice-qa/sample.wav", fileName: "Voice sample.wav" }]
} });

function Harness() {
  const [node, setNode] = React.useState(fixture);
  const update = (_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
  const prompt = buildVideoModelPrompt({ data: { model: "Seedance 2.5" } }, '@Newt says "These are new words."', { characterIn: [{ source: node }] }, {});
  return <main style={{ padding: 12 }}>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <button onClick={() => setNode(current => normalizeCurrentNode(JSON.parse(JSON.stringify(current))))}>Save / Reopen</button>
      <button onClick={() => setNode(current => normalizeCurrentNode(cloneNode(current)))}>Copy Node</button>
      <button onClick={() => { const old = fixture(); delete old.data.characterVoiceReferenceOnly; setNode(normalizeCurrentNode(old)); }}>Load Legacy</button>
    </div>
    <div className="character-qa-stage" style={{ width: 1000, maxWidth: "100%" }}>
      <section className="node-card character-node" style={{ position: "relative", width: "100%" }}>
        <NodeBody node={node} generationProvider="fal" incoming={{}} incomingByNode={{}} connectedPortKeys={new Set()} onUpdate={update}
          onCharacterUnlock={() => update(node.id, { locked: false, activated: false })} onConnectStart={() => {}} onDisconnectInput={() => {}} />
      </section>
    </div>
    <output hidden aria-label="Voice QA state">{JSON.stringify({ data: node.data, prompt })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
