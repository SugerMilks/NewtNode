import test from "node:test";
import assert from "node:assert/strict";
import { editorApi } from "../src/api/newtApi.js";
import { editorSetTransition } from "../src/editorTransitions.js";
import { transitionTimeline } from "./fixtures/editorTransitions.js";

test("transition exports and stills cannot silently render as cuts on an older backend", async t => {
  const calls = []; let supported = false;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json(String(url).endsWith("/api/health") ? { routes: { editorTimeline: true, editorTransitions: supported } } : { id: "job", status: "running" });
  });
  const timeline = editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve");
  for (const frame of [null, 48]) {
    calls.length = 0;
    await assert.rejects(editorApi.render({ timeline, frame }), /Restart.*transitions.*no export was started/);
    assert.equal(calls.length, 1); assert.match(calls[0].url, /health$/);
  }
  supported = true; calls.length = 0;
  assert.equal((await editorApi.render({ timeline })).id, "job");
  assert.equal(calls.length, 2); assert.deepEqual(JSON.parse(calls[1].options.body).timeline, timeline);
  calls.length = 0;
  await editorApi.render({ timeline: transitionTimeline() }); assert.equal(calls.length, 1, "Ordinary cuts keep their existing request path");
});
