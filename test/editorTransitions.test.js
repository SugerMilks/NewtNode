import test from "node:test";
import assert from "node:assert/strict";
import { transitionTimeline } from "./fixtures/editorTransitions.js";
import { editorCuts, editorSetTransition, editorResizeTransition, editorTransitionLimit, editorTransitionWindows, editorVideoSegments, editorVideoLayers, editorAudioSegments, editorAudioGain } from "../src/editorTransitions.js";
import { normalizeEditorTimeline, editorEnd, editorRenderSignature, editorMove, editorTrim, editorSplit, editorDelete, editorDuplicate, editorCopyClips, editorPasteClips, editorSetFrameRate } from "../src/editorTimeline.js";
import { validateEditorRequest } from "../server/editor-render.js";
const add = (t, type = "crossDissolve", duration = 24) => editorSetTransition(t, "v1-red", "v1-blue", type, duration);

test("transitions apply only at touching cuts of the appropriate type and respect track locks", () => {
  const t = transitionTimeline();
  assert.deepEqual(editorCuts(t, "v1"), [{ leftId: "v1-red", rightId: "v1-blue", frame: 48, trackId: "v1" }]);
  assert.throws(() => add(t, "crossFade"), /media type/);
  assert.throws(() => editorSetTransition(t, "a1-red", "a1-blue", "dipToBlack"), /media type/);
  assert.throws(() => add({ ...t, tracks: t.tracks.map(tr => ({ ...tr, locked: true })) }), /Unlock/);
  assert.throws(() => add(editorMove(t, ["v1-blue"], 5)), /touching/);
  assert.deepEqual(editorCuts(editorMove(t, ["v1-blue"], 5), "v1"), []);
  const next = add(t); assert.deepEqual(next.clips, t.clips); assert.equal(editorEnd(next), editorEnd(t));
  assert.equal(next.transitions.length, 1); assert.equal(add(next, "dipToBlack").transitions.length, 1);
  assert.deepEqual(editorSetTransition(next, "v1-red", "v1-blue", null).transitions, []);
  assert.equal(t.transitions.length, 0);
});

test("transitions round to centered frames, limit short clips and require real audio handles", () => {
  const t = transitionTimeline();
  assert.equal(add(t, "crossDissolve", 999).transitions[0].duration, 48);
  assert.equal(add(t, "crossDissolve", 7).transitions[0].duration, 8);
  const full = { ...t, clips: t.clips.map(c => ({ ...c, sourceIn: 0, duration: 96, start: c.start ? 96 : 0 })) };
  assert.equal(add(full).transitions.length, 1, "Untrimmed video can hold its edge frames");
  assert.equal(editorTransitionLimit(full, "a1-red", "a1-blue", "crossFade"), 0);
  assert.throws(() => editorSetTransition(full, "a1-red", "a1-blue", "crossFade"), /spare audio/);
  assert.equal(editorSetTransition(t, "a1-red", "a1-blue", "crossFade", 999).transitions[0].duration, 48);
});

test("save, normalization, render signatures and server validation retain only valid transitions", () => {
  const t = add(transitionTimeline());
  assert.deepEqual(normalizeEditorTimeline(JSON.parse(JSON.stringify(t))), t);
  assert.deepEqual(validateEditorRequest(t), t);
  assert.notEqual(editorRenderSignature(t), editorRenderSignature(transitionTimeline()));
  for (const transitions of [[{ ...t.transitions[0], type: "evil" }], [{ ...t.transitions[0], duration: 999 }], [...t.transitions, ...t.transitions], "bad"]) {
    assert.throws(() => validateEditorRequest({ ...t, transitions }), /invalid transition/);
  }
  const { transitions, ...old } = transitionTimeline();
  assert.deepEqual(normalizeEditorTimeline(old).transitions, []);
  assert.equal(editorRenderSignature(old), editorRenderSignature({ ...old, transitions: [] }));
});

