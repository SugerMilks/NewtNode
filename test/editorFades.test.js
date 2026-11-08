import test from "node:test";
import assert from "node:assert/strict";
import { editorSetFade, editorResizeFade, editorClipFade } from "../src/editorFades.js";
import { editorSetTransition, editorAudioSegments, editorAudioGain } from "../src/editorTransitions.js";
import { normalizeEditorTimeline, editorMove, editorTrim, editorSplit, editorCopyClips, editorPasteClips, editorSetFrameRate, editorRenderSignature, editorMarqueeSelection } from "../src/editorTimeline.js";
import { editorPlaybackSchedule } from "../src/editorPlaybackSchedule.js";
import { validateEditorRequest } from "../server/editor-render.js";
import { editorApi } from "../src/api/newtApi.js";
import { transitionTimeline } from "./fixtures/editorTransitions.js";

test("edge fades are independent of linked media, bounded, removable and respect locks", () => {
  const base = transitionTimeline(), before = JSON.stringify(base);
  let t = editorSetFade(base, "v1-red", "left");
  assert.equal(t.clips[0].fadeIn, 24); assert.ok(!t.clips.find(c => c.id === "a1-red").fadeIn);
  t = editorSetFade(t, "v1-red", "right", 900); assert.equal(t.clips[0].fadeOut, 24);
  t = editorResizeFade(t, "v1-red", "left", -10); assert.equal(t.clips[0].fadeIn, 14);
  t = editorResizeFade(t, "v1-red", "right", -100); assert.equal(t.clips[0].fadeOut, 34);
  assert.throws(() => editorSetFade(t, "v1-red", "left", NaN), /valid fade/);
  assert.throws(() => editorSetFade(t, "v1-red", "left", -1), /valid fade/);
  t = editorSetFade(t, "v1-red", "right", 0); assert.ok(!Object.hasOwn(t.clips[0], "fadeOut"));
  assert.equal(JSON.stringify(base), before);
  t = { ...t, tracks: t.tracks.map(track => track.id === "v1" ? { ...track, locked: true } : track) };
  assert.throws(() => editorSetFade(t, "v1-red", "left", 0), /Unlock/);
  assert.equal(JSON.stringify(base), before);
});

test("video opacity and audio volume use the same exact endpoint envelope", () => {
  let t = editorSetFade(transitionTimeline(), "a1-red", "left", 12);
  t = editorSetFade(t, "a1-red", "right", 12);
  const clip = t.clips.find(c => c.id === "a1-red"), segment = editorAudioSegments(t).find(s => s.clip.id === clip.id);
  for (const [frame, value] of [[0, 0], [5.5, .5], [11, 1], [24, 1], [36, 1], [41.5, .5], [47, 0]]) {
    assert.equal(editorClipFade(clip, frame), value); assert.equal(editorAudioGain(segment, frame), value);
  }
});

test("fades survive save/copy/FPS/move and splits retain only the outside edges", () => {
  let t = editorSetFade(transitionTimeline(), "v1-red", "left", 12);
  t = editorSetFade(t, "v1-red", "right", 12);
  assert.deepEqual(normalizeEditorTimeline(JSON.parse(JSON.stringify(t))), t);
  assert.notEqual(editorRenderSignature(t), editorRenderSignature(transitionTimeline()));
  const split = editorSplit(t, 24, ["v1-red"], false);
  assert.equal(split.clips[0].fadeIn, 12); assert.ok(!split.clips[0].fadeOut);
  assert.equal(split.clips[1].fadeOut, 12); assert.ok(!split.clips[1].fadeIn);
  const fps = editorSetFrameRate(t, 60); assert.equal(fps.clips[0].fadeIn, 30);
  const pasted = editorPasteClips(fps, editorCopyClips(t, ["v1-red"], false), 240);
  assert.equal(pasted.clips.at(-1).fadeIn, 30); assert.equal(pasted.clips.at(-1).fadeOut, 30);
  assert.equal(editorMove(t, ["v1-red"], 48, { linked: false, anchorId: "v1-red", trackId: "v2" }).clips[0].fadeIn, 12);
  const trimmed = editorTrim(t, "v1-red", "right", -36, false).clips[0];
  assert.equal(trimmed.fadeIn, 12); assert.ok(!trimmed.fadeOut);
});

