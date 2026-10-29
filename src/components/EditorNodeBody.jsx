import React from "react";
import { Slice, Play, Pause, Camera, Undo2, Redo2, Magnet, Link2, Unlink2, Lock, Unlock, Eye, EyeOff, Volume2, VolumeX,
  Plus, Trash2, Copy, ZoomIn, ZoomOut, Scan, MonitorPlay, Settings2, Download, Loader2, X, ChevronFirst, ChevronLast, Brackets } from "lucide-react";
import { PortHandle } from "./NodePorts.jsx";
import { EditorMonitor } from "./EditorMonitor.jsx";
import { EditorTimelineScrollbar, useEditorTimelineViewport } from "./EditorTimelineViewport.jsx";
import { editorTrackHeaderWidth } from "../editorViewport.js";
import { editorPlayback } from "../editorPlayback.js";
import { editorApi } from "../api/newtApi.js";
import { chooseEditorExportPath } from "../editorExport.js";
import { appendResultItems } from "../mediaResults.js";
import { setOutputItemDragData, outputItemFromDataTransfer, hasOutputItemDragData, finishOutputItemDragData } from "../mediaAssets.js";
import { notifyGenerationTaskComplete } from "../generationChime.js";
import { normalizeEditorNodeWidth } from "../nodeGeometry.js";
import { editorTimelineZoomDirection } from "../nodeKeyboardRouting.js";
import { createEditorTimeline, normalizeEditorTimeline, editorEnd, editorRange, editorTimecode, editorImportMedia, editorAddTrack,
  editorSelection, editorMove, editorTrim, editorSplit, editorDelete, editorDuplicate, editorUnlink, editorSnap, editorSetFrameRate,
  editorFrameRates, editorId, clampEditor, editorRenderSignature, editorClipboardMime, editorCopyClips, editorPasteClips,
  editorEditPoint, editorGapAt, editorRippleDeleteGap, normalizeEditorZoom, editorZoomStep } from "../editorTimeline.js";
import "../editorTimeline.css";

function Tool({ icon: Icon, label, active = false, ...props }) {
  return <button type="button" className={`editor-tool ${active ? "active" : ""}`} title={label} aria-label={label} {...props}><Icon size={17} /></button>;
}

function Waveform({ asset, clip, fps }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    const draw = () => {
      const width = Math.max(1, canvas.clientWidth), height = 26;
      canvas.width = Math.ceil(width * 2); canvas.height = height * 2;
      const ctx = canvas.getContext("2d"); ctx.scale(2, 2); ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#e8b77e";
      const start = clip.sourceIn / fps / asset.duration, span = clip.duration / fps / asset.duration;
      for (let x = 0; x < width; x += 3) {
        const i = clampEditor(Math.floor((start + x / width * span) * asset.waveform.length), 0, asset.waveform.length - 1);
        const h = Math.max(1, Math.sqrt(asset.waveform[i] || 0) * height);
        ctx.fillRect(x, (height - h) / 2, 2, h);
      }
    };
    const observer = new ResizeObserver(draw); observer.observe(canvas); draw(); return () => observer.disconnect();
  }, [asset, clip, fps]);
  return <canvas ref={ref} className="editor-waveform" aria-hidden="true" />;
}

