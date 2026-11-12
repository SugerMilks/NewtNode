import React from "react";
import { LoaderCircle, Play, Plus, Check, Pencil, RefreshCw, X, Layers } from "lucide-react";
import ImageLayersWorkspace from "./ImageLayersDialog.jsx";
import LayerSeparationSettings from "./LayerSeparationSettings.jsx";
import { useImageLayers } from "./useImageLayers.js";
import { useLayersPsdExport } from "./useLayersPsdExport.js";
import { layersOutputPatch, managedLayerUrl } from "../imageLayers.js";
import { imageLayersInitialState, imageLayersResult, imageLayersSessionKey, readImageLayersSession, saveImageLayersSession, originalLayerSeparation } from "../imageEditLayers.js";

export default function ImageEditLayers({ item, workflowContext, onAccept, onContinue, onClose, canApply, onActivityChange, showApiCosts, provider }) {
  const key = imageLayersSessionKey(item, workflowContext);
  const [data, setData] = React.useState(() => imageLayersInitialState(item, readImageLayersSession(key, globalThis.localStorage)));
  const [error, setError] = React.useState(""), [persistenceError, setPersistenceError] = React.useState(""), [accepting, setAccepting] = React.useState(false);
  const [separationOpen, setSeparationOpen] = React.useState(false), [preparing, setPreparing] = React.useState(false);
  const [editingLayer, setEditingLayer] = React.useState(false);
  const submitting = React.useRef(false);
  const current = React.useRef(data); current.current = data;
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = (_id, patch) => {
    const next = { ...current.current, ...patch }; current.current = next; setData(next);
    try { saveImageLayersSession(key, next, globalThis.localStorage); setPersistenceError(""); }
    catch { setPersistenceError("This browser could not keep the layer workspace. Save a copy to the canvas or export PSD before closing."); }
  };
  const node = { id: item.editContext?.nodeId || "advanced-image-layers", data: { ...data, title: item.label || "Layers" } };
  const controller = useImageLayers({ node, workflowContext, onUpdate: update,
    beforeSubmit: patch => saveImageLayersSession(key, { ...current.current, ...patch }, globalThis.localStorage) });
  const psd = useLayersPsdExport({ node, workflowContext, onUpdate: update });
  const document = data.layersDocuments.find(doc => doc.id === data.layersDocumentId);
  const draft = document && data.layersDraft?.documentId === document.id ? data.layersDraft.layers : null;
  const draftFolders = draft ? data.layersDraft.folders ?? document.folders ?? [] : undefined;
  const saving = controller.working || controller.saving || psd.busy || accepting || preparing;
  const busy = saving || editingLayer;
  const activity = React.useRef(onActivityChange); activity.current = onActivityChange;
  React.useEffect(() => { activity.current?.({ busy, dirty: Boolean(draft) }); }, [busy, draft]);
  React.useEffect(() => () => activity.current?.({ busy: false, dirty: false }), []);
  async function separate() {
    if (busy || submitting.current || current.current.layersJob) return;
    submitting.current = true; setPreparing(true); setError("");
    const sourceUrl = document?.sourceUrl || item.url;
    try {
      if (document && draft && !await save({ ...document, layers: draft, folders: draftFolders })) return;
      if (!mounted.current) return;
      await controller.start({ ...item, url: sourceUrl });
      if (mounted.current && (current.current.layersJob || (current.current.status === "complete" && !current.current.error))) setSeparationOpen(false);
    } catch (failure) { if (mounted.current) setError(`Could not start Layers: ${failure.message}`); }
    finally { submitting.current = false; if (mounted.current) setPreparing(false); }
  }
  async function save(document) {
    const saved = await controller.save(document);
    if (saved && mounted.current) update(node.id, { layersDraft: null });
    return saved;
  }
  async function accept(document, changed, action) {
    if (busy) return;
    setAccepting(true); setError("");
    try {
      const saved = changed ? await save(document) : document;
      if (!saved || !mounted.current) return;
      const result = imageLayersResult(saved);
      if (action === "continue") onContinue(result);
      else await onAccept(result, action);
    } catch (failure) { if (mounted.current) setError(failure.message || "Could not add the layered image."); }
    finally { if (mounted.current) setAccepting(false); }
  }
  const status = <div className="ies-layers-status">
    {data.layersJob && <div className="layers-job" role="status"><span>{controller.working ? "Separating layers..." : data.layersJob.error || "Check the existing separation before starting another."}</span>{controller.working ? <LoaderCircle className="layers-export-spinner" size={18} /> : <><button type="button" title="Check existing separation without generating" aria-label="Check separation" onClick={controller.check}><RefreshCw size={16} /></button><button type="button" title="Release separation request" aria-label="Release separation request" onClick={() => { if (window.confirm("Check Atlas history first. The provider may still finish and charge this request. Release it without generating again?")) controller.release(); }}><X size={16} /></button></>}</div>}
    {data.layersPsdJob && !psd.busy && <div className="layers-job"><span>Check the existing PSD export before exporting again.</span><button type="button" title="Check PSD export" onClick={psd.check}><RefreshCw size={16} /></button><button type="button" title="Release PSD export" onClick={() => { if (window.confirm("Check your chosen destination first. Release this PSD export?")) psd.release(); }}><X size={16} /></button></div>}
    {persistenceError && <p role="alert" className="layers-error">{persistenceError}</p>}
  </div>;
  const version = <div className="ies-layers-version"><label>Version<select aria-label="Layer version" value={document?.id || ""} disabled={busy} onChange={event => {
    if (draft && !window.confirm("Discard unsaved layer changes and switch versions? Saved versions are preserved.")) return;
    update(node.id, { ...layersOutputPatch(data.layersDocuments, event.target.value), layersDraft: null });
  }}>{data.layersDocuments.map((doc, index) => <option key={doc.id} value={doc.id}>{doc.name || "Layers"} {index + 1}</option>)}</select></label></div>;
  const separationControls = <>
    <LayerSeparationSettings data={data} disabled={busy || Boolean(data.layersJob)} onChange={patch => update(node.id, patch)} />
    <button type="button" className="layers-save" title="Generate a new separation of the original image using Atlas Cloud. This is a billed generation; existing versions are preserved." disabled={busy || Boolean(data.layersJob) || !managedLayerUrl(document?.sourceUrl || item.url)} onClick={separate}>{busy ? <LoaderCircle className="layers-export-spinner" size={17} /> : <Play size={17} />}Separate Layers</button>
    {showApiCosts && <small>Variable API cost</small>}
  </>;
  const separationPanel = separationOpen && <div className="ies-layers-separation"><div className="ies-layers-separation-heading"><strong>New Separation</strong><button type="button" title="Close separation settings" aria-label="Close separation settings" disabled={busy} onClick={() => setSeparationOpen(false)}><X size={16} /></button></div>{separationControls}</div>;
  if (document) return <ImageLayersWorkspace key={document.id} document={document} originalSeparation={originalLayerSeparation(document, data.layersDocuments)} embedded sidebarHeader={<>{version}{separationPanel}</>}
    workflowContext={workflowContext} nodeId={node.id} provider={provider} showApiCosts={showApiCosts} onEditActivityChange={setEditingLayer}
    toolbarActions={<button type="button" aria-expanded={separationOpen} disabled={busy || Boolean(data.layersJob)} onClick={() => setSeparationOpen(!separationOpen)} title="Set up another paid separation of the original image. Existing versions are kept."><Layers size={17} />New Separation</button>}
    initialDraft={draft} initialFolders={draftFolders} onDraftChange={(layers, changed, folders) => {
      const next = changed ? { documentId: document.id, layers, folders } : null;
      if (JSON.stringify(current.current.layersDraft || null) !== JSON.stringify(next)) update(node.id, { layersDraft: next });
    }} saving={saving} exporting={psd.busy} exportPending={Boolean(data.layersPsdJob)} psdResult={data.layersPsdExport?.documentId === document.id ? data.layersPsdExport : null}
    onSave={save} onExportPsd={psd.start} onClose={onClose} error={error || data.error || psd.error}
    actions={(document, changed) => <div className="ies-layers-delivery">{status}<button type="button" className="layers-save" disabled={busy} onClick={() => accept(document, changed, "copy")}><Plus size={16} />Add Image to Canvas</button>{canApply && <button type="button" disabled={busy} onClick={() => accept(document, changed, "apply")}><Check size={16} />Apply to Source</button>}<button type="button" disabled={busy} onClick={() => accept(document, changed, "continue")}><Pencil size={16} />Continue Editing</button></div>} />;
  return <div className="ies-workspace ies-layers-start">
    <div className="ies-layers-source"><img src={item.url} alt="Image to separate into layers" draggable={false} />{controller.working && <div className="ies-progress" role="status"><LoaderCircle className="ies-spinning" size={22} />Separating layers</div>}</div>
    <aside className="ies-sidebar">{separationControls}<small>Seedream 5.5 Layers / Atlas Cloud</small>
      {!managedLayerUrl(item.url) && <p className="ies-warning">Save this image to the canvas before separating it into layers.</p>}
      {status}{(error || data.error) && <p className="ies-error" role="alert">{error || data.error}</p>}
    </aside>
  </div>;
}
