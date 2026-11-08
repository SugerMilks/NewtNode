import { createEditorTimeline, editorEnd, clampEditor } from "./editorTimeline.js";
import { editorVideoLayers, editorAudioGain } from "./editorTransitions.js";
import { editorClipOffset } from "./editorClipPosition.js";
import { editorClipFade } from "./editorFades.js";
import { editorPlaybackSchedule, editorUpcomingMedia } from "./editorPlaybackSchedule.js";

const players = new Map();
export function pauseEditorPlayback() {
  for (const player of players.values()) player.pause();
}
export function editorPlayback(id) {
  if (!players.has(id)) players.set(id, createPlayback());
  return players.get(id);
}

function createPlayback() {
  let timeline = createEditorTimeline(), snapshot = { frame: 0, playing: false, rate: 1, buffering: false, error: "" };
  let canvas, layerCanvas, raf = 0, anchor = 0, disposed = true, lastPaintedFrame = null;
  let reverseFrame = null;
  let schedule = { video: [], audio: [], media: [] }, assets = new Map(), activeIds = new Set();
  const listeners = new Set(), mirrors = new Set(), media = new Map();
  const publish = patch => {
    if (Object.entries(patch).every(([key, value]) => snapshot[key] === value)) return;
    snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener());
  };
  function copyFrame() {
    if (!canvas) return;
    for (const mirror of mirrors) {
      if (mirror.width !== canvas.width) mirror.width = canvas.width;
      if (mirror.height !== canvas.height) mirror.height = canvas.height;
      mirror.getContext("2d")?.drawImage(canvas, 0, 0);
    }
  }
  function getMedia(clip, kind, allowReuse = false) {
    const asset = assets.get(clip.assetId), sourceOffset = clip.sourceIn - clip.start;
    let entry = media.get(clip.id);
    if (allowReuse && (!entry || entry.element.paused)) {
      const running = [...media].find(([id, item]) => !activeIds.has(id) && !item.failed && !item.element.paused
        && item.kind === kind && item.url === asset.url && item.sourceOffset === sourceOffset);
      if (running) {
        if (entry) release(entry);
        media.delete(running[0]); media.set(clip.id, running[1]);
        return running[1];
      }
    }
    if (entry?.url !== asset.url || entry?.kind !== kind) {
      if (entry) { release(entry); media.delete(clip.id); }
      if (allowReuse) {
        const reusable = [...media].find(([id, item]) => !activeIds.has(id) && !item.failed && item.kind === kind
          && item.url === asset.url && item.sourceOffset === sourceOffset);
        if (reusable) {
          media.delete(reusable[0]); media.set(clip.id, reusable[1]);
          return reusable[1];
        }
      }
      const element = document.createElement(kind === "video" ? "video" : "audio");
      element.preload = "auto"; element.crossOrigin = "anonymous";
      element.muted = kind === "video"; element.playsInline = true; element.preservesPitch = true;
      entry = { element, url: asset.url, sourceOffset, kind, playPending: false, active: false, lastUsed: performance.now() };
      element.onloadedmetadata = element.onloadeddata = element.onseeked = element.oncanplay = () => {
        if (!disposed && !snapshot.playing) draw(snapshot.frame);
      };
      element.onerror = () => {
        if (disposed) return;
        entry.failed = `Cannot play ${asset.label}. Reconnect the source if it moved or uses an unsupported browser codec.`;
        if (entry.active) { pause(); publish({ error: entry.failed }); }
      };
      media.set(clip.id, entry);
      element.src = asset.url;
    }
    entry.sourceOffset = sourceOffset;
    return entry;
  }
  function release(entry) {
    entry.released = true;
    entry.element.onloadedmetadata = entry.element.onloadeddata = entry.element.onseeked = entry.element.oncanplay = entry.element.onerror = null;
    entry.element.pause(); entry.element.removeAttribute("src"); entry.element.load();
  }
  function sourceTime(clip, frame) {
    const sourceFrame = clip.sourceIn + frame - clip.start;
    const last = Math.max(0, Math.floor(assets.get(clip.assetId).duration * timeline.fps + .00001) - 1);
    return { time: clampEditor(sourceFrame, 0, last) / timeline.fps, hold: sourceFrame < 0 || sourceFrame > last };
  }
  function clockMedia() {
    const entries = [...activeIds].map(id => media.get(id)).filter(e => e && !e.hold && !e.failed && !e.element.ended);
    return entries.find(e => e.kind === "audio") || entries.find(e => e.kind === "video");
  }
  function align(clip, kind, frame, volume = clip.volume) {
    const entry = getMedia(clip, kind, true), element = entry.element, { time, hold } = sourceTime(clip, frame);
    entry.active = true; entry.lastUsed = performance.now();
    entry.hold = kind === "video" && hold;
    if (entry.failed) { pause(); publish({ error: entry.failed }); return false; }
    if (element.readyState < 1) return false;
    const running = snapshot.playing && snapshot.rate > 0 && !entry.hold, drift = time - element.currentTime;
    const tolerance = running ? (element.paused ? 0.12 : 0.5) : 0.5 / timeline.fps;
    if (!element.seeking && Math.abs(drift) > tolerance) element.currentTime = Math.min(time, Math.max(0, element.duration - 0.001));
    // Small decoder/startup differences do not warrant a seek (which restarts the
    // audio device and can create a permanent seek/pause loop). Follow one media
    // clock and gently synchronize the others; explicit scrubs stay frame-accurate.
    const baseRate = snapshot.playing && snapshot.rate > 0 ? snapshot.rate : 1;
    const rate = running && !element.paused && entry !== clockMedia() && Math.abs(drift) > 0.5 / timeline.fps
      ? baseRate * clampEditor(1 + drift * 2, .9, 1.1) : baseRate;
    if (Math.abs(element.playbackRate - rate) > .005) element.playbackRate = rate;
    if (kind === "audio") element.volume = volume;
    return element.readyState >= 2 && !element.seeking;
  }
  function prepareUpcoming(frame) {
    const wanted = new Set(activeIds);
    const rate = snapshot.playing ? snapshot.rate : 1;
    for (const item of editorUpcomingMedia(schedule, frame, timeline.fps, activeIds, rate)) {
      const asset = assets.get(item.clip.assetId), offset = item.clip.sourceIn - item.clip.start;
      const continuous = [...media].some(([id, e]) => activeIds.has(id) && e.kind === item.kind && e.url === asset.url && e.sourceOffset === offset
        && schedule.media.some(s => s.clip.id === id && s.start <= frame && s.end === item.start));
      if (rate > 0 && continuous) continue;
      const entry = getMedia(item.clip, item.kind), element = entry.element, { time } = sourceTime(item.clip, rate < 0 ? item.end - 1 : item.start);
      wanted.add(item.clip.id); entry.lastUsed = performance.now();
      if (!entry.failed && element.readyState >= 1 && !element.seeking && Math.abs(element.currentTime - time) > 0.5 / timeline.fps) {
        element.currentTime = Math.min(time, Math.max(0, element.duration - .001));
      }
    }
    // A small recently-used cache avoids reloads on nearby scrubs without keeping
    // a decoder for every clip in a long sequence.
    const recent = [...media].filter(([id]) => !wanted.has(id)).sort((a, b) => b[1].lastUsed - a[1].lastUsed);
    recent.forEach(([id, entry], i) => {
      if (i >= 4 || performance.now() - entry.lastUsed > 1500 || !timeline.clips.some(c => c.id === id && assets.get(c.assetId)?.url === entry.url)) {
        release(entry); media.delete(id);
      }
    });
  }
  function draw(frame) {
    if (!canvas || disposed) return false;
    const active = s => frame >= s.start && frame < s.end;
    const video = schedule.video.find(active)?.segments || [];
    const reverse = snapshot.playing && snapshot.rate < 0;
    const layers = video.flatMap(segment => editorVideoLayers(segment, frame).map(layer => ({ ...layer,
      opacity: layer.opacity * (segment.clip ? editorClipFade(segment.clip, frame) : 1) })));
    const audio = reverse ? [] : schedule.audio.filter(active);
    activeIds = new Set([...audio.map(s => s.clip.id), ...layers.map(l => l.clip.id)]);
    media.forEach(entry => { entry.active = false; });
    let ready = true;
    // Create the audio clock first so video alignment does not mistake itself for
    // the master on the first frame of a new cut.
    for (const segment of audio) ready = align(segment.clip, "audio", frame, editorAudioGain(segment, frame)) && ready;
    for (const layer of layers) ready = align(layer.clip, "video", frame) && ready;
    for (const [id, entry] of media) if (!activeIds.has(id) || !snapshot.playing || reverse || !ready || entry.hold) entry.element.pause();
    if (ready && lastPaintedFrame !== frame) {
      const context = canvas.getContext("2d");
      context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height);
      for (const layer of layers) {
        const element = media.get(layer.clip.id).element;
        if (element.videoWidth && element.videoHeight) {
          const scale = Math.min(canvas.width / element.videoWidth, canvas.height / element.videoHeight);
          const w = element.videoWidth * scale, h = element.videoHeight * scale;
          const first = layer === layers[0], layerContext = first ? context : layerCanvas.getContext("2d");
          if (first) context.globalAlpha = layer.opacity;
          else { layerContext.fillStyle = "#000"; layerContext.fillRect(0, 0, canvas.width, canvas.height); }
          const offset = editorClipOffset(layer.clip, timeline.width, timeline.height);
          layerContext.drawImage(element, (canvas.width - w) / 2 + offset.x * canvas.width / timeline.width,
            (canvas.height - h) / 2 + offset.y * canvas.height / timeline.height, w, h);
          if (!first) { context.globalAlpha = layer.opacity; context.drawImage(layerCanvas, 0, 0); }
          context.globalAlpha = 1;
        }
      }
      copyFrame();
      lastPaintedFrame = frame;
    }
    if (snapshot.playing && snapshot.rate > 0 && ready) {
      const master = clockMedia();
      for (const id of activeIds) {
        const entry = media.get(id);
        if (entry.kind === "video" && master?.kind === "audio" && (master.playStart == null || master.element.currentTime <= master.playStart + .001)) continue;
        if (entry.element.paused && !entry.element.ended && !entry.playPending && !entry.hold) {
          entry.playPending = true; entry.playStart = entry.element.currentTime;
          entry.element.play().catch(error => {
            if (disposed || entry.released || !entry.active || !snapshot.playing || error.name === "AbortError") return;
            pause(); publish({ error: "Playback was blocked. Click Play again, or check that this browser supports the source media." });
          }).finally(() => { entry.playPending = false; });
        }
      }
    }
    prepareUpcoming(frame);
    publish({ buffering: !ready && !snapshot.error });
    return ready;
  }
  function tick(now) {
    if (disposed || !snapshot.playing) return;
    if (snapshot.rate < 0) {
      // Browsers cannot reliably play media at negative rates. Keep at most one
      // reverse frame in flight; drop intermediate frames when decoding is slow
      // instead of building a seek queue or changing the timeline's shuttle speed.
      if (reverseFrame == null) {
        reverseFrame = clampEditor(Math.floor((now - anchor) * timeline.fps * snapshot.rate / 1000), 0, Math.max(0, editorEnd(timeline) - 1));
        publish({ frame: reverseFrame });
      }
      if (draw(reverseFrame)) {
        const first = reverseFrame === 0; reverseFrame = null;
        if (first) { seek(0); return; }
      }
      if (snapshot.playing) raf = requestAnimationFrame(tick);
      return;
    }
    const end = editorEnd(timeline), master = clockMedia();
    let target = Math.floor((now - anchor) * timeline.fps * snapshot.rate / 1000);
    if (!snapshot.buffering && master && !master.element.paused && !master.element.seeking && master.element.readyState >= 2) {
      target = Math.floor(master.element.currentTime * timeline.fps - master.sourceOffset + .00001);
      anchor = now - target * 1000 / (timeline.fps * snapshot.rate);
    }
    if (target >= end) { seek(end); return; }
    // At a cut, hold the timeline clock while a new decoder seeks/buffers.
    const frame = snapshot.buffering ? snapshot.frame : Math.max(snapshot.frame, target);
    publish({ frame });
    if (!draw(frame) || snapshot.buffering) anchor = now - frame * 1000 / (timeline.fps * snapshot.rate);
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(raf); media.forEach(entry => entry.element.pause());
    reverseFrame = null;
    publish({ playing: false, rate: 1, buffering: false });
  }
  function seek(frame) {
    lastPaintedFrame = null;
    pause(); publish({ frame: clampEditor(Math.round(frame), 0, editorEnd(timeline)), error: "" });
    draw(snapshot.frame);
  }
  function visibility() { if (document.hidden) pause(); }
  function play(rate = 1) {
    if (disposed || !editorEnd(timeline)) return;
    if (rate < 0 && snapshot.frame <= 0) { pause(); return; }
    if (rate > 0 && snapshot.frame >= editorEnd(timeline)) seek(timeline.inFrame);
    if (rate < 0 && snapshot.frame >= editorEnd(timeline)) seek(editorEnd(timeline) - 1);
    if (Math.sign(rate) !== Math.sign(snapshot.rate)) media.forEach(entry => entry.element.pause());
    reverseFrame = null;
    publish({ playing: true, rate, error: "" }); anchor = performance.now() - snapshot.frame * 1000 / (timeline.fps * rate);
    if (rate < 0) reverseFrame = snapshot.frame;
    draw(snapshot.frame); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    mount() {
      disposed = false; canvas = document.createElement("canvas"); layerCanvas = document.createElement("canvas");
      document.addEventListener("visibilitychange", visibility);
    },
    dispose() {
      pause(); disposed = true; media.forEach(release); media.clear();
      document.removeEventListener("visibilitychange", visibility);
    },
    setTimeline(value) {
      const frame = Math.round(snapshot.frame * value.fps / timeline.fps);
      timeline = value;
      schedule = editorPlaybackSchedule(value); assets = new Map(value.assets.map(a => [a.id, a]));
      if (!canvas) return;
      const scale = Math.min(1, 1920 / Math.max(value.width, value.height));
      const width = Math.round(value.width * scale), height = Math.round(value.height * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height; layerCanvas.width = width; layerCanvas.height = height;
      }
      seek(Math.min(frame, editorEnd(timeline)));
    },
    mirror(element) { mirrors.add(element); copyFrame(); return () => mirrors.delete(element); },
    seek, pause,
    play: () => play(1),
    shuttle(direction) {
      if (direction !== 1 && direction !== -1) return;
      const speed = snapshot.playing && Math.sign(snapshot.rate) === direction ? Math.min(3, Math.abs(snapshot.rate) + 1) : 1;
      play(direction * speed);
    }
  };
}