export function EditorNodeBody({ node, config, sources = [], workflowContext = {}, onUpdate, onUndoSnapshot, onPreviewOpen,
  onConnectStart, onDisconnectInput, connectedPortKeys = new Set(), api = editorApi, chooseExportPath = chooseEditorExportPath }) {
  const saved = React.useMemo(() => normalizeEditorTimeline(node.data.editorTimeline || createEditorTimeline()), [node.data.editorTimeline]);
  const [draft, setDraft] = React.useState(null), [selection, setSelection] = React.useState([]), [error, setError] = React.useState("");
  const [gap, setGap] = React.useState(null), [gapMenu, setGapMenu] = React.useState(null);
  const [importing, setImporting] = React.useState(false), [retry, setRetry] = React.useState(0), [, setHistoryRevision] = React.useState(0);
  const [settings, setSettings] = React.useState(false), [monitor, setMonitor] = React.useState(false), [snap, setSnap] = React.useState(true), [linked, setLinked] = React.useState(true);
  const [progress, setProgress] = React.useState(0);
  const zoom = normalizeEditorZoom(node.data.editorZoom);
  const [choosingExport, setChoosingExport] = React.useState(false), [savedExportPath, setSavedExportPath] = React.useState("");
  const root = React.useRef(null), scroller = React.useRef(null), gesture = React.useRef(null), undo = React.useRef([]), redo = React.useRef([]);
  const importingRef = React.useRef(false), exportStarting = React.useRef(false), attempted = React.useRef(new Set()), mounted = React.useRef(false);
  const volumeEdit = React.useRef(null);
  const player = React.useMemo(() => editorPlayback(node.id), [node.id]);
  const transport = React.useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const timeline = draft || saved, latest = React.useRef({});
  latest.current = { node, saved, sources, workflowContext, onUpdate, onUndoSnapshot, onPreviewOpen };
  const range = editorRange(timeline), end = editorEnd(timeline), px = zoom / timeline.fps;
  const job = node.data.editorExportJob, exporting = Boolean(job);
  const selected = editorSelection(timeline, selection, linked), selectedLocked = selected.some(c => timeline.tracks.find(t => t.id === c.trackId)?.locked);
  const linkedLocked = editorSelection(timeline, selection, true).some(c => timeline.tracks.find(t => t.id === c.trackId)?.locked);
  const currentClip = timeline.clips.find(c => c.id === selection[0]), currentAsset = timeline.assets.find(a => a.id === currentClip?.assetId);
  const canUndo = undo.current.length > 0, canRedo = redo.current.length > 0;
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find(s => s * zoom >= 85) || 600;
  const scrollId = React.useId();
  const { viewport, scrollTo, prepareFit } = useEditorTimelineViewport({ scroller, zoom, fps: timeline.fps, frame: transport.frame, contentEnd: end });
  // One viewport of empty tail allows playhead-anchored zoom even on a short sequence.
  const tail = Math.max(timeline.fps * 4, Math.ceil((viewport.viewportWidth - editorTrackHeaderWidth) / px));
  const contentFrames = Math.max(Math.ceil(840 / px), end + tail), contentWidth = contentFrames * px;

  React.useEffect(() => {
    mounted.current = true; player.mount(); player.setTimeline(latest.current.saved); player.seek(latest.current.node.data.editorPlayhead || 0);
    return () => { mounted.current = false; player.dispose(); };
  }, [player]);
  React.useEffect(() => { player.setTimeline(timeline); }, [player, timeline]);
  React.useEffect(() => {
    if (!transport.playing && !transport.buffering && transport.frame !== (node.data.editorPlayhead || 0)) onUpdate(node.id, { editorPlayhead: transport.frame });
  }, [transport.playing, transport.buffering, transport.frame]);

  function commit(next, remember = true) {
    const previous = latest.current.saved;
    next = normalizeEditorTimeline(next);
    if (JSON.stringify(previous) === JSON.stringify(next)) { setDraft(null); return; }
    if (remember) { undo.current.push(previous); if (undo.current.length > 80) undo.current.shift(); redo.current = []; latest.current.onUndoSnapshot?.(); }
    latest.current.saved = next;
    const changed = editorRenderSignature(next) !== editorRenderSignature(previous);
    const data = latest.current.node.data;
    const matchingExport = data.editorExportTimeline && editorRenderSignature(normalizeEditorTimeline(data.editorExportTimeline)) === editorRenderSignature(next);
    latest.current.onUpdate(node.id, { editorTimeline: next, ...(changed ? { resultUrl: matchingExport ? data.resultItems?.at(-1)?.url || "" : "", error: "" } : {}) });
    setDraft(null); setGap(null); setGapMenu(null); setError(""); setHistoryRevision(v => v + 1);
  }
  function perform(action) { try { player.pause(); commit(action(latest.current.saved)); } catch (failure) { setError(failure.message); } }
  function history(back = true) {
    const from = back ? undo.current : redo.current, to = back ? redo.current : undo.current;
    if (!from.length || gesture.current) return;
    to.push(latest.current.saved); commit(from.pop(), false); setSelection([]);
  }
  async function importSource(item, key) {
    const context = latest.current.workflowContext;
    const data = await api.media({ ...context, url: item.url, type: item.type, nodeId: node.id });
    if (!mounted.current) return;
    const connected = key.startsWith("drop:") || latest.current.sources.some(s => s.key === key);
    if (!connected) return;
    commit(editorImportMedia(latest.current.saved, { ...data, label: item.label || "Media" }, key));
    if (data.warning) setError(data.warning);
  }
  const sourceSignature = JSON.stringify(sources.map(s => [s.key, s.url, s.label]));
  React.useEffect(() => {
    if (importingRef.current) return;
    const pending = sources.filter(s => s.url && !saved.imports.includes(s.key) && !attempted.current.has(s.key));
    if (!pending.length) return;
    importingRef.current = true; setImporting(true);
    void (async () => {
      for (const item of pending) {
        if (!mounted.current) break;
        attempted.current.add(item.key);
        try { await importSource(item, item.key); }
        catch (failure) { if (mounted.current) setError(`${item.label || "Media"}: ${failure.message}`); }
      }
      importingRef.current = false;
      if (mounted.current) { setImporting(false); setRetry(v => v + 1); }
    })();
  }, [sourceSignature, saved.imports, retry]);

  React.useEffect(() => {
    if (!job?.id) return;
    let canceled = false, timer, failures = 0;
    const poll = async () => {
      try {
        const state = await api.job(job.id);
        if (canceled || !mounted.current) return;
        failures = 0; setProgress(state.progress || 0);
        if (state.status === "running") { timer = setTimeout(poll, 1000); return; }
        if (state.status !== "complete" || !state.result?.url) {
          setError(state.error || "Export did not complete."); onUpdate(node.id, { editorExportJob: null, status: "error", error: state.error || "Export did not complete." }); return;
        }
        const data = latest.current.node.data, result = { ...state.result, label: job.frame == null ? `${data.title || "Editor"} export` : `Still ${editorTimecode(job.frame, job.fps)}` };
        if (job.frame == null) {
          setSavedExportPath(state.savedFilePath || "");
          const items = appendResultItems(data.resultItems || [], [result], "video");
          onUpdate(node.id, { editorExportJob: null, status: "complete", error: "", resultItems: items,
            resultType: "video", selectedResultIndex: items.length - 1,
            resultUrl: editorRenderSignature(latest.current.saved) === editorRenderSignature(job.timeline) ? result.url : "",
            editorExportTimeline: job.timeline });
        } else {
          const stills = appendResultItems(data.editorStills || [], [result], "image");
          onUpdate(node.id, { editorExportJob: null, status: "complete", error: "", editorStills: stills });
          latest.current.onPreviewOpen?.(result);
        }
        if (state.warning) setError(state.warning);
        notifyGenerationTaskComplete();
      } catch (failure) {
        if (canceled || !mounted.current) return;
        setError(failure.message);
        if (/no longer available/.test(failure.message)) {
          onUpdate(node.id, { editorExportJob: null, status: "error", error: failure.message }); return;
        }
        failures++; timer = setTimeout(poll, Math.min(15000, 2500 * failures));
      }
    };
    void poll();
    return () => { canceled = true; clearTimeout(timer); };
  }, [job?.id]);

  async function render(frame = null) {
    if (exporting || exportStarting.current || !end || importing) return;
    player.pause(); exportStarting.current = true; setError(""); setProgress(0);
    const state = latest.current.saved, requestId = editorId();
    try {
      let exportFilePath;
      if (frame == null) {
        setChoosingExport(true);
        exportFilePath = await chooseExportPath({ title: node.data.title || "Editor", workflowContext: latest.current.workflowContext });
        if (!mounted.current || !exportFilePath) return;
        setSavedExportPath("");
      }
      const result = await api.render({ ...latest.current.workflowContext, nodeId: node.id, nodeTitle: node.data.title || "Editor", requestId, timeline: state, frame, ...(exportFilePath ? { exportFilePath } : {}) });
      if (!mounted.current) return;
      onUpdate(node.id, { editorExportJob: { id: result.id, frame, fps: state.fps, timeline: state }, status: "running", error: "" });
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { exportStarting.current = false; if (mounted.current) setChoosingExport(false); }
  }
  function mark(which) {
    if (!end) return;
    const f = Math.min(end - 1, player.getSnapshot().frame), state = latest.current.saved;
    perform(() => which === "in" ? { ...state, inFrame: f, outFrame: state.outFrame != null && state.outFrame <= f ? null : state.outFrame }
      : { ...state, inFrame: state.inFrame > f ? f : state.inFrame, outFrame: f + 1 });
  }
  function togglePlayback() { player.getSnapshot().playing ? player.pause() : player.play(); }
  function split() { perform(t => editorSplit(t, player.getSnapshot().frame, selection, linked)); }
  function remove() { perform(t => editorDelete(t, selection, linked)); setSelection([]); }
  function changeZoom(next) { onUpdate(node.id, { editorZoom: normalizeEditorZoom(next) }); }
  function fit() {
    const next = (scroller.current?.clientWidth - 148 || 700) / Math.max(5, end / timeline.fps + 1);
    prepareFit(next); changeZoom(next);
  }
  function copyClips(event, cut = false) {
    if (event.target.closest("input,textarea,select,[contenteditable='true']")) return;
    event.preventDefault(); event.stopPropagation();
    if (gesture.current) return;
    const clipboard = editorCopyClips(latest.current.saved, selection, linked);
    if (!clipboard) return;
    try {
      const next = cut ? editorDelete(latest.current.saved, selection, linked) : null;
      const text = JSON.stringify(clipboard);
      event.clipboardData.setData(editorClipboardMime, text);
      event.clipboardData.setData("text/plain", text);
      if (next) { player.pause(); commit(next); setSelection([]); }
      setError("");
    } catch (failure) { setError(failure.message); }
  }
  function pasteClips(event) {
    if (event.target.closest("input,textarea,select,[contenteditable='true']")) return;
    event.preventDefault(); event.stopPropagation();
    if (gesture.current) return;
    try {
      const text = event.clipboardData.getData(editorClipboardMime) || event.clipboardData.getData("text/plain");
      if (!text || text.length > 2 * 1024 * 1024) throw new Error("Copy Editor clips before pasting into the timeline.");
      let copied;
      try { copied = JSON.parse(text); } catch { throw new Error("Copy Editor clips before pasting into the timeline."); }
      const previous = latest.current.saved, next = editorPasteClips(previous, copied, player.getSnapshot().frame, { targetTrackId: gap?.trackId });
      const pasted = next.clips.filter(c => !previous.clips.some(old => old.id === c.id));
      player.pause(); commit(next); setSelection(pasted.map(c => c.id));
      player.setTimeline(next); player.seek(Math.max(...pasted.map(c => c.start + c.duration)));
    } catch (failure) { setError(failure.message); }
  }
  function selectGap(event, track, contextMenu = false) {
    if (event.target.closest("[data-editor-clip]")) return;
    if (!contextMenu && event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); root.current.focus({ preventScroll: true });
    const rect = event.currentTarget.getBoundingClientRect();
    const selectedGap = editorGapAt(latest.current.saved, track.id, Math.floor((event.clientX - rect.left) / (rect.width / contentFrames)));
    setSelection([]); setGap(selectedGap); setGapMenu(null); setError("");
    if (contextMenu && selectedGap) {
      const bounds = root.current.getBoundingClientRect(), scale = bounds.width / root.current.offsetWidth;
      setGapMenu({ gap: selectedGap, x: clampEditor((event.clientX - bounds.left) / scale, 4, root.current.clientWidth - 184),
        y: clampEditor((event.clientY - bounds.top) / scale, 4, root.current.clientHeight - 48) });
    }
  }
  function rippleDelete() {
    try {
      const selectedGap = gapMenu?.gap || gap, next = editorRippleDeleteGap(latest.current.saved, selectedGap);
      player.pause(); commit(next); player.setTimeline(next); player.seek(selectedGap.start);
    } catch (failure) { setError(failure.message); setGapMenu(null); }
  }
  function beginResize(event) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); root.current.focus({ preventScroll: true });
    const card = event.currentTarget.closest(".node-card"), rect = card.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind: "resize", pointerId: event.pointerId, x: event.clientX, scale: rect.width / card.offsetWidth,
      width: normalizeEditorNodeWidth(latest.current.node.data.editorNodeWidth), changed: false };
  }
  function keyDown(event) {
    if (event.defaultPrevented || event.isComposing || event.target.closest("input,textarea,select,[contenteditable='true']")) return;
    const key = event.key.toLowerCase(), command = event.metaKey || event.ctrlKey;
    if (command && ["c", "x", "v"].includes(key)) { event.stopPropagation(); return; }
    if (gesture.current && key !== "escape") { event.preventDefault(); event.stopPropagation(); return; }
    const zoomDirection = editorTimelineZoomDirection(event);
    let action;
    if (zoomDirection) action = () => changeZoom(editorZoomStep(zoom, zoomDirection));
    else if (command && key === "z") action = () => history(!event.shiftKey);
    else if (command && key === "y") action = () => history(false);
    else if (command && key === "b") action = split;
    else if (command && key === "d") action = () => perform(t => editorDuplicate(t, selection, linked));
    else if (!command && key === " ") action = togglePlayback;
    else if (!command && key === "i") action = () => mark("in");
    else if (!command && key === "o") action = () => mark("out");
    else if (key === "delete" || key === "backspace") action = remove;
    else if (command && (key === "arrowleft" || key === "arrowright")) action = () => perform(t => editorMove(t, selection, key === "arrowleft" ? -1 : 1, { linked }));
    else if (key === "arrowleft" || key === "arrowright") action = () => player.seek(transport.frame + (key === "arrowleft" ? -1 : 1) * (event.shiftKey ? 10 : 1));
    else if (!command && (key === "arrowup" || key === "arrowdown")) action = () => player.seek(editorEditPoint(latest.current.saved, transport.frame, key === "arrowup" ? -1 : 1));
    else if (key === "home") action = () => player.seek(0);
    else if (key === "end") action = () => player.seek(end);
    else if (key === "escape") action = () => {
      if (gesture.current?.kind === "resize") onUpdate(node.id, { editorNodeWidth: gesture.current.width });
      player.pause(); gesture.current = null; setSelection([]); setGap(null); setGapMenu(null); setDraft(null);
    };
    if (action) { event.preventDefault(); event.stopPropagation(); action(); }
  }
  function handleBodyPointerDown(event) {
    if (!event.target.closest(".editor-gap-menu")) setGapMenu(null);
    if (event.button !== 0 || event.target === scroller.current || event.target.closest("input,textarea,select,button,a,label,[contenteditable],.editor-ruler,.editor-track-lane,.editor-gap-menu,.editor-scrollbar")) {
      event.stopPropagation();
      return;
    }
    // Let the shared node drag handler select/move the node and retain canvas keyboard focus.
    event.preventDefault();
  }
  function beginScrub(event) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); root.current.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind: "scrub", ruler: event.currentTarget, pointerId: event.pointerId };
    player.seek(Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / (event.currentTarget.getBoundingClientRect().width / contentFrames)));
  }
  function beginClip(event, clip, mode = "move") {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); root.current.focus({ preventScroll: true }); player.pause();
    const ids = event.shiftKey ? selection.includes(clip.id) ? selection.filter(id => id !== clip.id) : [...selection, clip.id] : selection.includes(clip.id) ? selection : [clip.id];
    setSelection(ids); setGap(null); setGapMenu(null); setError("");
    const picked = editorSelection(timeline, mode === "move" ? ids : [clip.id], linked);
    if (picked.some(c => timeline.tracks.find(t => t.id === c.trackId)?.locked)) { setError("This clip or its linked track is locked."); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = scroller.current.getBoundingClientRect(), scale = rect.width / scroller.current.offsetWidth;
    gesture.current = { kind: "clip", mode, base: saved, clip, ids, x: event.clientX, scale, initialScroll: scroller.current.scrollLeft, pointerId: event.pointerId, next: null };
  }
  function pointerMove(event) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.kind === "resize") {
      const width = normalizeEditorNodeWidth(g.width + (event.clientX - g.x) / g.scale);
      if (!g.changed && width !== g.width) { latest.current.onUndoSnapshot?.(); g.changed = true; }
      if (g.changed) onUpdate(node.id, { editorNodeWidth: width });
      return;
    }
    if (g.kind === "scrub") {
      const rect = g.ruler.getBoundingClientRect(); player.seek((event.clientX - rect.left) / (rect.width / contentFrames)); return;
    }
    let delta = Math.round(((event.clientX - g.x) / g.scale + scroller.current.scrollLeft - g.initialScroll) / px);
    const picked = editorSelection(g.base, g.mode === "move" ? g.ids : [g.clip.id], linked);
    const boundary = g.clip.start + (g.mode === "right" ? g.clip.duration : 0);
    if (snap && !event.altKey) delta = editorSnap(g.base, boundary + delta, picked.map(c => c.id), 8 / (px * g.scale), transport.frame) - boundary;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-editor-track]");
    const trackId = row?.dataset.editorTrack;
    try {
      const next = g.mode === "move" ? editorMove(g.base, g.ids, delta, { linked, anchorId: g.clip.id, trackId: trackId || g.clip.trackId }) : editorTrim(g.base, g.clip.id, g.mode, delta, linked);
      g.next = next; setDraft(next); setError("");
    } catch (failure) { g.next = null; setDraft(null); setError(failure.message); }
  }
  function pointerEnd(event) {
    const g = gesture.current; if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (g.kind === "resize") { if (event.type === "pointercancel") onUpdate(node.id, { editorNodeWidth: g.width }); return; }
    if (event.type === "pointercancel") { setDraft(null); return; }
    if (g.kind === "clip" && g.next && JSON.stringify(g.base) !== JSON.stringify(latest.current.saved)) {
      setDraft(null); setError("New media arrived during this edit. Try the edit again.");
    } else if (g.kind === "clip" && g.next) commit(g.next);
    else setDraft(null);
  }
  function changeTrack(track, patch) { perform(t => ({ ...t, tracks: t.tracks.map(item => item.id === track.id ? { ...item, ...patch } : item) })); }
  function unlinkSelection() {
    perform(t => editorUnlink(t, selection));
  }
  function changeVolume(value) {
    if (selectedLocked || !currentClip) return;
    player.pause();
    const remember = volumeEdit.current !== currentClip.id;
    volumeEdit.current = currentClip.id;
    commit({ ...latest.current.saved, clips: latest.current.saved.clips.map(c => c.id === currentClip.id ? { ...c, volume: value } : c) }, remember);
  }
  async function dropMedia(event) {
    const item = outputItemFromDataTransfer(event.dataTransfer);
    if (!item || !["video", "audio"].includes(item.type)) return;
    event.preventDefault(); event.stopPropagation();
    if (importingRef.current) { setError("Wait for the current media to finish loading."); return; }
    importingRef.current = true; setImporting(true);
    try { await importSource(item, `drop:${editorId()}`); }
    catch (failure) { setError(failure.message); }
    finally { importingRef.current = false; if (mounted.current) { setImporting(false); setRetry(v => v + 1); } }
  }
  const portProps = { node, onConnectStart, onDisconnectInput, connectedPortKeys };
  return <div ref={root} className="node-body editor-node-body" tabIndex={0} data-editor-timeline="true" aria-label="Editor timeline"
    onPointerDown={handleBodyPointerDown} onKeyDown={keyDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
    onCopy={event => copyClips(event)} onCut={event => copyClips(event, true)} onPaste={pasteClips}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setGapMenu(null); }}
    onWheel={event => event.stopPropagation()} onDragOver={event => { if (hasOutputItemDragData(event.dataTransfer)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={dropMedia}>
    <div className="editor-topbar">
      <div className="editor-inputs">{config.input.map(port => <div key={port.id}><PortHandle {...portProps} port={port} side="input" /><span>{port.label}</span></div>)}</div>
      <div className="editor-transport">
        <div className="editor-tool-group">
          <Tool icon={Slice} label="Split at playhead (Cmd/Ctrl+B)" onClick={split} disabled={!end || selectedLocked} />
          <Tool icon={Play} label="Play (Space)" onClick={() => player.play()} active={transport.playing} disabled={!end} />
          <Tool icon={Pause} label="Pause (Space)" onClick={() => player.pause()} disabled={!transport.playing} />
          <Tool icon={Camera} label="Grab current frame as PNG" onClick={() => render(transport.frame)} disabled={!end || transport.frame >= end || exporting || choosingExport || importing} />
        </div>
        <div className="editor-readouts"><label>Frame<input aria-label="Timeline frame" type="number" min="0" max={end} value={transport.frame} onChange={event => player.seek(Number(event.target.value))} /></label>
          <div className="editor-timecode"><span>Timecode</span><output aria-label="Timeline timecode">{editorTimecode(transport.frame, timeline.fps)}</output></div></div>
      </div>
      <div className="editor-output"><div><span>Output</span><PortHandle {...portProps} port={config.output[0]} side="output" /></div>
        <button className="editor-export" onClick={() => render()} disabled={!end || exporting || choosingExport || importing} aria-busy={exporting || choosingExport}>{exporting || choosingExport ? <Loader2 size={15} className="spin" /> : <Download size={15} />}<span>{choosingExport ? "Save..." : exporting ? `${Math.round(progress * 100)}%` : "Export"}</span></button></div>
    </div>
    <div className="editor-toolbar">
      <div className="editor-tool-group"><Tool icon={Undo2} label="Undo (Cmd/Ctrl+Z)" disabled={!canUndo} onClick={() => history()} /><Tool icon={Redo2} label="Redo (Cmd/Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => history(false)} />
        <Tool icon={Magnet} label="Snap to clips and markers (Alt temporarily disables)" active={snap} aria-pressed={snap} onClick={() => setSnap(v => !v)} />
        <Tool icon={Link2} label="Select and edit linked audio/video" active={linked} aria-pressed={linked} onClick={() => setLinked(v => !v)} /></div>
      <div className="editor-tool-group editor-range-controls"><Tool icon={ChevronFirst} label="Set In (I)" onClick={() => mark("in")} disabled={!end} /><output title="In point">{editorTimecode(range.start, timeline.fps)}</output>
        <Tool icon={ChevronLast} label="Set Out (O)" onClick={() => mark("out")} disabled={!end} /><output title="Out point (last included frame)">{editorTimecode(Math.max(0, range.end - 1), timeline.fps)}</output>
        <Tool icon={Brackets} label="Clear In and Out" onClick={() => perform(t => ({ ...t, inFrame: 0, outFrame: null }))} /></div>
      <div className="editor-tool-group editor-view-tools"><Tool icon={ZoomOut} label="Zoom out timeline (-)" onClick={() => changeZoom(editorZoomStep(zoom, -1))} /><Tool icon={Scan} label="Fit sequence" onClick={fit} /><Tool icon={ZoomIn} label="Zoom in timeline (+ / =)" onClick={() => changeZoom(editorZoomStep(zoom, 1))} />
        <Tool icon={MonitorPlay} label="Show sequence monitor" active={monitor} onClick={() => setMonitor(v => !v)} /><Tool icon={Settings2} label="Sequence settings" active={settings} onClick={() => setSettings(v => !v)} /></div>
    </div>
    {settings && <div className="editor-settings"><label>Frame Rate<select aria-label="Sequence frame rate" value={timeline.fps} disabled={exporting} onChange={event => perform(t => editorSetFrameRate(t, Number(event.target.value)))}>{editorFrameRates.map(fps => <option key={fps} value={fps}>{fps} fps</option>)}</select></label>
      <label>Width<input aria-label="Sequence width" type="number" min="2" max="4096" step="2" value={timeline.width} onChange={event => perform(t => ({ ...t, width: Number(event.target.value) }))} /></label>
      <label>Height<input aria-label="Sequence height" type="number" min="2" max="4096" step="2" value={timeline.height} onChange={event => perform(t => ({ ...t, height: Number(event.target.value) }))} /></label>
      <span>MP4 / H.264 + AAC</span></div>}
    {monitor && <EditorMonitor nodeId={node.id} timeline={timeline} allowNodeDrag />}
    <div className="editor-scroll" ref={scroller} id={scrollId}>
      <div className="editor-track-table" style={{ width: contentWidth + 148 }}>
        <div className="editor-ruler-row"><div className="editor-track-head editor-ruler-head"><span>{timeline.fps} fps</span></div>
          <div className="editor-ruler" style={{ width: contentWidth }} role="slider" aria-label="Timeline playhead" aria-valuemin={0} aria-valuemax={end} aria-valuenow={transport.frame} tabIndex={0} onPointerDown={beginScrub}>
            {Array.from({ length: Math.ceil(contentFrames / timeline.fps / step) + 1 }, (_, i) => <span key={i} className="editor-tick" style={{ left: i * step * zoom }}><span>{editorTimecode(i * step * timeline.fps, timeline.fps).slice(0, 8)}</span></span>)}
            {end > 0 && <div className="editor-export-range" style={{ left: range.start * px, width: (range.end - range.start) * px }}><span>I</span><span>O</span></div>}
          </div></div>
        {timeline.tracks.map(track => <div className={`editor-track-row ${track.kind} ${track.locked ? "locked" : ""} ${track.muted ? "muted" : ""}`} key={track.id}>
          <div className="editor-track-head"><strong>{track.name}</strong><Tool icon={track.locked ? Lock : Unlock} label={`${track.locked ? "Unlock" : "Lock"} ${track.name}`} active={track.locked} onClick={() => changeTrack(track, { locked: !track.locked })} />
            <Tool icon={track.kind === "video" ? track.muted ? EyeOff : Eye : track.muted ? VolumeX : Volume2} label={`${track.muted ? "Enable" : "Disable"} ${track.name}`} active={track.muted} disabled={track.locked} onClick={() => changeTrack(track, { muted: !track.muted })} />
            <Tool icon={Trash2} label={`Remove empty ${track.name} track`} disabled={track.locked || timeline.clips.some(c => c.trackId === track.id) || timeline.tracks.filter(t => t.kind === track.kind).length <= 1} onClick={() => perform(t => ({ ...t, tracks: t.tracks.filter(item => item.id !== track.id) }))} /></div>
          <div className="editor-track-lane" data-editor-track={track.id} style={{ width: contentWidth, backgroundSize: `${step * zoom}px 100%` }} onPointerDown={event => selectGap(event, track)} onContextMenu={event => selectGap(event, track, true)}>
            {gap?.trackId === track.id && <div className="editor-gap" aria-label={`Selected gap in ${track.name}`} style={{ left: gap.start * px, width: (gap.end - gap.start) * px }} />}
            {timeline.clips.filter(c => c.trackId === track.id).map(clip => {
              const asset = timeline.assets.find(a => a.id === clip.assetId), isSelected = selected.some(c => c.id === clip.id);
              return <div key={clip.id} className={`editor-clip ${isSelected ? "selected" : ""}`} data-editor-clip={clip.id} style={{ left: clip.start * px, width: Math.max(2, clip.duration * px) }} title={`${asset.label}\n${editorTimecode(clip.duration, timeline.fps)}${clip.linkGroup ? " | Linked" : ""}`} onPointerDown={event => beginClip(event, clip)}>
                {track.kind === "video" && asset.thumbnailUrl && <img className="editor-clip-thumbnail" src={asset.thumbnailUrl} alt="" draggable={false} />}
                <span className="editor-clip-label">{clip.linkGroup && <Link2 size={11} />}{asset.label}</span>
                {track.kind === "audio" && asset.waveform?.length > 0 && <Waveform asset={asset} clip={clip} fps={timeline.fps} />}
                <button className="editor-trim left" aria-label={`Trim start of ${asset.label}`} title="Trim start" onPointerDown={event => beginClip(event, clip, "left")} disabled={track.locked} />
                <button className="editor-trim right" aria-label={`Trim end of ${asset.label}`} title="Trim end" onPointerDown={event => beginClip(event, clip, "right")} disabled={track.locked} />
              </div>;
            })}
          </div></div>)}
        <div className="editor-playhead" style={{ left: 148 + transport.frame * px, height: 44 + timeline.tracks.length * 68 }} aria-hidden="true"><span /></div>
      </div>
    </div>
    <EditorTimelineScrollbar viewport={viewport} scrollTo={scrollTo} controls={scrollId} />
    <div className="editor-bottom-bar"><div className="editor-add-tracks"><button onClick={() => perform(t => editorAddTrack(t, "video"))} title="Add video track"><Plus size={13} />Video</button><button onClick={() => perform(t => editorAddTrack(t, "audio"))} title="Add audio track"><Plus size={13} />Audio</button></div>
      <span>{importing ? "Loading media..." : transport.buffering ? "Buffering..." : `${timeline.clips.length} clips`}</span><output>{editorTimecode(Math.max(0, range.end - range.start), timeline.fps)}</output>
      <div className="editor-tool-group"><Tool icon={Unlink2} label="Unlink selected audio/video" disabled={!selected.some(c => c.linkGroup) || linkedLocked} onClick={unlinkSelection} /><Tool icon={Copy} label="Duplicate clips (Cmd/Ctrl+D)" disabled={!selected.length || selectedLocked} onClick={() => perform(t => editorDuplicate(t, selection, linked))} /><Tool icon={Trash2} label="Delete clips (Delete / Backspace)" disabled={!selected.length || selectedLocked} onClick={remove} /></div></div>
    {currentClip && <div className="editor-selection-info"><span>{currentAsset.label}</span><output>{editorTimecode(currentClip.sourceIn, timeline.fps)} / {editorTimecode(currentClip.duration, timeline.fps)}</output>
      {timeline.tracks.find(t => t.id === currentClip.trackId)?.kind === "audio" && <label>Volume<input aria-label="Clip volume" type="range" min="0" max="1" step="0.01" disabled={selectedLocked} value={currentClip.volume} onPointerDown={() => { volumeEdit.current = null; }} onBlur={() => { volumeEdit.current = null; }} onChange={event => changeVolume(Number(event.target.value))} /><output>{Math.round(currentClip.volume * 100)}%</output></label>}</div>}
    {(error || transport.error || node.data.error) && <div className="editor-error" role="alert"><span>{error || transport.error || node.data.error}</span>
      {!importing && <button onClick={() => { attempted.current.clear(); setError(""); onUpdate(node.id, { error: "" }); setRetry(v => v + 1); }}>Retry media</button>}</div>}
    {exporting && <div className="editor-job-status" role="status"><progress max="1" value={progress} /><span>{job.frame == null ? "Exporting sequence" : "Saving still"}</span><Tool icon={X} label="Cancel local export" onClick={() => api.cancel(job.id).catch(failure => setError(failure.message))} /></div>}
    {savedExportPath && !exporting && <div className="editor-save-status" role="status" title={savedExportPath}>Saved to {savedExportPath}</div>}
    {!!(node.data.resultItems?.length || node.data.editorStills?.length) && <div className="editor-saved-media">
      {node.data.resultItems?.length > 0 && <a href={node.data.resultItems.at(-1).url} download={node.data.resultItems.at(-1).fileName} title="Download last exported sequence"><Download size={14} />Last export</a>}
      {(node.data.editorStills || []).slice(-8).map(item => <button key={item.url} draggable onClick={() => onPreviewOpen?.(item)} onDragStart={event => setOutputItemDragData(event.dataTransfer, item)} onDragEnd={event => finishOutputItemDragData(item, event)} title={`${item.label}: open or drag to canvas`}><img src={item.url} alt={item.label} draggable={false} /></button>)}
    </div>}
    {gapMenu && <div className="editor-gap-menu" role="menu" aria-label="Timeline gap actions" style={{ left: gapMenu.x, top: gapMenu.y }} onPointerDown={event => event.stopPropagation()}>
      <button role="menuitem" autoFocus onClick={rippleDelete}><Trash2 size={15} />Ripple Delete</button>
    </div>}
    <button className="preview-resize-handle editor-resize-handle" aria-label="Resize Editor width" title="Resize Editor width" onPointerDown={beginResize} />
  </div>;
}
