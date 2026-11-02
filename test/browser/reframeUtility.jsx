import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData, normalizeCurrentNode } from "virtual:storyboard-qa";
import { isReframeNode, reframeUtilityTransition, cameraCoverageDefaults, coverageOutputPatch } from "../../src/cameraCoverage.js";
import { imageModelOptions, videoModelOptions } from "../../src/modelOptions.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const image = "/storyboard/MOOD_BOARD.png";
const legacy = () => ({ id: "qa-reframe", type: "cameraCoverage", x: 0, y: 0, data: { ...cameraCoverageDefaults(), title: "Saved angles",
  masterImage: { url: image, label: "Master still" }, coverageView: "shot", model: "Nano Banana Pro", resolution: "4K",
  ...coverageOutputPatch([{ id: "shot", label: "Wide", originalUrl: image, versionId: "refined", versions: [
    { id: "original", url: image, type: "image", label: "Original" }, { id: "refined", url: `${image}?refined`, type: "image", label: "Refined" }
  ] }], "shot") } });
function Harness() {
  const [node, setNode] = React.useState({ id: "qa-reframe", type: "utility", x: 0, y: 0, data: { ...createDefaultNodeData("utility", "Utility", 1), settingsOpen: true } });
  const [epoch, setEpoch] = React.useState(0);
  const update = (_, patch) => setNode(current => {
    const safe = reframeUtilityTransition(current.data, patch);
    return safe ? { ...current, data: { ...current.data, ...safe } } : current;
  });
  return <main style={{ padding: 12 }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      <button onClick={() => { setNode(normalizeCurrentNode(legacy())); setEpoch(n => n + 1); }}>Load legacy ReFrame</button>
      <button onClick={() => { setNode(current => normalizeCurrentNode(JSON.parse(JSON.stringify(current)))); setEpoch(n => n + 1); }}>Save / Reopen</button>
      <button onClick={() => update(node.id, { coverageJob: { id: "mock-only", kind: "pass", status: "uncertain" } })}>Simulate pending work</button>
      <button onClick={() => update(node.id, { coverageJob: null })}>Clear simulated work</button>
    </nav>
    <article className={`node-card utility ${isReframeNode(node) ? "utility-reframe" : ""}`} style={{ position: "relative", maxWidth: "100%" }}>
      <header className="node-header">{node.data.title}</header>
      <NodeBody key={epoch} node={node} incoming={{}} incomingByNode={{}} workflowContext={{}} onUpdate={update}
        imageModelOptions={imageModelOptions} videoModelOptions={videoModelOptions} generationProvider="fal" connectedPortKeys={new Set()}
        onRun={() => { throw new Error("No real generations in UI QA"); }} onConnectStart={() => {}} onDisconnectInput={() => {}} />
    </article>
    <output aria-label="State" hidden>{JSON.stringify(node)}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
