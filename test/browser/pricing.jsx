import React from "react";
import { createRoot } from "react-dom/client";
import { PricingSettings } from "../../src/components/PricingSettings.jsx";
import { RunPriceLabel } from "../../src/components/RunPriceLabel.jsx";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const catalog = { version: 1, policyVersion: 2, revision: "qa", accountRevision: "qa", entries: {} };
let status = { enabled: true, running: false, lastCheckAt: new Date().toISOString(), catalog,
  sources: { krea: { status: "current", current: 7 }, atlas: { status: "current", current: 12 }, openai: { status: "current", current: 5 }, fal: { status: "disabled" }, google: { status: "bundled" } } };
window.fetch = async (url, init = {}) => {
  const route = new URL(url, location.href).pathname;
  if (route === "/api/pricing/quote") {
    const options = JSON.parse(init.body);
    return Response.json({ amountUsd: options.model.includes("OpenAI") ? null : 0.32 * options.batchCount,
      estimated: true, pricingStatus: "estimated", pricingBasis: "Provider account estimate.", accountRevision: "qa", checkedAt: new Date().toISOString() });
  }
  if (route === "/api/pricing/settings") status = { ...status, ...JSON.parse(init.body) };
  if (route === "/api/pricing/refresh") {
    status = { ...status, running: true };
    setTimeout(() => { status = { ...status, running: false, lastCheckAt: new Date().toISOString() }; }, 700);
  }
  if (route.startsWith("/api/pricing")) return Response.json(status, { status: route.endsWith("refresh") ? 202 : 200 });
  throw new Error(`Unexpected request in isolated pricing QA: ${route}`);
};

function PricingQA() {
  const [visible, setVisible] = React.useState(true);
  const [model, setModel] = React.useState("Nano Banana Pro");
  return <main style={{ maxWidth: 850, padding: 20, margin: "30px auto", display: "grid", gap: 24 }}>
    <PricingSettings />
    <section style={{ display: "grid", gap: 16, maxWidth: 380 }}>
      <label><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /> API Cost</label>
      <select aria-label="Image model" value={model} onChange={event => setModel(event.target.value)}><option>Nano Banana Pro</option><option>OpenAI Image 2.5 Flare</option></select>
      <button className="run-node-button"><RunPriceLabel label="Run Image" options={{ kind: "image", provider: "atlas", model, resolution: "1K", batchCount: 4 }} visible={visible} /></button>
      <button className="run-node-button"><RunPriceLabel label="Run Video" options={{ kind: "video", provider: "atlas", model: "Seedance 2.5", duration: "8 seconds" }} visible={visible} /></button>
    </section>
  </main>;
}
createRoot(document.getElementById("root")).render(<PricingQA />);
