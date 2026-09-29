import React from "react";
import { createRoot } from "react-dom/client";
import source from "../../src/NodeEditor.jsx?raw";
import { createConnectionHarness } from "../helpers/connectionHarness.js";
import "../../src/nodeEditor.css";

const harness = createConnectionHarness(source, {
  document,
  getConnectionError: (_from, to) => to.port === "audioIn" ? "Incompatible input" : ""
});
function Harness() {
  const [, redraw] = React.useReducer(value => value + 1, 0);
  const canvas = React.useRef(null);
  const { state } = harness;
  function start(event) {
    event.preventDefault(); event.stopPropagation();
    const bounds = canvas.current.getBoundingClientRect();
    state.menu = null;
    state.draftEdge = { from: { nodeId: "source", port: "imageOut" }, color: "#3d85ff", x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    redraw();
  }
  const port = (nodeId, portId, role, label, color) => <button type="button" aria-label={label} title={label} className={`node-port ${role}`} data-node-id={nodeId} data-port-id={portId} data-port-role={role} onPointerDown={role === "output" ? start : undefined} style={{ position: "static", background: color, width: 20, height: 20 }} />;
  return <main style={{ margin: 16, color: "#eee", fontFamily: "sans-serif" }}>
    <h1 style={{ fontSize: 18 }}>Canvas connection QA</h1>
    <div ref={canvas} className="node-canvas" aria-label="Test canvas" style={{ position: "relative", width: "100%", height: 480, background: "#101010" }}
      onPointerMove={event => { if (state.draftEdge) { const r=event.currentTarget.getBoundingClientRect(); Object.assign(state.draftEdge, {x:event.clientX-r.left, y:event.clientY-r.top}); redraw(); } }}
      onPointerUp={event => { harness.finishConnection(event); redraw(); }}
      onContextMenu={event => { harness.openContextMenu(event); if (state.menu) { const r=event.currentTarget.getBoundingClientRect(); state.menu.x-=r.left; state.menu.y-=r.top; } redraw(); }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {state.edges.map(edge => <path key={edge.id} d="M100 105 L340 105" stroke={edge.color} strokeWidth="3" />)}
        {state.draftEdge && <path data-testid="draft-wire" d={`M100 105 L${state.draftEdge.x} ${state.draftEdge.y}`} stroke="#3d85ff" strokeWidth="3" />}
      </svg>
      <section data-node-card-id="source" style={{ position: "absolute", top: 40, left: 40, padding: 20, background: "#242424" }}>Image output<br />{port("source", "imageOut", "output", "Image output", "#3d85ff")}</section>
      <section data-node-card-id="target" style={{ position: "absolute", top: 40, left: 300, padding: 20, background: "#242424" }}>Inputs<br />{port("target", "imageIn", "input", "Compatible image input", "#3d85ff")} {port("target", "audioIn", "input", "Incompatible audio input", "#ff8b35")}</section>
      {state.menu && <div className="node-context-menu" style={{ left: state.menu.x, top: state.menu.y }}><button onClick={() => { state.menu = null; redraw(); }}>Image Model</button><button onClick={() => { state.menu = null; redraw(); }}>Video Model</button></div>}
    </div>
    <output aria-label="Connection state">{JSON.stringify({ edges: state.edges.length, draft: Boolean(state.draftEdge), menu: Boolean(state.menu), undo: state.undoCount, status: state.status })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
