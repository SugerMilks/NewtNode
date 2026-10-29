import React from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, Circle, Eraser, LoaderCircle, Minus, Pencil, Redo2, Square, Trash2, Type, Undo2, Upload, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { canvasToBlob } from "../canvasMedia.js";
import { drawImageEditMarks, imageEditPoint, imageEditColors } from "../imageEdit.js";
import { vectorLayoutSize, validateVectorMarks } from "../vectorGuidance.js";
import { drawFontSpecimen, readVectorGuideFile, renderVectorLayout, saveVectorGuide } from "../vectorGuideMedia.js";
import { loadVectorLocalFonts, vectorFontGroups, vectorGenericFonts } from "../vectorFonts.js";
import "./VectorGuidanceDialog.css";

const Button = ({ title, children, ...props }) => <button type="button" aria-label={title} title={title} {...props}>{children}</button>;
const drawingTools = [["pen", Pencil, "Pen"], ["eraser", Eraser, "Eraser"], ["line", Minus, "Line"], ["rectangle", Square, "Rectangle"], ["ellipse", Circle, "Ellipse"], ["arrow", ArrowUpRight, "Arrow"], ["text", Type, "Text label"]];

export default function VectorGuidanceDialog({ kind, value, lettering, aspectRatio, images, workflowContext, upload, onApply, onClose }) {
  const modal = React.useRef(null), alive = React.useRef(false), sequence = React.useRef(0), saveLock = React.useRef(false);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [dirty, setDirty] = React.useState(false);
  const prepare = React.useRef(null);
  React.useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    modal.current.showModal();
    return () => { alive.current = false; sequence.current += 1; previous?.focus?.(); };
  }, []);
  function close() {
    if (dirty && !window.confirm("Discard changes to this reference?")) return;
    onClose();
  }
  async function apply() {
    if (saveLock.current || !prepare.current) return;
    saveLock.current = true; setBusy(true); setError("");
    const token = ++sequence.current;
    try {
      const { blob, guide } = await prepare.current();
      if (!alive.current || token !== sequence.current) return;
      if (!blob && guide.url) { onApply(guide); return; }
      const url = await saveVectorGuide(blob, kind === "font" ? "vector-font-reference.png" : "vector-layout.png", workflowContext, upload);
      if (alive.current && token === sequence.current) onApply({ ...guide, url, enabled: true });
    } catch (e) { if (alive.current && token === sequence.current) setError(e.message); }
    finally { if (alive.current && token === sequence.current) { saveLock.current = false; setBusy(false); } }
  }
  return createPortal(<dialog ref={modal} className="vector-guide-dialog nodrag nowheel" aria-label={kind === "font" ? "Font Reference" : "Draw Layout"}
    onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
    onCancel={e => { e.preventDefault(); close(); }}>
    <header><h2>{kind === "font" ? "Font Reference" : "Draw Layout"}</h2><Button title="Close reference editor" onClick={close}><X size={18} /></Button></header>
    {kind === "font" ? <FontReference value={value} lettering={lettering} prepare={prepare} busy={busy} onDirty={() => setDirty(true)} onError={setError} />
      : <LayoutReference value={value} aspectRatio={aspectRatio} images={images} prepare={prepare} busy={busy} onDirty={() => setDirty(true)} onError={setError} />}
    {error && <p className="vg-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={close}>Cancel</button><button type="button" className="vg-apply" disabled={busy} onClick={apply}>{busy ? <LoaderCircle size={16} className="vg-spin" /> : <Check size={16} />} {busy ? "Saving..." : "Apply Reference"}</button></footer>
  </dialog>, document.body);
}

