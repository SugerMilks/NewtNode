import test from "node:test";
import assert from "node:assert/strict";
import { createStoryboardFalClient } from "../server/storyboard-fal.js";

const requestId = "storyboard-test-request";
const networkError = () => new TypeError("fetch failed", { cause: Object.assign(new Error("socket closed"), { code: "ECONNRESET" }) });
function fixture({ endpoint = "openrouter/router", fail, status = "COMPLETED" } = {}) {
  const calls = [], waits = [];
  const client = createStoryboardFalClient({ credentials: "fixture-key", endpoint, model: "fixture-model" }, {
    wait: async ms => { waits.push(ms); },
    fetchImpl: async (url, options) => {
      const kind = options.method === "POST" ? "submit" : new URL(url).pathname.endsWith("/status") ? "status" : "result";
      const count = calls.filter(call => call.kind === kind).length + 1;
      calls.push({ kind, url, options });
      const response = await fail?.(kind, count, options);
      if (response) return response;
      return Response.json(kind === "submit" ? { request_id: requestId }
        : kind === "status" ? { request_id: requestId, status: typeof status === "function" ? status(count) : status }
          : { output: "completed plan", usage: { cost: 0.05 } }, { headers: { "x-fal-request-id": requestId } });
    }
  });
  return { calls, waits, run: options => client.subscribe(endpoint, { input: { prompt: "Plan shots" }, pollInterval: 0, ...options }) };
}

for (const endpoint of ["openrouter/router", "openrouter/router/vision"]) {
  for (const phase of ["status", "result"]) test(`${endpoint} reconnects after a lost ${phase} GET, without another submission`, async () => {
    const f = fixture({ endpoint, fail(kind, count) { if (kind === phase && count === 1) throw networkError(); } });
    const enqueued = [], updates = [];
    const result = await f.run({ onEnqueue: id => enqueued.push(id), onQueueUpdate: update => updates.push(update.status) });
    assert.equal(result.data.output, "completed plan");
    assert.equal(result.data.usage.cost, 0.05);
    assert.deepEqual(enqueued, [requestId]);
    assert.ok(updates.includes("COMPLETED"));
    assert.deepEqual(f.waits, [1000]);
    assert.equal(f.calls.filter(call => call.kind === "submit").length, 1);
    for (const call of f.calls.filter(call => call.kind !== "submit")) {
      assert.equal(call.options.method, "GET");
      assert.equal(call.options.headers.Authorization, "Key fixture-key");
      assert.ok(new URL(call.url).pathname.includes(`/requests/${requestId}`));
    }
  });
}

test("Storyboard keeps polling the original in-progress job after reconnecting", async () => {
  const f = fixture({ status: count => count < 4 ? "IN_PROGRESS" : "COMPLETED", fail(kind, count) { if (kind === "status" && count === 2) throw networkError(); } });
  assert.equal((await f.run()).data.output, "completed plan");
  assert.equal(f.calls.filter(call => call.kind === "submit").length, 1);
  assert.equal(f.calls.filter(call => call.kind === "status").length, 4);
});

test("Storyboard also recovers a dropped result body", async () => {
  const f = fixture({ fail(kind, count) { if (kind === "result" && count === 1) return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => { throw networkError(); } }; } });
  assert.equal((await f.run()).data.output, "completed plan");
  assert.equal(f.calls.filter(call => call.kind === "submit").length, 1);
});

test("exhausted connection checks retain request ID and unknown usage, without canceling or resubmitting", async () => {
  const f = fixture({ fail(kind) { if (kind === "status") throw networkError(); } });
  await assert.rejects(f.run(), error => {
    assert.equal(error.requestId, requestId);
    assert.equal(error.status, 502);
    assert.equal(error.llmResult.usage, null);
    assert.equal(error.llmResult.model, "fixture-model");
    assert.match(error.message, /may still finish and be billed/);
    assert.match(error.message, /did not resubmit/);
    return true;
  });
  assert.deepEqual(f.waits, [1000, 2000, 4000]);
  assert.equal(f.calls.filter(call => call.options.method === "POST").length, 1);
  assert.equal(f.calls.length, 5);
  assert.ok(f.calls.every(call => ["POST", "GET"].includes(call.options.method)));
});

test("an unacknowledged paid submission is never replayed", async () => {
  const f = fixture({ fail() { throw networkError(); } });
  await assert.rejects(f.run(), /could not confirm.*may have been billed/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.waits, []);
});

for (const failure of [new Error("Invalid model"), new SyntaxError("Invalid JSON"), Object.assign(new Error("aborted"), { name: "AbortError" })]) {
  test(`Storyboard does not reconnect after ${failure.name}: ${failure.message}`, async () => {
    const f = fixture({ fail(kind) { if (kind === "result") throw failure; } });
    await assert.rejects(f.run(), error => error === failure);
    assert.deepEqual(f.waits, []);
    assert.equal(f.calls.length, 3);
  });
}

test("Storyboard respects an explicitly aborted request", async () => {
  const abort = new AbortController();
  const f = fixture({ fail(kind) { if (kind === "status") { abort.abort(); throw networkError(); } } });
  await assert.rejects(f.run({ abortSignal: abort.signal }), /fetch failed/);
  assert.deepEqual(f.waits, []);
  assert.equal(f.calls.length, 2);
});

test("provider validation errors are not turned into reconnects", async () => {
  const f = fixture({ fail(kind) { if (kind === "result") return Response.json({ detail: "Model refused the request" }, { status: 422 }); } });
  await assert.rejects(f.run(), error => error.status === 422);
  assert.deepEqual(f.waits, []);
  assert.equal(f.calls.length, 3);
});
