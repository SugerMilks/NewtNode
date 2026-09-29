import React from "react";
import { createRoot } from "react-dom/client";
import { FolderOutput } from "lucide-react";
import { OutputNodeBody } from "../../src/components/OutputNodeBody.jsx";
import { normalizeOutputData } from "../../src/outputNode.js";
import { resetCopiedNodeRuntime } from "../../src/workflowState.js";
import { nodeTypeDefinitions } from "../../src/nodeRegistry.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const config = { input: [{ id: "mediaIn", label: "Media", color: "#8d8d8d" }], output: [] };
const sample = index => ({ url: `/outputs/qa/Campaign_${index}.png`, type: "image", fileName: `Campaign_${index}.png`, label: `Campaign ${index}`, sourceName: "Explore", selected: true, ready: true });
function Harness() {
  const [node, setNode] = React.useState({ id: "qa-output", type: "output", data: normalizeOutputData({ title: "Output" }) });
  const [sources, setSources] = React.useState([sample(1)]), [epoch, setEpoch] = React.useState(0), [events, setEvents] = React.useState([]);
  const [fail, setFail] = React.useState(false), [cancelPicker, setCancelPicker] = React.useState(false), [dragCount, setDragCount] = React.useState(0);
  const flags = React.useRef({}); flags.current = { fail, cancelPicker };
  const jobs = React.useRef(new Map());
  const api = React.useMemo(() => ({
    async selectFolder() { return flags.current.cancelPicker ? { canceled: true, path: "" } : { path: "/tmp/NewtNode QA Delivery" }; },
    async validate(body) {
      if (body.types.some(type => !body.destinations[type].path || body.destinations[type].path.includes("missing"))) throw new Error("Destination is unavailable. Check the drive or choose a folder on the NewtNode computer.");
      return { ok: true };
    },
    async export(body) {
      setEvents(values => [...values, `Export ${body.items.length} file(s)`]);
      const job = { id: body.requestId, status: "running", progress: 0, results: [] }; jobs.current.set(job.id, job);
      const error = flags.current.fail;
      setTimeout(() => {
        if (job.status !== "running") return;
        job.results = body.items.map((item, index) => {
          const destination = body.destinations[item.type], extension = destination.format === "original" ? "png" : destination.format === "jpeg" ? "jpg" : destination.format;
          const fileName = `${item.name}.${extension}`;
          return { sourceUrl: item.url, type: item.type, status: error && index === body.items.length - 1 ? "failed" : "saved",
            filePath: `${destination.path}/${destination.subfolder ? `${destination.subfolder}/` : ""}${fileName}`, fileName, error: error && index === body.items.length - 1 ? "Mock write error" : "" };
        });
        job.status = error ? job.results.length > 1 ? "partial" : "failed" : "complete"; job.progress = 1;
      }, 1200);
      return structuredClone(job);
    },
    async job(id) { const value = jobs.current.get(id); if (!value) throw new Error("This export is no longer available. Check the destination before exporting again."); return structuredClone(value); },
    async cancel(id) { const job = jobs.current.get(id); job.status = "canceled"; job.error = "Export canceled."; return structuredClone(job); },
    async reveal(path) { setEvents(values => [...values, `Reveal ${path}`]); return { ok: true }; }
  }), []);
  const update = (_, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
  return <main className="output-qa">
    <div className="qa-controls">
      <button onClick={() => setSources(items => [...items, sample(items.length + 1)])}>Add completed image</button>
      <button onClick={() => { setNode(value => JSON.parse(JSON.stringify(value))); setEpoch(value => value + 1); }}>Save / Reopen</button>
      <button onClick={() => { setNode(value => ({ ...value, id: `copy-${epoch}`, data: resetCopiedNodeRuntime(value.data) })); setEpoch(value => value + 1); }}>Duplicate node</button>
      <button onClick={() => setSources([])}>Disconnect sources</button>
      <button onClick={() => setSources(items => items.map(item => ({ ...item, ready: !item.ready })))}>Toggle upstream running</button>
      <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} />Fail next export</label>
      <label><input type="checkbox" checked={cancelPicker} onChange={event => setCancelPicker(event.target.checked)} />Cancel folder picker</label>
    </div>
    <div className="qa-layout">
      <aside aria-label="Node menu">{nodeTypeDefinitions.map(item => <div key={item.type} className={item.type === "output" ? "qa-active" : ""}>{item.label}</div>)}</aside>
      <section aria-label="Canvas" onPointerDown={event => { if (!event.defaultPrevented && !event.target.closest("button,input,select,textarea,label,summary,a")) setDragCount(value => value + 1); }}>
        <article className="node-card output" style={{ position: "relative", left: 0, top: 0, transform: "none" }}>
          <header className="node-header"><FolderOutput size={18} /><strong>Output</strong></header>
          <OutputNodeBody key={epoch} node={node} config={config} sources={sources} workflowContext={{ projectId: "qa", projectName: "Campaign", workflowName: "Campaign" }} onUpdate={update}
            connectedPortKeys={new Set(sources.length ? [`${node.id}:mediaIn`] : [])} onConnectStart={event => event.stopPropagation()} onDisconnectInput={event => event.stopPropagation()} api={api} />
        </article>
      </section>
      <aside aria-label="Test results"><strong>QA only</strong><p>Export requests: {events.filter(event => event.startsWith("Export ")).length}</p><p>Receipts: {node.data.outputReceipts?.length || 0}</p><p>Auto Export: {node.data.outputSettings.autoExport ? "On" : "Off"}</p><p>Canvas gestures: {dragCount}</p>{events.map((event, index) => <p key={index}>{event}</p>)}</aside>
    </div>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
