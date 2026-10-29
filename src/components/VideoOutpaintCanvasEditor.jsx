import React from "react";
import { X, Play, Pause, RotateCcw, Maximize, Magnet, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { displayMediaUrl } from "../mediaAssets.js";
import { defaultOutpaintFrame, dragOutpaintFrame, normalizeOutpaintFrame, outpaintRatio, snapOutpaintFrame } from "../videoOutpaintFrame.js";
import "./VideoOutpaintCanvasEditor.css";

function workspace(frame, dimensions, ratio) {
  const sourceHeight = dimensions.height / dimensions.width;
  const margin = Math.max(1, frame.width, sourceHeight) * 0.22;
  const x = Math.min(0, frame.x) - margin, y = Math.min(0, frame.y) - margin;
  return { x, y, width: Math.max(1, frame.x + frame.width) + margin - x, height: Math.max(sourceHeight, frame.y + frame.width / ratio) + margin - y };
}

export default function VideoOutpaintCanvasEditor({ sourceUrl, settings, onApply, onClose, snapEnabled = true, onSnapChange }) {
  const dialog = React.useRef(null), stage = React.useRef(null), video = React.useRef(null), drag = React.useRef(null);
  const [dimensions, setDimensions] = React.useState(null);
  const [frame, setFrame] = React.useState(settings.frame);
  const [view, setView] = React.useState(null);
  const [time, setTime] = React.useState(settings.start);
  const [duration, setDuration] = React.useState(0);
  const [error, setError] = React.useState("");
  const [playing, setPlaying] = React.useState(false);
  const [snap, setSnap] = React.useState(snapEnabled);
  const [guides, setGuides] = React.useState({ x: null, y: null });
  const ratio = outpaintRatio(settings.aspectRatio);
  const latestFrame = React.useRef(frame); latestFrame.current = frame;
  React.useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { video.current?.pause(); previous?.focus?.(); };
  }, []);
  function update(next, fit = false) {
    const normalized = normalizeOutpaintFrame(next);
    setFrame(normalized); latestFrame.current = normalized;
    if (fit && dimensions) setView(workspace(normalized, dimensions, ratio));
  }
  function loaded(event) {
    const element = event.currentTarget;
    const size = { width: element.videoWidth, height: element.videoHeight };
    if (!size.width || !size.height) return;
    const next = normalizeOutpaintFrame(settings.frame) || defaultOutpaintFrame(size, settings.aspectRatio);
    setDimensions(size); setFrame(next); latestFrame.current = next;
    setView(workspace(next, size, ratio)); setDuration(element.duration);
    element.currentTime = Math.min(settings.start, element.duration || settings.start);
  }
  function begin(event, handle) {
    if (event.button !== 0 || !frame || !view) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = stage.current.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, frame, view, pixels: bounds.width / view.width, handle };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const start = drag.current; if (!start) return;
    const next = dragOutpaintFrame(start.frame, start.handle, (event.clientX - start.x) / start.pixels, (event.clientY - start.y) / start.pixels, settings.aspectRatio);
    if (snap && !event.altKey) {
      const snapped = snapOutpaintFrame(next, start.handle, settings.aspectRatio, dimensions, { threshold: 8 / start.pixels, previous: start.snap });
      start.snap = snapped.state; setGuides(snapped.guides); update(snapped.frame);
    } else { start.snap = null; setGuides({ x: null, y: null }); update(next); }
  }
  function end() {
    if (drag.current) { drag.current = null; setGuides({ x: null, y: null }); setView(workspace(latestFrame.current, dimensions, ratio)); }
  }
  function keyboard(event, handle = "move") {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const step = (event.shiftKey ? 10 : 1) / dimensions.width;
    update(dragOutpaintFrame(frame, handle, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0, settings.aspectRatio), true);
  }
  const endTime = Math.min(duration || Infinity, settings.start + settings.duration);
  function apply() {
    const sourceHeight = dimensions.height / dimensions.width;
    if (frame.x >= 1 || frame.x + frame.width <= 0 || frame.y >= sourceHeight || frame.y + frame.width / ratio <= 0) { setError("Move the frame so it overlaps the video."); return; }
    onApply(frame);
  }
  return createPortal(<dialog ref={dialog} className="outpaint-canvas-dialog nodrag nowheel" aria-label="Outpainting canvas editor" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <div className="outpaint-canvas-heading"><h2>Canvas Edit <small>{settings.aspectRatio}</small></h2><button type="button" onClick={onClose} aria-label="Close canvas editor" title="Close"><X size={18} /></button></div>
    {!dimensions && !error && <p>Loading source video…</p>}
    <div ref={stage} className="outpaint-canvas-stage" style={view ? { aspectRatio: view.width / view.height, "--view-aspect": view.width / view.height } : { aspectRatio: "16 / 9" }}>
      <video ref={video} src={displayMediaUrl(sourceUrl)} muted playsInline preload="auto" onLoadedMetadata={loaded} onError={() => setError("Could not load the source video.")}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={event => { setTime(event.currentTarget.currentTime); if (event.currentTarget.currentTime >= endTime) event.currentTarget.pause(); }}
        style={view && dimensions ? { left: `${-view.x / view.width * 100}%`, top: `${-view.y / view.height * 100}%`, width: `${100 / view.width}%`, height: `${dimensions.height / dimensions.width / view.height * 100}%` } : { visibility: "hidden" }} />
      {frame && view && <div className="outpaint-canvas-region" role="group" aria-label="Outpainting crop region" tabIndex={0}
        style={{ left: `${(frame.x - view.x) / view.width * 100}%`, top: `${(frame.y - view.y) / view.height * 100}%`, width: `${frame.width / view.width * 100}%`, height: `${frame.width / ratio / view.height * 100}%` }}
        onPointerDown={event => begin(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event => keyboard(event)}>
        <span className="outpaint-frame-caption">{settings.aspectRatio} output</span>
        {["nw", "ne", "sw", "se"].map(handle => <button key={handle} type="button" className={`outpaint-canvas-handle ${handle}`} aria-label={`Resize outpainting frame ${handle}`} onPointerDown={event => begin(event, handle)} onKeyDown={event => keyboard(event, handle)} />)}
      </div>}
      {view && guides.x !== null && <div className="outpaint-snap-guide vertical" aria-label="Vertical snap guide" style={{ left: `${(guides.x - view.x) / view.width * 100}%` }} />}
      {view && guides.y !== null && <div className="outpaint-snap-guide horizontal" aria-label="Horizontal snap guide" style={{ top: `${(guides.y - view.y) / view.height * 100}%` }} />}
    </div>
    <div className="outpaint-canvas-toolbar">
      <button type="button" disabled={!dimensions} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={() => { const element = video.current; if (element.paused) { if (element.currentTime >= endTime) element.currentTime = settings.start; element.play().catch(() => {}); } else element.pause(); }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <input aria-label="Canvas preview time" type="range" min={settings.start} max={Math.max(settings.start, endTime)} step="0.01" value={time} disabled={!dimensions} onChange={event => { video.current.pause(); video.current.currentTime = Number(event.target.value); setTime(Number(event.target.value)); }} />
      <button type="button" disabled={!dimensions} aria-label="Reset framing" title="Reset framing" onClick={() => update(defaultOutpaintFrame(dimensions, settings.aspectRatio), true)}><RotateCcw size={18} /></button>
      <button type="button" disabled={!dimensions} aria-label="Fit workspace" title="Fit workspace" onClick={() => setView(workspace(frame, dimensions, ratio))}><Maximize size={18} /></button>
      <label className="outpaint-snap-toggle" title="Snap to clip edges and center. Hold Alt to bypass."><input aria-label="Snap canvas frame" type="checkbox" checked={snap} onChange={event => { setSnap(event.target.checked); setGuides({ x: null, y: null }); onSnapChange?.(event.target.checked); }} /><Magnet size={18} /></label>
    </div>
    {dimensions && frame && <div className="outpaint-canvas-fields">
      {[["x", "Left"], ["y", "Top"], ["width", "Width"]].map(([key, label]) => <label key={key}>{label} (px)<input aria-label={`Canvas frame ${label.toLowerCase()} pixels`} type="number" step="1" value={Number((frame[key] * dimensions.width).toFixed(1))} onChange={event => update({ ...frame, [key]: Number(event.target.value) / dimensions.width }, true)} /></label>)}
      <label>Height (px)<input aria-label="Canvas frame height pixels" readOnly value={Number((frame.width / ratio * dimensions.width).toFixed(1))} /></label>
    </div>}
    {error && <p role="alert">{error}</p>}
    <div className="outpaint-canvas-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!dimensions || !frame} onClick={apply}><Check size={16} /> Apply & prepare</button></div>
  </dialog>, document.body);
}
