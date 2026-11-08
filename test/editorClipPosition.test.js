import test from "node:test";
import assert from "node:assert/strict";
import { transitionTimeline } from "./fixtures/editorTransitions.js";
import { normalizeEditorTimeline, editorSetClipPosition, editorRenderSignature, editorSplit, editorCopyClips, editorPasteClips, editorSetFrameRate } from "../src/editorTimeline.js";
import { editorClipOffset, normalizeEditorPosition } from "../src/editorClipPosition.js";
import { validateEditorRequest } from "../server/editor-render.js";
import { editorApi } from "../src/api/newtApi.js";

test("clip positioning preserves old timelines, timing and linked sound; reset restores the export signature", () => {
  const base = transitionTimeline(), signature = editorRenderSignature(base);
  const positioned = editorSetClipPosition(base, "v1-red", { positionX: 25, positionY: -10 });
  assert.deepEqual(positioned.clips[0], { ...base.clips[0], positionX: 25, positionY: -10 });
  assert.deepEqual(positioned.clips.slice(1), base.clips.slice(1));
  assert.notEqual(editorRenderSignature(positioned), signature);
  assert.equal(editorRenderSignature(editorSetClipPosition(positioned, "v1-red", { positionX: 0, positionY: 0 })), signature);
  assert.deepEqual(normalizeEditorTimeline(base), base);
  assert.deepEqual(normalizeEditorTimeline(JSON.parse(JSON.stringify(positioned))), positioned);
  assert.deepEqual(editorClipOffset(positioned.clips[0], 1920, 1080), { x: 480, y: -108 });
  assert.deepEqual(editorClipOffset(positioned.clips[0], 3840, 2160), { x: 960, y: -216 });
});

test("positions are bounded, video-only and obey video locks without editing linked audio", () => {
  const base = transitionTimeline();
  assert.equal(normalizeEditorPosition(Infinity), 0);
  assert.equal(normalizeEditorPosition(-201), -100);
  assert.equal(normalizeEditorPosition(1.234), 1.2);
  assert.equal(editorSetClipPosition(base, "a1-red", { positionX: 10 }), base);
  base.tracks.find(t => t.id === "a1").locked = true;
  assert.equal(editorSetClipPosition(base, "v1-red", { positionX: 101 }).clips[0].positionX, 100);
  base.tracks.find(t => t.id === "v1").locked = true;
  assert.throws(() => editorSetClipPosition(base, "v1-red", { positionX: 10 }), /Unlock/);
  for (const value of [Infinity, NaN, -101, 101, "20", null, {}]) {
    const bad = transitionTimeline(); bad.clips[0].positionX = value;
    assert.throws(() => validateEditorRequest(bad), /positions/);
  }
  const bad = transitionTimeline(); bad.clips.find(c => c.id === "a1-red").positionY = 10;
  assert.throws(() => validateEditorRequest(bad), /positions/);
});

test("split, copy/paste, frame-rate and output-size changes retain clip framing", () => {
  const positioned = editorSetClipPosition(transitionTimeline(), "v1-red", { positionX: 12.5, positionY: -20 });
  let id = 0;
  const split = editorSplit(positioned, 24, ["v1-red"], true, () => `split-${++id}`);
  assert.deepEqual(split.clips.filter(c => c.trackId === "v1" && c.assetId === "red").map(c => [c.positionX, c.positionY]), [[12.5, -20], [12.5, -20]]);
  const pasted = editorPasteClips(positioned, editorCopyClips(positioned, ["v1-red"]), 96, { makeId: () => `paste-${++id}` });
  assert.equal(pasted.clips.find(c => c.start === 96 && c.trackId === "v1").positionX, 12.5);
  assert.equal(editorSetFrameRate(positioned, 60).clips[0].positionY, -20);
  assert.equal(normalizeEditorTimeline({ ...positioned, width: 3840 }).clips[0].positionX, 12.5);
});

test("positioned exports and stills require backend support; ordinary timelines retain their request path", async t => {
  const calls = []; let supported = false;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json(String(url).endsWith("/api/health") ? { routes: { editorTimeline: true, editorClipPosition: supported } } : { id: "job" });
  });
  const timeline = editorSetClipPosition(transitionTimeline(), "v1-red", { positionX: 25 });
  for (const frame of [null, 24]) {
    calls.length = 0;
    await assert.rejects(editorApi.render({ timeline, frame }), /Restart.*clip positions.*no export was started/);
    assert.equal(calls.length, 1);
  }
  supported = true; calls.length = 0;
  await editorApi.render({ timeline }); assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].options.body).timeline, timeline);
  calls.length = 0;
  await editorApi.render({ timeline: transitionTimeline() }); assert.equal(calls.length, 1);
});
