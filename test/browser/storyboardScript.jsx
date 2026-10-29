import React from "react";
import { createRoot } from "react-dom/client";
import { StoryboardScriptImport } from "../../src/components/StoryboardScriptImport.jsx";
import { StoryboardShotList } from "../../src/components/StoryboardShotList.jsx";
import { storyboardCameraPersonalities } from "../../src/storyboardCinematography.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const scripts = [
  { title: "The Last Coffee", version: "30-second spot", format: "Broadcast / AV", duration: "30 seconds", summary: "Maya and Sam finish their coffee before an unexpected departure.", excerpt: "MAYA: We should go.\nSam looks towards the door.", pages: [3, 4, 5], contextPages: [1, 2], scenes: [{ title: "Cafe interior", summary: "The conversation and departure", pages: [3, 4] }, { title: "Street", summary: "A final glance back", pages: [5] }] },
  { title: "The Last Coffee", version: "15-second cutdown", format: "Broadcast / AV", duration: "15 seconds", summary: "The shorter alternate script.", excerpt: "MAYA: Ready?", pages: [6, 7], contextPages: [], scenes: [] }
];
const fixture = () => ({ id: "qa", data: { title: "Storyboard QA", storyboardFrames: [], storyboardScriptImport: { document: { url: "/uploads/fixture.pdf", fileName: "Coffee - Directors Treatment.pdf", digest: "mock", pageCount: 70, scannedPages: [] }, range: "1-70" } } });
function Harness() {
  const [node, setNode] = React.useState(fixture), [calls, setCalls] = React.useState([]), [width, setWidth] = React.useState(960), [mounted, setMounted] = React.useState(true), [slow, setSlow] = React.useState(false);
  const [scenario, setScenario] = React.useState("single");
  const availableScripts = scenario === "multiple" ? scripts : scenario === "none" ? [] : [{ ...scripts[0], pages: scenario === "long" || scenario === "oversize" ? Array.from({ length: scenario === "long" ? 31 : 51 }, (_, index) => index + 1) : scripts[0].pages }];
  const api = {
    storyboardScript: async (mode, body) => {
      setCalls(value => [...value, { mode, pages: body.pages, confirmLongScript: body.confirmLongScript, cameraPersonality: body.storyboardCameraPersonality }]);
      if (slow) await new Promise(resolve => setTimeout(resolve, 2000));
      if (scenario === "failure" && mode === "build") throw new Error("Provider connection interrupted. Existing shots are unchanged.");
      if (mode === "analyze") return { catalog: { scripts: availableScripts, warnings: [] } };
      if (mode === "page") return { image: "/storyboard/MOOD_BOARD.png" };
      if (mode === "inspect") return { pageCount: 70, digest: "mock", scannedPages: [] };
      if (mode === "build" && scenario === "narrow") return { draft: { title: "Long script", summary: "Long script", warnings: ["This script needs more than 35 shots. Upload a shorter script or scene."], needsNarrowing: true, shots: [] } };
      if (mode === "build") return { draft: { title: "The Last Coffee", summary: "Establish the pair, the decision to leave, and the shared exit.", warnings: [], needsNarrowing: false, shots: [
        { number: 1, scene: "Cafe interior", pages: [body.pages[0]], description: "Maya and Sam face each other across a small cafe table. Both cups rest in front of their owners.", dialogue: "MAYA: We should go.", voiceover: "", onScreenText: "", timing: "0:00-0:05", productionNotes: "", shot: "MS", lens: "35mm", angle: "None" },
        { number: 2, scene: "Cafe interior", pages: [body.pages[0]], description: "Over Maya's shoulder, Sam turns towards the door. Maya remains visible in the foreground.", dialogue: "", voiceover: "", onScreenText: "", timing: "0:05-0:08", productionNotes: "Hold eyeline towards the established exit.", shot: "CU", lens: "50mm", angle: "None" }
      ] } };
    },
    uploadAsset: async () => { setCalls(value => [...value, { mode: "upload" }]); return { response: { ok: true }, data: { asset: { localUrl: "/uploads/fixture.pdf" } } }; }
  };
  return <main style={{ padding: 16 }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button onClick={() => { setNode(fixture()); setCalls([]); }}>Reset</button>
      <label>Camera personality<select aria-label="Camera personality" value={node.data.storyboardCameraPersonality || "Expressive"} onChange={event => { const value = event.target.value; setNode(current => ({ ...current, data: { ...current.data, storyboardCameraPersonality: value } })); }}>{storyboardCameraPersonalities.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Fixture<select aria-label="Fixture" value={scenario} onChange={event => { setScenario(event.target.value); setNode(fixture()); setCalls([]); }}>{["single", "multiple", "long", "oversize", "none", "failure", "narrow"].map(value => <option key={value}>{value}</option>)}</select></label>
      <button onClick={() => setNode(value => ({ ...value, data: { ...value.data, storyboardFrames: Array.from({ length: 35 }, (_, i) => ({ id: `old-${i}`, number: i + 1, shotDescription: `Existing shot ${i + 1}`, resultUrl: "/outputs/original.png", versions: [{ resultUrl: "/outputs/older.png" }] })) } }))}>Fill existing shots</button>
      <button onClick={() => setNode(value => ({ ...value, data: { ...value.data, storyboardFrames: value.data.storyboardFrames.map(frame => ({ ...frame, protected: true })) } }))}>Protect shots</button>
      <button onClick={() => setWidth(370)}>Narrow node</button><button onClick={() => setWidth(960)}>Wide node</button>
      <button onClick={() => setNode(value => JSON.parse(JSON.stringify(value)))}>Save and reopen</button>
      <button onClick={() => setMounted(value => !value)}>Toggle mount</button>
      <label><input type="checkbox" checked={slow} onChange={event => setSlow(event.target.checked)} />Slow requests</label>
    </nav>
    <section className="node-card storyboard-node" style={{ position: "relative", width: "100%", maxWidth: width, margin: "20px auto", padding: 20 }}>
      <h3 style={{ fontSize: 16 }}>Storyboard · Shot List</h3>
      {mounted && <StoryboardScriptImport node={node} frames={node.data.storyboardFrames} api={api} onUpdate={patch => setNode(value => ({ ...value, data: { ...value.data, ...patch } }))} onApply={frames => setNode(value => ({ ...value, data: { ...value.data, storyboardFrames: frames } }))} />}
      {!!node.data.storyboardFrames.length && <StoryboardShotList frames={node.data.storyboardFrames} onAdd={() => {}} onUpdate={(id, patch) => setNode(value => ({ ...value, data: { ...value.data, storyboardFrames: value.data.storyboardFrames.map(frame => frame.id === id ? { ...frame, ...patch } : frame) } }))} onRemove={() => {}} onMove={() => {}} onProtect={() => {}} onRun={() => {}} onPreview={() => {}} renderDescription={frame => <textarea aria-label={`Shot ${frame.number} description`} value={frame.shotDescription} onChange={event => { const description = event.target.value; setNode(value => ({ ...value, data: { ...value.data, storyboardFrames: value.data.storyboardFrames.map(item => item.id === frame.id ? { ...item, shotDescription: description } : item) } })); }} />} />}
    </section>
    <output style={{ display: "block", overflowWrap: "anywhere" }} aria-label="Import QA calls">{JSON.stringify(calls)}</output>
    <output style={{ display: "block", overflowWrap: "anywhere" }} aria-label="Imported frames">{JSON.stringify(node.data.storyboardFrames)}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
