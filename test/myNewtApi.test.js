import test from "node:test";
import assert from "node:assert/strict";
import { myNewtApi } from "../src/api/newtApi.js";

test("outdated backends cannot start expensive tasks; current capability checks are cached", async (t) => {
  const original = globalThis.fetch, calls = [];
  let updated = false, localActions = false, backgroundActions = false, approvedWork = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith("/api/health")
      ? { ok: true, routes: { myNewtPlanning: updated, myNewtLocalActions: localActions, myNewtBackgroundActions: backgroundActions, myNewtApprovedWork: approvedWork } }
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
  await assert.rejects(myNewtApi.start({ brief: 'Protect "Emma"', executionRoute: "local" }), /Restart the NewtNode backend/);
  approvedWork = true;
  assert.equal((await myNewtApi.start({ brief: "Test" })).id, "test");
  await myNewtApi.sync("test", {});
  assert.equal(calls.filter((url) => url.endsWith("/api/health")).length, 5);
});

test("remote start and control never retry ambiguous transport failures through the API fallback", async (t) => {
  const original = globalThis.fetch, posts = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, routes: { myNewtPlanning: true, myNewtLocalActions: true, myNewtBackgroundActions: true, myNewtApprovedWork: true } }));
    posts.push({ url: String(url), body: JSON.parse(options.body) });
    throw new TypeError("Connection closed after submission");
  };
  await assert.rejects(myNewtApi.startRemote({ brief: "Save" }), /Connection closed/);
  assert.equal(posts.length, 1);
  await assert.rejects(myNewtApi.controlRemote("test", { action: "approve", expectedVersion: "reviewed-version" }), /Connection closed/);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.expectedVersion, "reviewed-version");
});

test("Auto Review is never silently submitted to a backend without its capability", async (t) => {
  const original = globalThis.fetch, posts = [];
  let autoReview = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, routes: { myNewtPlanning: true, myNewtLocalActions: true, myNewtBackgroundActions: true, myNewtApprovedWork: true, myNewtAutoReview: autoReview } }));
    posts.push(JSON.parse(options.body)); return new Response(JSON.stringify({ id: "test" }));
  };
  await assert.rejects(myNewtApi.start({ settings: { autoReview: true } }), /activate Auto Review/);
  await assert.rejects(myNewtApi.control("test", { action: "settings", settings: { autoReview: true } }), /activate Auto Review/);
  assert.equal(posts.length, 0);
  autoReview = true;
  await myNewtApi.start({ settings: { autoReview: true } });
  assert.equal(posts[0].settings.autoReview, true);
});

test("favorite models cannot be silently ignored by an older backend", async (t) => {
  const original = globalThis.fetch, posts = [];
  let available = false;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, routes: { myNewtPlanning: true, myNewtLocalActions: true, myNewtBackgroundActions: true, myNewtApprovedWork: true, myNewtFavoriteModels: available } }));
    posts.push(JSON.parse(options.body)); return new Response(JSON.stringify({ id: "test" }));
  };
  const settings = { favoriteImageModel: "Nano Banana Pro", favoriteVideoModel: "Seedance 2.5" };
  await assert.rejects(myNewtApi.start({ settings }), /activate favorite model/);
  await assert.rejects(myNewtApi.control("test", { action: "settings", settings }), /activate favorite model/);
  assert.equal(posts.length, 0);
  available = true;
  await myNewtApi.start({ settings }); assert.deepEqual(posts[0].settings, settings);
});
