import React from "react";
import { Layers, LoaderCircle, Play, RefreshCw, X, Square, Pencil, Download } from "lucide-react";
import { NodeRow, OutputPortRow } from "./NodePorts.jsx";
import { useImageLayers } from "./useImageLayers.js";
import { useLayersPsdExport } from "./useLayersPsdExport.js";
import { layersOutputPatch } from "../imageLayers.js";
import { originalLayerSeparation } from "../imageEditLayers.js";
import LayerSeparationSettings from "./LayerSeparationSettings.jsx";
import { setOutputItemDragData, finishOutputItemDragData } from "../mediaAssets.js";
import "../imageLayers.css";
const LayersDialog = React.lazy(() => import("./ImageLayersDialog.jsx"));

export function ImageLayersNodeBody({ node, config, sources = [], onUpdate, workflowContext, onPreviewOpen, onConnectStart, onDisconnectInput, connectedPortKeys, showApiCosts, renderToolSwitcher, api, provider }) {
  const [editing, setEditing] = React.useState(false), [original, setOriginal] = React.useState(false);
  const controller = useImageLayers({ node, workflowContext, onUpdate, preserveSelection: editing, api });
  const { data, update, working, saving, start, check, stop, release, save } = controller;
  const psd = useLayersPsdExport({ node, workflowContext, onUpdate, api });
  const document = data.layersDocuments.find(doc => doc.id === data.layersDocumentId);
  const draft = document && data.layersDraft?.documentId === document.id ? data.layersDraft : null;
  const selected = data.resultItems[data.selectedResultIndex];
  const source = sources[0], displayed = original ? { url: document?.sourceUrl || source?.url, label: "Original", type: "image" } : selected?.url === document?.items?.[0]?.url ? { ...selected, imageLayersDocument: document } : selected || source;
  const ports = { node, onConnectStart, onDisconnectInput, connectedPortKeys };
  const drag = item => ({ draggable: Boolean(item?.url), onDragStart: event => { event.stopPropagation(); setOutputItemDragData(event.dataTransfer, item); }, onDragEnd: event => finishOutputItemDragData(item, event) });
  React.useEffect(() => { setEditing(false); }, [node.id, workflowContext?.projectId, document?.id]);
  return <div className="node-body image-layers-body">
    {renderToolSwitcher?.(working || saving || psd.busy || Boolean(data.layersJob || data.layersPsdJob) || editing)}
    <NodeRow {...ports} label="Image" inputPort={config.input.find(port => port.id === "imageIn")}><span className="layers-source-label">{sources.length > 1 ? "Connect only one image" : source?.label || "Connect image"}</span></NodeRow>
    <div className="layers-preview" onPointerDown={event => event.stopPropagation()}>
      {displayed?.url ? <img src={displayed.url} alt={displayed.label || "Layers preview"} {...drag(displayed)} onDoubleClick={() => onPreviewOpen?.(displayed)} /> : <Layers size={36} />}
      {working && <LoaderCircle className="layers-spinner" aria-label="Separating layers" />}
    </div>
    {document && <>
      <div className="layers-actions">
        <button type="button" aria-pressed={original} onClick={() => setOriginal(!original)}>{original ? "Original" : "Result"}</button>
        <select aria-label="Layer version" value={document.id} onChange={event => update(layersOutputPatch(data.layersDocuments, event.target.value))}>{data.layersDocuments.map((doc, i) => <option value={doc.id} key={doc.id}>{doc.name || "Layers"} {i + 1}</option>)}</select>
        <button type="button" onClick={() => setEditing(true)}><Pencil size={15} /> Edit Layers</button>
        <button type="button" disabled={saving || psd.busy || Boolean(data.layersPsdJob)} title="Export this version as editable Photoshop layers" onClick={() => psd.start(document)}>{psd.busy ? <LoaderCircle className="layers-export-spinner" size={15} /> : <Download size={15} />}Export PSD</button>
      </div>
      <div className="layers-thumbnails" aria-label="Layer outputs" onPointerDown={event => event.stopPropagation()}>{data.resultItems.map((item, index) => <button type="button" key={item.url} title={item.label} aria-label={`Select ${item.label}`} aria-pressed={index === data.selectedResultIndex} {...drag(item)} onClick={() => { setOriginal(false); update(layersOutputPatch(data.layersDocuments, document.id, index)); }}><img draggable={false} src={item.url} alt="" /><span>{item.label}</span></button>)}</div>
    </>}
    <OutputPortRow {...ports} port={config.output[0]} label="Image output" />
    <LayerSeparationSettings data={data} onChange={update} disabled={working || saving || editing} />
    <button className="primary-button layers-run" type="button" disabled={working || saving || Boolean(data.layersJob) || sources.length !== 1 || !source?.url} title="Separate the connected image using Seedream 5.5 on Atlas Cloud. This is a billed generation." onClick={() => start(source)}><Play size={16} />Separate Layers{showApiCosts ? " (Variable cost)" : ""}</button>
    {data.layersJob && <div className="layers-job" role="status"><span>{working ? "Separating layers..." : data.layersJob.error || "Check the existing request before generating again."}</span>{working ? <button title="Stop waiting; provider work continues" aria-label="Stop waiting" onClick={stop}><Square size={17} /></button> : <><button title="Check existing request without generating" aria-label="Check request" onClick={check}><RefreshCw size={17} /></button><button title="Release request after checking Atlas history" aria-label="Release request" onClick={() => { if (window.confirm("Release this request? Atlas may still finish and charge it. Check Atlas history before starting another separation.")) release(); }}><X size={17} /></button></>}</div>}
    {data.error && <p className="layers-error" role="alert">{data.error}</p>}
    {(data.layersPsdJob || psd.error || data.layersPsdExport) && <div className="layers-psd-status">
      {psd.error && <p className="layers-error" role="alert">{psd.error}</p>}
      {data.layersPsdJob && <div className="layers-job"><span>{psd.busy ? "Exporting PSD..." : "Check the existing PSD export or chosen destination before exporting again."}</span>{!psd.busy && <><button title="Check PSD export" aria-label="Check PSD export" onClick={psd.check}><RefreshCw size={16} /></button><button title="Release PSD export" aria-label="Release PSD export" onClick={() => { if (window.confirm("Check the chosen destination first. Release this export so you can export again?")) psd.release(); }}><X size={16} /></button></>}</div>}
      {data.layersPsdExport?.url && <a href={data.layersPsdExport.url} download={data.layersPsdExport.fileName} title={data.layersPsdExport.savedFilePath || "Download the completed PSD"}><Download size={14} />{data.layersPsdExport.fileName}</a>}
    </div>}
    {editing && document && <React.Suspense fallback={null}><LayersDialog key={document.id} document={document} originalSeparation={originalLayerSeparation(document, data.layersDocuments)} workflowContext={workflowContext} nodeId={node.id} provider={provider} showApiCosts={showApiCosts} initialDraft={draft?.layers} initialFolders={draft?.folders} onDraftChange={(layers, changed, folders) => {
      const next = changed ? { documentId: document.id, layers, folders } : null;
      if (JSON.stringify(data.layersDraft || null) !== JSON.stringify(next)) update({ layersDraft: next });
    }} saving={saving || psd.busy} exporting={psd.busy} exportPending={Boolean(data.layersPsdJob)} psdResult={data.layersPsdExport?.documentId === document.id ? data.layersPsdExport : null} error={data.error || psd.error} onExportPsd={psd.start} onClose={() => { update({ layersDraft: null }); setEditing(false); }} onSave={async doc => { if (await save(doc)) { update({ layersDraft: null }); setEditing(false); } }} /></React.Suspense>}
  </div>;
}
