import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData } from "virtual:storyboard-qa";
import { imageModelOptions } from "../../src/modelOptions.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Isolated controls only. The QA server blocks API calls, including paid generation.
function Harness() {
  const [provider, setProvider] = React.useState("fal");
  const [count, setCount] = React.useState(0);
  const [width, setWidth] = React.useState(640);
  const [ran, setRan] = React.useState(false);
  const [node, setNode] = React.useState({ id: "ideogram-qa", type: "imageModel", data: {
    ...createDefaultNodeData("imageModel", "Ideogram QA", 1), model: "Ideogram 4.5",
    prompt: "Rework the lettering using the connected references.", settingsOpen: true,
    quality: "high", resolution: "2K", aspectRatio: "16:9", enablePromptExpansion: false,
    resultUrl: "/storyboard/MOOD_BOARD.png"
  } });
  const incoming = { imagePromptIn: Array.from({ length: count }, (_, index) => ({ source: {
    id: `reference-${index}`, type: "image", data: { title: `Reference ${index + 1}`, resultUrl: `/uploads/qa-${index}.png` }
  } })) };
  return <main style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>References <select aria-label="Test reference count" value={count} onChange={e => setCount(Number(e.target.value))}>
        {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}
      </select></label>
      <label>Provider <select aria-label="Test provider" value={provider} onChange={e => setProvider(e.target.value)}>
        {["fal", "krea", "atlas"].map(name => <option key={name}>{name}</option>)}
      </select></label>
      <label>Width <select aria-label="Test width" value={width} onChange={e => setWidth(Number(e.target.value))}>
        {[640, 360].map(n => <option key={n}>{n}</option>)}
      </select></label>
    </div>
    <section className="node-card" style={{ position: "relative", width: "100%", maxWidth: width, margin: "16px auto" }}>
      <NodeBody node={node} incoming={incoming} incomingByNode={{}} connectedPortKeys={new Set()} imageModelOptions={imageModelOptions}
        generationProvider={provider} showApiCosts={true}
        onUpdate={(_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }))}
        onRun={() => setRan(true)} onConnectStart={() => {}} onDisconnectInput={() => {}} onPreviewOpen={() => {}} />
    </section>
    <output aria-label="Test result">{JSON.stringify({ source: node.data.ideogramSourceUrl || "First connected", ran, expansion: node.data.enablePromptExpansion })}</output>
  </main>;
}
function PreviewHarness() {
  const image = index => ({ url: `/storyboard/MOOD_BOARD.png?result=${index}`, type: "image", label: `Result ${index}`,
    model: "Ideogram 4.5", sourceUrl: "/uploads/shared-reference.png", imagePromptCount: 1, editPrecision: "regular" });
  const [batch, setBatch] = React.useState([1, 2, 3]);
  const [count, setCount] = React.useState(3);
  const [node, setNode] = React.useState({ id: "preview-qa", type: "preview", data: {
    ...createDefaultNodeData("preview", "Preview", 1), previewTab: "layout"
  } });
  const source = { id: "ideogram-source", type: "imageModel", data: { title: "Ideogram mock outputs", model: "Ideogram 4.5",
    resultItems: batch.map(image), resultUrl: image(batch.at(-1)).url, selectedResultIndex: batch.length - 1 } };
  return <main style={{ padding: 16 }}>
    <button onClick={() => { setBatch([count + 1]); setCount(count + 1); }}>Simulate next generation</button>
    <button onClick={() => setNode(current => JSON.parse(JSON.stringify(current)))}>Simulate project reload</button>
    <section className="node-card preview-node" style={{ position: "relative", width: "100%", maxWidth: 1000, margin: "16px auto" }}>
      <NodeBody node={node} incoming={{ sourceIn: [{ source, edge: { from: { port: "imageOut" } } }] }} incomingByNode={{}} connectedPortKeys={new Set()}
        onUpdate={(id, patch) => { if (id === node.id) setNode(current => ({ ...current, data: { ...current.data, ...patch } })); }}
        onConnectStart={() => {}} onDisconnectInput={() => {}} onPreviewOpen={() => {}} />
    </section>
    <output aria-label="Layout URLs">{JSON.stringify(node.data.previewLayoutItems.map(item => item.url))}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(new URLSearchParams(location.search).has("preview") ? <PreviewHarness /> : <Harness />);
