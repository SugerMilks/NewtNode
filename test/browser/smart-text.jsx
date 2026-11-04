import React from "react";
import { createRoot } from "react-dom/client";
import { TextModelNodeBody } from "../../src/components/NodeBodies.jsx";
import { runTextNodeProcessing, smartTextCompletionPatch } from "../../src/nodeRunners/textModels.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Isolated UI/runner fixture. Block every API call unless a browser test supplies a mock.
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, options) => String(url).includes("/api/") && !window.smartTextQaEnabled
  ? Promise.reject(new Error("This test requires mocked API responses.")) : realFetch(url, options);
const config = { input: [{ id: "imageIn", label: "Image", color: "#3d85ff" }, { id: "videoIn", label: "Video", color: "#54c96a" }], output: [{ id: "promptOut", label: "Prompt", color: "#f0c83b" }] };

function Harness() {
  const [node, setNode] = React.useState({ id: "qa-smart", type: "text", data: { title: "Smart Text", text: "" } });
  const [connected, setConnected] = React.useState(false);
  const [videoConnected, setVideoConnected] = React.useState(false);
  const [mount, setMount] = React.useState(0);
  const incoming = { ...(connected ? { imageIn: [{}] } : {}), ...(videoConnected ? { videoIn: [{}] } : {}) };
  const live = React.useRef(node); live.current = node;
  const update = (_, patch) => setNode(value => ({ ...value, data: { ...value.data, ...patch } }));
  async function run(submitted, action) {
    if (live.current.data.status === "running") return;
    update(node.id, { status: "running", error: "" });
    const textAction = action === "revise-smart-text" ? "revise" : "generate";
    try {
      const result = await runTextNodeProcessing({ node: submitted, incoming,
        imageInputs: connected ? [{ type: "image", url: "/storyboard/MOOD_BOARD.png", label: "@Reference" }] : [],
        videoInputs: videoConnected ? [{ type: "video", url: "/uploads/clip.mov", label: "@Clip" }] : [], action: textAction });
      update(node.id, smartTextCompletionPatch(submitted, live.current, result, textAction));
    } catch (error) { update(node.id, { status: "error", error: error.message }); }
  }
  return <main style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <label><input type="checkbox" checked={connected} onChange={event => setConnected(event.target.checked)} />Connect image</label>
      <label><input type="checkbox" checked={videoConnected} onChange={event => setVideoConnected(event.target.checked)} />Connect video</label>
      <button onClick={() => { setNode(JSON.parse(JSON.stringify(node))); setMount(value => value + 1); }}>Save / Reopen</button>
    </div>
    <article className="node-card text" style={{ position: "relative", width: 420, maxWidth: "100%" }}>
      <header className="node-header">Smart Text</header>
      <TextModelNodeBody key={mount} node={node} config={config} outputPort={config.output[0]} incoming={incoming}
        onUpdate={update} onRun={run} running={node.data.status === "running"} onConnectStart={() => {}} onDisconnectInput={(_nodeId, portId) => portId === "videoIn" ? setVideoConnected(false) : setConnected(false)}
        connectedPortKeys={new Set([...(connected ? ["qa-smart:imageIn"] : []), ...(videoConnected ? ["qa-smart:videoIn"] : [])])} />
    </article>
  </main>;
}

createRoot(document.getElementById("root")).render(<Harness />);
