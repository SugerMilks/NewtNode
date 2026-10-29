import React from "react";
import { createRoot } from "react-dom/client";
import { ExploreNodeBody } from "../../src/components/ExploreNodeBody.jsx";
import { exploreDefaults } from "../../src/explore.js";
import { isOpenAiImage25Model, openAiImage25KreaAspectRatios, openAiImage25KreaResolutionOptions, openAiImage25KreaSelection } from "../../src/openAiImage25.js";
import { openAiImageAspectRatios, nanoImageAspectRatios } from "../../src/modelOptions.js";
import { runExploreGeneration } from "../../src/nodeRunners/explore.js";
import { clearStaleRunningState } from "../../src/workflowState.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Real UI/runner, isolated data and bundled media; no backend or paid provider requests.
const config = { input: [["promptIn", "Brief", "#f0c83b"], ["imageIn", "Image / Product", "#3d85ff"], ["characterIn", "Character", "#20cfdb"], ["transferIn", "Mood Board", "#ff4fb3"], ["cameraIn", "Camera", "#ef4444"]].map(([id, label, color]) => ({ id, label, color })),
  output: [{ id: "imageOut", label: "Images output", color: "#3d85ff" }] };
const names = ["Sculptural light", "Chromatic reflections", "Atmospheric editorial", "Tactile geometry"];
function Harness() {
  const [node, setNode] = React.useState({ id: "qa-explore", type: "explore", data: { ...exploreDefaults(), referencesOpen: true, title: "Explore", prompt: "An art-directed perfume bottle campaign" } });
  const [mount, setMount] = React.useState(0);
  const ref = React.useRef(node); ref.current = node;
  const [calls, setCalls] = React.useState({ plan: 0, images: 0 }), [preview, setPreview] = React.useState(null), [fail, setFail] = React.useState(false), [costs, setCosts] = React.useState(false);
  const [plans, setPlans] = React.useState([]);
  const [connected, setConnected] = React.useState(false);
  const [provider, setProvider] = React.useState("fal");
  const krea25 = provider === "krea" && isOpenAiImage25Model(node.data.model);
  const [canvasGestures, setCanvasGestures] = React.useState(0), [zoom, setZoom] = React.useState(1);
  const canvasRef = React.useRef(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wheel = event => { event.preventDefault(); setCanvasGestures(value => value + 1); };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);
  const incoming = connected ? Object.fromEntries(config.input.slice(1).map(port => [port.id, [{ source: { type: port.id, data: {
    title: { imageIn: "Campaign bottle", characterIn: "Lead model", transferIn: "Editorial lighting mood board", cameraIn: "Hero framing" }[port.id],
    shotPreset: "Close-up", lensPreset: "85mm", typePreset: "Cinema camera"
  } } }]])) : {};
  const connectedPortKeys = new Set(connected ? config.input.slice(1).map(port => `${node.id}:${port.id}`) : []);
  const update = (_, patch) => setNode(value => ({ ...value, data: { ...value.data, ...patch } }));
  async function run(request) {
    update(node.id, { status: "running", error: "", exploreStopRequested: false });
    try {
      await runExploreGeneration({ node: request, prompt: request.data.prompt, references: connected ? [{ role: "product", label: "Campaign bottle", url: "/outputs/mock-bottle.png" }] : [], workflowContext: {}, update: patch => update(node.id, patch),
        shouldStop: () => ref.current.data.exploreStopRequested,
        plan: async body => { setPlans(value => [...value, body]); setCalls(value => ({ ...value, plan: value.plan + 1 })); return { directions: Array.from({ length: body.count }, (_, index) => ({ name: `${names[index % names.length]} ${index + 1}`, concept: `${names[index % names.length]}: intentional composition ${index + 1}.`, composition: "Asymmetric framing", lighting: "Soft window light", palette: "Red, cyan and neutral gray", treatment: "Editorial photography", styleBrief: "Motivated light, precise color and restrained materials.", prompt: `A perfume bottle with ${names[index % names.length]}, execution ${index + 1}.` })) }; },
        generate: async args => { await new Promise(resolve => setTimeout(resolve, 700)); setCalls(value => ({ ...value, images: value.images + 1 })); if (fail && args.index === 1) throw new Error("Mock provider failure; previous results remain available."); return [{ url: `/storyboard/MOOD_BOARD.png?qa=${crypto.randomUUID()}`, type: "image", label: "Mock result" }]; }
      });
    } catch (error) { update(node.id, { status: "error", error: error.message }); }
  }
  return <main style={{ padding: 16 }}><div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
    <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} />Fail second image</label>
    <label><input type="checkbox" checked={costs} onChange={event => setCosts(event.target.checked)} />Show cost</label>
    <label><input type="checkbox" checked={connected} onChange={event => setConnected(event.target.checked)} />Connect sample references</label>
    <button onClick={() => { setNode(clearStaleRunningState(JSON.parse(JSON.stringify(node)))); setMount(value => value + 1); }}>Save / Reopen</button>
    <button onClick={() => update(node.id, { resultItems: Array.from({ length: 20 }, (_, index) => ({ url: `/storyboard/MOOD_BOARD.png?sample=${index}`, type: "image", label: `Direction ${index + 1}` })), selectedResultIndex: 0 })}>Load 20 sample results</button>
    <button onClick={() => update(node.id, { resultItems: [], selectedResultIndex: 0 })}>Clear results</button>
    <button onClick={() => canvasRef.current.querySelector(".explore-gallery")?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 250 }))}>Test thumbnail wheel</button>
    <label>Canvas zoom<select aria-label="Canvas zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value="1">100%</option><option value="0.5">50%</option></select></label>
    <label>Provider<select aria-label="Provider" value={provider} onChange={event => setProvider(event.target.value)}><option value="fal">Fal</option><option value="krea">Krea</option><option value="atlas">Atlas</option></select></label>
    <output aria-label="Canvas gestures">{canvasGestures}</output>
    <output aria-label="Provider calls">{calls.plan} plans; {calls.images} images</output>
  </div>
    <div ref={canvasRef}>
    <article data-node-card-id={node.id} className="node-card explore" style={{ position: "relative", transform: `scale(${zoom})`, transformOrigin: "top left", maxWidth: "100%" }}>
      <header className="node-header">Explore</header>
      <ExploreNodeBody key={mount} node={node} config={config} incoming={incoming} prompt={node.data.prompt} onUpdate={update} onRun={run} onPreviewOpen={setPreview}
        onConnectStart={() => {}} onDisconnectInput={() => {}} connectedPortKeys={connectedPortKeys} imageModels={["Nano Banana Pro", "OpenAI Image 2.5 Sunburst", "OpenAI Image 2.5 Flare"]}
        ratios={krea25 ? openAiImage25KreaAspectRatios : isOpenAiImage25Model(node.data.model) ? openAiImageAspectRatios : nanoImageAspectRatios}
        resolutions={krea25 ? openAiImage25KreaResolutionOptions : ["1K", "2K", "4K"]} qualities={isOpenAiImage25Model(node.data.model) ? ["low", "medium", "high", "xhigh", "max"] : []}
        modelPatch={model => ({ model, ...(provider === "krea" && isOpenAiImage25Model(model) ? openAiImage25KreaSelection({ ...node.data, model }) : {}) })} provider={provider} showApiCosts={costs} />
    </article>
    </div>
    <output aria-label="Selected output">{node.data.resultItems[node.data.selectedResultIndex]?.label || "None"}</output>
    <output aria-label="Saved look choices">{JSON.stringify(node.data.resultItems.map(item => item.exploreSettings))}</output>
    <pre><output aria-label="Explore state">{JSON.stringify(node.data)}</output></pre>
    <pre><output aria-label="Planning requests">{JSON.stringify(plans)}</output></pre>
    {preview && <dialog open><img src={preview.url} alt={preview.label} style={{ maxWidth: "70vw", maxHeight: "60vh" }} /><button onClick={() => setPreview(null)}>Close preview</button></dialog>}
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
