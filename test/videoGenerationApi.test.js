import test from "node:test";
import assert from "node:assert/strict";
import { nodeApi, generationApi, myNewtApi } from "../src/api/newtApi.js";
import { withMyNewtRequestScope } from "../src/myNewt/requestScope.js";
import { isVideoGenerationRequest, isVideoGenerationRoute } from "../src/videoJobPolicy.js";

const paths = [
  () => nodeApi.planStoryboard({ nodeId: "board" }),
  () => nodeApi.reviseStoryboard({ nodeId: "board" }),
  () => nodeApi.reviewStoryboardSequence({ nodeId: "board" }),
  () => nodeApi.generateImage({ nodeId: "image" }),
  () => myNewtApi.request("job", { route: "/api/node/generate-image", body: {} }),
  () => nodeApi.generateVideo({ nodeId: "video" }),
  () => nodeApi.utilityVideo({ nodeId: "utility" }),
  () => generationApi.generateNodeVideo({}),
  () => generationApi.generateVideo(new FormData()),
  () => myNewtApi.request("job", { route: "/api/node/generate-video", body: {} })
];

test("Kling 4 checks backend capability before a single paid request", async (t) => {
  const calls = [];
  let supported = false;
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith("/api/health")) return Response.json({ routes: { kling4: supported } });
    return Response.json({ video: { localUrl: "/outputs/kling4.mp4" } });
  });
  const request = { model: "Kling 4", prompt: "A scene.", duration: "30 seconds", resolution: "720p" };
  await assert.rejects(nodeApi.generateVideo(request), /Restart.*Kling 4.*No generation was submitted/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\/health$/);
  supported = true;
  calls.length = 0;
  const result = await nodeApi.generateVideo(request);
  assert.equal(result.data.video.localUrl, "/outputs/kling4.mp4");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\/health$/);
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), request);
});

test("only video generation requests bypass the generic fallback", () => {
  assert.equal(isVideoGenerationRoute("/api/node/generate-video"), true);
  assert.equal(isVideoGenerationRoute("/api/node/generate-image"), false);
  assert.equal(isVideoGenerationRequest("/api/my-newt/jobs/a/request", { body: '{"route":"/api/node/utility-video"}' }), true);
  assert.equal(isVideoGenerationRequest("/api/my-newt/jobs/a/request", { body: "broken" }), false);
});

for (const failure of ["network", "HTML", "body read"]) {
  test(`media generation wrappers never replay a POST on ${failure} failure`, async (t) => {
    const originalWindow = globalThis.window;
    globalThis.window = { location: { hostname: "localhost", port: "5176" } };
    t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      if (failure === "network") throw new Error("Disconnected");
      if (failure === "body read") return { text: async () => { throw new Error("Disconnected"); } };
      return new Response("<!DOCTYPE html><html>Timeout</html>", { status: 504 });
    });
    for (const run of paths) {
      const previous = fetch.mock.callCount();
      await assert.rejects(run(), /Check History and the provider.*did not resubmit or cancel/);
      assert.equal(fetch.mock.callCount(), previous + 1);
      assert.equal(fetch.mock.calls.at(-1).arguments[1].signal, undefined);
    }
  });
}

test("video wrappers retain their result shapes and provider failure messages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ video: { localUrl: "/video.mp4" } }));
  assert.equal((await nodeApi.generateVideo({})).data.video.localUrl, "/video.mp4");
  assert.equal((await generationApi.generateNodeVideo({})).video.localUrl, "/video.mp4");
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Provider cancelled" }, { status: 502 }));
  await assert.rejects(generationApi.generateNodeVideo({}), /Provider cancelled/);
  const result = await nodeApi.generateVideo({});
  assert.equal(result.response.ok, false);
  assert.equal(result.data.error, "Provider cancelled");
});

test("Newt approval and budget request scopes are still honored", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("Must use the approved relay"));
  let relays = 0;
  const result = await withMyNewtRequestScope("video", async (route, body, sequence) => {
    relays++;
    assert.equal(route, "/api/node/generate-video");
    assert.equal(body.nodeId, "video");
    assert.equal(sequence, 1);
    return { response: { ok: true }, data: { video: {} } };
  }, () => nodeApi.generateVideo({ nodeId: "video" }));
  assert.equal(result.response.ok, true);
  assert.equal(relays, 1);
  assert.equal(fetch.mock.callCount(), 0);
});
