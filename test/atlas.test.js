import test from "node:test";
import assert from "node:assert/strict";
import { atlasError, createAtlasClient } from "../server/atlas.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const pending = (status = "processing") => json({ data: { id: "job-1", status } });
const completed = () => json({ data: { id: "job-1", status: "completed", outputs: ["https://cdn.example/result.mp4"] } });
const input = { model: "bytedance/seedance-2.5/text-to-video", prompt: "Scene", enable_sync_mode: false };

test("Atlas video keeps polling beyond an hour, retries only lookups, and captures one key", async () => {
  let posts = 0, gets = 0, elapsed = 0;
  const credentials = new Set();
  const client = createAtlasClient({ sleep: async (ms) => { elapsed += ms; }, fetchImpl: async (url, options) => {
    credentials.add(options.headers.Authorization);
    assert.equal(options.redirect, "error");
    if (options.method === "POST") { posts += 1; return pending(); }
    assert.equal(url, "https://api.atlascloud.ai/api/v1/model/prediction/job-1");
    gets += 1;
    if (gets === 4) return new Response("<!DOCTYPE html><html>Timeout</html>", { status: 524 });
    if (gets === 5) throw new TypeError("Disconnected");
    if (gets === 6) return json({ code: 429, message: "Busy" });
    return gets < 850 ? pending() : completed();
  } });
  const result = await client.generate({ mediaType: "video", input, key: "original-key" });
  assert.equal(posts, 1);
  assert.ok(elapsed > 60 * 60 * 1000);
  assert.deepEqual([...credentials], ["Bearer original-key"]);
  assert.equal(result.requestId, "job-1");
  assert.equal(result.url, "https://cdn.example/result.mp4");
});

test("Atlas never retries uncertain paid submissions", async () => {
  for (const response of [() => { throw new Error("network"); }, () => new Response("bad response"), () => json({ message: "Busy" }, 503)]) {
    let calls = 0;
    const client = createAtlasClient({ fetchImpl: async () => { calls += 1; return response(); }, sleep: async () => {} });
    await assert.rejects(client.generate({ mediaType: "video", input, key: "key" }), /Check Atlas Cloud history.*did not resubmit/i);
    assert.equal(calls, 1);
  }
});

test("Atlas provider failures and cancellations are terminal and readable", async () => {
  for (const status of ["failed", "canceled", "cancelled"]) {
    let calls = 0;
    const client = createAtlasClient({ fetchImpl: async () => {
      calls += 1;
      return json({ data: { id: "job-1", status, error: { message: "Provider ended the run" } } });
    } });
    await assert.rejects(client.generate({ mediaType: "video", input, key: "key" }), /Provider ended the run/);
    assert.equal(calls, 1);
  }
  assert.ok(!atlasError({ error: { message: "<!DOCTYPE html><body>bad</body>" } }, 524).includes("DOCTYPE"));
  assert.match(atlasError({ detail: [{ msg: "Invalid resolution" }] }, 422), /Invalid resolution/);
});

test("Atlas lookup authorization and persistent not-found errors never cancel or resubmit", async () => {
  for (const status of [401, 403, 404]) {
    let posts = 0, gets = 0;
    const client = createAtlasClient({ sleep: async () => {}, fetchImpl: async (_url, options) => {
      if (options.method === "POST") { posts += 1; return pending(); }
      gets += 1;
      return json({ message: "Lookup error" }, status);
    } });
    await assert.rejects(client.generate({ mediaType: "video", input, key: "key" }), /job job-1.*did not cancel or resubmit/);
    assert.equal(posts, 1);
    assert.equal(gets, status === 404 ? 16 : 1);
  }
});

test("Atlas retains finite image polling without canceling the provider job", async () => {
  let calls = 0;
  const client = createAtlasClient({ sleep: async () => {}, fetchImpl: async () => { calls += 1; return pending(); } });
  await assert.rejects(client.generate({ mediaType: "image", input, key: "key" }), /image job job-1 is still pending/);
  assert.equal(calls, 601);
});

test("Atlas rejects missing keys, missing IDs, and empty outputs", async () => {
  const noKey = createAtlasClient({ fetchImpl: async () => { throw new Error("should not fetch"); } });
  await assert.rejects(noKey.generate({ mediaType: "image", input, key: "" }), /enable.*Atlas Cloud/);
  for (const body of [{ data: {} }, { data: { id: "job-1", status: "completed", outputs: [] } }]) {
    const client = createAtlasClient({ fetchImpl: async () => json(body) });
    await assert.rejects(client.generate({ mediaType: "image", input, key: "key" }), /history/i);
  }
});

test("Atlas uploads native media with multipart auth and accepts documented response envelopes", async () => {
  for (const body of [{ url: "https://cdn.example/reference.png" }, { data: { url: "https://cdn.example/reference.png" } }]) {
    const client = createAtlasClient({ fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.atlascloud.ai/api/v1/model/uploadMedia");
      assert.equal(options.headers.Authorization, "Bearer secret");
      assert.equal(options.headers["Content-Type"], undefined);
      assert.equal(options.body.get("file").name, "original.png");
      assert.equal(await options.body.get("file").text(), "native pixels");
      return json(body);
    } });
    assert.equal(await client.upload({ buffer: Buffer.from("native pixels"), fileName: "original.png", mimeType: "image/png" }, "secret"), "https://cdn.example/reference.png");
  }
});
