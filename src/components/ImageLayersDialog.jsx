import React from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Lock, Unlock, Trash2, Undo2, Redo2, X, Save, ZoomIn, ZoomOut, GripVertical, ScanEye, Download, LoaderCircle, Move, Hand, Copy, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, MoveHorizontal, RotateCcw, ChevronUp, ChevronRight, ChevronDown, Pencil, Folder, FolderPlus, FolderMinus, FolderOutput, Layers } from "lucide-react";
import { sameRasterLayers, selectRasterLayers, editableRasterLayers, rasterSelectionBounds, translateRasterLayers, resizeRasterSelection, rotateRasterSelection, duplicateRasterSelection, rasterComparisonPercent } from "../rasterLayerSelection.js";
import { validateLayerDocument } from "../imageLayers.js";
import { useImagePreviewViewport } from "./useImagePreviewViewport.js";
import RasterLayerEditPanel from "./RasterLayerEditPanel.jsx";
import RasterLayerSeparationPanel from "./RasterLayerSeparationPanel.jsx";
import { insertLayerSeparation, layerSeparationKey, readLayerSeparation } from "../rasterLayerSeparation.js";
import { applyRasterLayerEdit } from "../rasterLayerEdit.js";
import { sameRasterFolders, pruneRasterFolders, rasterLayerLocked, rasterLayerVisible, rasterStackEntries, rasterFolderMembers, groupRasterLayers, ungroupRasterFolder, duplicateRasterFolder, moveRasterLayersToFolder, moveRasterStackToRoot, reorderRasterStack } from "../rasterLayerFolders.js";
import "../imageLayers.css";

