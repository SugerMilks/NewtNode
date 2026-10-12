import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData } from "virtual:storyboard-qa";
import { videoModelOptions } from "../../src/modelOptions.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Isolated UI fixture; its run action never contacts a provider or opens a project.
function Harness() {
  const [provider, setProvider] = React.useState("atlas");
  const [width, setWidth] = React.useState(540);
  const [runs, setRuns] = React.useState(0);
  const [node, setNode] = React.useState({ id: "video-qa", type: "videoModel", data: {
    ...createDefaultNodeData("videoModel", "Seedance QA", 1), model: "Seedance 2.5", prompt: "Edit @Clip using @Plate.",
    duration: "9 seconds", aspectRatio: "21:9", resolution: "1080p", settingsOpen: true
  } });
  const incoming = {
    referenceImageIn: [{ source: { id: "plate", type: "image", data: { title: "Plate", resultUrl: "/uploads/plate.png" } } }],
    referenceVideoIn: [{ source: { id: "clip", type: "video", data: { title: "Clip", resultUrl: "/uploads/clip.mov" } } }]
  };
  return <main style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Provider <select aria-label="Test provider" value={provider} onChange={e => setProvider(e.target.value)}>
        {["atlas", "fal", "krea"].map(name => <option key={name}>{name}</option>)}
      </select></label>
      <label>Width <select aria-label="Test width" value={width} onChange={e => setWidth(Number(e.target.value))}>
        {[540, 360].map(n => <option key={n}>{n}</option>)}
      </select></label>
      <button onClick={() => setNode(current => JSON.parse(JSON.stringify(current)))}>Reload saved node</button>
    </div>
    <section className="node-card" style={{ position: "relative", width: "100%", maxWidth: width, margin: "16px auto" }}>
      <NodeBody node={node} incoming={incoming} incomingByNode={{}} connectedPortKeys={new Set()} videoModelOptions={videoModelOptions}
        generationProvider={provider} showApiCosts={false}
        onUpdate={(_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }))}
        onRun={() => setRuns(count => count + 1)} onConnectStart={() => {}} onDisconnectInput={() => {}} onPreviewOpen={() => {}} />
    </section>
    <output aria-label="Saved settings">{JSON.stringify({ task: node.data.seedanceTask || "reference", duration: node.data.duration, aspectRatio: node.data.aspectRatio, runs })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
