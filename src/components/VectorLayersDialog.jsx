import React from "react";
import { createPortal } from "react-dom";
import { X, Layers, Eye, EyeOff, Lock, LockOpen, Group, Ungroup, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, ChevronRight, ChevronDown, ArrowUp, ArrowDown, ImageOff, Save, Download, WandSparkles, LoaderCircle, RefreshCw, FolderClosed, FolderOpen, Folders, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import { createVectorLayerRenderer, vectorLayerRows } from "../vectorLayerCanvas.js";
import { workflowContextPayload } from "../workflowContext.js";
import { ideogramVectorApi } from "../api/newtApi.js";
import { vectorLayerHistoryShortcut } from "../vectorLayerHistory.js";
import { vectorResizeHandles } from "../vectorLayerTransforms.js";
import { useVectorLayerTransform } from "./useVectorLayerTransform.js";
import { vectorOrganizationRuns, vectorOrganizationOperation, vectorSelectionGroup, vectorRowSelection } from "../vectorLayerOrganization.js";
import { Type, Magnet, Scan, SlidersHorizontal, Palette } from "lucide-react";
import { vectorAlignmentOperation, vectorFinishingMatrix, vectorPixelBox, vectorEditorVersion } from "../vectorArtwork.js";
import VectorArtworkProperties from "./VectorArtworkProperties.jsx";
import "./VectorLayersDialog.css";

const Tool = ({ title, children, ...props }) => <button type="button" title={title} aria-label={title} {...props}>{children}</button>;
const layerMime = "application/x-newt-vector-layer";
const resizeLabels = { nw: "top left", n: "top", ne: "top right", e: "right", se: "bottom right", s: "bottom", sw: "bottom left", w: "left" };

function Thumbnail({ renderer, layer }) {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => {
    const value = URL.createObjectURL(new Blob([renderer.isolatedSvg([layer.key])], { type: "image/svg+xml" }));
    setUrl(value); return () => URL.revokeObjectURL(value);
  }, [renderer, layer.key]);
  return <span className="vle-thumbnail">{url && <img src={url} alt="" draggable={false} />}</span>;
}

function Opacity({ value, disabled, commit }) {
  const [percent, setPercent] = React.useState(Math.round(value * 100));
  const apply = () => { const next = Math.max(0, Math.min(100, Number(percent) || 0)); setPercent(next); if (next !== Math.round(value * 100)) commit(next / 100); };
  return <label className="vle-opacity">Opacity<input type="range" min="0" max="100" value={percent} disabled={disabled} aria-label="Layer opacity" onChange={e => setPercent(e.target.value)} onPointerUp={apply} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) apply(); }} />
    <input type="number" min="0" max="100" value={percent} disabled={disabled} aria-label="Opacity percent" onChange={e => setPercent(e.target.value)} onBlur={apply} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /><span>%</span></label>;
}