function FontReference({ value, lettering, prepare, busy, onDirty, onError }) {
  const input = React.useRef(null), canvas = React.useRef(null), font = React.useRef(null), epoch = React.useRef(0);
  const [source, setSource] = React.useState(value ? { kind: "saved", label: value.label, url: value.url } : { kind: "font", ...vectorGenericFonts[0], fontId: vectorGenericFonts[0].id });
  const [sample, setSample] = React.useState((value?.sample || lettering || "Aa Bb Cc Dd Ee Ff Gg\nABCDEFGHIJKLMNOPQRSTUVWXYZ\n0123456789").slice(0, 500));
  const [loading, setLoading] = React.useState(false);
  const [localFonts, setLocalFonts] = React.useState([]), [discovering, setDiscovering] = React.useState(true);
  React.useEffect(() => {
    const controller = new AbortController();
    loadVectorLocalFonts(undefined, { signal: controller.signal }).then(fonts => {
      if (!controller.signal.aborted) { setLocalFonts(fonts); setDiscovering(false); }
    });
    return () => controller.abort();
  }, []);
  React.useEffect(() => () => { epoch.current++; if (font.current) document.fonts.delete(font.current); }, []);
  React.useEffect(() => {
    if (source.kind === "font" && canvas.current) drawFontSpecimen(canvas.current, source.family, sample);
    return () => { if (source.kind === "image") URL.revokeObjectURL(source.url); };
  }, [source, sample]);
  // The editable font exists only in this dialog. Persist its rendered sample, never the font binary.
  prepare.current = async () => {
    if (loading) throw new Error("Wait for the font reference to finish loading.");
    if (source.kind === "saved") return { guide: value };
    if (source.kind === "font" && !sample.trim()) throw new Error("Enter some lettering for the font sample.");
    return { blob: source.kind === "image" ? source.blob : await canvasToBlob(canvas.current, "image/png"),
      guide: { label: source.label, kind: source.kind, sample: source.kind === "font" ? sample : "" } };
  };
  async function choose(file) {
    if (!file) return;
    const token = ++epoch.current; setLoading(true); onError("");
    try {
      const next = await readVectorGuideFile(file);
      if (token !== epoch.current) return;
      if (font.current) document.fonts.delete(font.current);
      font.current = next.face || null;
      if (next.face) document.fonts.add(next.face);
      setSource(next.kind === "image" ? { ...next, url: URL.createObjectURL(next.blob) } : next);
      onDirty();
    } catch (e) { if (token === epoch.current) onError(e.message); }
    finally { if (token === epoch.current) setLoading(false); }
  }
  function chooseTypeface(id) {
    const next = [...vectorGenericFonts, ...localFonts].find(option => option.id === id);
    if (!next) return;
    if (font.current) document.fonts.delete(font.current);
    font.current = next.face || null;
    if (next.face) document.fonts.add(next.face);
    setSource({ kind: "font", family: next.family, label: next.label, fontId: next.id });
    onError(""); onDirty();
  }
  return <div className="vg-font">
    <div className="vg-font-tools">
      <button type="button" disabled={busy || loading} title="Upload a PNG/JPEG/WebP sample or a TTF/OTF/WOFF font up to 10 MB. Font files stay in this browser; only a rendered sample is saved and sent. Exact font reproduction is not guaranteed." onClick={() => input.current.click()}><Upload size={16} />{loading ? "Loading..." : "Choose Image or Font"}</button>
      <input ref={input} hidden type="file" aria-label="Font reference file" accept=".png,.jpg,.jpeg,.webp,.ttf,.otf,.woff,.woff2" onChange={e => { choose(e.target.files[0]); e.target.value = ""; }} />
      <select aria-label="Sample typeface" aria-busy={discovering} disabled={busy || loading || discovering} value={source.fontId || "custom"}
        title={discovering ? "Checking available fonts..." : "Fonts available on this computer. Missing Mac fonts can be enabled in Font Book. Only the rendered sample is saved; font files are never shared."}
        onChange={e => chooseTypeface(e.target.value)}>
        <option value="custom" disabled>Uploaded reference</option>
        <optgroup label="System Defaults">{vectorGenericFonts.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
        {vectorFontGroups.map(group => {
          const fonts = localFonts.filter(option => option.group === group.label);
          return fonts.length > 0 && <optgroup key={group.label} label={group.label}>{fonts.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>;
        })}
      </select>
    </div>
    <div className="vg-font-preview">{source.kind === "font" ? <canvas ref={canvas} width={1536} height={768} aria-label="Font sample preview" /> : <img src={source.url} alt="Font reference preview" />}</div>
    <label title={source.kind === "saved" ? "The saved sample is ready to use. Choose the font file again to render different sample lettering; font files are not stored in the project." : "Sample words guide letter shapes only. The node's Lettering field controls the words in the generated artwork."}>Sample lettering<textarea aria-label="Font sample lettering" rows={3} maxLength={500} value={sample} disabled={source.kind !== "font" || busy || loading} onChange={e => { setSample(e.target.value); onDirty(); }} /></label>
    <div className="vg-file-label" title={source.label}>{source.label}</div>
  </div>;
}

function LayoutReference({ value, aspectRatio, images, prepare, busy, onDirty, onError }) {
  const size = React.useMemo(() => value ? { width: value.width, height: value.height } : vectorLayoutSize(aspectRatio, images[0]), []);
  const [history, setHistory] = React.useState({ past: [], marks: value?.marks || [], future: [] });
  const historyRef = React.useRef(history); historyRef.current = history;
  const [background, setBackground] = React.useState(value?.backgroundUrl || "");
  const [tool, setTool] = React.useState("pen"), [color, setColor] = React.useState("#191919"), [brush, setBrush] = React.useState(1), [opacity, setOpacity] = React.useState(100), [note, setNote] = React.useState("");
  const [zoom, setZoom] = React.useState(1), [viewport, setViewport] = React.useState({ width: 600, height: 480 });
  const stage = React.useRef(null), canvas = React.useRef(null), drag = React.useRef(null);
  const choices = [...(value?.backgroundUrl ? [{ url: value.backgroundUrl, label: value.backgroundLabel }] : []), ...images].filter((image, index, list) => image?.url && list.findIndex(other => other.url === image.url) === index);
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  const paint = marks => { if (canvas.current) drawImageEditMarks(canvas.current.getContext("2d"), marks, size.width, size.height); };
  React.useEffect(() => { paint(history.marks); }, [history.marks]);
  function commit(marks) {
    try { validateVectorMarks(marks); }
    catch (e) { onError(e.message); paint(historyRef.current.marks); return; }
    const current = historyRef.current;
    const next = { past: [...current.past.slice(-49), current.marks], marks, future: [] };
    historyRef.current = next; setHistory(next); onError(""); onDirty();
  }
  function undo(redo = false) {
    if (busy || drag.current) return;
    const current = historyRef.current;
    if (!(redo ? current.future.length : current.past.length)) return;
    const next = redo ? { past: [...current.past, current.marks], marks: current.future[0], future: current.future.slice(1) }
      : { past: current.past.slice(0, -1), marks: current.past.at(-1), future: [current.marks, ...current.future] };
    historyRef.current = next; setHistory(next); onError(""); onDirty();
  }
  function begin(e) {
    if (busy || e.button !== 0 || drag.current) return;
    e.preventDefault(); e.currentTarget.focus();
    if (tool === "text" && !note.trim()) { onError("Enter a text label before placing it."); return; }
    const point = imageEditPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    const mark = { tool, layer: "drawing", color, size: brush / 100, opacity: opacity / 100, points: [point], ...(tool === "text" ? { text: note } : {}) };
    if (tool === "text") { commit([...historyRef.current.marks, mark]); return; }
    drag.current = { mark, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId);
    paint([...historyRef.current.marks, mark]);
  }
  function move(e) {
    const active = drag.current; if (!active || e.pointerId !== active.id) return;
    const p = imageEditPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    const old = active.mark.points, last = old.at(-1);
    if (["pen", "eraser"].includes(active.mark.tool)) {
      if (Math.hypot(p.x - last.x, p.y - last.y) < .001 || old.length >= 3000) return;
      active.mark = { ...active.mark, points: [...old, p] };
    } else active.mark = { ...active.mark, points: [old[0], p] };
    paint([...historyRef.current.marks, active.mark]);
  }
  function end(e, canceled = false) {
    const active = drag.current; if (!active || e.pointerId !== active.id) return;
    drag.current = null;
    if (canceled) paint(historyRef.current.marks); else commit([...historyRef.current.marks, active.mark]);
  }
  prepare.current = async () => {
    if (drag.current) throw new Error("Finish your drawing stroke before saving.");
    const guide = { ...size, label: "Drawn layout", marks: historyRef.current.marks, backgroundUrl: background, backgroundLabel: choices.find(image => image.url === background)?.label || "" };
    return { guide, blob: await renderVectorLayout(guide) };
  };
  const fit = Math.max(.05, Math.min((viewport.width - 40) / size.width, (viewport.height - 40) / size.height));
  return <div className="vg-layout" onKeyDown={e => {
    if (e.target.closest("input, textarea, select")) return;
    if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) { e.preventDefault(); undo(e.shiftKey || e.key.toLowerCase() === "y"); }
  }}>
    <div className="vg-tools" role="toolbar" aria-label="Layout drawing tools">
      {drawingTools.map(([id, Icon, label]) => <Button key={id} title={label} aria-pressed={tool === id} disabled={busy} onClick={() => setTool(id)}><Icon size={17} /></Button>)}
      <span className="vg-divider" />
      <Button title="Undo stroke" disabled={busy || !history.past.length} onClick={() => undo()}><Undo2 size={17} /></Button>
      <Button title="Redo stroke" disabled={busy || !history.future.length} onClick={() => undo(true)}><Redo2 size={17} /></Button>
      <Button title="Clear drawing" disabled={busy || !history.marks.length} onClick={() => commit([])}><Trash2 size={17} /></Button>
    </div>
    <div className="vg-layout-options">
      <label>Background<select aria-label="Layout background" disabled={busy} value={background} onChange={e => { setBackground(e.target.value); onDirty(); }}><option value="">Blank</option>{choices.map(image => <option key={image.url} value={image.url}>{image.label || "Reference image"}</option>)}</select></label>
      <label>{tool === "text" ? "Text size" : "Brush size"}<input aria-label="Drawing size" type="range" min="0.2" max="8" step="0.2" disabled={busy} value={brush} onChange={e => setBrush(Number(e.target.value))} /></label>
      <label>Opacity<input aria-label="Drawing opacity" type="range" min="10" max="100" step="5" disabled={busy} value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></label>
    </div>
    <div className="vg-colors">{imageEditColors.map(c => <button type="button" key={c} aria-label={`Drawing color ${c}`} title={c} aria-pressed={color === c} disabled={busy} style={{ backgroundColor: c }} onClick={() => setColor(c)} />)}<input aria-label="Custom drawing color" title="Custom color" type="color" value={color} disabled={busy} onChange={e => setColor(e.target.value)} /></div>
    {tool === "text" && <input className="vg-note" aria-label="Drawing text label" maxLength={200} placeholder="Layout label" value={note} disabled={busy} onChange={e => setNote(e.target.value)} />}
    <div className="vg-stage" ref={stage}>
      <div className="vg-artboard" style={{ width: size.width * fit * zoom, height: size.height * fit * zoom }}>
        {background && <img src={background} alt="Layout background" draggable={false} onError={() => onError("The background could not be loaded. Choose another reference or Blank.")} />}
        <canvas ref={canvas} width={size.width} height={size.height} tabIndex={0} aria-label="Layout drawing canvas" style={{ cursor: tool === "text" ? "text" : "crosshair" }} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)} />
      </div>
    </div>
    <div className="vg-zoom"><span>{size.width} x {size.height}</span><Button title="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(z => Math.max(.5, z - .25))}><ZoomOut size={17} /></Button><Button title="Fit layout" onClick={() => setZoom(1)}><Maximize size={17} /></Button><Button title="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + .25))}><ZoomIn size={17} /></Button></div>
  </div>;
}
