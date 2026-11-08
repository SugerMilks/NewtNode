import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MyNewtNodeBody } from "../../src/components/MyNewtNodeBody.jsx";
import { myNewtDefaults, myNewtSettings } from "../../src/myNewt/contract.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

function Harness() {
  const [node, setNode] = useState({ id: "qa-newt", type: "myNewt", data: { ...myNewtDefaults } });
  const [revision, setRevision] = useState(0), [unknown, setUnknown] = useState(false), [narrow, setNarrow] = useState(false);
  const [action, setAction] = useState("None");
  const job = unknown ? { id: "mock-job", nodeId: node.id, status: "paused", unpricedCount: 2,
    pending: { preview: { model: "OpenAI Image 2.6 Sunburst", provider: "atlas", estimatedCost: null } } } : null;
  return <main style={{ padding: 20, overflow: "auto", maxHeight: "100dvh", boxSizing: "border-box" }}>
    <h1 style={{ fontSize: 18 }}>Newt settings QA (no provider requests)</h1>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <button onClick={() => { setNode(value => JSON.parse(JSON.stringify(value))); setRevision(value => value + 1); }}>Restore saved node</button>
      <label><input type="checkbox" checked={narrow} onChange={event => setNarrow(event.target.checked)} />Narrow layout</label>
      <label><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />Unpriced task</label>
    </div>
    <output aria-label="Saved permissions" style={{ display: "block", overflowWrap: "anywhere", maxWidth: 620, marginBottom: 12 }}>
      {JSON.stringify({ autoReview: myNewtSettings(node.data).autoReview, allowUnpricedGenerations: myNewtSettings(node.data).allowUnpricedGenerations, allowImages: myNewtSettings(node.data).allowImages, allowVideos: myNewtSettings(node.data).allowVideos })}
    </output>
    <section className="node-card myNewt" style={{ position: "relative", width: narrow ? 320 : 600, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", transform: "none" }}>
      <header className="node-title">Newt</header>
      <MyNewtNodeBody key={revision} node={node} config={{ input: [] }} incoming={{}} connectedPortKeys={new Set()}
        onUpdate={(_id, patch) => setNode(value => ({ ...value, data: { ...value.data, ...patch } }))}
        controller={{ job, projectId: "qa-project", projectName: "QA", control: async value => { setAction(value); return true; } }} />
    </section>
    <output aria-label="Mock action">{action}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