export default function VectorLayersDialog({ item, editor, openingOperations = editor.operations, nodeId, nodeTitle, workflowContext, api = ideogramVectorApi, onClose }) {
  const dialog = React.useRef(null), viewport = React.useRef(null), stage = React.useRef(null), pan = React.useRef(null);
  const baseline = React.useRef(openingOperations), alive = React.useRef(false), namingController = React.useRef(null), pickEpoch = React.useRef(0), historyHandler = React.useRef(null);
  const rangeAnchor = React.useRef(null);
  const pickQueue = React.useRef(Promise.resolve()), pickSequence = React.useRef(0);
  const [picking, setPicking] = React.useState(false);
  const [revealKey, setRevealKey] = React.useState("");
  const marqueeGesture = React.useRef(null), marqueeClick = React.useRef(false);
  const [marquee, setMarquee] = React.useState(null), [boxMode, setBoxMode] = React.useState(false), [solo, setSolo] = React.useState(""), [soloUrl, setSoloUrl] = React.useState("");
  const [sidebarTab, setSidebarTab] = React.useState("layers"), [textRequest, setTextRequest] = React.useState(0), [adjusting, setAdjusting] = React.useState(false);
  const [textDraft, setTextDraft] = React.useState(null), [textPreview, setTextPreview] = React.useState(null);
  const closeText = React.useCallback(() => setTextRequest(0), []);
  const [snap, setSnap] = React.useState(false), [snapTargets, setSnapTargets] = React.useState([]);
  const [selected, setSelected] = React.useState([]), [expanded, setExpanded] = React.useState(new Set()), [query, setQuery] = React.useState(""), [page, setPage] = React.useState(0);
  const [zoom, setZoom] = React.useState(1), [hand, setHand] = React.useState(false), [space, setSpace] = React.useState(false), [background, setBackground] = React.useState("checker");
  const [size, setSize] = React.useState({ width: 640, height: 480 }), [outline, setOutline] = React.useState(null), [renaming, setRenaming] = React.useState(null);
  const [error, setError] = React.useState(""), [naming, setNaming] = React.useState(false), [suggestions, setSuggestions] = React.useState(null), [dragOver, setDragOver] = React.useState("");
  const { doc, pending, saving } = editor, layers = doc?.layers || [], busy = Boolean(pending || saving || naming || adjusting);
  const renderer = React.useMemo(() => doc ? createVectorLayerRenderer(doc) : null, [doc]);
  const chosen = layers.filter(layer => selected.includes(layer.key)), keys = chosen.map(layer => layer.key);
  const textDocumentKey = JSON.stringify([doc?.scope, doc?.sourceHash, doc?.signature]);
  const activeText = sidebarTab === "properties" && textDraft?.documentKey === textDocumentKey && textDraft.selection === JSON.stringify(keys) && textDraft.textRequest === textRequest ? textDraft : null;
  const locked = layer => layer.locked || layer.parentLocked || layers.some(child => child.locked && (() => { let parent = child.parentKey; while (parent) { if (parent === layer.key) return true; parent = layers.find(entry => entry.key === parent)?.parentKey; } return false; })());
  const editable = chosen.length > 0 && chosen.every(layer => !locked(layer));
  const transform = useVectorLayerTransform({ stage, doc, renderer, keys, outline,
    enabled: editable && !busy && !activeText && !editor.error && !hand && !space && !boxMode, failed: Boolean(editor.error), onCommit: edit, onError: setError, snapTargets, snapEnabled: snap, rootKey: solo });
  const indices = chosen.map(layer => layer.index).sort((a, b) => a - b);
  const groupPlan = vectorSelectionGroup(layers, keys), canGroup = !groupPlan.reason;
  const canUngroup = editable && chosen.every(layer => layer.canUngroup);
  const organizationRuns = React.useMemo(() => vectorOrganizationRuns(layers), [layers]);
  const groupCounts = React.useMemo(() => { const counts = new Map(); for (const layer of layers) if (layer.parentKey) counts.set(layer.parentKey, (counts.get(layer.parentKey) || 0) + 1); return counts; }, [layers]);
  const visible = vectorLayerRows(layers, expanded, query), currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 40) - 1)), rows = visible.slice(currentPage * 40, (currentPage + 1) * 40);
  React.useEffect(() => {
    if (!revealKey || sidebarTab !== "layers") return;
    const index = visible.findIndex(layer => layer.key === revealKey);
    if (index < 0) return;
    const targetPage = Math.floor(index / 40);
    if (currentPage !== targetPage) { setPage(targetPage); return; }
    const row = dialog.current?.querySelector(`[data-layer-key="${CSS.escape(revealKey)}"]`);
    if (row) { row.scrollIntoView({ block: "nearest" }); setRevealKey(""); }
  }, [revealKey, visible, currentPage, sidebarTab]);
  React.useEffect(() => {
    alive.current = true; const previous = document.activeElement; dialog.current.showModal();
    const historyKey = event => {
      const modal = dialog.current, target = event.target;
      if (!modal?.open || [...document.querySelectorAll("dialog:modal")].at(-1) !== modal) return;
      if (!modal.contains(target) && target !== document.body && target !== document.documentElement) return;
      historyHandler.current(event);
    };
    window.addEventListener("keydown", historyKey, true);
    const blur = () => { cancelBox(); setSpace(false); pickEpoch.current++; setPicking(false); };
    window.addEventListener("blur", blur);
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSize({ width, height }); }); observer.observe(viewport.current);
    return () => { alive.current = false; pickEpoch.current++; observer.disconnect(); window.removeEventListener("keydown", historyKey, true); window.removeEventListener("blur", blur); namingController.current?.abort(); previous?.focus?.(); };
  }, []);
  React.useEffect(() => {
    pickEpoch.current++; setPicking(false); cancelBox();
  }, [renderer, solo]);
  React.useEffect(() => {
    let active = true; setOutline(null);
    if (renderer && keys.length) renderer.bounds(keys).then(value => { if (active) setOutline(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [renderer, JSON.stringify(keys)]);
  React.useEffect(() => {
    if (!solo || !renderer || !layers.some(layer => layer.key === solo)) { setSoloUrl(""); return; }
    const url = URL.createObjectURL(new Blob([renderer.isolatedSvg([solo])], { type: "image/svg+xml" })); setSoloUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [renderer, solo]);
  React.useEffect(() => {
    if (!activeText || !renderer) { setTextPreview(null); return; }
    try {
      const operation = textOperation(activeText.text, activeText.key, activeText.replaceKeys, "newt-text-preview");
      const url = URL.createObjectURL(new Blob([renderer.textSvg(operation, solo)], { type: "image/svg+xml" }));
      setTextPreview({ doc, url }); return () => URL.revokeObjectURL(url);
    } catch (error) { setTextPreview(null); setError(error.message); }
  }, [activeText, renderer, outline, solo]);
  const textPreviewUrl = activeText && textPreview?.doc === doc ? textPreview.url : "";
  React.useEffect(() => {
    let active = true; setSnapTargets(doc ? [{ left: 0, top: 0, width: doc.width, height: doc.height }] : []);
    if (snap && renderer && doc) (async () => {
      const targets = [{ left: 0, top: 0, width: doc.width, height: doc.height }];
      const selectedAncestors = new Set(keys);
      for (const key of keys) { let parent = layers.find(layer => layer.key === key)?.parentKey; while (parent) { selectedAncestors.add(parent); parent = layers.find(layer => layer.key === parent)?.parentKey; } }
      for (const layer of layers.filter(layer => layer.parentKey === solo && !layer.hidden && !layer.parentHidden && !selectedAncestors.has(layer.key)).slice(0, 32)) { const box = await renderer.bounds([layer.key]); if (!active) return; if (box) targets.push(vectorPixelBox(box, doc)); }
      if (active) setSnapTargets(targets);
    })().catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [renderer, snap, solo, JSON.stringify(keys)]);
  const changed = JSON.stringify(editor.operations) !== JSON.stringify(baseline.current);
  function close() {
    if (saving || naming || adjusting) return;
    transform.cancel();
    if (changed && !window.confirm("Discard changes made in this Layers editor? Your original artwork and earlier edits will be kept.")) return;
    editor.replaceOperations(baseline.current); onClose();
  }
  function edit(operation) { pickEpoch.current++; setPicking(false); setError(""); setSuggestions(null); editor.edit(operation); }
  async function align(mode) {
    if (busy || !editable || !renderer) return;
    setAdjusting(true);
    try {
      const roots = chosen.filter(layer => { let parent = layer.parentKey; while (parent) { if (keys.includes(parent)) return false; parent = layers.find(entry => entry.key === parent)?.parentKey; } return true; });
      if (roots.length > 32) throw new Error("Select up to 32 objects to align.");
      const boxes = [];
      for (const layer of roots) { const box = await renderer.bounds([layer.key]); if (box) boxes.push({ key: layer.key, ...vectorPixelBox(box, doc) }); }
      if (alive.current) edit(vectorAlignmentOperation(boxes, mode, doc));
    } catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setAdjusting(false); }
  }
  function finishTransform(action, amount) {
    if (busy || !editable || !outline) return;
    try { edit({ type: "affine", keys, matrix: vectorFinishingMatrix(vectorPixelBox(outline, doc), action, amount) }); } catch (error) { setError(error.message); }
  }
  async function fitCanvas(padding) {
    if (busy || !doc) return;
    setAdjusting(true); const controller = new AbortController(); namingController.current = controller;
    try {
      const response = await api.inspectLayers({ editorVersion: vectorEditorVersion, svgUrl: item.svgUrl, sourceHash: doc.sourceHash, operations: editor.operations,
        backgroundKeys: item.vectorBackgroundKeys || [], lockedKeys: item.vectorLockedKeys || [], fitCanvasPadding: padding }, { signal: controller.signal });
      if (alive.current && !controller.signal.aborted && response.initialOperation) { edit(response.initialOperation); setSelected([]); setSolo(""); setZoom(1); }
    } catch (error) { if (alive.current && !controller.signal.aborted) setError(error.message); }
    finally { if (alive.current) { namingController.current = null; setAdjusting(false); } }
  }
  function textOperation(text, key, replaceKeys, id = `newt-text-${crypto.randomUUID()}`) {
    if (key && !textRequest) return { type: "text", key, text };
    const box = outline ? vectorPixelBox(outline, doc) : null;
    return { type: "addText", id, text, replaceKeys, x: box ? box.left + box.width / 2 : doc.width / 2, y: box ? box.top + Math.min(box.height, text.size) : doc.height / 2 };
  }
  function applyText(text, key, replaceKeys) {
    if (busy || !doc) return;
    const operation = textOperation(text, key, replaceKeys); edit(operation);
    if (operation.type === "addText") { setSelected([operation.id]); setSolo(""); }
  }
  function boxPoint(event) { const rect = stage.current.getBoundingClientRect(); return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) }; }
  function boxStart(event) {
    if ((!boxMode && !event.shiftKey) || busy || editor.error || hand || space || !renderer || event.button !== 0 || marqueeGesture.current) return false;
    event.preventDefault(); event.stopPropagation(); stage.current.focus({ preventScroll: true });
    marqueeGesture.current = { ...boxPoint(event), clientX: event.clientX, clientY: event.clientY, id: event.pointerId, moved: false, multiple: event.shiftKey || event.metaKey || event.ctrlKey };
    stage.current.setPointerCapture(event.pointerId); return true;
  }
  function boxMove(event) {
    const start = marqueeGesture.current; if (!start || start.id !== event.pointerId) return;
    start.moved ||= Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= 4;
    if (!start.moved) return;
    const point = boxPoint(event); setMarquee({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(start.x - point.x), height: Math.abs(start.y - point.y) });
  }
  function cancelBox() {
    const start = marqueeGesture.current; if (!start) return false;
    marqueeGesture.current = null; setMarquee(null); marqueeClick.current = true;
    if (stage.current?.hasPointerCapture(start.id)) stage.current.releasePointerCapture(start.id);
    return true;
  }
  function boxEnd(event) {
    const start = marqueeGesture.current; if (!start || start.id !== event.pointerId) return;
    const point = boxPoint(event), box = { left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(start.x - point.x), height: Math.abs(start.y - point.y) };
    marqueeGesture.current = null; setMarquee(null);
    if (stage.current.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
    if (!start.moved && Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < 4) return;
    marqueeClick.current = true;
    queueSelection(() => box.width > 0 && box.height > 0 ? renderer.marquee(box, solo) : [], found => {
      setSelected(previous => start.multiple ? [...new Set([...previous, ...found])] : found);
    });
  }
  function select(key, multiple = false) { setSelected(previous => multiple ? previous.includes(key) ? previous.filter(value => value !== key) : [...previous, key] : key ? [key] : []); }
  function selectRow(event, key) {
    pickEpoch.current++; setPicking(false); setError(""); setRevealKey("");
    if (solo) { let layer = layers.find(item => item.key === key); while (layer && layer.key !== solo) layer = layers.find(item => item.key === layer.parentKey); if (!layer) setSolo(""); }
    const anchor = rangeAnchor.current;
    setSelected(previous => vectorRowSelection(layers, previous, anchor, key, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey }));
    if (!event.shiftKey || !anchor) rangeAnchor.current = key;
  }
  function groupSelected() {
    if (busy || picking || editor.error) return;
    if (!canGroup) { setError(groupPlan.reason); return; }
    const id = `newt-group-${crypto.randomUUID()}`;
    edit({ type: "group", mode: "selection", keys: groupPlan.keys, id, name: "Group" });
    const parents = new Set([...expanded, id]);
    for (let key = groupPlan.parentKey; key; key = layers.find(layer => layer.key === key)?.parentKey) parents.add(key);
    setSelected([id]); setExpanded(parents); setRenaming(id); setQuery(""); setRevealKey(id); rangeAnchor.current = id;
  }
  function ungroupSelected() {
    if (busy || !canUngroup) return;
    const children = layers.filter(layer => keys.includes(layer.parentKey)).map(layer => layer.key);
    edit({ type: "ungroup", keys }); setSelected(children);
  }
  function organize() {
    if (busy) return;
    const operation = vectorOrganizationOperation(layers, () => crypto.randomUUID());
    if (operation) { edit(operation); setSelected([]); setExpanded(new Set()); setQuery(""); setPage(0); }
  }
  function reorder(direction) {
    if (!editable || busy || !chosen.every(layer => layer.parentKey === chosen[0].parentKey)) return;
    const siblings = layers.filter(layer => layer.parentKey === chosen[0].parentKey && !keys.includes(layer.key));
    const target = direction > 0 ? siblings.find(layer => layer.index > Math.max(...indices)) : siblings.filter(layer => layer.index < Math.min(...indices)).at(-1);
    if (target) edit({ type: "reorder", keys, target: target.key, position: direction > 0 ? "after" : "before" });
  }
  async function autoName() {
    if (namingController.current || busy) return;
    const targets = (chosen.length ? chosen : layers.filter(layer => !layer.parentKey)).filter(layer => !locked(layer));
    if (!targets.length || targets.length > 32) { setError("Select between 1 and 32 unlocked layers to name."); return; }
    if (!window.confirm("Use an AI analysis to suggest names for these layers? This uses your enabled API provider and may incur a charge. Artwork will not change.")) return;
    const controller = new AbortController(); namingController.current = controller; setNaming(true); setError("");
    try {
      const result = await api.nameLayers({ editorVersion: vectorEditorVersion, requestId: crypto.randomUUID(), svgUrl: item.svgUrl, sourceHash: doc.sourceHash,
        operations: editor.operations, backgroundKeys: item.vectorBackgroundKeys || [], lockedKeys: item.vectorLockedKeys || [], keys: targets.map(layer => layer.key), nodeId, nodeTitle, ...workflowContextPayload(workflowContext) }, { signal: controller.signal });
      if (alive.current && !controller.signal.aborted) setSuggestions(result.names);
    } catch (e) { if (alive.current && !controller.signal.aborted) setError(e.message); }
    finally { if (alive.current) { namingController.current = null; setNaming(false); } }
  }
  function queueSelection(resolve, apply) {
    const epoch = pickEpoch.current, sequence = ++pickSequence.current;
    setPicking(true);
    // Clicks and box selections share one queue so an additive drag retains
    // preceding clicks even while their alpha hit tests are still resolving.
    pickQueue.current = pickQueue.current.then(async () => {
      try {
        if (!alive.current || epoch !== pickEpoch.current) return;
        const result = await resolve();
        if (!alive.current || epoch !== pickEpoch.current) return;
        setError(""); apply(result);
      } catch (e) { if (alive.current && epoch === pickEpoch.current) setError(e.message); }
      finally { if (alive.current && sequence === pickSequence.current) setPicking(false); }
    });
  }
  function pick(event) {
    if (marqueeClick.current) { marqueeClick.current = false; return; }
    if (transform.consumeClick()) return;
    if (busy || hand || space || pan.current?.moved || !renderer) return;
    const bounds = stage.current.getBoundingClientRect(), multiple = event.shiftKey || event.metaKey || event.ctrlKey, deep = event.altKey;
    const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
    queueSelection(() => renderer.hitTest(x, y, deep, solo), key => {
      if (!key && multiple) return;
      select(key, multiple); rangeAnchor.current = key;
      if (key) {
        const parents = new Set(expanded); let current = layers.find(layer => layer.key === key);
        while (current?.parentKey) { parents.add(current.parentKey); current = layers.find(layer => layer.key === current.parentKey); }
        setExpanded(previous => new Set([...previous, ...parents])); setQuery(""); setRevealKey(key);
      }
    });
  }
  historyHandler.current = event => {
    const action = vectorLayerHistoryShortcut(event);
    if (!action) return;
    // Consume history keys before canvas/browser handlers, even if focus was lost
    // when a renamed or deleted row disappeared. Never cross a modal boundary.
    event.preventDefault(); event.stopPropagation();
    if (cancelBox() || transform.cancel()) return;
    if (!dialog.current.contains(event.target)) dialog.current.focus({ preventScroll: true });
    if (saving || naming || adjusting || activeText) return;
    setError(""); setSuggestions(null);
    pickEpoch.current++; setPicking(false);
    if (action === "undo") editor.undo(); else editor.redo();
  };
  function keyboard(event) {
    event.stopPropagation();
    if (event.isComposing || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === "Escape" && transform.cancel()) { event.preventDefault(); return; }
    if (event.key === "Escape" && cancelBox()) { event.preventDefault(); return; }
    if (event.key === "Escape" && solo) { event.preventDefault(); setSolo(""); return; }
    if (transform.active || marqueeGesture.current || activeText) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "g") { event.preventDefault(); event.shiftKey ? ungroupSelected() : groupSelected(); return; }
    if (!event.target.closest("button") && transform.nudge(event)) return;
    if (event.code === "Space" && !event.target.closest("button")) { event.preventDefault(); setSpace(true); }
    if (!busy && editable && ["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); edit({ type: "delete", keys }); }
    if (!busy && chosen.length === 1 && !locked(chosen[0]) && event.key === "F2") { event.preventDefault(); setRenaming(chosen[0].key); }
    if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); setZoom(value => Math.min(8, Math.max(0.25, value * (event.key === "-" ? 0.8 : 1.25)))); }
  }
  const fit = doc ? Math.min((size.width - 48) / doc.width, (size.height - 48) / doc.height) : 1;
  const width = Math.max(1, (doc?.width || 100) * Math.max(0.01, fit) * zoom), height = Math.max(1, (doc?.height || 100) * Math.max(0.01, fit) * zoom);
  return createPortal(<dialog className="vector-layers-dialog nodrag nowheel" ref={dialog} tabIndex={-1} aria-modal="true" aria-label="Vector Layers editor" onCancel={event => { event.preventDefault(); close(); }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={keyboard} onKeyUp={event => { event.stopPropagation(); if (event.code === "Space") setSpace(false); }}>
    <header><h2><Layers size={19} />Edit Artwork</h2><span className="vle-art-name">{item.label || "Vector"}</span><Tool title="Close Layers editor" disabled={saving || naming || adjusting} onClick={close}><X size={19} /></Tool></header>
    <div className="vle-toolbar">
      <div><Tool title="Select layer (Shift-drag to add layers; Alt-click inside a group)" aria-pressed={!hand && !boxMode} onClick={() => { setHand(false); setBoxMode(false); }}><MousePointer2 size={17} /></Tool><Tool title="Pan canvas (hold Space)" aria-pressed={hand} onClick={() => { setHand(true); setBoxMode(false); }}><Hand size={17} /></Tool></div>
      <div><Tool title="Box select" aria-pressed={boxMode} onClick={() => { setBoxMode(value => !value); setHand(false); }}><Scan size={17} /></Tool><Tool title="Snap to artwork and canvas guides (Alt bypasses)" aria-pressed={snap} onClick={() => setSnap(value => !value)}><Magnet size={17} /></Tool><Tool title="Add editable text" disabled={busy} onClick={() => { setSelected([]); setSidebarTab("properties"); setTextRequest(Date.now()); }}><Type size={17} /></Tool><Tool title="Edit artwork colors" disabled={busy} onClick={() => setSidebarTab("properties")}><Palette size={17} /></Tool></div>
      <div><Tool title="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom(value => Math.max(.25, value * .8))}><ZoomOut size={17} /></Tool><select aria-label="Layers zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[...new Set([.25, .5, 1, 2, 4, 8, zoom])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value === 1 ? "Fit" : `${Math.round(value * 100)}%`}</option>)}</select><Tool title="Zoom in" disabled={zoom >= 8} onClick={() => setZoom(value => Math.min(8, value * 1.25))}><ZoomIn size={17} /></Tool><Tool title="Fit artwork" onClick={() => { setZoom(1); viewport.current.scrollTo(0, 0); }}><Maximize size={17} /></Tool></div>
      <select aria-label="Layers canvas background" value={background} onChange={event => setBackground(event.target.value)}><option value="checker">Checkerboard</option><option value="light">Light</option><option value="dark">Dark</option></select>
      <div><Tool title="Undo layer edit" aria-keyshortcuts="Meta+Z Control+Z" disabled={saving || naming || adjusting || activeText || !editor.canUndo} onClick={() => { transform.cancel(); editor.undo(); }}><Undo2 size={17} /></Tool><Tool title="Redo layer edit" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y" disabled={saving || naming || adjusting || activeText || !editor.canRedo} onClick={() => { transform.cancel(); editor.redo(); }}><Redo2 size={17} /></Tool></div>
    </div>
    <div className="vle-workspace">
      <div ref={viewport} className={`vle-viewport${hand || space ? " panning" : ""}`} tabIndex={0} aria-label="Artwork canvas"
        onPointerDown={event => {
          if (!(hand || space || event.button === 1)) return;
          event.preventDefault(); viewport.current.setPointerCapture(event.pointerId);
          pan.current = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop, moved: false };
        }} onPointerMove={event => { if (!pan.current) return; pan.current.moved = true; viewport.current.scrollLeft = pan.current.left - event.clientX + pan.current.x; viewport.current.scrollTop = pan.current.top - event.clientY + pan.current.y; }}
        onPointerUp={() => { setTimeout(() => { pan.current = null; }, 0); }} onPointerCancel={() => { pan.current = null; }}>
        <div className="vle-canvas-space" style={{ minWidth: width + 48, minHeight: height + 48 }}>
          <div ref={stage} tabIndex={0} aria-label="Select and move artwork" className={`vle-artwork vector-background-${background}${transform.active ? " transforming" : ""}${marquee ? " selecting" : ""}`} style={{ width, height }} onClick={pick}
            onDoubleClick={event => { event.stopPropagation(); if (chosen.length === 1 && chosen[0].kind === "g") { setSolo(chosen[0].key); setExpanded(new Set([...expanded, chosen[0].key])); setSelected([]); } }}
            onPointerDown={event => { marqueeClick.current = false; if (!boxStart(event)) transform.start(event); }} onPointerMove={event => { boxMove(event); transform.move(event); }} onPointerUp={event => { boxEnd(event); transform.end(event); }} onPointerCancel={() => { cancelBox(); transform.cancelPointer(); }} onLostPointerCapture={() => { cancelBox(); transform.cancelPointer(); }}>
            {(textPreviewUrl || transform.previewUrl || soloUrl || editor.previewUrl) && <img src={textPreviewUrl || transform.previewUrl || soloUrl || editor.previewUrl} alt="Editable vector artwork" draggable={false} />}
            {marquee && <span className="vle-marquee" style={Object.fromEntries(Object.entries(marquee).map(([key, value]) => [key, `${value}%`]))} />}
            {transform.guides?.map((line, i) => line != null && <span key={i} className={`vle-snap-guide ${i ? "horizontal" : "vertical"}`} style={i ? { top: `${line / doc.height * 100}%` } : { left: `${line / doc.width * 100}%` }} />)}
            {transform.outline && !activeText && <span className={`vle-selection${editable && !busy && !hand && !space ? " movable" : ""}`} data-testid="layer-selection" style={Object.fromEntries(Object.entries(transform.outline).map(([key, value]) => [key, `${value}%`]))}>
              {editable && !busy && !hand && !space && vectorResizeHandles.map(handle => <button key={handle} type="button" className={`vle-resize-handle handle-${handle}`} aria-label={`Resize ${resizeLabels[handle]}`} title="Drag to resize. Corners keep proportions; Shift resizes freely; Alt resizes from center. Arrow keys make small adjustments."
                onPointerDown={event => transform.start(event, handle)} onClick={event => event.stopPropagation()} onKeyDown={event => transform.nudge(event, handle)} />)}
            </span>}
          </div>
        </div>
      </div>
      <aside className="vle-sidebar" aria-label="Layers panel">
        {solo && <button type="button" className="vle-isolation" onClick={() => { setSolo(""); setSelected([]); }}>Artwork / {layers.find(layer => layer.key === solo)?.name || "Group"}<X size={14} /></button>}
        <div className="vle-sidebar-tabs" role="tablist" aria-label="Artwork panel"><button type="button" role="tab" aria-selected={sidebarTab === "layers"} onClick={() => setSidebarTab("layers")}><Layers size={15} />Layers</button><button type="button" role="tab" aria-selected={sidebarTab === "properties"} onClick={() => setSidebarTab("properties")}><SlidersHorizontal size={15} />Properties</button></div>
        {sidebarTab === "properties" ? <VectorArtworkProperties doc={doc} documentKey={textDocumentKey} keys={keys} editable={editable} busy={busy} onEdit={edit} onTransform={finishTransform} onAlign={align} onFit={fitCanvas} onText={applyText} onTextPreview={setTextDraft} onError={setError} textRequest={textRequest} onTextClose={closeText} /> : <>
        <div className="vle-sidebar-title"><strong>Layers</strong><span>{layers.length}</span><Tool title="Auto Name Layers (optional paid AI analysis; review names before applying)" disabled={busy || !doc || Boolean(editor.error)} onClick={autoName}>{naming ? <LoaderCircle className="vle-spin" size={16} /> : <WandSparkles size={16} />}</Tool></div>
        <input type="search" aria-label="Find layer" placeholder="Find layer" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
        <div className="vle-group-tools">
          <button type="button" title={groupPlan.reason || "Group selected layers at the frontmost selected position (Cmd/Ctrl+G). Undo restores the original stacking."} aria-keyshortcuts="Meta+G Control+G" disabled={busy || picking || Boolean(editor.error) || !canGroup} onClick={groupSelected}><Group size={15} />Group</button>
          <button type="button" title="Ungroup selected groups (Cmd/Ctrl+Shift+G); groups with compositing effects stay intact" aria-keyshortcuts="Meta+Shift+G Control+Shift+G" disabled={busy || !canUngroup} onClick={ungroupSelected}><Ungroup size={15} />Ungroup</button>
          <Tool title="Organize loose layers into folders without changing their stacking order" disabled={busy || !organizationRuns.length} onClick={organize}><Folders size={16} /></Tool>
          <Tool title={expanded.size ? "Collapse all groups" : "Expand all groups"} disabled={!groupCounts.size} onClick={() => setExpanded(expanded.size ? new Set() : new Set(groupCounts.keys()))}>{expanded.size ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}</Tool>
        </div>
        {keys.length > 0 && <Opacity key={`${keys.join(":")}:${chosen[0]?.opacity}`} value={chosen[0]?.opacity ?? 1} disabled={busy || !editable} commit={opacity => edit({ type: "opacity", keys, opacity })} />}
        <div className="vle-layer-tools">
          <Tool title="Move layers forward" disabled={busy || !editable} onClick={() => reorder(1)}><ArrowUp size={16} /></Tool><Tool title="Move layers backward" disabled={busy || !editable} onClick={() => reorder(-1)}><ArrowDown size={16} /></Tool>
          <Tool title="Mark selected objects as background" disabled={busy || !keys.length} onClick={() => edit({ type: "background", keys })}><ImageOff size={16} /></Tool>
          <Tool title="Delete selected layers" disabled={busy || !editable} onClick={() => edit({ type: "delete", keys })}><Trash2 size={16} /></Tool>
        </div>
        {doc?.backgroundKeys.length > 0 && <div className="vle-background"><label><input type="checkbox" role="switch" aria-label="Background visible" checked={doc.backgroundVisible} disabled={busy} onChange={event => edit({ type: "backgroundVisibility", visible: event.target.checked })} />Background</label><button type="button" disabled={busy} title="Clear background assignment without changing visibility" onClick={() => edit({ type: "background", keys: [] })}>Clear</button></div>}
        {suggestions ? <div className="vle-suggestions"><strong>Suggested names</strong>{suggestions.map((entry, index) => <label key={entry.key}>{layers.find(layer => layer.key === entry.key)?.name}<input aria-label={`Suggested name ${entry.key}`} maxLength={120} value={entry.name} onChange={event => setSuggestions(previous => previous.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>)}<div><button type="button" onClick={() => setSuggestions(null)}>Cancel</button><button type="button" disabled={suggestions.some(entry => !entry.name.trim())} onClick={() => edit({ type: "renameMany", names: suggestions })}>Apply Names</button></div></div> :
          <div className="vle-layer-list" role="listbox" aria-label="Vector layers" aria-multiselectable="true" aria-busy={busy}>
            {rows.map(layer => <div key={layer.key} role="option" aria-selected={selected.includes(layer.key)} data-layer-key={layer.key} tabIndex={0}
              className={`vle-layer-row${selected.includes(layer.key) ? " selected" : ""}${layer.hidden || layer.parentHidden ? " hidden-layer" : ""}${dragOver === layer.key ? " drop-target" : ""}`}
              style={{ paddingLeft: Math.min(layer.depth * 12, 48) + 4 }} title={`${layer.name} - ${layer.kind}`} draggable={!busy && !locked(layer) && !renaming}
              onClick={event => selectRow(event, layer.key)} onKeyDown={event => { if (event.target === event.currentTarget && event.key === "Enter") selectRow(event, layer.key); }}
              onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(layerMime, JSON.stringify({ scope: editor.scope, keys: selected.includes(layer.key) ? keys : [layer.key] })); }}
              onDragOver={event => { if (!busy && event.dataTransfer.types.includes(layerMime)) { event.preventDefault(); setDragOver(layer.key); } }} onDragLeave={() => setDragOver("")} onDragEnd={() => setDragOver("")}
              onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragOver(""); try {
                const value = JSON.parse(event.dataTransfer.getData(layerMime));
                if (busy || value.scope !== editor.scope || value.keys.includes(layer.key)) return;
                if (!value.keys.every(key => { const source = layers.find(entry => entry.key === key); return source && !locked(source) && source.parentKey === layer.parentKey; })) { setError("Reorder layers within their existing group to preserve their positioning."); return; }
                const rect = event.currentTarget.getBoundingClientRect(); edit({ type: "reorder", keys: value.keys, target: layer.key, position: event.clientY < rect.top + rect.height / 2 ? "after" : "before" });
              } catch { setError("Could not move these layers."); } }}>
              {layer.kind === "g" ? <Tool title={`${expanded.has(layer.key) ? "Collapse" : "Expand"} ${layer.name}`} onClick={event => { event.stopPropagation(); const next = new Set(expanded); next.has(layer.key) ? next.delete(layer.key) : next.add(layer.key); setExpanded(next); }}>{expanded.has(layer.key) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</Tool> : <span className="vle-indent" />}
              {layer.kind === "g" ? <span className="vle-folder">{expanded.has(layer.key) ? <FolderOpen size={21} /> : <FolderClosed size={21} />}</span> : renderer && <Thumbnail renderer={renderer} layer={layer} />}
              {renaming === layer.key ? <input autoFocus aria-label={`Layer name ${layer.key}`} defaultValue={layer.name} maxLength={120} onClick={event => event.stopPropagation()} onBlur={event => { const name = event.target.value.trim(); if (name && name !== layer.name) edit({ type: "rename", key: layer.key, name }); setRenaming(null); }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.preventDefault(); event.currentTarget.value = layer.name; setRenaming(null); } }} /> : <span className="vle-layer-name" onDoubleClick={() => { if (!busy && !locked(layer)) setRenaming(layer.key); }}>{layer.name}</span>}
              {layer.kind === "g" && <span className="vle-group-count" title={`${groupCounts.get(layer.key) || 0} items`}>{groupCounts.get(layer.key) || 0}</span>}
              <Tool title={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`} disabled={busy || layer.parentLocked} onClick={event => { event.stopPropagation(); edit({ type: "lock", keys: [layer.key], locked: !layer.locked }); }}>{layer.locked || layer.parentLocked ? <Lock size={13} /> : <LockOpen size={13} />}</Tool>
              <Tool title={`${layer.hidden ? "Show" : "Hide"} ${layer.name}`} disabled={busy || layer.parentHidden} onClick={event => { event.stopPropagation(); edit({ type: "visibility", keys: [layer.key], visible: layer.hidden }); }}>{layer.hidden || layer.parentHidden ? <EyeOff size={14} /> : <Eye size={14} />}</Tool>
            </div>)}
            {!rows.length && !pending && <span className="vle-empty">{query ? "No matching layers" : "No layers"}</span>}
          </div>}
        {visible.length > 40 && <div className="vle-pages"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} / {Math.ceil(visible.length / 40)}</span><button type="button" disabled={(currentPage + 1) * 40 >= visible.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        <div className="vle-selection-count">{keys.length} selected</div>
        </>}
      </aside>
    </div>
    {(error || editor.error) && <div className="vle-error" role="alert">{error || editor.error}{editor.error && <Tool title="Reload vector layers" disabled={saving} onClick={editor.retry}><RefreshCw size={14} /></Tool>}</div>}
    <footer><span role="status">{busy ? <><LoaderCircle className="vle-spin" size={15} />{saving ? "Saving artwork..." : naming ? "Naming layers..." : "Updating layers..."}</> : activeText ? "Text preview" : editor.dirty ? "Unsaved edits" : "Original preserved"}</span><button type="button" disabled={saving || naming} onClick={close}>Cancel</button><button type="button" disabled={busy || activeText || !doc || Boolean(editor.error) || !keys.length} title="Save selected objects in place as a separate SVG, PNG and alpha matte" onClick={async () => { const result = await editor.save(keys); if (result) onClose(); }}><Download size={15} />Save Selection</button><button type="button" className="vle-save" disabled={busy || activeText || !doc || Boolean(editor.error)} title="Create a new editable SVG, PNG and alpha matte. No generation." onClick={async () => { const result = await editor.save(); if (result) onClose(); }}><Save size={15} />Save Version</button></footer>
  </dialog>, document.body);
}
