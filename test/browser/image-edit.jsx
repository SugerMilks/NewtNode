import React from "react";
import { createRoot } from "react-dom/client";
import { OutputPreviewLightbox } from "../../src/components/MediaViews.jsx";
import { nodeApi } from "../../src/api/newtApi.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const load = (url) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
const source = await load("/storyboard/MOOD_BOARD.png");
function fixture(portrait) {
  const canvas = document.createElement("canvas"); canvas.width = portrait ? 768 : 1536; canvas.height = portrait ? 1280 : 864;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#586c72"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ratio = Math.min(canvas.width / source.width, canvas.height / source.height);
  ctx.drawImage(source, (canvas.width - source.width * ratio) / 2, (canvas.height - source.height * ratio) / 2, source.width * ratio, source.height * ratio);
  ctx.fillStyle = "#e4cf37"; ctx.fillRect(0, canvas.height - 28, canvas.width, 28);
  return canvas.toDataURL("image/png");
}
function Harness() {
  const [item, setItem] = React.useState(null), [report, setReport] = React.useState("No request"), [enabled, setEnabled] = React.useState(true), [fail, setFail] = React.useState(false);
  nodeApi.editImage = async (form) => {
    if (fail) throw new Error("Simulated provider failure; no credits used.");
    const image = await load(form.get("sourceUrl"));
    const layers = {};
    for (const name of ["drawing", "selection"]) {
      const blob = form.get(name);
      if (!blob) continue;
      const url = URL.createObjectURL(blob), layer = await load(url);
      const canvas = document.createElement("canvas"); canvas.width = layer.width; canvas.height = layer.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(layer, 0, 0);
      const rgba = ctx.getImageData(0, 0, layer.width, layer.height).data;
      let pixels = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) pixels++;
      layers[name] = { width: layer.width, height: layer.height, pixels }; URL.revokeObjectURL(url);
    }
    setReport(JSON.stringify({ mode: form.get("mode"), blank: form.get("blank"), prompt: form.get("prompt"), quality: form.get("quality"), layers }, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.filter = "hue-rotate(30deg)"; ctx.drawImage(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return { item: { url: URL.createObjectURL(blob), type: "image", fileName: "qa-edit.png", label: "Mock edit", width: image.width, height: image.height } };
  };
  return <main style={{ padding: 20 }}><h1>Image editor QA (mock generation only)</h1><button onClick={() => setItem({ url: fixture(true), type: "image", label: "Portrait fixture", editContext: { type: "nodeResult", nodeId: "qa", itemIndex: 0 } })}>Open portrait</button><button onClick={() => setItem({ url: fixture(false), type: "image", label: "Landscape fixture", editContext: { type: "nodeResult", nodeId: "qa", itemIndex: 0 } })}>Open landscape</button><label><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Fal enabled</label><label><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />Simulate failure</label><pre aria-label="QA report">{report}</pre>
    {item && <OutputPreviewLightbox item={item} workflowContext={{ projectId: "qa" }} falAvailable={enabled} onClose={() => setItem(null)} onApplyImageEdit={async () => {}} onAcceptAiEdit={async (_source, result, action) => { setReport((value) => `${value}\nAccepted: ${action} ${result.width}x${result.height}`); setItem(null); }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
