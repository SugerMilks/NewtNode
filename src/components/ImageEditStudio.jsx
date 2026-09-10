import React from "react";
import { ArrowUpRight, Brush, Check, Circle, Download, Eraser, Hand, LoaderCircle, Maximize, Minus, Pencil, Plus, Redo2, Scan, Square, Trash2, Type, Undo2, X } from "lucide-react";
import { drawImageEditMarks, imageEditColors, imageEditHasPixels, imageEditPoint, imageEditSize } from "../imageEdit.js";
import { nodeApi } from "../api/newtApi.js";
import { appendWorkflowContextFormFields } from "../workflowContext.js";
import { notifyGenerationTaskComplete } from "../generationChime.js";
import "./imageEditStudio.css";

const tools = [["pen", Pencil, "Draw"], ["arrow", ArrowUpRight, "Arrow"], ["ellipse", Circle, "Circle"], ["rectangle", Square, "Rectangle"], ["text", Type, "Text note"], ["eraser", Eraser, "Erase marks"], ["hand", Hand, "Pan"]];
const blobOf = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the drawing.")), "image/png"));
const emptyHistory = { past: [], marks: [], future: [] };

function IconButton({ icon: Icon, label, active = false, ...props }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} className={`ies-icon ${active ? "active" : ""}`} {...props}><Icon size={18} /></button>;
}

