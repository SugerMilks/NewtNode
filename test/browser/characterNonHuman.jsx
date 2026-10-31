import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData, normalizeCurrentNode } from "virtual:storyboard-qa";
import { cloneNode } from "../../src/workflowState.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const fixture = () => ({ id: "character-qa", type: "character", x: 0, y: 0, data: {
  ...createDefaultNodeData("character", "Character", 1), characterName: "Creature",
  characterPortrait: { localUrl: "/newt-mark.png", fileName: "Reference.png" }
} });

function Harness() {
  const [node, setNode] = React.useState(fixture);
  const [runs, setRuns] = React.useState(0);
  const update = (_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
  return <main style={{ padding: 12 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <button onClick={() => setNode(current => normalizeCurrentNode(JSON.parse(JSON.stringify(current))))}>Save / Reopen</button>
      <button onClick={() => setNode(current => normalizeCurrentNode(cloneNode(current)))}>Copy Node</button>
      <button onClick={() => setNode(() => { const legacy = fixture(); delete legacy.data.nonHumanCharacter; delete legacy.data.autoWardrobe; return normalizeCurrentNode(legacy); })}>Load Legacy</button>
      <button onClick={() => update(node.id, { locked: true, activated: true })}>Lock Fixture</button>
      <button onClick={() => update(node.id, { locked: false, activated: false, status: "compiling" })}>Compile Fixture</button>
      <button onClick={() => update(node.id, { locked: false, activated: false, status: "ready" })}>Idle Fixture</button>
      <button onClick={() => update(node.id, { characterPortrait: null })}>Clear Portrait</button>
    </div>
    <div className="character-qa-stage" style={{ width: 1000, maxWidth: "100%" }}>
      <section className="node-card character-node" style={{ position: "relative", width: "100%" }}>
        <NodeBody node={node} generationProvider="fal" incoming={{}} incomingByNode={{}} connectedPortKeys={new Set()} onUpdate={update}
          onCharacterActivate={() => setRuns(value => value + 1)} onCharacterUnlock={() => update(node.id, { locked: false, activated: false })}
          onCharacterWardrobeRemove={() => update(node.id, { autoWardrobe: false })}
          onConnectStart={() => {}} onDisconnectInput={() => {}} />
      </section>
    </div>
    <output hidden aria-label="Character QA state">{JSON.stringify({ data: node.data, runs })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
