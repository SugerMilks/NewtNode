import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, normalizeCurrentNode, createDefaultNodeData } from "newtnode-qa-editor";
import { imageModelOptions, videoModelOptions } from "../../src/modelOptions.js";
import { nodeApi } from "../../src/api/newtApi.js";
import { buildUtilityVideoRequest, normalizeUtilityVideoGenerationResult } from "../../src/nodeRunners/videoModels.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Browser automation supplies local synthetic video and intercepts API requests.
// This harness never submits a provider job on its own.
function Harness() {
  const [node, setNode] = React.useState(() => normalizeCurrentNode({ id: "outpaint-qa", type: "utility", data: { ...createDefaultNodeData("utility", "Utility", 1), utilityMode: "video", utilityVideoModel: "Video Outpaint", settingsOpen: true, prompt: "Continue the courtyard." } }));
  const [connected, setConnected] = React.useState(true);
  const [calls, setCalls] = React.useState([]);
  const incoming = connected ? { referenceVideoIn: [{ source: { id: "source", type: "video", data: { title: "Footage", resultUrl: "/uploads/outpaint-qa.mp4" } } }] } : {};
  const update = (_, patch) => setNode(value => ({ ...value, data: { ...value.data, ...patch } }));
  const run = async () => {
    if (!window.__OUTPAINT_MOCK_ONLY__) throw new Error("Run this harness with mocked endpoints only.");
    update(node.id, { status: "running", error: "" });
    try {
      const body = buildUtilityVideoRequest({ node, model: "Video Outpaint", prompt: node.data.prompt, referenceVideoUrls: connected ? ["/uploads/outpaint-qa.mp4"] : [], workflowContext: {} });
      setCalls(values => [...values, body]);
      const { response, data } = await nodeApi.utilityVideo(body);
      if (!response.ok) throw new Error(data.error);
      const result = normalizeUtilityVideoGenerationResult(data, 0);
      update(node.id, { status: "complete", resultUrl: result.url, resultItems: [...(node.data.resultItems || []), result], selectedResultIndex: node.data.resultItems?.length || 0 });
    } catch (error) { update(node.id, { status: "error", error: error.message }); }
  };
  return <main style={{ padding: 16 }}>
    <label><input aria-label="Connected source" type="checkbox" checked={connected} onChange={event => setConnected(event.target.checked)} />Source</label>
    <button onClick={() => setNode(value => normalizeCurrentNode(JSON.parse(JSON.stringify(value))))}>Save / Reopen</button>
    <article className="node-card utility" data-node-card-id={node.id} style={{ position: "relative", width: 390, maxWidth: "100%", marginTop: 16 }}>
      <header className="node-header">Utility</header>
      <NodeBody node={node} workflowContext={{ projectName: "Outpaint QA" }} incoming={incoming} incomingByNode={{}} imageModelOptions={imageModelOptions} videoModelOptions={videoModelOptions} generationProvider="fal"
        connectedPortKeys={new Set(connected ? [node.id + ":referenceVideoIn"] : [])} running={node.data.status === "running"} onUpdate={update} onRun={run} onConnectStart={() => {}} onDisconnectInput={() => {}} />
    </article>
    <output aria-label="Outpaint state" style={{ display: "block", overflowWrap: "anywhere" }}>{JSON.stringify(node.data)}</output>
    <output aria-label="Outpaint calls" style={{ display: "block", overflowWrap: "anywhere" }}>{JSON.stringify(calls)}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
