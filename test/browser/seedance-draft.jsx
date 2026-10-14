import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData, normalizeCurrentNode, directorPackageForVideo } from "virtual:storyboard-qa";
import { videoModelOptions } from "../../src/modelOptions.js";
import { buildVideoGenerationRequest, normalizeVideoGenerationResult } from "../../src/nodeRunners/videoModels.js";
import { finishSeedanceDraft } from "../../src/nodeRunners/seedanceDraft.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

function Harness() {
  const [provider, setProvider] = React.useState("fal"), [width, setWidth] = React.useState(540);
  const [attach, setAttach] = React.useState(false), [showDirector, setShowDirector] = React.useState(false);
  const [costs, setCosts] = React.useState(false), [submits, setSubmits] = React.useState(0);
  const [clip, setClip] = React.useState("");
  const [node, setNode] = React.useState({ id: "draft-video", type: "videoModel", data: { ...createDefaultNodeData("videoModel", "Draft Video", 1),
    model: "Seedance 2.5", prompt: "A cinematic landscape", resolution: "1080p", duration: "5 seconds", settingsOpen: true } });
  const [director, setDirector] = React.useState({ id: "draft-director", type: "skillDirector", data: { ...createDefaultNodeData("skillDirector", "Director", 1),
    skillDirectorBuilt: true, resultText: "A planned cinematic scene", skillDirectorLocks: { setup: true, style: true, motion: true, scene: true, shotList: true } } });
  const ref = React.useRef(node); ref.current = node;
  function update(_id, patch) { ref.current = { ...ref.current, data: { ...ref.current.data, ...patch } }; setNode(ref.current); }
  React.useEffect(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream), chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    recorder.onstop = () => { setClip(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }))); stream.getTracks().forEach(track => track.stop()); };
    recorder.start();
    const timer = setInterval(() => { ctx.fillStyle = "#25483c"; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = "#e8d632"; ctx.fillRect(220, 130, 200, 100); }, 100);
    const stop = setTimeout(() => { clearInterval(timer); recorder.stop(); }, 600);
    return () => { clearInterval(timer); clearTimeout(stop); stream.getTracks().forEach(track => track.stop()); };
  }, []);
  const incoming = attach ? { directorIn: [{ source: director, edge: { from: { nodeId: director.id, port: "directorOut" } } }] } : {};
  async function run(_node, action) {
    if (action === "finish-seedance-draft") {
      return finishSeedanceDraft({ node: ref.current, getCurrent: () => ref.current, update: patch => update(node.id, patch),
        complete: async ({ receiptId }) => { setSubmits(n => n + 1); await new Promise(resolve => setTimeout(resolve, 400));
          return { video: { localUrl: `${clip}#finished` }, seedanceDraftSource: receiptId }; } });
    }
    const request = buildVideoGenerationRequest({ node: ref.current, filmDirector: attach ? directorPackageForVideo(director, {}) : null });
    const result = normalizeVideoGenerationResult({ video: { localUrl: clip }, ...(request.seedanceDraft ? { seedanceDraft: provider === "krea"
      ? { provider, completionSupported: false, resolution: "480p" }
      : { provider, receiptId: "test-receipt", draftId: "test-draft", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() } } : {}) }, 0);
    update(node.id, { resultItems: [result], resultUrl: result.url, selectedResultIndex: 0, status: "complete" });
  }
  const shared = { incomingByNode: {}, connectedPortKeys: new Set(), videoModelOptions, generationProvider: provider, showApiCosts: costs,
    onConnectStart() {}, onDisconnectInput() {}, onPreviewOpen() {} };
  return <main style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <select aria-label="Test provider" value={provider} onChange={event => setProvider(event.target.value)}>{["fal", "atlas", "krea"].map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Test width" value={width} onChange={event => setWidth(Number(event.target.value))}>{[540, 360].map(value => <option key={value}>{value}</option>)}</select>
      <label><input type="checkbox" checked={costs} onChange={event => setCosts(event.target.checked)} />Show costs</label>
      <label><input type="checkbox" checked={attach} onChange={event => setAttach(event.target.checked)} />Attach Director</label>
      <label><input type="checkbox" checked={showDirector} onChange={event => setShowDirector(event.target.checked)} />Show Director</label>
      <button onClick={() => setNode(normalizeCurrentNode(JSON.parse(JSON.stringify(ref.current))))}>Reload saved node</button>
    </div>
    {showDirector && <section className="node-card" style={{ position: "relative", width: "100%", maxWidth: 900, margin: "16px auto" }}>
      <NodeBody {...shared} node={director} incoming={{}} onUpdate={(_id, patch) => setDirector(current => ({ ...current, data: { ...current.data, ...patch } }))} onRun={() => {}} />
    </section>}
    <section className="node-card" style={{ position: "relative", width: "100%", maxWidth: width, margin: "16px auto" }}>
      <NodeBody {...shared} node={node} incoming={incoming} onUpdate={update} onRun={run} />
    </section>
    <output aria-label="Saved settings">{JSON.stringify({ draft: node.data.seedanceDraft || false, resolution: node.data.resolution, results: node.data.resultItems?.length || 0, finishingSubmits: submits, directorDraft: director.data.skillSeedanceDraft || false, directorBuilt: director.data.skillDirectorBuilt })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