const Icon = ({ title, children, ...props }) => <button type="button" title={title} aria-label={title} {...props}>{children}</button>;
export default function ImageLayersDialog({ document: source, originalSeparation, onClose, onSave, saving, error, onExportPsd, exporting = false, exportPending = false, psdResult, embedded = false, toolbarActions, sidebarHeader, actions, initialDraft, initialFolders, onDraftChange, workflowContext, nodeId, provider, showApiCosts = false, onEditActivityChange }) {
  const dialog = React.useRef(null), viewport = React.useRef(null), artboard = React.useRef(null), gesture = React.useRef(null), dragged = React.useRef(null), wipeGesture = React.useRef(null);
  const journalKey = layerSeparationKey(source, workflowContext, nodeId);
  const recovered = React.useMemo(() => readLayerSeparation(journalKey, globalThis.localStorage), [journalKey]);
  const [separationTarget, setSeparationTarget] = React.useState(recovered?.target || null);
  const [separationBaseline, setSeparationBaseline] = React.useState(recovered?.baseline || null);
  const [separating, setSeparating] = React.useState(false);
  const initialLayers = recovered?.baseline.layers || initialDraft || source.layers;
  const [layers, setLayers] = React.useState(initialLayers), [selected, setSelected] = React.useState([recovered?.target.id || initialLayers.at(-1)?.id].filter(Boolean));
  const [folders, setFolders] = React.useState(recovered?.baseline.folders || initialFolders || source.folders || []), [selectedFolder, setSelectedFolder] = React.useState("");
  const folderRef = React.useRef(folders); folderRef.current = folders;
  const locked = layer => rasterLayerLocked(layer, folders);
  const visible = layer => rasterLayerVisible(layer, folders);
  const stackDocument = { ...source, layers, folders };
  const [tool, setTool] = React.useState("move"), [localError, setLocalError] = React.useState("");
  const [transforming, setTransforming] = React.useState(false);
  const [draggingLayer, setDraggingLayer] = React.useState(false), [rootDropMarker, setRootDropMarker] = React.useState("");
  const [propertiesOpen, setPropertiesOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState(null), [editPreview, setEditPreview] = React.useState(null), [paintingEdit, setPaintingEdit] = React.useState(false);
  const [generatingEdit, setGeneratingEdit] = React.useState(false);
  const editOverlay = React.useRef(null), paintingRef = React.useRef(false); paintingRef.current = paintingEdit;
  const blocked = saving || Boolean(editTarget || separationTarget);
  const editActivity = React.useRef(onEditActivityChange); editActivity.current = onEditActivityChange;
  React.useEffect(() => { editActivity.current?.(Boolean(editTarget || separationTarget)); return () => editActivity.current?.(false); }, [Boolean(editTarget || separationTarget)]);
  const propertiesId = React.useId();
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const spaceHeldRef = React.useRef(false);
  const sliderGesture = React.useRef(null);
  const [fit, setFit] = React.useState(1), [compare, setCompare] = React.useState(false);
  const [split, setSplit] = React.useState(50);
  const [revision, setRevision] = React.useState(0);
  const history = React.useRef({ past: [], future: [] }), current = React.useRef(layers); current.current = layers;
  const handActive = tool === "hand" || spaceHeld;
  const imageViewport = useImagePreviewViewport({ stageRef: viewport, imageSize: { width: source.width * fit, height: source.height * fit }, enabled: true,
    sourceKey: source.id, canPan: handActive, isEditing: () => Boolean(gesture.current || wipeGesture.current || sliderGesture.current || paintingRef.current) });
  const zoom = imageViewport.view.scale;
  const changed = !sameRasterLayers(layers, source.layers) || !sameRasterFolders(folders, source.folders), scale = fit * zoom;
  const selectedLayers = layers.filter(layer => selected.includes(layer.id)), editable = editableRasterLayers(layers, selected, folders);
  const active = layers.find(layer => layer.id === selected.at(-1)), multiple = selectedLayers.length > 1;
  const bounds = rasterSelectionBounds(layers, selected, folders), geometry = multiple ? bounds : active;
  const selectionBox = editable.length === 1 ? editable[0] : gesture.current?.rotate ? { ...gesture.current.bounds, rotation: gesture.current.angle || 0 } : bounds;
  React.useEffect(() => { if (!embedded) dialog.current.showModal(); return () => { if (!embedded) dialog.current?.close(); }; }, [embedded]);
  const draftCallback = React.useRef(onDraftChange); draftCallback.current = onDraftChange;
  React.useEffect(() => { draftCallback.current?.(layers, changed, folders); }, [layers, changed, folders]);
  React.useEffect(() => { if (selectedFolder && !folders.some(folder => folder.id === selectedFolder)) setSelectedFolder(""); }, [folders, selectedFolder]);
  React.useEffect(() => {
    const resize = () => { const box = viewport.current?.getBoundingClientRect(); if (box?.width && box?.height) setFit(Math.max(0.01, Math.min((box.width - 72) / source.width, (box.height - 72) / source.height))); };
    const observer = new ResizeObserver(resize); observer.observe(viewport.current); resize(); return () => observer.disconnect();
  }, [source.width, source.height]);
  function commit(next, before = current.current, applyingEdit = false, nextFolders = folderRef.current) {
    nextFolders = pruneRasterFolders(next, nextFolders);
    if (saving || ((editTarget || separationTarget) && !applyingEdit) || (sameRasterLayers(next, before) && sameRasterFolders(nextFolders, folderRef.current))) return false;
    try { validateLayerDocument({ ...source, layers: next, folders: nextFolders }); }
    catch (error) { setLocalError(error.message); return false; }
    if (!sliderGesture.current) { history.current.past = [...history.current.past.slice(-49), { layers: before, folders: folderRef.current }]; history.current.future = []; }
    folderRef.current = nextFolders; setFolders(nextFolders);
    setLayers(next); current.current = next; setRevision(value => value + 1);
    return true;
  }
  const patch = (id, values) => commit(current.current.map(layer => {
    if (layer.id !== id || locked(layer)) return layer;
    const next = { ...layer, ...values };
    next.x = Math.round(Math.max(-source.width * 4, Math.min(source.width * 4, next.x)));
    next.y = Math.round(Math.max(-source.height * 4, Math.min(source.height * 4, next.y)));
    next.width = Math.round(Math.max(1, Math.min(8192, next.width)));
    next.height = Math.round(Math.max(1, Math.min(8192, Math.floor(36000000 / next.width), next.height)));
    return next;
  }));
  const patchSelection = values => commit(current.current.map(layer => selected.includes(layer.id) && !locked(layer) ? { ...layer, ...values } : layer));
  function select(event, id, keep = false) {
    if (editTarget || separationTarget) return selected;
    setSelectedFolder("");
    const next = selectRasterLayers(current.current, selected, id, { toggle: event.shiftKey || event.metaKey || event.ctrlKey, keep });
    setSelected(next); return next;
  }
  function undo(redo = false) {
    if (blocked || gesture.current || sliderGesture.current) return;
    const from = redo ? history.current.future : history.current.past, to = redo ? history.current.past : history.current.future;
    if (!from.length) return;
    to.push({ layers: current.current, folders: folderRef.current }); const next = from.pop();
    setLayers(next.layers); current.current = next.layers; setFolders(next.folders); folderRef.current = next.folders; setRevision(value => value + 1);
  }
  const close = () => { if (!blocked && (!changed || window.confirm("Discard these unsaved layer edits? The original separation is preserved."))) onClose(); };
  function begin(event, layer, resizing = "") {
    if (event.button !== 0 || blocked || compare || tool === "hand" || spaceHeldRef.current || gesture.current || sliderGesture.current) return;
    event.stopPropagation(); event.preventDefault();
    dialog.current.focus({ preventScroll: true });
    const ids = resizing || (selectedFolder && selected.includes(layer?.id) && !event.shiftKey && !event.ctrlKey && !event.metaKey) ? selected : select(event, layer.id, true);
    if ((!resizing && !ids.includes(layer.id)) || (layer && locked(layer)) || !editableRasterLayers(current.current, ids, folders).length) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = rasterSelectionBounds(current.current, ids, folders), rect = artboard.current.getBoundingClientRect();
    const cx = rect.left + (box.x + box.width / 2) * scale, cy = rect.top + (box.y + box.height / 2) * scale;
    gesture.current = { ids, resize: resizing, rotate: resizing === "rotate", bounds: box, cx, cy,
      startAngle: Math.atan2(event.clientY - cy, event.clientX - cx),
      startX: event.clientX, startY: event.clientY, before: current.current, scale, element: event.currentTarget, pointerId: event.pointerId };
    setTransforming(true);
  }
  function move(event) {
    const g = gesture.current; if (!g || event.pointerId !== g.pointerId) return;
    const dx = (event.clientX - g.startX) / g.scale, dy = (event.clientY - g.startY) / g.scale;
    try {
      const document = { ...source, layers: g.before, folders };
      const degrees = (Math.atan2(event.clientY - g.cy, event.clientX - g.cx) - g.startAngle) * 180 / Math.PI;
      const next = g.rotate ? rotateRasterSelection(document, g.ids, degrees, event.shiftKey)
        : g.resize ? resizeRasterSelection(document, g.ids, g.resize, dx, dy) : translateRasterLayers(document, g.ids, dx, dy);
      if (g.rotate) g.angle = event.shiftKey ? Math.round(degrees / 15) * 15 : degrees;
      current.current = next; setLayers(next);
    } catch { /* Keep the last valid placement at document limits. */ }
  }
  function end(cancel = false) {
    const g = gesture.current; gesture.current = null; if (!g) return;
    if (g.element.hasPointerCapture(g.pointerId)) g.element.releasePointerCapture(g.pointerId);
    setTransforming(false);
    if (cancel) { current.current = g.before; setLayers(g.before); } else commit(current.current, g.before);
  }
  function beginSlider() {
    if (blocked || sliderGesture.current) return;
    sliderGesture.current = { before: current.current }; setTransforming(true);
  }
  function endSlider(cancel = false) {
    const g = sliderGesture.current; sliderGesture.current = null;
    if (!g) return;
    setTransforming(false);
    if (cancel) { current.current = g.before; setLayers(g.before); } else commit(current.current, g.before);
  }
  const sliderEvents = {
    onPointerDown: beginSlider, onPointerUp: () => endSlider(), onPointerCancel: () => endSlider(true), onLostPointerCapture: () => endSlider(true), onBlur: () => endSlider(),
    onKeyDown: event => {
      if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
        event.stopPropagation(); event.preventDefault(); endSlider(); undo(event.key.toLowerCase() === "y" || event.shiftKey);
      } else if (event.key === "Escape" && sliderGesture.current) { event.stopPropagation(); event.preventDefault(); endSlider(true); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginSlider();
    },
    onKeyUp: event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) endSlider(); }
  };
  function endWipe(cancel = false) {
    const g = wipeGesture.current; wipeGesture.current = null;
    if (!g) return;
    if (cancel) setSplit(g.split);
    if (g.element.hasPointerCapture(g.pointerId)) g.element.releasePointerCapture(g.pointerId);
  }
  function beginWipe(event) {
    if (spaceHeldRef.current) return;
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const rect = artboard.current.getBoundingClientRect();
    wipeGesture.current = { element: event.currentTarget, pointerId: event.pointerId, split, offset: event.clientX - rect.left - rect.width * split / 100 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function wipeKey(event) {
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault(); setSplit(value => event.key === "Home" ? 0 : event.key === "End" ? 100 : Math.max(0, Math.min(100, value + (event.key === "ArrowLeft" ? -step : step))));
    } else if (event.key === "Escape") { event.preventDefault(); if (wipeGesture.current) endWipe(true); else setCompare(false); }
  }
  React.useEffect(() => {
    const releaseSpace = event => {
      if ((event.code === "Space" || event.key === " ") && spaceHeldRef.current) {
        event.preventDefault(); event.stopPropagation();
        spaceHeldRef.current = false; setSpaceHeld(false); imageViewport.endPan();
      }
    };
    const cancel = () => { end(true); imageViewport.cancelPan(); endWipe(true); endSlider(true); endLayerDrag(); spaceHeldRef.current = false; setSpaceHeld(false); };
    const visibility = () => { if (globalThis.document.hidden) cancel(); };
    window.addEventListener("blur", cancel); window.addEventListener("keyup", releaseSpace, true); globalThis.document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", cancel); window.removeEventListener("keyup", releaseSpace, true); globalThis.document.removeEventListener("visibilitychange", visibility); endWipe(); };
  }, []);
  const remove = () => { if (editable.length && editable.length < layers.length) commit(layers.filter(layer => !selected.includes(layer.id) || locked(layer))); };
  const duplicate = () => {
    if (selectedFolder) {
      const next = duplicateRasterFolder(stackDocument, selectedFolder, () => crypto.randomUUID());
      if (commitFolder(next)) { setSelected(next.selectedIds); setSelectedFolder(next.selectedFolderId); }
      return;
    }
    try { const next = duplicateRasterSelection(stackDocument, selected, () => crypto.randomUUID()); commit(next.layers); if (next.selectedIds.length) { setSelected(next.selectedIds); setSelectedFolder(""); } setLocalError(""); }
    catch (error) { setLocalError(error.message); }
  };
  const translate = (dx, dy) => commit(translateRasterLayers(stackDocument, selected, dx, dy));
  function commitFolder(next) {
    if (blocked || transforming) return false;
    return commit(next.layers, current.current, false, next.folders || []);
  }
  const group = () => {
    const id = crypto.randomUUID();
    if (commitFolder(groupRasterLayers(stackDocument, selected, id))) { setSelectedFolder(id); setLocalError(""); }
  };
  const ungroup = () => { if (selectedFolder) commitFolder(ungroupRasterFolder(stackDocument, selectedFolder)); };
  const patchFolder = (id, values) => commitFolder({ ...stackDocument, folders: folders.map(folder => folder.id === id ? { ...folder, ...values } : folder) });
  function selectFolder(event, folder) {
    if (blocked || transforming) return;
    const ids = rasterFolderMembers(layers, folders, folder.id).map(layer => layer.id);
    const toggle = event.shiftKey || event.metaKey || event.ctrlKey;
    setSelected(toggle ? (ids.every(id => selected.includes(id)) ? selected.filter(id => !ids.includes(id)) : [...selected.filter(id => !ids.includes(id)), ...ids]) : ids);
    setSelectedFolder(toggle ? "" : folder.id);
    if (!event.target.closest("input,button")) dialog.current.focus({ preventScroll: true });
  }
  function drop(event, targetId, intoFolder = false) {
    event.preventDefault(); event.stopPropagation();
    const moving = dragged.current; endLayerDrag();
    if (!moving || blocked || transforming) return;
    const next = intoFolder && !moving.folderId ? moveRasterLayersToFolder(stackDocument, moving.ids, targetId)
      : reorderRasterStack(stackDocument, moving.ids, targetId, moving.folderId);
    commitFolder(next);
  }
  function endLayerDrag() { dragged.current = null; setDraggingLayer(false); setRootDropMarker(""); }
  function rootDragOver(event, marker) {
    if (blocked || transforming || !dragged.current) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setRootDropMarker(marker);
  }
  function dropAtRoot(event, placement) {
    event.preventDefault(); event.stopPropagation();
    const moving = dragged.current; endLayerDrag();
    if (!moving || blocked || transforming) return;
    if (commitFolder(moveRasterStackToRoot(stackDocument, moving.ids, { ...placement, folderId: moving.folderId }))) setSelectedFolder(moving.folderId || "");
  }
  const rootDropZone = (anchorId = "", name = "") => {
    const marker = anchorId || "bottom";
    return <div role="separator" aria-label={anchorId ? `Main layers above ${name}` : "Main layers bottom"} title="Move to main layers" className={`layers-root-drop ${rootDropMarker === marker ? "active" : ""}`}
      onDragOver={event => rootDragOver(event, marker)} onDragLeave={() => setRootDropMarker("")}
      onDrop={event => dropAtRoot(event, { edge: anchorId ? "above" : "bottom", anchorId })} />;
  };
  const reset = () => {
    if (!originalSeparation || blocked || transforming) return;
    commit(originalSeparation.layers.map(layer => ({ ...layer })), current.current, false, originalSeparation.folders || []);
    setSelectedFolder("");
    setSelected([originalSeparation.layers.at(-1)?.id].filter(Boolean)); setLocalError("");
  };
  const discardEdit = () => { setEditTarget(null); setEditPreview(null); setLocalError(""); dialog.current?.focus({ preventScroll: true }); };
  const applyEdit = result => {
    try { if (commit(applyRasterLayerEdit(current.current, editTarget, result), current.current, true)) discardEdit(); }
    catch (error) { setLocalError(error.message); }
  };
  const applySeparation = result => {
    const id = `separated-${result.id}`;
    const next = insertLayerSeparation({ ...source, layers: current.current, folders: folderRef.current }, separationTarget, result, id);
    if (!commit(next.layers, current.current, true, next.folders)) return false;
    setSelected(next.layers.filter(layer => layer.folderId === id).map(layer => layer.id)); setSelectedFolder(id);
    setLocalError(""); return true;
  };
  function setGeometry(key, value) {
    if (!multiple) { if (active) patch(active.id, { [key]: value }); return; }
    if (!bounds) return;
    if (key === "x" || key === "y") translate(key === "x" ? value - bounds.x : 0, key === "y" ? value - bounds.y : 0);
    else {
      const baseline = sliderGesture.current?.before || layers, initialBounds = rasterSelectionBounds(baseline, selected, folders), factor = value / initialBounds[key];
      try { commit(resizeRasterSelection({ ...source, layers: baseline, folders }, selected, "se", initialBounds.width * (factor - 1), initialBounds.height * (factor - 1))); setLocalError(""); }
      catch (error) { setLocalError(error.message); }
    }
  }
  const renderLayer = (layer, depth = 0) => <div role="listitem" key={layer.id} data-layer-id={layer.id} style={{ marginLeft: depth * 12 }} className={`layers-list-row ${layer.folderId ? "layers-folder-child" : ""} ${selected.includes(layer.id) ? "selected" : ""}`} onClick={event => { select(event, layer.id); if (event.shiftKey || event.metaKey || event.ctrlKey || !event.target.closest("input,button")) dialog.current.focus({ preventScroll: true }); }}
    draggable={!blocked && !transforming && !locked(layer)} onDragStart={event => {
      if (event.target.closest("input,button")) { event.preventDefault(); return; }
      const ids = selectRasterLayers(layers, selected, layer.id, { keep: true });
      dragged.current = { ids, folderId: "" }; setDraggingLayer(true); setSelected(ids); setSelectedFolder(""); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", ids.join(","));
    }} onDragOver={event => { setRootDropMarker(""); if (!blocked && dragged.current && !locked(layer)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => drop(event, layer.id)} onDragEnd={endLayerDrag}>
    <GripVertical size={13} className="layers-grip" /><img src={layer.url} alt="" draggable={false} /><input aria-label={`Name ${layer.name}`} value={layer.name} disabled={blocked || locked(layer)} maxLength={100} onPointerDown={event => { if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault(); }} onChange={event => patch(layer.id, { name: event.target.value })} />
    <Icon title={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} disabled={blocked || locked(layer)} onClick={event => { event.stopPropagation(); patch(layer.id, { visible: !layer.visible }); }}>{layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}</Icon>
    <Icon title={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`} disabled={blocked || rasterLayerLocked({ folderId: layer.folderId }, folders)} onClick={event => { event.stopPropagation(); commit(layers.map(item => item.id === layer.id ? { ...item, locked: !item.locked } : item)); }}>{locked(layer) ? <Lock size={15} /> : <Unlock size={15} />}</Icon>
  </div>;
  const renderEntries = (parentId = "", depth = 0) => rasterStackEntries(layers, folders, parentId).reverse().map(entry => <React.Fragment key={entry.layer?.id || entry.folder.id}>
    {!parentId && rootDropZone(entry.layer?.id || entry.folder.id, entry.layer?.name || entry.folder.name)}
    {entry.layer ? renderLayer(entry.layer, depth) : <>
    <div role="listitem" className={`layers-folder-row ${selectedFolder === entry.folder.id ? "selected" : ""}`} style={{ marginLeft: depth * 12 }} data-folder-id={entry.folder.id} onClick={event => selectFolder(event, entry.folder)}
      draggable={!blocked && !transforming && entry.layers.every(layer => !locked(layer))}
      onDragStart={event => { if (event.target.closest("input,button")) { event.preventDefault(); return; } const ids = entry.layers.map(layer => layer.id); dragged.current = { ids, folderId: entry.folder.id }; setDraggingLayer(true); setSelected(ids); setSelectedFolder(entry.folder.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", entry.folder.id); }}
      onDragOver={event => { setRootDropMarker(""); if (!blocked && dragged.current && !rasterLayerLocked({ folderId: entry.folder.id }, folders)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => drop(event, entry.folder.id, true)} onDragEnd={endLayerDrag}>
      <Icon title={`${entry.folder.collapsed ? "Expand" : "Collapse"} ${entry.folder.name}`} aria-expanded={!entry.folder.collapsed} disabled={blocked || transforming} onClick={event => { event.stopPropagation(); patchFolder(entry.folder.id, { collapsed: !entry.folder.collapsed }); }}>{entry.folder.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</Icon>
      <Folder size={18} className="layers-folder-symbol" /><input aria-label={`Folder name ${entry.folder.name}`} value={entry.folder.name} maxLength={100} disabled={blocked || rasterLayerLocked({ folderId: entry.folder.id }, folders)} onChange={event => patchFolder(entry.folder.id, { name: event.target.value })} />
      <Icon title={`${entry.folder.visible ? "Hide" : "Show"} folder ${entry.folder.name}`} disabled={blocked || transforming || rasterLayerLocked({ folderId: entry.folder.id }, folders)} onClick={event => { event.stopPropagation(); patchFolder(entry.folder.id, { visible: !entry.folder.visible }); }}>{entry.folder.visible ? <Eye size={16} /> : <EyeOff size={16} />}</Icon>
      <Icon title={`${entry.folder.locked ? "Unlock" : "Lock"} folder ${entry.folder.name}`} disabled={blocked || transforming || rasterLayerLocked({ folderId: entry.folder.parentId }, folders)} onClick={event => { event.stopPropagation(); patchFolder(entry.folder.id, { locked: !entry.folder.locked }); }}>{entry.folder.locked ? <Lock size={16} /> : <Unlock size={16} />}</Icon>
    </div>{!entry.folder.collapsed && renderEntries(entry.folder.id, depth + 1)}</>}
  </React.Fragment>);
  const Container = embedded ? "section" : "dialog";
  const content = <Container className={`image-layers-dialog ${embedded ? "ies-layer-workspace" : ""}`} ref={dialog} tabIndex={-1} aria-label="Edit Layers" onCancel={event => { event.preventDefault(); if (wipeGesture.current) endWipe(true); else if (gesture.current) end(true); else if (!imageViewport.cancelPan()) close(); }}
    onKeyDownCapture={event => {
      if ((event.code !== "Space" && event.key !== " ") || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],.layers-adjustments-toggle')) return;
      event.preventDefault(); event.stopPropagation();
      if (!gesture.current && !wipeGesture.current && !sliderGesture.current) { spaceHeldRef.current = true; setSpaceHeld(true); }
    }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) { spaceHeldRef.current = false; setSpaceHeld(false); imageViewport.cancelPan(); } }}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (editTarget || separationTarget) return;
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); end(true); return; }
      if (gesture.current) return;
      if (event.key === "Escape" && imageViewport.cancelPan()) { event.preventDefault(); return; }
      if (event.key === "Escape" && embedded) { event.preventDefault(); onClose?.(); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && ["+", "=", "-", "0"].includes(event.key)) { event.preventDefault(); event.key === "0" ? imageViewport.reset() : imageViewport.zoom(event.key === "-" ? 1 / 1.2 : 1.2); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); undo(true); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); if (!saving) duplicate(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") { event.preventDefault(); event.shiftKey ? ungroup() : group(); }
      else if (!event.ctrlKey && !event.metaKey && !event.altKey && ["v", "h"].includes(event.key.toLowerCase())) { event.preventDefault(); setTool(event.key.toLowerCase() === "h" ? "hand" : "move"); }
      else if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); if (!saving) remove(); }
      else if (event.key.startsWith("Arrow") && editable.length && !saving && !compare) { event.preventDefault(); const n = event.shiftKey ? 10 : 1; translate(event.key === "ArrowRight" ? n : event.key === "ArrowLeft" ? -n : 0, event.key === "ArrowDown" ? n : event.key === "ArrowUp" ? -n : 0); }
    }}>
    <header>{!embedded && <strong>Edit Layers</strong>}<div className="layers-actions">
      <Icon title="Move tool (V)" aria-pressed={!handActive} onClick={() => setTool("move")}><Move size={18} /></Icon>
      <Icon title="Hand tool (H); hold Space to pan temporarily" aria-label="Hand tool (H)" aria-pressed={handActive} onClick={() => setTool("hand")}><Hand size={18} /></Icon>
      <Icon title="Undo (Command/Ctrl Z)" disabled={blocked || !history.current.past.length} onClick={() => undo()}><Undo2 size={18} /></Icon>
      <Icon title="Redo (Command/Ctrl Shift Z)" disabled={blocked || !history.current.future.length} onClick={() => undo(true)}><Redo2 size={18} /></Icon>
      <Icon title="Reset to original layers" disabled={blocked || transforming || !originalSeparation || (sameRasterLayers(layers, originalSeparation.layers) && sameRasterFolders(folders, originalSeparation.folders))} onClick={reset}><RotateCcw size={18} /></Icon>
      <Icon title="Center layer horizontally" disabled={blocked || transforming || !bounds} onClick={() => translate(Math.round((source.width - bounds.width) / 2) - bounds.x, 0)}><AlignHorizontalJustifyCenter size={18} /></Icon>
      <Icon title="Center layer vertically" disabled={blocked || transforming || !bounds} onClick={() => translate(0, Math.round((source.height - bounds.height) / 2) - bounds.y)}><AlignVerticalJustifyCenter size={18} /></Icon>
      <Icon title="Zoom out" disabled={zoom <= 1} onClick={() => imageViewport.zoom(1 / 1.2)}><ZoomOut size={18} /></Icon>
      <Icon title="Zoom in" disabled={zoom >= 8} onClick={() => imageViewport.zoom(1.2)}><ZoomIn size={18} /></Icon>
      <Icon title="Compare original image" aria-pressed={compare} disabled={!source.sourceUrl || Boolean(editTarget || separationTarget)} onClick={() => { endWipe(); setCompare(!compare); }}><ScanEye size={18} /></Icon>
      <button type="button" title="Edit one visible, unlocked layer with AI while preserving its transparency" disabled={blocked || transforming || Boolean(selectedFolder) || multiple || !active || !visible(active) || locked(active)} onClick={() => { endWipe(); setCompare(false); setTool("move"); setPropertiesOpen(false); setLocalError(""); setEditTarget({ ...active }); }}><Pencil size={17} />Edit Layer</button>
      <button type="button" title="Separate the selected layer into a folder of new layers" disabled={blocked || transforming || Boolean(selectedFolder) || multiple || !active || !visible(active) || locked(active)} onClick={() => { endWipe(); setCompare(false); setPropertiesOpen(false); setLocalError(""); setSeparationBaseline(stackDocument); setSeparationTarget({ ...active }); }}><Layers size={17} />Separate Layer</button>
      {toolbarActions}
      <button type="button" title="Export the current edits as editable Photoshop layers" disabled={blocked || exportPending || transforming} onClick={() => onExportPsd?.(stackDocument)}>{exporting ? <LoaderCircle className="layers-export-spinner" size={17} /> : <Download size={17} />}Export PSD</button>
      <button type="button" className="layers-save" disabled={blocked || transforming} onClick={() => onSave({ ...stackDocument, name: "Edited" })}><Save size={17} />{saving && !exporting ? "Saving..." : "Save Version"}</button>
      {!embedded && <Icon title="Close layer editor" disabled={blocked} onClick={close}><X size={20} /></Icon>}
    </div></header>
    <div className="layers-editor-grid">
      <div ref={viewport} className={`layers-viewport ${handActive ? "layers-hand" : ""} ${imageViewport.panning ? "layers-panning" : ""}`} tabIndex={0} aria-label="Layers image viewport" data-image-viewport="" {...imageViewport.handlers}>
        <div className="layers-artboard-space">
          <div ref={artboard} className={`layers-artboard ${compare ? "layers-comparing" : ""}`} data-revision={revision} style={{ width: source.width * scale, height: source.height * scale, transform: `translate3d(${imageViewport.view.x}px, ${imageViewport.view.y}px, 0) translate(-50%, -50%)` }}>
            <div className="layers-artboard-content">{layers.filter(visible).map(layer => <div key={layer.id} className={`layers-object ${selected.includes(layer.id) ? "selected" : ""} ${locked(layer) ? "locked" : ""}`}
              style={{ left: layer.x * scale, top: layer.y * scale, width: layer.width * scale, height: layer.height * scale, transform: `rotate(${layer.rotation || 0}deg)` }}
              aria-label={layer.name} data-layer-id={layer.id} onPointerDown={event => begin(event, layer)} onPointerMove={move} onPointerUp={() => end()} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)}>
              <img src={editTarget?.id === layer.id && editPreview ? editPreview.url : layer.url} style={{ opacity: layer.opacity }} alt="" draggable={false} />
            </div>)}</div>
            {editTarget && <div ref={editOverlay} className="raster-edit-overlay" style={{ left: editTarget.x * scale, top: editTarget.y * scale, width: editTarget.width * scale, height: editTarget.height * scale, transform: `rotate(${editTarget.rotation || 0}deg)` }} />}
            {selectionBox && !editTarget && !separationTarget && !compare && !handActive && <div className="layers-selection-box" style={{ left: selectionBox.x * scale, top: selectionBox.y * scale, width: selectionBox.width * scale, height: selectionBox.height * scale, transform: `rotate(${selectionBox.rotation || 0}deg)` }}
              onPointerMove={move} onPointerUp={() => end()} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)}>
              <button type="button" className="layers-rotate" aria-label="Rotate selected layers" title="Drag to rotate; hold Shift for 15-degree steps" disabled={saving} onPointerDown={event => begin(event, null, "rotate")}
                onKeyDown={event => {
                  if (gesture.current) return;
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
                  event.preventDefault(); event.stopPropagation();
                  try { commit(rotateRasterSelection(stackDocument, selected, (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 15 : 1))); }
                  catch (error) { setLocalError(error.message); }
                }}><RotateCcw size={14} /></button>
              {["nw", "ne", "sw", "se"].map(corner => <button key={corner} className={`layers-resize layers-resize-${corner}`} aria-label={`Resize ${multiple ? "selection" : active?.name}${corner === "se" ? "" : ` ${corner}`}`} title="Resize selected layers proportionally" onPointerDown={event => begin(event, null, corner)} />)}
            </div>}
            {compare && <>
              <div className="layers-wipe-original" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}><img className="layers-original" src={source.sourceUrl} alt="Original" draggable={false} /></div>
              <span className="layers-compare-label layers-compare-before">Original</span><span className="layers-compare-label layers-compare-after">Edited</span>
              <div className="layers-wipe-divider" role="slider" tabIndex={0} aria-label="Layers comparison divider" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)}% original, ${100 - Math.round(split)}% edited`} title="Drag to compare original and edit" style={{ left: `${split}%` }}
                onPointerDown={beginWipe} onPointerMove={event => { event.stopPropagation(); const g = wipeGesture.current; if (g?.pointerId === event.pointerId) setSplit(rasterComparisonPercent(event.clientX, artboard.current.getBoundingClientRect(), g.offset)); }}
                onPointerUp={event => { event.stopPropagation(); endWipe(); }} onPointerCancel={event => { event.stopPropagation(); endWipe(true); }} onLostPointerCapture={() => endWipe(true)} onBlur={() => endWipe(true)} onKeyDown={wipeKey}>
                <span className="layers-wipe-handle" aria-hidden="true"><MoveHorizontal size={18} /></span>
              </div>
            </>}
          </div>
        </div>
        {editTarget && generatingEdit && <div className="raster-edit-progress" role="status" aria-label="Generating layer edit" title="Generating layer edit"><LoaderCircle className="layers-export-spinner" size={22} aria-hidden="true" /></div>}
        {separationTarget && separating && <div className="raster-edit-progress" role="status" aria-label="Separating selected layer" title="Separating selected layer"><LoaderCircle className="layers-export-spinner" size={22} aria-hidden="true" /></div>}
      </div>
      <aside>{!editTarget && !separationTarget && sidebarHeader}{separationTarget ? <RasterLayerSeparationPanel key={separationTarget.id} target={separationTarget} baseline={separationBaseline} journalKey={journalKey} workflowContext={workflowContext} nodeId={nodeId} onApply={applySeparation} onClose={() => { setSeparationTarget(null); setSeparating(false); }} onGeneratingChange={setSeparating} showApiCosts={showApiCosts} /> : editTarget ? <RasterLayerEditPanel key={editTarget.id + editTarget.url} layer={editTarget} overlayRef={editOverlay} artboardRef={artboard} scale={scale} handActive={handActive} workflowContext={workflowContext} nodeId={nodeId} provider={provider} showApiCosts={showApiCosts} onPreview={setEditPreview} onApply={applyEdit} onDiscard={discardEdit} onPainting={setPaintingEdit} onGeneratingChange={setGeneratingEdit} /> : <><div className={`layers-panel-header ${rootDropMarker === "top" ? "layers-root-highlight" : ""}`} onDragOver={event => rootDragOver(event, "top")} onDragLeave={() => setRootDropMarker("")} onDrop={event => dropAtRoot(event, { edge: "top" })}><strong>{multiple ? `${selectedLayers.length} selected` : "Layers"}</strong><div className="layers-actions">
          <Icon title="Group selected layers (Command/Ctrl G)" disabled={blocked || transforming || !selectedLayers.length || editable.length !== selectedLayers.length} onClick={group}><FolderPlus size={17} /></Icon>
          {selectedFolder && <Icon title="Ungroup folder (Command/Ctrl Shift G)" disabled={blocked || transforming || folders.find(folder => folder.id === selectedFolder)?.locked} onClick={ungroup}><FolderMinus size={17} /></Icon>}
          {!selectedFolder && selectedLayers.some(layer => layer.folderId) && <Icon title="Move selected layers out of folder" disabled={blocked || transforming || editable.length !== selectedLayers.length} onClick={() => commitFolder(moveRasterLayersToFolder(stackDocument, selected))}><FolderOutput size={17} /></Icon>}
          <Icon title="Duplicate layer (Command/Ctrl D)" disabled={blocked || transforming || !editable.length || (selectedFolder && editable.length !== selectedLayers.length) || layers.length + editable.length > 24} onClick={duplicate}><Copy size={17} /></Icon><Icon title="Delete selected layer" disabled={blocked || transforming || !editable.length || editable.length === layers.length} onClick={remove}><Trash2 size={17} /></Icon></div></div>
        <div className={`layers-list ${draggingLayer ? "layers-dragging" : ""} ${rootDropMarker === "space" ? "layers-root-highlight" : ""}`} role="list" aria-label="Layer stack"
          onDragOver={event => { if (event.target === event.currentTarget) rootDragOver(event, "space"); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRootDropMarker(""); }}
          onDrop={event => { if (event.target === event.currentTarget) dropAtRoot(event, { edge: "bottom" }); }}>{renderEntries()}{rootDropZone()}</div>
        {selectedLayers.length > 0 && <div className="layers-adjustments">
          <div id={propertiesId} className={`layers-properties-reveal ${propertiesOpen ? "open" : ""}`} aria-hidden={!propertiesOpen} inert={!propertiesOpen}>
            <div className="layers-properties-clip"><div className="layers-properties"><label>Opacity<input aria-label="Layer opacity" type="range" min={0} max={1} step={0.01} value={editable.at(-1)?.opacity ?? active?.opacity ?? 1} disabled={!propertiesOpen || saving || !editable.length} {...sliderEvents} onChange={event => patchSelection({ opacity: Number(event.target.value) })} /></label>
              <div className="layers-sliders">{["x", "y", "width", "height"].map(key => <label key={key}><span>{({ x: "Horizontal", y: "Vertical", width: "Width", height: "Height" })[key]}</span><output>{geometry ? `${geometry[key]} px` : ""}</output><input type="range" aria-label={`Layer ${key}`} aria-valuetext={geometry ? `${geometry[key]} pixels` : ""} value={geometry?.[key] ?? 0} disabled={!propertiesOpen || saving || !editable.length} min={key === "x" ? -source.width * 4 : key === "y" ? -source.height * 4 : 1} max={key === "x" ? source.width * 4 : key === "y" ? source.height * 4 : Math.max(8192, geometry?.[key] || 0)} step={1} {...sliderEvents} onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n)) setGeometry(key, n); }} /></label>)}</div>
            </div></div>
          </div>
          <button type="button" className="layers-adjustments-toggle" aria-label="Layer adjustments" aria-expanded={propertiesOpen} aria-controls={propertiesId} title={propertiesOpen ? "Hide layer adjustments" : "Show layer adjustments"} onClick={() => setPropertiesOpen(open => !open)}><span>Adjustments</span><ChevronUp size={15} /></button>
        </div>}{typeof actions === "function" ? actions(stackDocument, changed) : actions}</>}
      </aside>
    </div>
    {(error || localError) && <div className="layers-error" role="alert">{error || localError}</div>}
    {psdResult?.url && <footer className="layers-psd-status" role="status"><a href={psdResult.url} download={psdResult.fileName} title={psdResult.savedFilePath || "Download the completed PSD"}><Download size={14} />{psdResult.savedFilePath ? "Saved: " : "Download: "}{psdResult.fileName}</a></footer>}
  </Container>;
  return embedded ? content : createPortal(content, globalThis.document.body);
}
