import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData, normalizeCurrentNode, connectedOutputItem, previewSourceResultItems } from "virtual:storyboard-qa";
import { imageModelOptions, videoModelOptions } from "../../src/modelOptions.js";
import { outputDragMime } from "../../src/mediaAssets.js";
import { isLayersNode } from "../../src/imageLayers.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";
function Harness() {
  const [node, setNode] = React.useState({ id: "layers-qa", type: "utility", x: 0, y: 0, data: { ...createDefaultNodeData("utility", "Utility", 1), utilityMode: "image", settingsOpen: true } });
  const [epoch, setEpoch] = React.useState(0), [dropped, setDropped] = React.useState(null);
  const edge = { from: { nodeId: node.id, port: "utilityOut" } };
  return <main style={{ padding: 12 }}>
    <button onClick={() => { setNode(normalizeCurrentNode(JSON.parse(JSON.stringify(node)))); setEpoch(n => n + 1); }}>Save / Reopen</button>
    <div aria-label="Canvas drop target" style={{ padding: 20, border: "1px dashed #666", margin: "12px 0" }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); setDropped(JSON.parse(event.dataTransfer.getData(outputDragMime))); }}>Drop output</div>
    <article className={`node-card utility ${isLayersNode(node) ? "utility-layers" : ""}`} style={{ position: "relative", maxWidth: "100%" }}>
      <header className="node-header">Utility</header>
      <NodeBody key={epoch} node={node} workflowContext={{ projectId: "layers-qa", projectName: "Layers QA" }}
        incoming={{ imageIn: [{ source: { id: "source", type: "image", data: { resultUrl: "/uploads/layers-qa-source.png", title: "Source image" } }, edge: { from: { nodeId: "source", port: "imageOut" } } }] }} incomingByNode={{}}
        onUpdate={(_, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }))}
        imageModelOptions={imageModelOptions} videoModelOptions={videoModelOptions} generationProvider="atlas" connectedPortKeys={new Set(["layers-qa:imageIn"])}
        onRun={() => { throw new Error("Unexpected generic generation"); }} onConnectStart={() => {}} onDisconnectInput={() => {}} onPreviewOpen={() => {}} />
    </article>
    <output aria-label="State" hidden>{JSON.stringify(node)}</output>
    <output aria-label="Dropped image" hidden>{JSON.stringify(dropped)}</output>
    <output aria-label="Connected outputs" hidden>{JSON.stringify({ selected: connectedOutputItem(node, edge), all: previewSourceResultItems(node, edge) })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
