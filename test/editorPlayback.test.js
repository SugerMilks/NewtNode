import test from "node:test";
import assert from "node:assert/strict";
import { editorPlayback } from "../src/editorPlayback.js";
import { editorPlaybackSchedule, editorUpcomingMedia } from "../src/editorPlaybackSchedule.js";
import { editorSetTransition } from "../src/editorTransitions.js";
import { editorSplit } from "../src/editorTimeline.js";
import { transitionTimeline } from "./fixtures/editorTransitions.js";

test("lookahead prepares transition handles, dip midpoints and lower-track reveals in chronological order", () => {
  let timeline = editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve");
  timeline = editorSetTransition(timeline, "a1-red", "a1-blue", "crossFade");
  let schedule = editorPlaybackSchedule(timeline);
  let upcoming = editorUpcomingMedia(schedule, 0, 24, new Set(["v1-red", "a1-red"]));
  assert.deepEqual(upcoming.map(s => [s.clip.id, s.start]), [["v1-blue", 36], ["a1-blue", 36]]);
  assert.ok(upcoming.every(s => s.clip.sourceIn + s.start - s.clip.start === 12));
  timeline = editorSetTransition(timeline, "v1-red", "v1-blue", "dipToBlack");
  upcoming = editorUpcomingMedia(editorPlaybackSchedule(timeline), 0, 24, new Set(["v1-red", "a1-red"]));
  assert.deepEqual(upcoming.map(s => [s.clip.id, s.start]), [["a1-blue", 36], ["v1-blue", 48]]);
  timeline = transitionTimeline();
  timeline.clips.push({ ...timeline.clips[0], id: "cover", trackId: "v2", duration: 36 });
  schedule = editorPlaybackSchedule(timeline);
  assert.equal(schedule.video[0].segment.clip.id, "cover");
  assert.equal(schedule.media.find(s => s.clip.id === "v1-red").start, 36);
  assert.equal(editorUpcomingMedia(schedule, 0, 24, new Set(["cover", "a1-red"]))[0].clip.id, "v1-red");
  timeline.tracks.find(t => t.id === "v2").muted = true;
  assert.ok(editorPlaybackSchedule(timeline).media.every(s => s.clip.id !== "cover"));
});

test("lookahead is bounded on dense timelines and never includes muted tracks", () => {
  const timeline = transitionTimeline(); timeline.clips = Array.from({ length: 100 }, (_, i) => ({ ...timeline.clips[0], id: `clip-${i}`, start: i, duration: 1 }));
  const upcoming = editorUpcomingMedia(editorPlaybackSchedule(timeline), 0, 24, new Set(["clip-0"]));
  assert.equal(upcoming.length, 8); assert.equal(upcoming[0].clip.id, "clip-1");
});

function harness(t) {
  let now = 0, rafId = 0; const frames = new Map(), pending = [], elements = [], canvases = [], events = new Map();
  t.mock.method(performance, "now", () => now);
  t.mock.method(globalThis, "requestAnimationFrame", cb => { frames.set(++rafId, cb); return rafId; });
  t.mock.method(globalThis, "cancelAnimationFrame", id => frames.delete(id));
  class Media {
    constructor(kind) { Object.assign(this, { kind, paused: true, seeking: false, readyState: 4, duration: 4, playbackRate: 1, videoWidth: 160, videoHeight: 90, time: 0, updated: now, plays: 0, seeks: [], removed: false }); }
    get currentTime() {
      if (!this.paused) this.time = Math.min(this.duration, this.time + Math.max(0, now - Math.max(this.updated, this.startup)) * this.playbackRate / 1000);
      this.updated = now; return this.time;
    }
    set currentTime(value) {
      this.seeks.push({ value, playing: !this.paused }); this.time = value; this.updated = now; this.seeking = true;
      pending.push(() => { this.seeking = false; this.onseeked?.(); });
    }
    get ended() { return this.currentTime >= this.duration; }
    play() { this.currentTime; this.paused = false; this.startup = now + (this.kind === "audio" ? 150 : 0); this.plays++; return Promise.resolve(); }
    pause() { this.currentTime; this.paused = true; }
    removeAttribute() { this.removed = true; }
    load() {}
  }
  const document = { hidden: false, addEventListener: (key, cb) => events.set(key, cb), removeEventListener: key => events.delete(key),
    createElement(kind) {
      if (kind !== "canvas") { const el = new Media(kind); elements.push(el); return el; }
      const context = { paints: 0, fillRect() {}, drawImage() { this.paints++; } };
      const el = { width: 300, height: 150, getContext: () => context }; canvases.push(el); return el;
    } };
  const previousDocument = globalThis.document;
  globalThis.document = document;
  const player = editorPlayback(crypto.randomUUID()); player.mount();
  t.after(() => { player.dispose(); globalThis.document = previousDocument; });
  return { player, elements, canvases, document, events,
    async step(count = 1) { for (let i = 0; i < count; i++) {
      now += 16; const ready = pending.splice(0); ready.forEach(fn => fn());
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); await Promise.resolve();
    } } };
}

