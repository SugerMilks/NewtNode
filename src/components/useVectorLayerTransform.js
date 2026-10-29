import React from "react";
import { vectorGestureTransform } from "../vectorLayerTransforms.js";
import { vectorSnapMove } from "../vectorArtwork.js";

const pixels = (box, doc) => ({ left: box.left * doc.width / 100, top: box.top * doc.height / 100, width: box.width * doc.width / 100, height: box.height * doc.height / 100 });
const percent = (box, doc) => ({ left: box.left / doc.width * 100, top: box.top / doc.height * 100, width: box.width / doc.width * 100, height: box.height / doc.height * 100 });

export function useVectorLayerTransform({ stage, doc, renderer, keys, outline, enabled, failed, onCommit, onError, snapTargets = [], snapEnabled = false, rootKey = "" }) {
  const gesture = React.useRef(null), frame = React.useRef(null), suppressClick = React.useRef(false), latest = React.useRef(null);
  const [draft, setDraft] = React.useState(null), [active, setActive] = React.useState(false), [preview, setPreview] = React.useState(null);
  latest.current = { enabled, onCommit, onError };
  const selection = JSON.stringify(keys);
  function clearFrame() { if (frame.current != null) cancelAnimationFrame(frame.current); frame.current = null; }
  function release(current) {
    gesture.current = null; clearFrame(); setActive(false);
    if (current && stage.current?.hasPointerCapture(current.id)) stage.current.releasePointerCapture(current.id);
  }
  function cancel() {
    const current = gesture.current;
    if (!current) { setDraft(null); return false; }
    suppressClick.current = true; release(current); setDraft(null); return true;
  }
  function cancelPointer() { if (gesture.current) cancel(); }
  React.useEffect(() => {
    cancel(); setDraft(null);
  }, [doc?.svg, selection, rootKey]);
  React.useEffect(() => { if (failed) cancel(); }, [failed]);
  React.useEffect(() => {
    const abort = () => cancel(); window.addEventListener("blur", abort);
    return () => { window.removeEventListener("blur", abort); clearFrame(); gesture.current = null; };
  }, []);
  React.useEffect(() => {
    if (!draft?.svg) { setPreview(null); return; }
    const url = URL.createObjectURL(new Blob([draft.svg], { type: "image/svg+xml" }));
    setPreview({ svg: draft.svg, url }); return () => URL.revokeObjectURL(url);
  }, [draft?.svg]);
  function result(current) {
    const dx = (current.x - current.startX) * current.doc.width / current.rect.width;
    const dy = (current.y - current.startY) * current.doc.height / current.rect.height;
    const value = vectorGestureTransform(current.box, current.handle, dx, dy, { free: current.shift, center: current.alt });
    if (current.snap && !current.handle && !current.alt) {
      const snap = vectorSnapMove(value.box, current.targets, 7 * current.doc.width / current.rect.width);
      value.matrix.e += snap.dx; value.matrix.f += snap.dy; value.box.left += snap.dx; value.box.top += snap.dy; value.guides = snap.guides;
    }
    return { ...value, svg: current.renderer.transformedSvg(current.keys, value.matrix, current.rootKey) };
  }
  function paint(current) {
    if (gesture.current !== current || !current.moved) return;
    try { const value = result(current); setDraft({ svg: value.svg, box: percent(value.box, current.doc), guides: value.guides, rootKey: current.rootKey }); }
    catch (error) { cancel(); latest.current.onError(error.message); }
  }
  function start(event, handle = null) {
    if (!enabled || !outline || !renderer || event.button !== 0 || gesture.current) return;
    if (!handle && (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)) return;
    const rect = stage.current.getBoundingClientRect(), box = pixels(outline, doc);
    const x = (event.clientX - rect.left) / rect.width * doc.width, y = (event.clientY - rect.top) / rect.height * doc.height;
    if (!handle && (x < box.left || y < box.top || x > box.left + box.width || y > box.top + box.height)) return;
    event.preventDefault(); event.stopPropagation(); stage.current.focus({ preventScroll: true });
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, rect, doc, renderer, keys: [...keys], box, handle, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, moved: false, shift: event.shiftKey, alt: event.altKey, targets: snapTargets, snap: snapEnabled, rootKey };
    stage.current.setPointerCapture(event.pointerId); setActive(true);
  }
  function move(event) {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    Object.assign(current, { x: event.clientX, y: event.clientY, shift: event.shiftKey, alt: event.altKey });
    current.moved ||= Math.hypot(current.x - current.startX, current.y - current.startY) >= 3;
    if (frame.current == null) frame.current = requestAnimationFrame(() => { frame.current = null; paint(current); });
  }
  function end(event) {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return;
    event.stopPropagation(); clearFrame();
    Object.assign(current, { x: event.clientX, y: event.clientY, shift: event.shiftKey, alt: event.altKey });
    try {
      if (current.moved && latest.current.enabled) {
        const value = result(current);
        setDraft({ svg: value.svg, box: percent(value.box, current.doc), rootKey: current.rootKey });
        suppressClick.current = true;
        latest.current.onCommit({ type: "transform", keys: current.keys, matrix: value.matrix });
      }
    } catch (error) { setDraft(null); latest.current.onError(error.message); }
    finally { release(current); }
  }
  function consumeClick() { const suppressed = suppressClick.current; suppressClick.current = false; return suppressed; }
  function nudge(event, handle = null) {
    if (!enabled || !outline || gesture.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return false;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    try {
      const value = vectorGestureTransform(pixels(outline, doc), handle, dx, dy, { free: event.shiftKey, center: event.altKey });
      const svg = renderer.transformedSvg(keys, value.matrix, rootKey);
      setDraft({ svg, box: percent(value.box, doc), rootKey }); onCommit({ type: "transform", keys, matrix: value.matrix });
    } catch (error) { onError(error.message); }
    return true;
  }
  return { active, previewUrl: draft?.rootKey === rootKey && draft?.svg === preview?.svg ? preview?.url || "" : "", guides: active ? draft?.guides : null, outline: draft?.box || outline, start, move, end, cancel, cancelPointer, consumeClick, nudge };
}