test("a single edge cannot have both fade and transition; opposite edges remain intact", () => {
  let t = editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve");
  t = editorSetFade(t, "v1-red", "left", 100);
  assert.equal(t.clips[0].fadeIn, 36); assert.equal(t.transitions.length, 1);
  t = editorSetFade(t, "v1-red", "right", 12); assert.equal(t.transitions.length, 0);
  t = editorSetTransition(t, "v1-red", "v1-blue", "dipToBlack");
  assert.equal(t.transitions.length, 1); assert.ok(!t.clips[0].fadeOut); assert.equal(t.clips[0].fadeIn, 36);
});

test("fade validation rejects malformed payloads instead of silently exporting incorrect results", () => {
  for (const fadeIn of [-1, 1, 1.5, 100, "12", NaN, Infinity]) {
    const t = transitionTimeline(); t.clips[0].fadeIn = fadeIn;
    assert.throws(() => validateEditorRequest(t), /fade/);
  }
  const t = transitionTimeline(); t.clips[0].fadeIn = 30; t.clips[0].fadeOut = 30;
  assert.throws(() => validateEditorRequest(t), /fade/);
  assert.deepEqual(validateEditorRequest(editorSetFade(transitionTimeline(), "v1-red", "left")), editorSetFade(transitionTimeline(), "v1-red", "left"));
});

test("playback prepares lower tracks during fades but skips them under opaque material", () => {
  let t = transitionTimeline(); t.clips.push({ ...t.clips[0], id: "cover", trackId: "v2", assetId: "blue", linkGroup: "" });
  t = editorSetFade(editorSetFade(t, "cover", "left", 12), "cover", "right", 12);
  const schedule = editorPlaybackSchedule(t), ids = f => schedule.video.find(s => f >= s.start && f < s.end).segments.map(s => s.clip.id);
  assert.deepEqual(ids(0), ["v1-red", "cover"]); assert.deepEqual(ids(24), ["cover"]); assert.deepEqual(ids(47), ["v1-red", "cover"]);
  assert.equal(schedule.media.filter(s => s.clip.id === "v1-red").length, 2);
  t.tracks.find(track => track.id === "v1").muted = true;
  assert.ok(editorPlaybackSchedule(t).media.every(s => s.clip.id !== "v1-red"));
});

test("marquee adds unlocked clips, preserves earlier picks and respects linked track locks", () => {
  const t = transitionTimeline(); t.tracks.find(track => track.id === "a1").locked = true;
  assert.deepEqual(editorMarqueeSelection(t, ["existing"], ["v1-red", "a1-red"]), ["existing"]);
  assert.deepEqual(editorMarqueeSelection(t, [], ["v1-red", "a1-red"], false), ["v1-red"]);
  t.tracks.find(track => track.id === "a1").locked = false;
  assert.deepEqual(editorMarqueeSelection(t, ["v1-blue"], ["v1-red", "v1-blue"]), ["v1-blue", "v1-red"]);
});

test("multi-track movement preserves spacing and refuses unavailable destinations atomically", () => {
  const t = transitionTimeline(); t.tracks.unshift({ id: "v3", kind: "video", name: "V3" });
  t.clips.push({ ...t.clips[0], id: "top", trackId: "v2", linkGroup: "" });
  const moved = editorMove(t, ["v1-red", "top"], 96, { anchorId: "v1-red", trackId: "v2" });
  assert.equal(moved.clips.find(c => c.id === "v1-red").trackId, "v2");
  assert.equal(moved.clips.find(c => c.id === "top").trackId, "v3");
  assert.equal(moved.clips.find(c => c.id === "a1-red").start, 96);
  assert.throws(() => editorMove(t, ["top", "v1-red"], 0, { anchorId: "top", trackId: "v1" }), /same spacing/);
});

test("fade exports/stills require updated backend support, without sending an unsupported render", async t => {
  const calls = []; let supported = false;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json(String(url).endsWith("/api/health") ? { routes: { editorClipFades: supported } } : { id: "job" });
  });
  const timeline = editorSetFade(transitionTimeline(), "v1-red", "left");
  for (const frame of [null, 5]) {
    calls.length = 0; await assert.rejects(editorApi.render({ timeline, frame }), /Restart.*fades/); assert.equal(calls.length, 1);
  }
  supported = true; calls.length = 0;
  await editorApi.render({ timeline }); assert.equal(calls.length, 2); assert.deepEqual(JSON.parse(calls[1].options.body).timeline, timeline);
});