// Node does not supply browser globals; install mockable slots for this file only.
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
globalThis.document ??= {};

test("audio startup delay does not trigger repeated seeks or restarts; rendering follows sequence frames", async t => {
  const h = harness(t); h.player.setTimeline(transitionTimeline()); await h.step(3);
  const initialPaints = h.canvases[0].getContext().paints;
  h.player.play(); await h.step(300);
  assert.equal(h.player.getSnapshot().frame, 96); assert.equal(h.player.getSnapshot().playing, false);
  assert.equal(h.elements.flatMap(e => e.seeks).filter(s => s.playing).length, 0);
  assert.equal(h.elements.filter(e => e.kind === "audio").reduce((n, e) => n + e.plays, 0), 2);
  assert.ok(h.canvases[0].getContext().paints - initialPaints <= 96, "Repeated RAFs do not repaint the same timeline frame");
});

test("contiguous razor cuts reuse both running video and audio decoders", async t => {
  const h = harness(t); let timeline = transitionTimeline();
  timeline.clips = timeline.clips.filter(c => c.assetId === "red").map(c => ({ ...c, sourceIn: 0, duration: 96 }));
  for (const frame of [24, 48, 72]) timeline = editorSplit(timeline, frame);
  h.player.setTimeline(timeline); await h.step(3); h.player.play(); await h.step(300);
  assert.equal(h.player.getSnapshot().frame, 96);
  assert.equal(h.elements.filter(e => e.kind === "video").reduce((n, e) => n + e.plays, 0), 1);
  assert.equal(h.elements.filter(e => e.kind === "audio").reduce((n, e) => n + e.plays, 0), 1);
  assert.equal(h.elements.flatMap(e => e.seeks).filter(s => s.playing).length, 0);
});

test("real buffering holds the clock, while scrubbing remains exact and disposal releases sources", async t => {
  const h = harness(t); h.player.setTimeline(transitionTimeline()); await h.step(3); h.player.play(); await h.step(40);
  const video = h.elements.find(e => e.kind === "video" && e.src.endsWith("red.mp4"));
  video.readyState = 1; await h.step(); const stopped = h.player.getSnapshot().frame;
  assert.equal(h.player.getSnapshot().buffering, true);
  await h.step(15); assert.equal(h.player.getSnapshot().frame, stopped);
  video.readyState = 4; await h.step(25); assert.ok(h.player.getSnapshot().frame > stopped);
  h.player.seek(60); await h.step(3);
  assert.equal(h.player.getSnapshot().playing, false);
  const blue = h.elements.filter(e => e.src.endsWith("blue.mp4"));
  assert.ok(blue.every(e => Math.abs(e.currentTime - 1.5) < .001));
  h.player.play(); await h.step(12); h.document.hidden = true; h.events.get("visibilitychange")();
  assert.equal(h.player.getSnapshot().playing, false);
  h.player.dispose(); assert.ok(h.elements.every(e => e.paused && e.removed));
});

test("failed background preloads do not interrupt the current clip; errors surface when needed", async t => {
  const h = harness(t); h.player.setTimeline(transitionTimeline()); await h.step(3); h.player.play(); await h.step(20);
  const future = h.elements.find(e => e.src.endsWith("blue.mp4")); future.onerror();
  assert.equal(h.player.getSnapshot().playing, true); assert.equal(h.player.getSnapshot().error, "");
  h.player.seek(60); assert.match(h.player.getSnapshot().error, /Cannot play blue/);
  assert.equal(h.player.getSnapshot().buffering, false);
});

test("small video drift is corrected without seeking or stopping sound", async t => {
  const h = harness(t); h.player.setTimeline(transitionTimeline()); await h.step(3); h.player.play(); await h.step(30);
  const video = h.elements.find(e => e.kind === "video" && e.src.endsWith("red.mp4"));
  const audio = h.elements.find(e => e.kind === "audio" && e.src.endsWith("red.mp4"));
  video.time -= .09; await h.step();
  assert.ok(video.playbackRate > 1 && video.playbackRate <= 1.1);
  assert.equal(audio.playbackRate, 1); assert.equal(audio.plays, 1);
  await h.step(50);
  assert.ok(Math.abs(video.currentTime - audio.currentTime) < .05);
  assert.equal(video.seeks.filter(s => s.playing).length, 0);
});

test("seeking through a long sequence keeps decoder resources bounded", async t => {
  const h = harness(t), timeline = transitionTimeline();
  timeline.clips = Array.from({ length: 100 }, (_, i) => ({ ...timeline.clips[0], id: `video-${i}`, start: i * 6, duration: 6 }));
  h.player.setTimeline(timeline);
  for (let i = 0; i < 100; i += 7) {
    h.player.seek(i * 6); await h.step(3);
    assert.ok(h.elements.filter(e => !e.removed).length <= 13, "One active, eight upcoming and at most four recently used decoders");
  }
});

