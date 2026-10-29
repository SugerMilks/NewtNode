import test from "node:test";
import assert from "node:assert/strict";
import { nodeApi } from "../src/api/newtApi.js";

test("Outpaint blocks an old backend before generation or preparation", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, routes: {} }));
  await assert.rejects(nodeApi.utilityVideo({ model: "Video Outpaint" }), /Restart NewtNode.*No generation was submitted/);
  await assert.rejects(nodeApi.prepareVideoOutpaint({}), /Restart NewtNode/);
  assert.equal(fetch.mock.callCount(), 2);
  assert.ok(fetch.mock.calls.every(call => String(call.arguments[0]).endsWith("/api/health")));
});

for (const failure of ["network", "HTML", "body read"]) {
  test(`Outpaint never replays generation or prompt analysis after ${failure} failure`, async t => {
    const fetch = t.mock.method(globalThis, "fetch", async url => {
      if (String(url).endsWith("/api/health")) return Response.json({ ok: true, routes: { videoOutpaint: true } });
      if (failure === "network") throw new Error("Interrupted");
      if (failure === "body read") return { text: async () => { throw new Error("Body interrupted"); } };
      return new Response("<html>Gateway timeout</html>", { status: 504 });
    });
    await assert.rejects(nodeApi.utilityVideo({ model: "Video Outpaint" }), /did not resubmit or cancel/);
    await assert.rejects(nodeApi.analyzeVideoOutpaint({ mode: "auto" }));
    const posts = fetch.mock.calls.filter(call => call.arguments[1]?.method === "POST");
    assert.equal(posts.length, 2);
    assert.ok(posts.every(call => call.arguments[1].signal === undefined));
  });
}
