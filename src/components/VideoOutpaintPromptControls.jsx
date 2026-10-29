import React from "react";
import { WandSparkles } from "lucide-react";
import { NodeRow } from "./NodePorts.jsx";
import { normalizeOutpaintPromptMode } from "../videoOutpaintPrompt.js";

export function VideoOutpaintPromptControls({ node, sourceVideoUrl, maskVideoUrl, maskImageUrl = "", preparedPlan, referenceImageUrls = [], promptConnected, running, onUpdate, onAnalyze }) {
  const mode = normalizeOutpaintPromptMode(node.data.outpaintPromptMode);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const latest = React.useRef(null);
  const state = JSON.stringify([sourceVideoUrl, maskVideoUrl, maskImageUrl, preparedPlan, referenceImageUrls, mode, node.data.videoOutpaint?.model || "wan-vace", node.data.outpaintGuidance || "", node.data.wanVaceAspectRatio || "auto", node.data.prompt || "", promptConnected, running]);
  latest.current = state;
  React.useEffect(() => () => { latest.current = null; }, []);
  async function analyze() {
    if (busy || running || promptConnected) return;
    const snapshot = state;
    setBusy(true); setNotice(""); onUpdate(node.id, { outpaintBusy: true });
    try {
      const data = await onAnalyze(node, { mode, guidance: node.data.outpaintGuidance || "", aspectRatio: node.data.wanVaceAspectRatio || "auto", outpaintModel: node.data.videoOutpaint?.model || "wan-vace", sourceVideoUrl, maskVideoUrl, referenceImageUrls, ...(maskImageUrl ? { maskImageUrl, preparedPlan } : {}) });
      if (latest.current !== snapshot) {
        if (latest.current !== null) setNotice("Inputs or prompt changed during analysis. Existing prompt kept; see History for the generated draft.");
        return;
      }
      onUpdate(node.id, { prompt: data.text, outpaintPromptAnalysis: { provider: data.provider, model: data.model, sourceVideoUrl, maskVideoUrl, referenceImageUrls, frameAnalysis: data.frameAnalysis, createdAt: new Date().toISOString() } });
      setNotice("");
    } catch (error) {
      if (latest.current !== null) setNotice(error.message || "Analysis failed; existing prompt kept.");
    } finally { onUpdate(node.id, { outpaintBusy: false }); if (latest.current !== null) setBusy(false); }
  }
  return <>
    <NodeRow label="Outpaint prompt">
      <select aria-label="Outpainting prompt mode" value={mode} disabled={busy || running} onChange={event => onUpdate(node.id, { outpaintPromptMode: event.target.value })}>
        <option value="manual">Manual</option><option value="auto">Auto</option><option value="guided">Auto + guidance</option>
      </select>
    </NodeRow>
    {mode === "guided" && <NodeRow label="Guidance"><textarea aria-label="Outpainting guidance" value={node.data.outpaintGuidance || ""} disabled={busy || running} onChange={event => onUpdate(node.id, { outpaintGuidance: event.target.value })} /></NodeRow>}
    {mode !== "manual" && <NodeRow label="Analyze">
      <button className="outpaint-user-action" type="button" title={promptConnected ? "Disconnect the text prompt to draft a local prompt." : !sourceVideoUrl || !(maskVideoUrl || maskImageUrl) ? "Prepare canvas and mask first." : "Analyze sampled frames and draft a prompt. Uses your enabled vision LLM and may incur an API charge."} disabled={busy || running || promptConnected || !sourceVideoUrl || !(maskVideoUrl || maskImageUrl) || !onAnalyze} onClick={analyze}><WandSparkles size={16} />{busy ? "Analyzing..." : "Draft prompt"}</button>
    </NodeRow>}
    {notice && <p className="utility-mini-note" role="status">{notice}</p>}
  </>;
}
