import VideoOutpaintCanvasEditor from "./VideoOutpaintCanvasEditor.jsx";
import { outpaintRatio } from "../videoOutpaintFrame.js";
import React from "react";
import { Crop, Scan, Download } from "lucide-react";
import { displayMediaUrl } from "../mediaAssets.js";
import { NodeRow } from "./NodePorts.jsx";
import { VideoOutpaintPromptControls } from "./VideoOutpaintPromptControls.jsx";
import { normalizeUtilityOutpaintSettings, videoOutpaintRatios, videoOutpaintFingerprint, videoOutpaintModels } from "../videoOutpaint.js";

export function VideoOutpaintModelControl({ node, running, onUpdate }) {
  const settings = normalizeUtilityOutpaintSettings(node.data.videoOutpaint);
  return <NodeRow label="Outpaint model"><select aria-label="Outpaint model" value={settings.model} disabled={running} onChange={e => onUpdate(node.id, { videoOutpaint: { ...settings, model: e.target.value }, videoOutpaintPrepared: null })}>{videoOutpaintModels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></NodeRow>;
}

export function VideoOutpaintControls({ node, sourceVideoUrl, canvasVideoUrl = "", canvasPort, referenceImageUrls = [], promptConnected, running, onUpdate, onPrepare, onAnalyze, referenceImagePort, settingsOpen, incoming, portProps }) {
  const settings = normalizeUtilityOutpaintSettings(node.data.videoOutpaint);
  const seedance = settings.model === "seedance-2.5";
  const key = videoOutpaintFingerprint(sourceVideoUrl, settings, canvasVideoUrl);
  const prepared = node.data.videoOutpaintPrepared?.fingerprint === key ? node.data.videoOutpaintPrepared : null;
  const selected = (node.data.resultItems || []).at(node.data.selectedResultIndex || 0);
  const details = selected?.videoOutpaint;
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => setEditing(false), [sourceVideoUrl, canvasVideoUrl]);
  const [notice, setNotice] = React.useState("");
  const current = React.useRef(key);
  current.current = key;
  React.useEffect(() => () => { current.current = null; }, []);
  const change = patch => {
    if (patch.aspectRatio && settings.frame) patch = { ...patch, frame: { ...settings.frame, y: settings.frame.y + settings.frame.width / outpaintRatio(settings.aspectRatio) / 2 - settings.frame.width / outpaintRatio(patch.aspectRatio) / 2 } };
    onUpdate(node.id, { videoOutpaint: { ...settings, ...patch }, videoOutpaintPrepared: null });
  };
  async function prepare(overrides) {
    if (busy || running || !(sourceVideoUrl || canvasVideoUrl)) return;
    const nextSettings = normalizeUtilityOutpaintSettings(overrides || settings);
    const snapshot = videoOutpaintFingerprint(sourceVideoUrl, nextSettings, canvasVideoUrl);
    current.current = snapshot;
    setBusy(true); setNotice(""); onUpdate(node.id, { outpaintBusy: true });
    try {
      const result = await onPrepare(node, { sourceVideoUrl, canvasVideoUrl, videoOutpaint: nextSettings });
      if (current.current === snapshot) onUpdate(node.id, { videoOutpaintPrepared: result });
      else if (current.current !== null) setNotice("Source or settings changed. Prepare the current canvas again.");
    } catch (error) { if (current.current !== null) setNotice(error.message); }
    finally { onUpdate(node.id, { outpaintBusy: false }); if (current.current !== null) setBusy(false); }
  }
  return <>
    <NodeRow label="Target ratio">{canvasVideoUrl ? <span>{prepared?.plan.settings.aspectRatio || "From connected canvas"}</span> : <select aria-label="Outpaint target ratio" value={settings.aspectRatio} disabled={busy || running || Boolean(canvasVideoUrl)} onChange={e => change({ aspectRatio: e.target.value })}>{videoOutpaintRatios.map(ratio => <option key={ratio}>{ratio}</option>)}</select>}</NodeRow>
    <NodeRow label="Start (sec)"><input aria-label="Outpaint start seconds" type="number" min="0" step="0.125" value={settings.start} disabled={busy || running} onChange={e => change({ start: e.target.value })} /></NodeRow>
    <NodeRow label="Duration (sec)"><input aria-label="Outpaint duration seconds" type="number" min={seedance ? "0.125" : "2.7"} max="10.05" step="0.125" value={settings.duration} disabled={busy || running} onChange={e => change({ duration: e.target.value })} /></NodeRow>
    <NodeRow label="Framing"><button className="outpaint-user-action" type="button" disabled={busy || running || !sourceVideoUrl || Boolean(canvasVideoUrl)} onClick={() => setEditing(true)}><Crop size={16} /> Canvas Edit</button></NodeRow>
    <NodeRow label="Canvas video" inputPort={settingsOpen ? canvasPort : null} node={node} {...portProps}><span title="Optional video with rectangular black borders; overrides framing.">{canvasVideoUrl ? "Connected" : "Optional"}</span></NodeRow>
    <NodeRow label="Canvas"><button className="outpaint-user-action" type="button" title="Prepare the source canvas and expansion mask locally. No paid generation." disabled={busy || running || !(sourceVideoUrl || canvasVideoUrl) || !onPrepare} onClick={() => prepare()}><Scan size={16} />{busy ? "Preparing..." : "Prepare canvas"}</button></NodeRow>
    {editing && <VideoOutpaintCanvasEditor key={sourceVideoUrl} sourceUrl={sourceVideoUrl} settings={settings} snapEnabled={node.data.videoOutpaintSnap !== false} onSnapChange={value => onUpdate(node.id, { videoOutpaintSnap: value })} onClose={() => setEditing(false)} onApply={frame => { const next = { ...settings, frame }; change({ frame }); setEditing(false); prepare(next); }} />}
    {notice && <p className="utility-mini-note" role="alert">{notice}</p>}
    {prepared && <>
      <video aria-label="Prepared outpainting canvas" controls muted preload="metadata" poster={prepared.previewUrl} src={displayMediaUrl(prepared.generationVideoUrl || prepared.videoUrl)} style={{ width: "100%", maxHeight: 320, objectFit: "contain" }} />
      {!seedance && <a className="utility-mini-note" href={prepared.maskVideoUrl} target="_blank" rel="noreferrer">View expansion mask</a>}
      {prepared.plan.looped && <p className="utility-mini-note" role="status">The short source will repeat to meet Wan's minimum frame count. Use Seedance to preserve the original segment length.</p>}
      {prepared.plan.needsOutpaint === false && <p className="utility-mini-note" role="status">Crop only. No paid generation needed.</p>}
    </>}
    {prepared?.plan.needsOutpaint !== false && <VideoOutpaintPromptControls node={{ ...node, data: { ...node.data, wanVaceAspectRatio: prepared?.plan.settings.aspectRatio || settings.aspectRatio } }} sourceVideoUrl={prepared?.videoUrl || ""} maskVideoUrl={prepared?.maskVideoUrl || ""} maskImageUrl={prepared?.maskImageUrl || ""} preparedPlan={prepared?.plan} referenceImageUrls={referenceImageUrls} promptConnected={promptConnected} running={running || busy} onUpdate={onUpdate} onAnalyze={onAnalyze} />}
    <NodeRow label="Reference image" inputPort={settingsOpen ? referenceImagePort : null} node={node} {...portProps}><span>{incoming.referenceImageIn?.length ? "Connected" : "Optional"}</span></NodeRow>
    <NodeRow label="Restore source"><input aria-label="Restore original source footage" type="checkbox" checked={settings.restoreSource} disabled={busy || running} onChange={e => change({ restoreSource: e.target.checked })} /></NodeRow>
    <NodeRow label="Blend width (px)"><input aria-label="Outpaint seam feather" title="Generated overlap inside the original edge. A smooth inward feather blends this ring and preserves the original core; generated pixels outside the source remain unchanged." type="number" min="0" max="128" step="1" value={settings.feather} disabled={busy || running || !settings.restoreSource} onChange={e => change({ feather: e.target.value })} /></NodeRow>
    {seedance ? <NodeRow label="Resolution"><select aria-label="Outpaint Seedance resolution" value={settings.seedanceResolution} disabled={busy || running} onChange={e => change({ seedanceResolution: e.target.value })}>{["480p", "720p", "1080p"].map(value => <option key={value}>{value}</option>)}</select></NodeRow> : <NodeRow label="Delivery size"><select aria-label="Outpaint delivery size" value={settings.outputSize} disabled={busy || running} onChange={e => change({ outputSize: e.target.value })}><option>720p</option><option>1080p</option></select></NodeRow>}
    {selected?.warning && <p className="utility-mini-note" role="alert">{selected.warning}</p>}
    {details?.rawVideoUrl && <NodeRow label="Original render"><a href={details.rawVideoUrl} download title="Download the unprocessed provider result"><Download size={16} /> Raw video</a></NodeRow>}
    {!seedance && <>
      <NodeRow label="Steps"><input aria-label="Outpaint inference steps" type="number" min="1" max="60" value={node.data.wanVaceNumInferenceSteps ?? 30} onChange={e => onUpdate(node.id, { wanVaceNumInferenceSteps: e.target.value })} disabled={running} /></NodeRow>
      <NodeRow label="Guidance scale"><input aria-label="Outpaint guidance scale" type="number" min="0" max="20" step="0.5" value={node.data.wanVaceGuidanceScale ?? 5} onChange={e => onUpdate(node.id, { wanVaceGuidanceScale: e.target.value })} disabled={running} /></NodeRow>
    </>}
    {!seedance && <NodeRow label="Seed"><input aria-label="Outpaint seed" value={node.data.seed ?? ""} placeholder="Random" onChange={e => onUpdate(node.id, { seed: e.target.value })} disabled={running} /></NodeRow>}
    {!seedance && <NodeRow label="Negative"><textarea aria-label="Outpaint negative prompt" value={node.data.wanVaceNegativePrompt || ""} onChange={e => onUpdate(node.id, { wanVaceNegativePrompt: e.target.value })} disabled={running} /></NodeRow>}
  </>;
}
