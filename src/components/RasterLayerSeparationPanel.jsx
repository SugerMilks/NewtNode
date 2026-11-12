import React from "react";
import { Layers, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useImageLayers } from "./useImageLayers.js";
import { imageLayersApi } from "../api/newtApi.js";
import { layersDefaults } from "../imageLayers.js";
import { layerSeparationCapacity, readLayerSeparation } from "../rasterLayerSeparation.js";
import LayerSeparationSettings from "./LayerSeparationSettings.jsx";

export default function RasterLayerSeparationPanel({ target, baseline, journalKey, workflowContext, nodeId, onApply, onClose, onGeneratingChange, showApiCosts }) {
  const restored = React.useMemo(() => readLayerSeparation(journalKey, globalThis.localStorage), [journalKey]);
  const maximum = layerSeparationCapacity(baseline, target);
  const [data, setData] = React.useState(() => restored?.data || { ...layersDefaults, layersLimit: Math.min(8, maximum) });
  const [error, setError] = React.useState("");
  const current = React.useRef(data); current.current = data;
  const persist = next => localStorage.setItem(journalKey, JSON.stringify({ target, baseline, data: next }));
  const update = (_id, patch) => {
    const next = { ...current.current, ...patch }; current.current = next; setData(next);
    try { persist(next); } catch { setError("Could not store recovery details. Keep this workspace open until the separation is saved."); }
  };
  const api = React.useMemo(() => ({ ...imageLayersApi, start: body => imageLayersApi.start({ ...body, layerOnly: true, sourceOpacity: target.opacity }) }), [target.opacity]);
  const controller = useImageLayers({ node: { id: `${nodeId || "layers"}:${target.id}`, data }, workflowContext, onUpdate: update, api,
    beforeSubmit: patch => persist({ ...current.current, ...patch }) });
  React.useEffect(() => { onGeneratingChange(controller.working); return () => onGeneratingChange(false); }, [controller.working, onGeneratingChange]);
  const result = data.layersDocuments.at(-1);
  const applied = React.useRef(null);
  function release() {
    try { localStorage.removeItem(journalKey); } catch { /* Closing must remain possible if browser storage becomes unavailable. */ }
    onClose();
  }
  function apply() {
    try {
      if (onApply(result)) release();
    } catch (failure) { setError(failure.message); }
  }
  React.useEffect(() => {
    if (result && applied.current !== result.id) { applied.current = result.id; apply(); }
  }, [result?.id]);
  function close() {
    if (controller.working) return;
    if ((data.layersJob || result) && !window.confirm("Discard this separation from the editor? Atlas may still finish and charge a pending request. No new generation will be submitted.")) return;
    release();
  }
  return <div className="raster-layer-separation" aria-busy={controller.working}>
    <div className="ies-layers-separation-heading"><strong>Separate Layer</strong><button type="button" title="Close layer separation" aria-label="Close layer separation" disabled={controller.working} onClick={close}><X size={16} /></button></div>
    <div className="raster-separation-target"><img src={target.url} alt="Selected layer to separate" /><span>{target.name}</span></div>
    <LayerSeparationSettings data={data} maximum={maximum} disabled={controller.working || Boolean(data.layersJob || result)} onChange={patch => update(null, patch)} />
    {!data.layersJob && !result && <button type="button" className="layers-save" disabled={maximum < 2} title="Separate only this layer using Atlas Cloud. This is a billed generation." onClick={() => controller.start(target)}><Layers size={17} />Separate Layer{showApiCosts ? " (Variable cost)" : ""}</button>}
    {maximum < 2 && <p className="layers-error" role="alert">This document has reached its layer or size limit. Remove layers or use a smaller document before separating another layer.</p>}
    {data.layersJob && <div className="layers-job" role="status"><span>{controller.working ? "Separating layer..." : data.layersJob.error || "Check the existing separation to recover its layers."}</span>{controller.working ? <LoaderCircle className="layers-export-spinner" size={18} /> : <button type="button" title="Check existing separation without generating" aria-label="Check layer separation" onClick={controller.check}><RefreshCw size={17} /></button>}</div>}
    {result && <button type="button" onClick={apply}>Apply Separated Layers</button>}
    {(error || data.error) && <p className="layers-error" role="alert">{error || data.error}</p>}
  </div>;
}