export function ImageEditStudio({ item, workflowContext, falAvailable, provider = falAvailable ? "fal" : "", canApply, onAccept, onClose, showApiCosts = false }) {
  const [base, setBase] = React.useState(item);
  const [size, setSize] = React.useState(null);
  const [history, setHistory] = React.useState(emptyHistory);
  const [draft, setDraft] = React.useState(null);
  const [tool, setTool] = React.useState("pen");
  const [layer, setLayer] = React.useState("drawing");
  const [color, setColor] = React.useState(imageEditColors[2]);
  const [brushSize, setBrushSize] = React.useState(1);
  const [opacity, setOpacity] = React.useState(100);
  const [note, setNote] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [mode, setMode] = React.useState("edit");
  const [blank, setBlank] = React.useState(false);
  const [quality, setQuality] = React.useState("high");
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [viewport, setViewport] = React.useState({ width: 700, height: 600 });
  const [versions, setVersions] = React.useState([]);
  const [resultIndex, setResultIndex] = React.useState(-1);
  const [view, setView] = React.useState("result");
  const [split, setSplit] = React.useState(50);
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [warning, setWarning] = React.useState("");
  const [elapsed, setElapsed] = React.useState(0);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [cursor, setCursor] = React.useState(null);
  const drawingRef = React.useRef(null), selectionRef = React.useRef(null), stageRef = React.useRef(null), surfaceRef = React.useRef(null);
  const dragRef = React.useRef(null), busyRef = React.useRef(false), rootRef = React.useRef(null);
  const result = versions[resultIndex];
  const reviewing = Boolean(result);
  const marks = draft ? [...history.marks, draft] : history.marks;
  const hasDrawing = history.marks.some((mark) => mark.layer === "drawing" && mark.tool !== "eraser");
  const hasSelection = history.marks.some((mark) => mark.layer === "selection" && mark.tool !== "eraser");
  const dirty = history.marks.length || prompt.trim();
  const providerAvailable = provider === "fal" || provider === "atlas";
  const providerLabel = provider === "atlas" ? "Atlas Cloud" : provider === "fal" ? "Fal" : provider === "krea" ? "Krea" : "Unavailable";
  const resultProvider = result?.provider || result?.cost?.provider;

  React.useEffect(() => { rootRef.current?.focus(); }, []);
  React.useEffect(() => {
    const stage = stageRef.current;
    const observer = new ResizeObserver(() => setViewport({ width: stage.clientWidth, height: stage.clientHeight }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    const stage = stageRef.current;
    const wheel = (event) => {
      event.preventDefault(); event.stopPropagation();
      if (event.ctrlKey || event.metaKey) setZoom((value) => Math.max(0.5, Math.min(5, value * Math.exp(-event.deltaY * 0.008))));
      else setPan((value) => ({ x: value.x - event.deltaX, y: value.y - event.deltaY }));
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, []);
  React.useEffect(() => {
    if (!busy) return;
    const start = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  React.useLayoutEffect(() => {
    if (!size || reviewing) return;
    for (const [ref, targetLayer] of [[drawingRef, "drawing"], [selectionRef, "selection"]]) {
      const canvas = ref.current;
      if (!canvas) continue;
      drawImageEditMarks(canvas.getContext("2d"), marks, canvas.width, canvas.height, targetLayer);
    }
  }, [marks, size, reviewing]);

  function commit(nextMarks) {
    setHistory((current) => ({ past: [...current.past.slice(-59), current.marks], marks: nextMarks, future: [] }));
  }
  function undo() {
    if (busyRef.current || dragRef.current) return;
    setHistory((s) => !s.past.length ? s : ({ past: s.past.slice(0, -1), marks: s.past.at(-1), future: [s.marks, ...s.future] }));
  }
  function redo() {
    if (busyRef.current || dragRef.current) return;
    setHistory((s) => !s.future.length ? s : ({ past: [...s.past, s.marks], marks: s.future[0], future: s.future.slice(1) }));
  }
  function close() { if (!busyRef.current && !saving) dirty ? setConfirmClose(true) : onClose(); }
  function keyboard(event) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") {
      const container = confirmClose ? rootRef.current.querySelector(".ies-confirm") : rootRef.current;
      const controls = [...container.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')].filter((element) => element.offsetParent && !element.matches(":disabled"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
    if (event.target.closest("input, textarea, select")) return;
    if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.shiftKey || event.key.toLowerCase() === "y" ? redo() : undo();
    }
  }
  function point(event) { return imageEditPoint(event.clientX, event.clientY, surfaceRef.current.getBoundingClientRect()); }
  function pointerDown(event) {
    if (event.button !== 0 || busy || !size || dragRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const start = point(event);
    if (!reviewing && tool === "text" && !note.trim()) { setError("Enter a text note first, then place it on the image."); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    const mark = { tool: reviewing ? "hand" : tool, layer, color, opacity: opacity / 100, size: brushSize / 100, points: [start], text: note.slice(0, 500) };
    dragRef.current = { pointerId: event.pointerId, mark, clientX: event.clientX, clientY: event.clientY, pan };
    if (mark.tool !== "hand") setDraft(mark);
    setError("");
  }
  function pointerMove(event) {
    if (size) setCursor(point(event));
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (drag.mark.tool === "hand") { setPan({ x: drag.pan.x + event.clientX - drag.clientX, y: drag.pan.y + event.clientY - drag.clientY }); return; }
    const p = point(event);
    if (["pen", "eraser"].includes(drag.mark.tool)) {
      const last = drag.mark.points.at(-1);
      if (Math.hypot(last.x - p.x, last.y - p.y) < 0.0005 || drag.mark.points.length >= 12000) return;
      drag.mark = { ...drag.mark, points: [...drag.mark.points, p] };
    } else drag.mark = { ...drag.mark, points: [drag.mark.points[0], p] };
    setDraft(drag.mark);
  }
  function pointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mark.tool !== "hand" && event.type !== "pointercancel") commit([...history.marks, drag.mark]);
    dragRef.current = null; setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function renderLayer(targetLayer) {
    const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    drawImageEditMarks(ctx, history.marks, size.width, size.height, targetLayer);
    return imageEditHasPixels(ctx, size.width, size.height) ? blobOf(canvas) : null;
  }
  async function generate() {
    if (busyRef.current || !size || !providerAvailable) return;
    busyRef.current = true; setBusy(true); setError(""); setWarning("");
    try {
      imageEditSize(size.width, size.height);
      const drawing = await renderLayer("drawing"), selection = blank ? null : await renderLayer("selection");
      if (mode === "remove" && !selection) throw new Error("Paint a selection over the area to remove.");
      if (blank && !drawing) throw new Error("Draw a sketch first.");
      const form = new FormData();
      appendWorkflowContextFormFields(form, workflowContext);
      for (const [key, value] of Object.entries({ sourceUrl: base.url, requestId: crypto.randomUUID(), prompt, mode, quality, blank: String(blank), nodeId: item.editContext?.nodeId || "", nodeTitle: item.label || "Image Edit" })) form.append(key, value);
      if (drawing) form.append("drawing", drawing, "drawing.png");
      if (selection) form.append("selection", selection, "selection.png");
      const data = await nodeApi.editImage(form);
      if (!data.item?.url) throw new Error("The edit returned no image. Check History before running again.");
      setVersions((old) => [...old, { ...data.item, before: base.url }]);
      setResultIndex(versions.length); setView("split"); setSplit(50); setWarning(data.warning || "");
      notifyGenerationTaskComplete();
    } catch (failure) { setError(failure.message || "Image edit failed."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function accept(action) {
    if (busyRef.current || !result) return;
    busyRef.current = true; setSaving(true); setError("");
    try { await onAccept(item, result, action); onClose(); }
    catch (failure) { setError(failure.message || "Could not apply the edit."); }
    finally { busyRef.current = false; setSaving(false); }
  }
  function continueEditing() {
    setBase(result); setResultIndex(-1); setHistory(emptyHistory); setPrompt(""); setBlank(false); setMode("edit"); setError(""); setZoom(1); setPan({ x: 0, y: 0 });
  }
  const scale = size ? Math.min(1, (viewport.width - 40) / size.width, (viewport.height - 40) / size.height) : 1;
  const displaySize = size ? { width: size.width * scale, height: size.height * scale } : { width: 300, height: 300 };
  const previewScale = size ? Math.min(1, 1600 / Math.max(size.width, size.height)) : 1;
  const setActiveLayer = (value) => { setLayer(value); if (value === "selection" && ["text", "arrow"].includes(tool)) setTool("pen"); };

  return <section ref={rootRef} tabIndex={-1} className="image-edit-studio" aria-label="Image Edit" role="dialog" aria-modal="true" onKeyDownCapture={keyboard} onPointerDown={(event) => event.stopPropagation()}>
    <header className="ies-header"><span><Pencil size={18} /><strong>Image Edit</strong><small>{item.label || item.fileName || "Image"}</small></span><IconButton icon={X} label="Close image editor" onClick={close} disabled={busy || saving} /></header>
    <div className="ies-workspace">
      <div className="ies-main">
        <div className="ies-toolbar" role="toolbar" aria-label="Drawing tools">
          <div className="ies-segment" role="group" aria-label="Editing layer"><IconButton icon={Pencil} label="Drawing layer" active={layer === "drawing"} disabled={busy || reviewing} onClick={() => setActiveLayer("drawing")} /><IconButton icon={Scan} label="Selection layer" active={layer === "selection"} disabled={busy || reviewing || blank} onClick={() => setActiveLayer("selection")} /></div>
          {tools.map(([id, Icon, label]) => <IconButton key={id} icon={Icon} label={label} active={reviewing ? id === "hand" : tool === id} disabled={busy || (reviewing && id !== "hand") || (layer === "selection" && ["text", "arrow"].includes(id))} onClick={() => setTool(id)} />)}
          <div className="ies-divider" />
          <IconButton icon={Undo2} label="Undo stroke" onClick={undo} disabled={busy || reviewing || !history.past.length} /><IconButton icon={Redo2} label="Redo stroke" onClick={redo} disabled={busy || reviewing || !history.future.length} />
          <IconButton icon={Trash2} label="Clear active layer" onClick={() => commit(history.marks.filter((mark) => mark.layer !== layer))} disabled={busy || reviewing || !history.marks.some((mark) => mark.layer === layer)} />
        </div>
        <div className="ies-stage" ref={stageRef}>
          <div ref={surfaceRef} className={`ies-surface ${tool === "hand" || reviewing ? "panning" : ""}`} style={{ ...displaySize, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerLeave={() => setCursor(null)} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>
            <img src={reviewing ? result.before : base.url} alt="Original image" draggable={false} style={{ visibility: blank && !reviewing ? "hidden" : "visible" }} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError("Could not load the original full-resolution image.")} />
            {!reviewing && size && <><canvas ref={drawingRef} aria-label="Drawing canvas" width={Math.round(size.width * previewScale)} height={Math.round(size.height * previewScale)} /><canvas ref={selectionRef} aria-label="Selection canvas" className="ies-selection" width={Math.round(size.width * previewScale)} height={Math.round(size.height * previewScale)} /></>}
            {reviewing && view !== "original" && <img className="ies-result" src={result.url} alt="Edited result" draggable={false} style={{ clipPath: view === "split" ? `inset(0 0 0 ${split}%)` : undefined }} />}
            {reviewing && view === "split" && <div className="ies-split-line" style={{ left: `${split}%` }} />}
            {cursor && !reviewing && !busy && ["pen", "eraser"].includes(tool) && <div className="ies-brush-cursor" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, width: Math.max(3, brushSize / 100 * Math.min(displaySize.width, displaySize.height)), aspectRatio: "1", borderColor: tool === "eraser" ? "#fff" : layer === "selection" ? "#72efd8" : color }} />}
          </div>
          {busy && <div className="ies-progress" role="status"><LoaderCircle size={22} className="ies-spinning" /><span>Generating edit</span><time>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</time></div>}
          {!size && !error && <div className="ies-progress" role="status"><LoaderCircle className="ies-spinning" size={22} />Loading image</div>}
        </div>
        <div className="ies-viewbar">
          <span>{size ? `${size.width} x ${size.height}` : ""}</span>
          {reviewing && <div className="ies-review-controls"><div className="ies-segment">{["original", "split", "result"].map((value) => <button type="button" key={value} className={view === value ? "active" : ""} onClick={() => setView(value)}>{value === "split" ? "Compare" : value === "result" ? "Edit" : "Original"}</button>)}</div>{view === "split" && <input aria-label="Comparison split" type="range" min="0" max="100" value={split} onChange={(e) => setSplit(Number(e.target.value))} />}</div>}
          <div className="ies-zoom"><IconButton icon={Minus} label="Zoom out" onClick={() => setZoom((v) => Math.max(0.5, v - 0.25))} /><output>{Math.round(zoom * 100)}%</output><IconButton icon={Plus} label="Zoom in" onClick={() => setZoom((v) => Math.min(5, v + 0.25))} /><IconButton icon={Maximize} label="Fit image" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} /></div>
        </div>
      </div>
      <aside className="ies-sidebar">
        {!reviewing && <fieldset disabled={busy || saving}>
          <label>Method<select aria-label="Edit method" value={mode} onChange={(e) => { setMode(e.target.value); if (e.target.value !== "sketch") setBlank(false); if (e.target.value === "remove") { setActiveLayer("selection"); setTool("pen"); } }}><option value="edit">Edit image</option><option value="sketch">Render sketch</option><option value="remove">Remove selected</option></select></label>
          {mode === "sketch" && <label className="ies-checkbox"><input type="checkbox" checked={blank} onChange={(e) => { setBlank(e.target.checked); if (e.target.checked) setActiveLayer("drawing"); }} />Blank canvas</label>}
          <div className="ies-color-row" aria-label="Drawing color">{imageEditColors.map((value) => <button type="button" key={value} aria-label={`Color ${value}`} title={value} aria-pressed={color === value} className={`ies-swatch ${color === value ? "active" : ""}`} style={{ background: value }} onClick={() => setColor(value)} disabled={layer === "selection"} />)}<input aria-label="Custom drawing color" type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={layer === "selection"} /></div>
          <label className="ies-slider">{tool === "text" ? "Text size" : "Brush size"}<output>{brushSize.toFixed(1)}</output><input aria-label="Brush size" type="range" min="0.2" max="12" step="0.2" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /></label>
          <label className="ies-slider">Opacity<output>{opacity}%</output><input aria-label="Drawing opacity" type="range" min="10" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} disabled={layer === "selection"} /></label>
          {tool === "text" && <label>Text note<textarea aria-label="Text note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
          <label>Prompt<textarea className="ies-prompt" aria-label="Edit prompt" rows={5} maxLength={16000} placeholder={mode === "remove" ? "Additional direction (optional)" : "Describe the change..."} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          <label>Quality<select aria-label="Edit quality" value={quality} onChange={(e) => setQuality(e.target.value)}><option value="high">High</option><option value="xhigh">Extra High</option><option value="max">Maximum</option></select></label>
        </fieldset>}
        <div className="ies-run-section">
          <small>Image 2.5 Sunburst <span>{resultProvider === "fal.ai" ? "Fal" : resultProvider || providerLabel}</span></small>
          {!reviewing && <button className="ies-primary" type="button" onClick={generate} disabled={busy || !size || !providerAvailable || (mode === "remove" ? !hasSelection : !prompt.trim() && !(mode === "sketch" && hasDrawing))}><Brush size={17} />{busy ? "Generating..." : "Generate Edit"}</button>}
          {!reviewing && showApiCosts && <small className="ies-cost">Variable API cost</small>}
          {!providerAvailable && <p role="status" className="ies-warning">Enable Fal, or disable Krea and enable Atlas Cloud in Settings. Krea does not support masked edits.</p>}
        </div>
        {versions.length > 0 && <label>Versions<select aria-label="Edit version" value={resultIndex} disabled={busy || saving} onChange={(e) => { setResultIndex(Number(e.target.value)); setView("split"); }}><option value="-1">Current draft</option>{versions.map((version, i) => <option key={version.url} value={i}>Edit {i + 1}</option>)}</select></label>}
        {reviewing && <div className="ies-result-actions">
          <button className="ies-primary" type="button" disabled={saving} onClick={() => accept("copy")}><Plus size={17} />Add Image to Canvas</button>
          {canApply && <button type="button" disabled={saving} onClick={() => accept("apply")}><Check size={17} />Apply to Source</button>}
          <button type="button" disabled={saving} onClick={continueEditing}><Pencil size={17} />Continue Editing</button>
          <a href={result.url} download={result.fileName}><Download size={17} />Download</a>
        </div>}
        {error && <p className="ies-error" role="alert">{error}</p>}{warning && <p className="ies-warning" role="status">{warning}</p>}
      </aside>
    </div>
    {confirmClose && <div className="ies-confirm"><div role="alertdialog" aria-label="Discard edit draft"><h3>Discard this draft?</h3><p>Generated edits are kept in History. Unsaved drawing marks will be discarded.</p><div><button onClick={() => setConfirmClose(false)}>Keep Editing</button><button className="ies-primary" onClick={onClose}>Discard Draft</button></div></div></div>}
  </section>;
}
