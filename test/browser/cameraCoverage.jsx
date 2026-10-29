import React from "react";
import { createRoot } from "react-dom/client";
import { CameraCoverageNodeBody } from "../../src/components/CameraCoverageNodeBody.jsx";
import { cameraCoverageDefaults, coverageOutputPatch, coverageTrajectory, coverageFramingPoses, newCoveragePoses } from "../../src/cameraCoverage.js";
import { clearStaleRunningState, resetCopiedNodeRuntime } from "../../src/workflowState.js";
import { outputItemFromDataTransfer } from "../../src/mediaAssets.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const config = { input: [{ id: "imageIn", label: "Master image", color: "#3d85ff" }], output: [{ id: "imageOut", label: "Selected shot", color: "#3d85ff" }] };
const image = "/storyboard/MOOD_BOARD.png";
const outputImage = "/outputs/coverage-qa.png";
const video = "/test/browser/coverage-test.mp4";
function Harness() {
  const [node, setNode] = React.useState({ id: "qa-camera", type: "cameraCoverage", data: { ...cameraCoverageDefaults(), title: "ReFrame", masterImage: { url: image, label: "Master still" }, coverageView: "master" } });
  const [epoch, setEpoch] = React.useState(0), [costs, setCosts] = React.useState(false), [calls, setCalls] = React.useState({ start: 0, read: 0, refine: 0, capture: 0 });
  const jobs = React.useRef(new Map());
  const behavior = React.useRef({ fail: false, slow: false, hold: false, holdRefine: false, pending: [] });
  const [disabled, setDisabled] = React.useState(false), [dropped, setDropped] = React.useState(null);
  const [imageRequests, setImageRequests] = React.useState([]);
  const api = React.useMemo(() => ({
    start: async body => { setCalls(c => ({ ...c, start: c.start + 1, lastStart: body })); const reply = { ...body, id: body.requestId, requestId: "mock-provider-request", status: "queued", trajectory: body.poses ? coverageTrajectory(coverageFramingPoses(body.poses, body.pathMode, body.protectFraming, body.framingRoom), body.pathMode) : [] }; jobs.current.set(reply.id, reply); return reply; },
    job: async id => { setCalls(c => ({ ...c, read: c.read + 1 })); const job = jobs.current.get(id); return behavior.current.hold ? job : { ...job, status: "complete", result: { url: job.kind === "pass" ? video : `${outputImage}?upscale=${id}`, width: 960, height: 540, duration: 3, fps: 24 } }; },
    capture: async body => { setCalls(c => ({ ...c, capture: c.capture + 1 })); if (behavior.current.slow) await new Promise(r => setTimeout(r, 700));
      return { image: { localUrl: `${outputImage}?frame=${body.frameTime}&id=${crypto.randomUUID()}` }, width: 960, height: 540 }; }
  }), []);
  const update = (_, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
  const refine = async request => { setCalls(c => ({ ...c, refine: c.refine + 1, lastRefine: { model: request.node.data.model, aspectRatio: request.aspectRatio, source: request.imagePromptItems[0].url } }));
    setImageRequests(items => [...items, { prompt: request.prompt, references: request.imagePromptItems, model: request.node.data.model, title: request.node.data.title }]);
    const fail = behavior.current.fail;
    if (behavior.current.holdRefine) await new Promise(r => behavior.current.pending.push(r)); else await new Promise(r => setTimeout(r, 250));
    if (fail) throw new Error("Simulated provider failure"); return [{ url: `${outputImage}?refined=${crypto.randomUUID()}`, type: "image" }]; };
  const sampleShots = () => {
    const shots = Array.from({ length: 12 }, (_, index) => ({ id: `shot-${index}`, label: `Shot ${index + 1}`, originalUrl: `${outputImage}?shot=${index}`, passId: "sample", versionId: "original", frameTime: index / 24,
      versions: [{ id: "original", url: `${outputImage}?shot=${index}`, label: "Original", width: 960, height: 540, type: "image" }] }));
    update(node.id, { ...coverageOutputPatch(shots, shots[0].id), coverageView: "shot" });
  };
  return <main style={{ padding: 16 }}><style>{"@media (min-width: 1100px) { .coverage-qa-drop { position: fixed; top: 120px; right: 24px; width: 220px; } }"}</style><nav style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
    <button onClick={sampleShots}>Load shots</button>
    <button onClick={() => { setNode(clearStaleRunningState(JSON.parse(JSON.stringify(node)))); setEpoch(n => n + 1); }}>Save / Reopen</button>
    <button onClick={() => { setNode(current => ({ ...current, data: resetCopiedNodeRuntime(current.data) })); setEpoch(n => n + 1); }}>Copy node</button>
    <label><input type="checkbox" checked={costs} onChange={e => setCosts(e.target.checked)} />Show costs</label>
    <label><input type="checkbox" onChange={e => { behavior.current.fail = e.target.checked; }} />Fail refinement</label>
    <label><input type="checkbox" onChange={e => { behavior.current.slow = e.target.checked; }} />Slow capture</label>
    <label><input type="checkbox" onChange={e => { behavior.current.hold = e.target.checked; }} />Hold jobs</label>
    <label><input type="checkbox" onChange={e => { behavior.current.holdRefine = e.target.checked; }} />Hold refinements</label>
    <button onClick={() => behavior.current.pending.pop()?.()}>Finish latest refinement</button>
    <label><input type="checkbox" checked={disabled} onChange={e => setDisabled(e.target.checked)} />Disable models</label>
    <output aria-label="Calls" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{JSON.stringify(calls)}</output>
  </nav><article className="node-card cameraCoverage" style={{ position: "relative", maxWidth: "100%" }}><header className="node-header">{node.data.title}</header>
    <CameraCoverageNodeBody key={epoch} node={node} config={config} onUpdate={update} workflowContext={{}} onConnectStart={() => {}} onDisconnectInput={() => {}} connectedPortKeys={new Set()}
      api={api} refine={refine} imageModels={disabled ? [] : undefined} ratios={["16:9", "1:1", "9:16"]} resolutions={["1K", "2K", "4K"]} showApiCosts={costs} />
  </article><div className="coverage-qa-drop" aria-label="Canvas drop target" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setDropped(outputItemFromDataTransfer(e.dataTransfer)); }}
    style={{ padding: 24, border: "1px dashed #666", marginTop: 16 }}>Canvas drop target</div>
  <output aria-label="Dropped" style={{ display: "none" }}>{JSON.stringify(dropped)}</output>
  <output aria-label="Image requests" style={{ display: "none" }}>{JSON.stringify(imageRequests)}</output>
  <output aria-label="State" style={{ display: "none" }}>{JSON.stringify(node.data)}</output></main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