test("silent transitions with missing handles advance through held frames and stop at the end", async t => {
  const h = harness(t); let timeline = transitionTimeline();
  timeline.clips = timeline.clips.filter(c => c.trackId === "v1").map(c => ({ ...c, sourceIn: 0, start: c.start ? 96 : 0, duration: 96 }));
  timeline = editorSetTransition(timeline, "v1-red", "v1-blue", "crossDissolve");
  h.player.setTimeline(timeline); await h.step(3); h.player.play(); await h.step(580);
  assert.equal(h.player.getSnapshot().frame, 192); assert.equal(h.player.getSnapshot().playing, false);
  assert.equal(h.player.getSnapshot().error, "");
});

test("shuttle speeds step through 1x/2x/3x, pause immediately, and reset when direction changes", async t => {
  const h = harness(t), timeline = transitionTimeline(), original = JSON.stringify(timeline);
  h.player.setTimeline(timeline); await h.step(3);
  for (const expected of [1, 2, 3, 3]) { h.player.shuttle(1); assert.equal(h.player.getSnapshot().rate, expected); }
  await h.step(32); assert.ok(h.player.getSnapshot().frame > 20);
  assert.ok(h.elements.some(e => !e.paused && e.playbackRate >= 2.7));
  h.player.pause(); const stopped = h.player.getSnapshot().frame;
  await h.step(10); assert.equal(h.player.getSnapshot().frame, stopped);
  assert.equal(h.player.getSnapshot().rate, 1); assert.ok(h.elements.every(e => e.paused));
  h.player.seek(84); await h.step(3);
  for (const expected of [-1, -2, -3, -3]) { h.player.shuttle(-1); assert.equal(h.player.getSnapshot().rate, expected); }
  await h.step(12); assert.ok(h.player.getSnapshot().frame < 80);
  assert.ok(h.elements.every(e => e.paused && e.playbackRate > 0), "Reverse never starts native audio or negative media rates");
  h.player.shuttle(1); assert.equal(h.player.getSnapshot().rate, 1);
  await h.step(15); h.player.shuttle(-1); assert.equal(h.player.getSnapshot().rate, -1);
  h.player.pause(); h.player.shuttle(-1); assert.equal(h.player.getSnapshot().rate, -1);
  h.player.play(); assert.equal(h.player.getSnapshot().rate, 1);
  assert.equal(JSON.stringify(timeline), original, "Transport does not change the sequence or export data");
});

test("reverse travels across cuts and transitions, lands on frame zero and never wraps", async t => {
  const h = harness(t);
  let timeline = editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve");
  timeline = editorSetTransition(timeline, "a1-red", "a1-blue", "crossFade");
  h.player.setTimeline(timeline); h.player.seek(96); await h.step(3);
  const visited = []; const stop = h.player.subscribe(() => { if (h.player.getSnapshot().playing) visited.push(h.player.getSnapshot().frame); });
  h.player.shuttle(-1); await h.step(300); stop();
  assert.ok(visited.some(f => f > 36 && f < 60), "Reverse crosses the dissolve window");
  assert.ok(visited.some(f => f < 36));
  assert.equal(h.player.getSnapshot().frame, 0); assert.equal(h.player.getSnapshot().playing, false);
  assert.equal(h.player.getSnapshot().rate, 1);
  assert.ok(h.elements.every(e => e.plays === 0), "Reverse uses silent video frame decoding only");
  h.player.shuttle(-1); await h.step(12); assert.equal(h.player.getSnapshot().frame, 0);
  h.player.shuttle(1); h.player.shuttle(1); h.player.shuttle(1); await h.step(150);
  assert.equal(h.player.getSnapshot().frame, 96); assert.equal(h.player.getSnapshot().playing, false);
});

test("reverse preloading warms previous visible video frames, and speed expands the bounded lookahead", () => {
  const timeline = editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve");
  const schedule = editorPlaybackSchedule(timeline);
  const upcoming = editorUpcomingMedia(schedule, 72, 24, new Set(["v1-blue"]), -1);
  assert.deepEqual(upcoming.map(s => [s.clip.id, s.end - 1]), [["v1-red", 59]]);
  const later = { ...schedule, media: [{ ...schedule.media[0], start: 200, end: 240 }] };
  assert.equal(editorUpcomingMedia(later, 0, 24, new Set(), 1).length, 0);
  assert.equal(editorUpcomingMedia(later, 0, 24, new Set(), 3).length, 1);
});

test("pausing a pending reverse seek cannot restart playback on late media events", async t => {
  const h = harness(t); h.player.setTimeline(transitionTimeline()); h.player.seek(84); await h.step(3);
  h.player.shuttle(-1); h.player.shuttle(-1); h.player.shuttle(-1); await h.step(2);
  assert.ok(h.elements.some(e => e.seeking));
  h.player.pause(); const frame = h.player.getSnapshot().frame;
  await h.step(25);
  assert.equal(h.player.getSnapshot().frame, frame); assert.equal(h.player.getSnapshot().playing, false);
  assert.ok(h.elements.every(e => e.paused));
  h.player.shuttle(1); await h.step(4); h.document.hidden = true; h.events.get("visibilitychange")();
  assert.equal(h.player.getSnapshot().rate, 1); assert.equal(h.player.getSnapshot().playing, false);
});
