import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData } from "virtual:storyboard-qa";
import { imageModelOptions, videoModelOptions } from "../../src/modelOptions.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

function Harness() {
  const [type, setType] = React.useState("imageModel");
  const [provider, setProvider] = React.useState("fal");
  const initial = type => ({ id: "seedream-qa", type, data: { ...createDefaultNodeData(type, "Model QA", 1),
    settingsOpen: true, advancedOpen: true, storyboardTab: "advanced", utilityMode: "image", utilityImageModel: "Coverage" } });
  const [node, setNode] = React.useState(() => initial("imageModel"));
  return <main style={{ padding: 16 }}>
    <label>Test node <select aria-label="Test node" value={type} onChange={event => { setType(event.target.value); setNode(initial(event.target.value)); }}>
      {["imageModel", "character", "storyboard", "explore", "utility", "autoAspect"].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <label>Test provider <select aria-label="Test provider" value={provider} onChange={event => setProvider(event.target.value)}>
      {["fal", "krea", "atlas"].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <section className={`node-card ${type === "storyboard" ? "storyboard-node" : ""}`} style={{ position: "relative", width: "100%", maxWidth: type === "imageModel" ? 640 : 1100, margin: "16px auto" }}>
      <NodeBody node={node} incoming={{}} incomingByNode={{}} connectedPortKeys={new Set()} imageModelOptions={imageModelOptions} videoModelOptions={videoModelOptions}
        generationProvider={provider} showApiCosts={true} onUpdate={(_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }))}
        onRun={() => {}} onConnectStart={() => {}} onDisconnectInput={() => {}} onPreviewResizeStart={() => {}} onPreviewOpen={() => {}} />
    </section>
    <output aria-label="Selected settings">{JSON.stringify({ model: node.data.model, characterSheetModel: node.data.characterSheetModel, resolution: node.data.resolution, background: node.data.background })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