test("editing, splitting, copying and changing FPS preserve or remove transitions with their cut", () => {
  const t = add(transitionTimeline());
  assert.equal(editorMove(t, ["v1-red", "v1-blue"], 24).transitions.length, 1);
  assert.equal(editorMove(t, ["v1-blue"], 24).transitions.length, 0);
  assert.equal(editorTrim(t, "v1-red", "right", -12).transitions.length, 0);
  assert.equal(editorDelete(t, ["v1-blue"]).transitions.length, 0);
  const split = editorSplit(t, 24, ["v1-red"]);
  assert.equal(split.transitions.length, 1); assert.notEqual(split.transitions[0].leftId, "v1-red");
  assert.equal(split.clips.find(c => c.id === split.transitions[0].leftId).start, 24);
  const copied = editorCopyClips(t, ["v1-red", "v1-blue"]), pasted = editorPasteClips(t, copied, 96);
  assert.equal(pasted.transitions.length, 2); assert.notEqual(pasted.transitions[1].leftId, t.transitions[0].leftId);
  assert.equal(editorCopyClips(t, ["v1-red"]).transitions.length, 0);
  assert.equal(editorDuplicate(t, ["v1-red", "v1-blue"]).transitions.length, 2);
  assert.equal(editorSetFrameRate(t, 60).transitions[0].duration, 60);
});

test("preview intervals have no holes or overlaps, with matching dissolve/dip and audio envelopes", () => {
  for (const type of ["crossDissolve", "dipToBlack"]) {
    const t = add(transitionTimeline(), type), segments = editorVideoSegments(t);
    for (let f = 0; f < 96; f++) assert.equal(segments.filter(s => f >= s.start && f < s.end).length, 1);
    const segment = segments.find(s => s.transition), middle = editorVideoLayers(segment, 48);
    assert.deepEqual(middle.map(l => l.opacity), type === "dipToBlack" ? [0] : [1, .5]);
    assert.equal(editorTransitionWindows(t)[0].start, 36);
  }
  const t = editorSetTransition(transitionTimeline(), "a1-red", "a1-blue", "crossFade"), audio = editorAudioSegments(t);
  assert.equal(audio[0].end, 60); assert.equal(audio[1].start, 36);
  for (let f = 36; f < 60; f++) assert.ok(Math.abs(audio.reduce((n, s) => n + editorAudioGain(s, f), 0) - 1) < 1e-8);
});

test("either transition edge resizes around the same cut without editing clips or sequence timing", () => {
  for (const type of ["crossDissolve", "dipToBlack", "crossFade"]) {
    const prefix = type === "crossFade" ? "a1" : "v1", left = `${prefix}-red`, right = `${prefix}-blue`;
    const t = editorSetTransition(transitionTimeline(), left, right, type);
    for (const [edge, delta] of [["left", -6], ["right", 6]]) {
      const resized = editorResizeTransition(t, left, right, edge, delta), window = editorTransitionWindows(resized)[0];
      assert.equal(window.duration, 36); assert.equal(window.start, 30); assert.equal(window.end, 66); assert.equal(window.cut, 48);
      assert.deepEqual(resized.clips, t.clips); assert.deepEqual(resized.assets, t.assets); assert.deepEqual(resized.tracks, t.tracks);
      assert.equal(editorEnd(resized), editorEnd(t)); assert.equal(resized.inFrame, t.inFrame); assert.equal(resized.outFrame, t.outFrame);
      assert.equal(editorResizeTransition(resized, left, right, edge, -delta).transitions[0].duration, 24);
    }
    assert.equal(editorResizeTransition(t, left, right, "left", 1000).transitions[0].duration, 2);
    assert.equal(editorResizeTransition(t, left, right, "right", 1000).transitions[0].duration, 48);
    assert.equal(editorResizeTransition(t, left, right, "left", .2), t, "Sub-frame movement does not dirty the timeline");
    assert.throws(() => editorResizeTransition({ ...t, tracks: t.tracks.map(tr => ({ ...tr, locked: true })) }, left, right, "right", 3), /Unlock/);
  }
});

test("resizing obeys audio handles and does not resurrect a removed transition", () => {
  const raw = transitionTimeline(); raw.clips.find(c => c.id === "a1-blue").sourceIn = 8;
  const t = editorSetTransition(raw, "a1-red", "a1-blue", "crossFade", 12);
  assert.equal(editorResizeTransition(t, "a1-red", "a1-blue", "right", 10).transitions[0].duration, 16);
  assert.throws(() => editorResizeTransition(transitionTimeline(), "v1-red", "v1-blue", "right", 1), /no longer/);
  assert.throws(() => editorResizeTransition(t, "a1-red", "a1-blue", "top", 1), /valid/);
  assert.throws(() => editorResizeTransition(t, "a1-red", "a1-blue", "right", NaN), /valid/);
});
