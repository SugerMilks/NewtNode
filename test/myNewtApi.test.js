import test from "node:test";
import assert from "node:assert/strict";
import { myNewtApi } from "../src/api/newtApi.js";

test("outdated backends cannot start expensive tasks; current capability checks are cached", async (t) => {
  const original = globalThis.fetch, calls = [];
  let updated = false, localActions = false, backgroundActions = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith("/api/health")
      ? { ok: true, routes: { myNewtPlanning: updated, myNewtLocalActions: localActions, myNewtBackgroundActions: backgroundActions } }
      : { id: "test" }), { headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(myNewtApi.start({ brief: "Test" }), /Restart the NewtNode backend/);
  assert.equal(calls.length, 1);
  updated = true;
  await assert.rejects(myNewtApi.start({ brief: "Add a Text node", executionRoute: "local" }), /Restart the NewtNode backend/);
  assert.equal(calls.length, 2);
  localActions = true;
  await assert.rejects(myNewtApi.start({ brief: "Save", executionRoute: "local" }), /Restart the NewtNode backend/);
  backgroundActions = true;
  assert.equal((await myNewtApi.start({ brief: "Test" })).id, "test");
  await myNewtApi.sync("test", {});
  assert.equal(calls.filter((url) => url.endsWith("/api/health")).length, 4);
});
