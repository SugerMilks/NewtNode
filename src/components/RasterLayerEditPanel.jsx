import React from "react";
import { createPortal } from "react-dom";
import { Brush, Check, Eraser, Lock, LoaderCircle, Pencil, Trash2, Undo2, X } from "lucide-react";
import { nodeApi } from "../api/newtApi.js";
import { imageEditDefaultModel, imageEditModels, imageEditSize, drawImageEditMarks, imageEditHasPixels } from "../imageEdit.js";
import { ideogramImageEditModel, ideogramImageEditQualityOptions } from "../ideogramImageEdit.js";
import { openAiImage26QualityOptions } from "../openAiImage26.js";
import { nanoBanana21ModelName, nanoBanana21ResolutionOptions } from "../nanoBanana21.js";
import { appendWorkflowContextFormFields } from "../workflowContext.js";
import { rasterLayerEditPoint } from "../rasterLayerEdit.js";
import { notifyGenerationTaskComplete } from "../generationChime.js";

const png = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare the layer selection.")), "image/png"));

export default function RasterLayerEditPanel({ layer, overlayRef, artboardRef, scale, handActive, workflowContext, nodeId, provider, showApiCosts, onPreview, onApply, onDiscard, onPainting, onGeneratingChange }) {
  const [prompt, setPrompt] = React.useState(""), [model, setModel] = React.useState(imageEditDefaultModel);
  const [quality, setQuality] = React.useState("high"), [resolution, setResolution] = React.useState("2K");
  const [painting, setPainting] = React.useState(false), [eraser, setEraser] = React.useState(false), [brush, setBrush] = React.useState(5);
  const [marks, setMarks] = React.useState([]), [stroke, setStroke] = React.useState(null);
  const [size, setSize] = React.useState(null), [busy, setBusy] = React.useState(false), [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(""), [warning, setWarning] = React.useState(""), [before, setBefore] = React.useState(false);
  const [overlay, setOverlay] = React.useState(null);
  const mounted = React.useRef(true), submitting = React.useRef(false), drag = React.useRef(null), canvasRef = React.useRef(null), promptRef = React.useRef(null);
  const generationActivity = React.useRef(onGeneratingChange); generationActivity.current = onGeneratingChange;
  React.useEffect(() => { generationActivity.current?.(busy); return () => generationActivity.current?.(false); }, [busy]);
  const nano = model === nanoBanana21ModelName, ideogram = model === ideogramImageEditModel;
  const pointCount = marks.reduce((sum, mark) => sum + mark.points.length, 0);
  const available = provider === undefined || provider === "fal";
  React.useLayoutEffect(() => { setOverlay(overlayRef.current); promptRef.current?.focus(); }, []);
  React.useEffect(() => {
    mounted.current = true;
    const image = new Image();
    image.onload = () => { if (mounted.current) setSize({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { if (mounted.current) setError("Could not load the original layer."); };
    image.src = layer.url;
    return () => { mounted.current = false; image.onload = image.onerror = null; };
  }, [layer.url]);
  const previewScale = size ? Math.min(1, 1600 / Math.max(size.width, size.height)) : 1;
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawImageEditMarks(canvas.getContext("2d"), stroke ? [...marks, stroke] : marks, canvas.width, canvas.height, "selection");
  }, [size, marks, stroke, overlay, result]);
  function end(cancel = false) {
    const gesture = drag.current; drag.current = null;
    if (!gesture) return;
    if (gesture.element.hasPointerCapture(gesture.id)) gesture.element.releasePointerCapture(gesture.id);
    if (!cancel) setMarks(old => [...old, gesture.mark]);
    setStroke(null); onPainting(false);
  }
  React.useEffect(() => {
    const cancel = () => end(true);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); onPainting(false); };
  }, []);
  async function generate() {
    if (submitting.current || !size || !available || !prompt.trim() || drag.current) return;
    submitting.current = true; setBusy(true); setError(""); setWarning("");
    try {
      imageEditSize(size.width, size.height, model);
      const form = new FormData(); appendWorkflowContextFormFields(form, workflowContext);
      for (const [key, value] of Object.entries({ sourceUrl: layer.url, requestId: crypto.randomUUID(), prompt, mode: "edit", model, preserveAlpha: "true", nodeId: nodeId || "", nodeTitle: `Layer Edit: ${layer.name}`, ...(nano ? { resolution } : { quality }), ...(ideogram ? { editPrecision: "high" } : {}) })) form.append(key, value);
      if (marks.length) {
        const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        drawImageEditMarks(context, marks, size.width, size.height, "selection");
        if (!imageEditHasPixels(context, size.width, size.height)) throw new Error("The painted selection is empty. Paint an area or clear the selection to edit the whole layer.");
        form.append("selection", await png(canvas), "selection.png");
      }
      const response = await nodeApi.editImage(form);
      if (!mounted.current) return;
      const item = response.item;
      if (!item?.url || item.preserveAlpha !== true || item.alphaUrl !== item.url || item.width !== size.width || item.height !== size.height)
        throw new Error("The edit could not be verified as a matching transparent layer. The original is unchanged. Check History before generating again.");
      setResult(item); setBefore(false); setPainting(false); onPreview(item); setWarning(response.warning || "");
      notifyGenerationTaskComplete();
    } catch (failure) { if (mounted.current) setError(failure.message || "Layer edit failed. The original is unchanged."); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  const discard = () => { if (!submitting.current) { end(true); onDiscard(); } };
  function keyboard(event) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); if (drag.current) end(true); else discard(); }
    if (!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault(); if (!busy && !result && !drag.current && !event.shiftKey) setMarks(old => old.slice(0, -1));
    }
  }
  return <div className="raster-layer-edit" aria-label="Edit selected layer" aria-busy={busy} onKeyDown={keyboard}>
    <div className="raster-edit-heading"><strong>Edit Layer</strong><button type="button" title="Discard layer edit" aria-label="Discard layer edit" disabled={busy} onClick={discard}><X size={17} /></button></div>
    <span className="raster-edit-name" title={layer.name}>{layer.name}</span>
    <span className="raster-alpha-lock" title="The original alpha channel is restored exactly. Shape, soft edges, position, rotation and other layers are preserved."><Lock size={14} />Transparency locked</span>
    {!result ? <>
      <fieldset disabled={busy}>
        <label>Prompt<textarea ref={promptRef} aria-label="Layer edit prompt" rows={4} maxLength={8000} placeholder="Change her dress to deep red..." value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
        <div className="layers-actions" role="group" aria-label="Layer edit selection tools">
          <button type="button" title="Paint an optional selection to protect everything outside it" aria-label="Paint edit selection" aria-pressed={painting && !eraser} onClick={() => { setPainting(value => !value || eraser); setEraser(false); }}><Pencil size={17} /></button>
          <button type="button" title="Erase selection" aria-label="Erase edit selection" aria-pressed={painting && eraser} onClick={() => { setPainting(true); setEraser(true); }}><Eraser size={17} /></button>
          <button type="button" title="Undo selection stroke" aria-label="Undo selection stroke" disabled={!marks.length} onClick={() => setMarks(old => old.slice(0, -1))}><Undo2 size={17} /></button>
          <button type="button" title="Clear selection; edit the whole layer" aria-label="Clear edit selection" disabled={!marks.length} onClick={() => setMarks([])}><Trash2 size={17} /></button>
        </div>
        {painting && <label>Brush size<input aria-label="Layer edit brush size" type="range" min={1} max={30} step={1} value={brush} onChange={event => setBrush(Number(event.target.value))} /></label>}
        <label>Model<select aria-label="Layer edit model" value={model} onChange={event => { setModel(event.target.value); setQuality("high"); }}>{imageEditModels.map(value => <option key={value}>{value}</option>)}</select></label>
        {nano ? <label>Resolution<select aria-label="Layer edit resolution" value={resolution} onChange={event => setResolution(event.target.value)}>{nanoBanana21ResolutionOptions.map(value => <option key={value}>{value}</option>)}</select></label>
          : <label>Quality<select aria-label="Layer edit quality" value={quality} onChange={event => setQuality(event.target.value)}>{(ideogram ? ideogramImageEditQualityOptions : openAiImage26QualityOptions).map(value => <option key={value} value={value}>{({ very_low: "Very Low", low: "Low", medium: "Medium", high: "High" })[value] || value}</option>)}</select></label>}
      </fieldset>
      <button type="button" className="layers-save" disabled={busy || !size || !prompt.trim() || !available || Boolean(stroke)} onClick={generate}>{busy ? <LoaderCircle className="layers-export-spinner raster-edit-button-spinner" size={17} aria-hidden="true" /> : <Brush size={17} />}{busy ? "Generating edit..." : "Generate Edit"}</button>
      {showApiCosts && <small>Variable API cost</small>}
      {!available && <p className="layers-error" role="status">Enable Fal in Settings for layer editing.</p>}
    </> : <>
      <div className="layers-actions" role="group" aria-label="Layer edit preview">{[true, false].map(original => <button type="button" key={String(original)} aria-pressed={before === original} onClick={() => { setBefore(original); onPreview(original ? null : result); }}>{original ? "Original Layer" : "Edited Layer"}</button>)}</div>
      <button type="button" className="layers-save" onClick={() => onApply(result)}><Check size={17} />Apply Layer Edit</button>
      <button type="button" onClick={discard}><X size={17} />Discard</button>
    </>}
    {error && <p className="layers-error" role="alert">{error}</p>}{warning && <p className="layers-error" role="status">{warning}</p>}
    {overlay && size && !result && createPortal(<canvas ref={canvasRef} className={`raster-edit-mask ${painting && !handActive && !busy ? "painting" : ""}`} tabIndex={painting ? 0 : -1} aria-label="Layer edit selection canvas"
      width={Math.round(size.width * previewScale)} height={Math.round(size.height * previewScale)} style={{ maskImage: `url("${layer.url}")` }} onKeyDown={keyboard}
      onPointerDown={event => {
        if (event.button !== 0 || busy || !painting || handActive) return;
        if (marks.length >= 500 || pointCount >= 20000) { setError("This selection is full. Clear it or undo strokes before adding more."); return; }
        event.stopPropagation(); event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        const rect = artboardRef.current.getBoundingClientRect();
        const mark = { tool: eraser ? "eraser" : "pen", layer: "selection", size: brush / 100, points: [rasterLayerEditPoint(event.clientX, event.clientY, layer, rect, scale)] };
        drag.current = { element: event.currentTarget, id: event.pointerId, mark, rect, scale }; event.currentTarget.setPointerCapture(event.pointerId); setStroke(mark); onPainting(true);
      }} onPointerMove={event => {
        const gesture = drag.current; if (!gesture || gesture.id !== event.pointerId || pointCount + gesture.mark.points.length >= 20000) return;
        event.stopPropagation(); gesture.mark = { ...gesture.mark, points: [...gesture.mark.points, rasterLayerEditPoint(event.clientX, event.clientY, layer, gesture.rect, gesture.scale)] }; setStroke(gesture.mark);
      }} onPointerUp={() => end()} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)} />, overlay)}
  </div>;
}
