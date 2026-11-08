import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { editorResizeTransition, editorSetTransition, editorTransitionWindows } from "../src/editorTransitions.js";
import { transitionTimeline } from "./fixtures/editorTransitions.js";

const source = readFileSync(new URL("../src/components/EditorNodeBody.jsx", import.meta.url), "utf8");
function handler(name, next, deps) {
  const start = source.indexOf(`  function ${name}(`), end = source.indexOf(`  function ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return new Function(...Object.keys(deps), `${source.slice(start, end)};return ${name};`)(...Object.values(deps));
}
const initial = () => editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve");

test("transition dragging accounts for canvas scale, timeline zoom and scrolling without committing intermediate changes", () => {
  for (const scale of [.25, .5, 1, 2]) for (const px of [.5, 2, 8]) for (const edge of ["left", "right"]) {
    const base = initial(), transition = editorTransitionWindows(base)[0], g = { kind: "transition", base, transition, edge, pointerId: 7, x: 200, scale, px, initialScroll: 50 };
    let draft;
    const move = handler("pointerMove", "pointerEnd", { gesture: { current: g }, scroller: { current: { scrollLeft: 50 + 2 * px } }, editorResizeTransition, setDraft: value => { draft = value; }, setError: value => assert.equal(value, "") });
    move({ pointerId: 7, clientX: 200 + 4 * px * scale });
    assert.equal(draft.transitions[0].duration, edge === "left" ? 12 : 36); assert.equal(g.next, draft);
    assert.equal(base.transitions[0].duration, 24); assert.deepEqual(draft.clips, base.clips);
  }
});

test("a completed resize commits once while canceled or stale gestures preserve saved work", () => {
  const base = initial(), next = editorResizeTransition(base, "v1-red", "v1-blue", "right", 6);
  for (const mode of ["finish", "cancel", "stale"]) {
    const gesture = { current: { kind: "transition", base, next, pointerId: 7 } }, commits = [], errors = [];
    const end = handler("pointerEnd", "changeTrack", { gesture, latest: { current: { saved: mode === "stale" ? { ...base, inFrame: 3 } : base } },
      commit: t => commits.push(t), setDraft: value => assert.equal(value, null), setError: value => errors.push(value) });
    const event = { pointerId: 7, type: mode === "cancel" ? "pointercancel" : "pointerup" };
    end(event); end(event);
    assert.equal(gesture.current, null); assert.equal(commits.length, mode === "finish" ? 1 : 0);
    assert.equal(errors.length, mode === "stale" ? 1 : 0);
  }
});

test("lost capture or window blur cancels the resize without saving it", () => {
  let released = 0, cleared = 0;
  const gesture = { current: { kind: "transition", pointerId: 7, target: { hasPointerCapture: id => id === 7, releasePointerCapture: () => { released++; } } } };
  const cancel = handler("cancelTransitionResize", "transitionEdgeKey", { gesture, setDraft: value => { assert.equal(value, null); cleared++; } });
  cancel(); cancel(); assert.equal(released, 1); assert.equal(cleared, 1); assert.equal(gesture.current, null);
  assert.match(source, /window.addEventListener\("blur", cancelTransitionResize\)/);
  assert.match(source, /onLostPointerCapture=\{cancelTransitionResize\}/);
  assert.doesNotMatch(source, /<select[^>]*aria-label="Transition duration"/);
});
