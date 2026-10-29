import React from "react";
import { createRoot } from "react-dom/client";
import { VectorNodeBody } from "../../src/components/VectorNodeBody.jsx";
import { vectorDefaults, normalizeVectorData, ideogramVectorRates } from "../../src/ideogramVector.js";
import { outputDragMime } from "../../src/mediaAssets.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Isolated component and request-lifecycle QA. Both paid calls and status checks are mocks.
// scripts/verifyVector.mjs supplies local image/SVG fixture responses without any app backend access.
const config = { input: [{ id: "promptIn", label: "Brief", color: "#f0c83b" }, { id: "imageIn", label: "References", color: "#3d85ff" }, { id: "transferIn", label: "Mood Board", color: "#ff4fb3" }], output: [{ id: "imageOut", label: "Image output", color: "#3d85ff" }] };
// Exercise older projects whose settings were collapsed and preview background was dark.
const fresh = () => ({ id: "qa-vector", type: "vector", data: { ...vectorDefaults(), settingsOpen: false, previewBackground: "dark", title: "Vector", prompt: "A playful newt mark for a design studio" } });
const requests = new Map();
const looks = new Map();
function Harness() {
  const [node, setNode] = React.useState(fresh), [mount, setMount] = React.useState(0), [project, setProject] = React.useState(1);
  const [slow, setSlow] = React.useState(false), [fail, setFail] = React.useState(false), [references, setReferences] = React.useState(false), [costs, setCosts] = React.useState(true), [visible, setVisible] = React.useState(true);
  const [calls, setCalls] = React.useState({ generate: 0, check: 0, last: null, items: [] }), [preview, setPreview] = React.useState(null), [dropped, setDropped] = React.useState(null);
  const generationIndex = React.useRef(0);
  const [failAt, setFailAt] = React.useState(0);
  const [slowLayerSave, setSlowLayerSave] = React.useState(false), [failLayerSave, setFailLayerSave] = React.useState(false);
  const [moodBoard, setMoodBoard] = React.useState(false), [emptyMoodBoard, setEmptyMoodBoard] = React.useState(false);
  const [slowGuideSave, setSlowGuideSave] = React.useState(false), [failGuideSave, setFailGuideSave] = React.useState(false), [guideUploads, setGuideUploads] = React.useState([]);
  const [extraSources, setExtraSources] = React.useState(false);
  const [nodePointerDowns, setNodePointerDowns] = React.useState(0);
  const api = {
    looks: async () => ({ looks: [...looks.values()] }),
    saveLook: async body => { looks.set(body.id, structuredClone(body)); return { look: body }; },
    removeLook: async id => { looks.delete(id); return { ok: true }; },
    async nameLayers(body) {
      setCalls(previous => ({ ...previous, naming: (previous.naming || 0) + 1 }));
      await new Promise(resolve => setTimeout(resolve, 100));
      return { names: body.keys.map(key => ({ key, name: `Named ${key}` })) };
    },
    async uploadGuidance(form) {
      const blob = form.get("asset");
      setGuideUploads(previous => [...previous, { name: blob.name, type: blob.type, size: blob.size, fields: Object.fromEntries([...form].filter(([key]) => key !== "asset")) }]);
      if (slowGuideSave) await new Promise(resolve => setTimeout(resolve, 1500));
      if (failGuideSave) throw new Error("Mock reference save failed. Previous guidance preserved.");
      const response = await fetch("/vector-qa-local/guide", { method: "POST", body: blob });
      return { response, data: await response.json() };
    },
    async inspectLayers(body, { signal } = {}) {
      const response = await fetch("/vector-qa-local/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
    },
    async saveLayers(body, { signal } = {}) {
      if (slowLayerSave) await new Promise(resolve => setTimeout(resolve, 1500));
      if (failLayerSave) throw new Error("Mock local save failed; original preserved.");
      const response = await fetch("/vector-qa-local/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
    },
    pricing: async () => ({ rates: { ...ideogramVectorRates } }),
    async generate(body) {
      const index = ++generationIndex.current;
      setCalls(previous => ({ ...previous, generate: previous.generate + 1, last: body, items: [...previous.items, body] }));
      requests.set(body.requestId, { requestId: body.requestId, status: "running" });
      await new Promise(resolve => setTimeout(resolve, slow ? 1500 : 180));
      if (fail || index === failAt) {
        requests.set(body.requestId, { requestId: body.requestId, status: "failed", error: "Mock provider rejection; no automatic retry." });
        throw Object.assign(new Error("Mock provider rejection; check the request."), { status: 400 });
      }
      const item = { type: "image", url: `/outputs/vector-qa/${body.requestId}.png`, thumbnailUrl: `/outputs/vector-qa/${body.requestId}-thumb.png`, svgUrl: `/outputs/vector-qa/${body.requestId}.svg`, width: 640, height: 640, model: "Ideogram Vector", label: body.mode === "vectorize" ? "Converted artwork" : "Newt studio mark", cost: { amountUsd: body.mode === "vectorize" ? 0.10 : 0.16 }, seed: 42, settings: body };
      const result = { requestId: body.requestId, status: "completed", item };
      requests.set(body.requestId, result); return result;
    },
    async job(id) { setCalls(previous => ({ ...previous, check: previous.check + 1 })); return requests.get(id) || { requestId: id, status: "uncertain", error: "No mock receipt exists." }; }
  };
  const update = (_, patch) => setNode(previous => ({ ...previous, data: { ...previous.data, ...patch } }));
  const imageInputs = references ? Array.from({ length: extraSources ? 3 : 1 }, (_, i) => ({ url: `/uploads/vector-qa/${i ? `source-${i}` : "source"}.png`, label: `Original artwork ${i + 1}` })) : [];
  const moodBoardInputs = moodBoard ? [{ url: emptyMoodBoard ? "" : "/uploads/vector-qa/mood.png", label: "BrandVisualDirectionWithAnUnusuallyLongUnbrokenNameForLayoutTesting" }] : [];
  return <main style={{ padding: 16 }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <strong>Vector QA · mocked providers</strong>
      <label><input type="checkbox" checked={slow} onChange={e => setSlow(e.target.checked)} />Slow response</label>
      <label><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} />Fail request</label>
      <label>Fail on call<input type="number" min="0" value={failAt} onChange={e => setFailAt(Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={references} onChange={e => setReferences(e.target.checked)} />Connect source</label>
      <label><input type="checkbox" checked={moodBoard} onChange={e => setMoodBoard(e.target.checked)} />Connect Mood Board</label>
      <label><input type="checkbox" checked={emptyMoodBoard} onChange={e => setEmptyMoodBoard(e.target.checked)} />Empty Mood Board</label>
      <label><input type="checkbox" checked={costs} onChange={e => setCosts(e.target.checked)} />Show costs</label>
      <label><input type="checkbox" checked={slowLayerSave} onChange={e => setSlowLayerSave(e.target.checked)} />Slow layer save</label>
      <label><input type="checkbox" checked={failLayerSave} onChange={e => setFailLayerSave(e.target.checked)} />Fail layer save</label>
      <label><input type="checkbox" checked={slowGuideSave} onChange={e => setSlowGuideSave(e.target.checked)} />Slow reference save</label>
      <label><input type="checkbox" checked={failGuideSave} onChange={e => setFailGuideSave(e.target.checked)} />Fail reference save</label>
      <label><input type="checkbox" checked={extraSources} onChange={e => setExtraSources(e.target.checked)} />Extra sources</label>
      <button onClick={() => { setNode(previous => ({ ...previous, data: normalizeVectorData(JSON.parse(JSON.stringify(previous.data)), { restore: true }) })); setMount(value => value + 1); }}>Save / Reopen</button>
      <button onClick={() => { setProject(value => value + 1); setNode(fresh()); }}>Switch project</button>
      <button onClick={() => setNode(previous => ({ ...previous, data: { ...previous.data, vectorLayersOpen: false, vectorLayerDrafts: [{ svgUrl: previous.data.resultItems[previous.data.selectedResultIndex]?.svgUrl, operations: [{ type: "background", keys: ["background"] }, { type: "backgroundVisibility", visible: false }] }] } }))}>Restore layer draft</button>
      <button onClick={() => setVisible(value => !value)}>{visible ? "Unmount node" : "Mount node"}</button>
    </div>
    {visible && <article className="node-card vector" data-node-card-id={node.id} style={{ position: "relative" }} onPointerDown={() => setNodePointerDowns(count => count + 1)}><header className="node-header">Vector</header>
      <VectorNodeBody key={mount} node={node} config={config} prompt={node.data.prompt} imageInputs={imageInputs} imageConnected={references} onUpdate={update} workflowContext={{ projectId: `qa-${project}`, projectName: "Vector QA" }}
        moodBoardInputs={moodBoardInputs} moodBoardConnected={moodBoard}
        onPreviewOpen={setPreview} onConnectStart={() => {}} onDisconnectInput={() => {}} connectedPortKeys={new Set([...(references ? ["qa-vector:imageIn"] : []), ...(moodBoard ? ["qa-vector:transferIn"] : [])])} showApiCosts={costs} api={api} />
    </article>}
    <div aria-label="Canvas drop target" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setDropped(JSON.parse(e.dataTransfer.getData(outputDragMime) || "null")); }} style={{ border: "1px dashed #777", minHeight: 50, width: 370, padding: 10, marginTop: 10 }}>Drop output here</div>
    <pre><output aria-label="Provider calls">{JSON.stringify(calls)}</output></pre>
    <pre><output aria-label="Vector state">{JSON.stringify(node.data)}</output></pre>
    <pre><output aria-label="Guidance uploads">{JSON.stringify(guideUploads)}</output></pre>
    <output aria-label="Node pointer downs">{nodePointerDowns}</output>
    <output aria-label="Dropped output">{JSON.stringify(dropped)}</output>
    {preview && <dialog open><img src={preview.url} alt={preview.label} style={{ maxWidth: "70vw", maxHeight: "60vh" }} /><button onClick={() => setPreview(null)}>Close preview</button></dialog>}
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
