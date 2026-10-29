import { createEditorTimeline, editorActiveClips, editorEnd, clampEditor } from "./editorTimeline.js";

const players = new Map();
export function pauseEditorPlayback() {
  for (const player of players.values()) player.pause();
}
export function editorPlayback(id) {
  if (!players.has(id)) players.set(id, createPlayback());
  return players.get(id);
}

function createPlayback() {
  let timeline = createEditorTimeline(), snapshot = { frame: 0, playing: false, buffering: false, error: "" };
  let canvas, raf = 0, anchor = 0, disposed = true;
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
  function getMedia(clip, kind) {
    const asset = timeline.assets.find(a => a.id === clip.assetId);
    let entry = media.get(clip.id);
    if (entry?.url !== asset.url) {
      if (entry) release(entry);
      const element = document.createElement(kind === "video" ? "video" : "audio");
      element.preload = "auto"; element.crossOrigin = "anonymous"; element.src = asset.url;
      element.muted = kind === "video"; element.playsInline = true;
      entry = { element, url: asset.url, kind, playPending: false };
      element.onloadeddata = element.onseeked = element.oncanplay = () => { if (!disposed && !snapshot.playing) draw(snapshot.frame); };
      element.onerror = () => { if (!disposed) { pause(); publish({ error: `Cannot play ${asset.label}. Reconnect the source if it moved or uses an unsupported browser codec.` }); } };
      media.set(clip.id, entry);
    }
    return entry;
  }
  function release(entry) {
    entry.element.onloadeddata = entry.element.onseeked = entry.element.oncanplay = entry.element.onerror = null;
    entry.element.pause(); entry.element.removeAttribute("src"); entry.element.load();
  }
  function align(clip, kind, frame) {
    const entry = getMedia(clip, kind), element = entry.element;
    const time = (clip.sourceIn + frame - clip.start) / timeline.fps;
    if (element.readyState < 1) return false;
    const tolerance = snapshot.playing ? 0.12 : 0.5 / timeline.fps;
    if (!element.seeking && Math.abs(element.currentTime - time) > tolerance) element.currentTime = Math.min(time, Math.max(0, element.duration - 0.001));
    if (kind === "audio") element.volume = clip.volume;
    return element.readyState >= 2 && !element.seeking;
  }
  function draw(frame) {
    if (!canvas || disposed) return false;
    const { video, audio } = editorActiveClips(timeline, frame);
    const wanted = new Set([video?.id, ...audio.map(c => c.id)].filter(Boolean));
    let ready = true;
    if (video) ready = align(video, "video", frame) && ready;
    for (const clip of audio) ready = align(clip, "audio", frame) && ready;
    for (const [id, entry] of media) if (!wanted.has(id) || !snapshot.playing || !ready) entry.element.pause();
    if (ready) {
      const context = canvas.getContext("2d");
      context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height);
      if (video) {
        const element = media.get(video.id).element;
        if (element.videoWidth && element.videoHeight) {
          const scale = Math.min(canvas.width / element.videoWidth, canvas.height / element.videoHeight);
          const w = element.videoWidth * scale, h = element.videoHeight * scale;
          context.drawImage(element, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        }
      }
      copyFrame();
    }
    if (snapshot.playing && ready) {
      for (const id of wanted) {
        const entry = media.get(id);
        if (entry.element.paused && !entry.playPending) {
          entry.playPending = true;
          entry.element.play().catch(error => {
            if (disposed || !snapshot.playing || error.name === "AbortError") return;
            pause(); publish({ error: "Playback was blocked. Click Play again, or check that this browser supports the source media." });
          }).finally(() => { entry.playPending = false; });
        }
      }
    }
    // Preload only the next second, keeping long sequences from decoding every source.
    const upcoming = timeline.clips.filter(c => c.start >= frame && c.start < frame + timeline.fps && !timeline.tracks.find(t => t.id === c.trackId)?.muted).slice(0, 8);
    for (const clip of upcoming) {
      wanted.add(clip.id);
      const kind = timeline.tracks.find(t => t.id === clip.trackId).kind;
      const entry = getMedia(clip, kind);
      if (clip.start > frame && entry.element.readyState >= 1 && !entry.element.seeking && Math.abs(entry.element.currentTime - clip.sourceIn / timeline.fps) > 0.1) entry.element.currentTime = clip.sourceIn / timeline.fps;
    }
    for (const [id, entry] of media) if (!wanted.has(id)) { release(entry); media.delete(id); }
    publish({ buffering: !ready });
    return ready;
  }
  function tick(now) {
    if (disposed || !snapshot.playing) return;
    const end = editorEnd(timeline), target = Math.floor((now - anchor) * timeline.fps / 1000);
    if (target >= end) { seek(end); return; }
    // At a cut, hold the timeline clock while a new decoder seeks/buffers.
    const frame = snapshot.buffering ? snapshot.frame : Math.max(snapshot.frame, target);
    publish({ frame });
    if (!draw(frame) || snapshot.buffering) anchor = now - frame * 1000 / timeline.fps;
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(raf); media.forEach(entry => entry.element.pause());
    publish({ playing: false, buffering: false });
  }
  function seek(frame) {
    pause(); publish({ frame: clampEditor(Math.round(frame), 0, editorEnd(timeline)), error: "" });
    draw(snapshot.frame);
  }
  function visibility() { if (document.hidden) pause(); }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    mount() {
      disposed = false; canvas = document.createElement("canvas");
      document.addEventListener("visibilitychange", visibility);
    },
    dispose() {
      pause(); disposed = true; media.forEach(release); media.clear();
      document.removeEventListener("visibilitychange", visibility);
    },
    setTimeline(value) {
      const frame = Math.round(snapshot.frame * value.fps / timeline.fps);
      timeline = value;
      if (!canvas) return;
      const scale = Math.min(1, 1920 / Math.max(value.width, value.height));
      canvas.width = Math.round(value.width * scale); canvas.height = Math.round(value.height * scale);
      seek(Math.min(frame, editorEnd(timeline)));
    },
    mirror(element) { mirrors.add(element); copyFrame(); return () => mirrors.delete(element); },
    seek, pause,
    play() {
      if (disposed || !editorEnd(timeline)) return;
      if (snapshot.frame >= editorEnd(timeline)) seek(timeline.inFrame);
      publish({ playing: true, error: "" }); anchor = performance.now() - snapshot.frame * 1000 / timeline.fps;
      draw(snapshot.frame); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
  };
}
