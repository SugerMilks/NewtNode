import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData } from "virtual:storyboard-qa";
import { audioModelApi } from "../../src/api/newtApi.js";
import { buildAudioRequest, elevenLabsPricing } from "../../src/audioModel.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// All provider operations are local mocks; the isolated QA server also blocks API calls.
audioModelApi.voices = async () => ({ pricing: elevenLabsPricing, voices: [
  { id: "default-voice", name: "Default Narrator", group: "Default" },
  { id: "my-voice", name: "My Narrator", group: "Mine" }
] });

function Harness() {
  const [width, setWidth] = React.useState(560);
  const [request, setRequest] = React.useState(null);
  const [node, setNode] = React.useState({ id: "audio-qa", type: "audioModel", data: {
    ...createDefaultNodeData("audioModel", "Audio Model", 1), ttsModel: "eleven_v4", voiceId: "my-voice", voiceName: "My Narrator", voiceGroup: "Mine",
    prompt: "[whispering] We made it. [laughing] Finally!", settingsOpen: true, style: 0.6, speed: 0.9
  } });
  return <main style={{ padding: 16 }}>
    <label>Width <select aria-label="Test width" value={width} onChange={event => setWidth(Number(event.target.value))}>
      {[560, 360].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <button onClick={() => setNode(current => JSON.parse(JSON.stringify(current)))}>Simulate project reload</button>
    <section className="node-card" style={{ position: "relative", width: "100%", maxWidth: width, margin: "16px auto" }}>
      <NodeBody node={node} incoming={{}} incomingByNode={{}} connectedPortKeys={new Set()} showApiCosts={true}
        onUpdate={(_id, patch) => setNode(current => ({ ...current, data: { ...current.data, ...patch } }))}
        onRun={current => setRequest(buildAudioRequest(current.data))} onConnectStart={() => {}} onDisconnectInput={() => {}} onPreviewOpen={() => {}} />
    </section>
    <output aria-label="Test request">{JSON.stringify(request)}</output>
    <output aria-label="Test settings">{JSON.stringify({ model: node.data.ttsModel, voice: node.data.voiceId, style: node.data.style, speed: node.data.speed })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
