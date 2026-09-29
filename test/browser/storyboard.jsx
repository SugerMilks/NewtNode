import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData } from "virtual:storyboard-qa";
import { imageModelOptions, videoModelOptions } from "../../src/modelOptions.js";
import { storyboardFrameWithVersion } from "../../src/storyboardWorkflow.js";
import { useStoryboardBoardOutput } from "../../src/useStoryboardBoardOutput.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const longScene = "The @Woman and @Man have a conversation at a table in @CoffeeShop. There are two coffee @Cups on the table, one in front of each person. The @Woman sits on the left and listens as the @Man talks. She takes a sip and gives a subtle laugh. He reaches across the table and holds her hand. The mood becomes serious. A tear rolls down her cheek. He tells her it will be okay. They remain silent for a moment, then she wipes away the tear and smiles.\n\n";

function fixture() {
  return { id: "board-qa", type: "storyboard", data: { ...createDefaultNodeData("storyboard", "Storyboard QA", 1),
    sceneDescription: "An empty hallway. A door opens, revealing daylight.", storyboardTab: "view", useInternalStoryboardCharacters: false,
    storyboardFrames: Array.from({ length: 9 }, (_, i) => ({ id: `f${i + 1}`, number: i + 1, shotId: `s${i + 1}`, phase: "single", purpose: "Reveal the doorway while maintaining the established eyeline and geography of the hallway.", prompt: `Panel ${i + 1}: Black-and-white storyboard line art. The door opens, revealing the empty hallway. Preserve the direction of light from the previous shot.`, shot: "WS", lens: "35mm", angle: "None", resultUrl: "/storyboard/MOOD_BOARD.png", status: "complete", versions: [{ resultUrl: "/storyboard/MOOD_BOARD.png", savedAt: 1, prompt: "The closed door.", shot: "CU" }] }))
  } };
}
function Harness() {
  const [node, setNode] = React.useState(fixture);
  const [calls, setCalls] = React.useState([]);
  const [scope, setScope] = React.useState(0);
  const [failBuild, setFailBuild] = React.useState(false);
  const [connectedScene, setConnectedScene] = React.useState(false);
  const incoming = {
    sceneReferenceIn: [{ source: { id: "location", type: "image", data: { title: "CoffeeShop", resultUrl: "/storyboard/MOOD_BOARD.png" } } }],
    ...(connectedScene ? { sceneDescriptionIn: [{ source: { id: "scene", type: "plainText", data: { title: "Connected scene", text: longScene.repeat(5) } } }] } : {})
  };
  const record = value => setCalls(current => [...current, value]);
  const update = (_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
  const prepare = useStoryboardBoardOutput({ nodes: [node], scope, onBuild: async (_node, { signature, isCurrent }) => {
    record({ action: "prepare-output", scope });
    await new Promise(resolve => setTimeout(resolve, 300));
    if (!isCurrent()) { record({ action: "discard-stale-output", scope }); return null; }
    if (failBuild) { update(node.id, { storyboardBoardError: "Mock output failure", storyboardBoardErrorSource: signature }); return null; }
    update(node.id, { storyboardBoardSource: signature, storyboardBoardUrl: "/storyboard/MOOD_BOARD.png", storyboardBoardError: "", storyboardBoardErrorSource: "" });
    return "/storyboard/MOOD_BOARD.png";
  } });
  const replace = (ids, instruction) => {
    record({ action: instruction ? "revise" : "generate", ids, instruction });
    setNode(current => ({ ...current, data: { ...current.data, storyboardFrames: current.data.storyboardFrames.map(frame => ids.includes(frame.id) ? storyboardFrameWithVersion(frame, { prompt: instruction || frame.prompt, shot: instruction ? "CU" : frame.shot }) : frame) } }));
  };
  return <main style={{ padding: 16 }}>
    <button onClick={() => { setNode(fixture()); setCalls([]); setScope(value => value + 1); }}>Reset QA fixture</button>
    <button onClick={() => setNode(current => ({ ...current, data: { ...current.data, status: "running", storyboardTab: "view", storyboardFrames: current.data.storyboardFrames.map(frame => ({ ...frame, status: frame.id === "f2" ? "running" : "complete", qcWarning: frame.id === "f1" ? "QC warning: Check the listening partner." : "" })) } }))}>Rendering fixture</button>
    <button onClick={() => setNode(current => ({ ...current, data: { ...current.data, status: "complete", storyboardFrames: current.data.storyboardFrames.map(frame => frame.id === "f2" ? { ...frame, status: "complete" } : frame) } }))}>Complete fixture run</button>
    <button onClick={() => update(node.id, { storyboardTab: "setup", sceneDescription: longScene.repeat(5) })}>Long Setup fixture</button>
    <label><input type="checkbox" checked={connectedScene} onChange={event => setConnectedScene(event.target.checked)} />Connected Scene Text</label>
    <label><input type="checkbox" checked={failBuild} onChange={event => setFailBuild(event.target.checked)} />Fail output preparation</label>
    <section className="node-card storyboard-node" style={{ position: "relative", width: "100%", maxWidth: 1200, margin: "16px auto" }}>
      <NodeBody node={node} imageModelOptions={imageModelOptions} videoModelOptions={videoModelOptions} generationProvider="fal" incoming={incoming} incomingByNode={{}} connectedPortKeys={new Set(["board-qa:sceneReferenceIn", ...(connectedScene ? ["board-qa:sceneDescriptionIn"] : [])])} onUpdate={update} onUndoSnapshot={() => record({ action: "undo" })}
        onStoryboardPlan={(_node, options) => record({ action: "plan", options })}
        onStoryboardGenerateAll={(_node, ids) => replace(ids)} onStoryboardGenerateFrame={(_node, id) => replace([id])}
        onStoryboardRevise={(_node, ids, instruction) => replace(ids, instruction)}
        onStoryboardPrepare={prepare} onStoryboardExport={(_node, mode) => record({ action: "export", mode })}
        onPreviewOpen={item => record({ action: "preview", frame: item.editContext.itemId })}
        onStoryboardReview={() => update(node.id, { storyboardSequenceReview: { summary: "Mock review complete", issues: [{ frameIds: ["f2"], severity: "minor", message: "Check the eyeline." }] } })}
        onPreviewResizeStart={() => {}} onConnectStart={() => {}} onDisconnectInput={() => {}} />
    </section>
    <output aria-label="QA actions">{JSON.stringify(calls)}</output>
    <output aria-label="QA panels">{JSON.stringify(node.data.storyboardFrames.map(({ id, prompt, shot, protected: locked, versions }) => ({ id, prompt, shot, protected: locked, versions: versions?.length || 0 })))}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
