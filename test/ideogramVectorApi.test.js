import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import express from "express";
import sharp from "sharp";
import { createIdeogramVectorService, ideogramVectorProviderInput, readGeneratedVector, validateVectorImage } from "../server/ideogram-vector.js";
import { registerIdeogramVectorRoutes, secureVectorAssetResponse } from "../server/routes/ideogramVector.js";
import { createSingleSubmissionFalClient } from "../server/fal-single-submission.js";
import { buildVectorRequest, vectorDefaults } from "../src/ideogramVector.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64"><path fill="#e8a928" d="M0 0h96v64H0z"/><circle cx="48" cy="32" r="20" fill="#203848"/></svg>';
const body = (overrides = {}) => ({ requestId: randomUUID(), mode: "generate", prompt: "A geometric sun logo", quality: "medium", aspectRatio: "1:1", images: [],
  projectId: "project", projectName: "Vector QA", workflowPackageId: "fixture", workflowPackagePath: "/fixture/package", nodeId: "vector1", nodeTitle: "Sun logo", ...overrides });

async function setup(overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-vector-test-"));
  const source = await sharp({ create: { width: 64, height: 96, channels: 4, background: "#123456" } }).png().toBuffer();
  const calls = [], uploads = [], saves = [], histories = [], queries = [];
  const client = { queue: {
    status: async (endpoint, options) => { queries.push({ kind: "status", endpoint, options }); return { status: "COMPLETED" }; },
    result: async (endpoint, options) => { queries.push({ kind: "result", endpoint, options }); return { data: { images: [{ url: "https://v3.fal.media/vector.svg" }], seed: 17 } }; }
  } };
  const deps = { directory, getKey: () => "fixture-key", clientFor: () => client,
    readSource: async url => { assert.match(url, /^\/uploads\//); return { buffer: source, fileName: "source.png" }; },
    uploadImage: async (image, index, requestClient) => { assert.equal(requestClient, client); uploads.push(image); return `https://v3.fal.media/reference-${index}.png`; },
    subscribe: async (endpoint, options, context, requestClient, key) => {
      assert.equal(requestClient, client); assert.equal(key, "fixture-key");
      calls.push({ endpoint, input: options.input, context }); options.onEnqueue?.("provider-request");
      return { requestId: "provider-request", data: { images: [{ url: "https://v3.fal.media/vector.svg" }], seed: 17 } };
    }, readGenerated: async () => Buffer.from(svg),
    save: async (context, artwork) => { saves.push({ context, artwork });
      return { url: "/workflow-assets/fixture/outputs/vector.png", fileName: "vector.png", svgUrl: "/workflow-assets/fixture/outputs/vector.svg", svgFileName: "vector.svg", bytes: artwork.png.length };
    }, recordHistory: async item => histories.push(item), ...overrides };
  return { service: createIdeogramVectorService(deps), deps, directory, source, calls, uploads, saves, histories, queries,
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}

async function withService(run, overrides) {
  const fixture = await setup(overrides);
  try { await run(fixture); } finally { await fixture.cleanup(); }
}

test("Vector text contract, editable SVG and PNG persist with project context, history, seed and estimate", () => withService(async ({ service, calls, uploads, saves, histories }) => {
  const request = body({ quality: "high", seed: 42 });
  const result = await service.start(request);
  assert.equal(result.status, "completed"); assert.equal(uploads.length, 0);
  assert.equal(calls[0].endpoint, "ideogram/vector/text-to-vector");
  assert.deepEqual(calls[0].input, { prompt: request.prompt, quality: "high", aspect_ratio: "1:1", num_images: 1, seed: 42 });
  assert.equal(result.item.type, "image"); assert.equal(result.item.mimeType, "image/png"); assert.match(result.item.svgUrl, /\.svg$/);
  assert.equal(result.item.seed, 17); assert.equal(result.item.cost.amountUsd, .20);
  assert.equal(result.item.vectorSettings.prompt, request.prompt); assert.equal(result.item.vectorSettings.seed, 42);
  assert.equal(result.item.width, 96); assert.equal(result.item.height, 64); assert.ok(result.item.shapeCount >= 2);
  assert.equal(saves[0].context.workflowPackagePath, "/fixture/package"); assert.match(saves[0].artwork.svg, /<path/);
  const decoded = await sharp(saves[0].artwork.png).metadata(); assert.equal(decoded.format, "png");
  assert.equal(histories.length, 1); assert.equal(histories[0].localSvg, result.item.svgUrl); assert.equal(histories[0].localImage, result.item.url);
  assert.equal(histories[0].settings.seed, 17); assert.equal(histories[0].node.id, "vector1");
}));

test("reference generation uses all validated images and the documented high-reference tariff", () => withService(async ({ service, calls, uploads }) => {
  const images = [{ url: "/uploads/a.png" }, { url: "/uploads/b.png" }];
  const result = await service.start(body({ images, quality: "high" }));
  assert.equal(uploads.length, 2); assert.equal(result.item.cost.amountUsd, .32);
  assert.deepEqual(calls[0].input.image_urls, ["https://v3.fal.media/reference-0.png", "https://v3.fal.media/reference-1.png"]);
}));

test("Mood Board direction reaches the existing Fal contract in order and is recorded with the result", () => withService(async ({ service, calls, uploads, histories }) => {
  const request = body(buildVectorRequest({ ...vectorDefaults(), prompt: "An original emblem", quality: "high" }, {
    images: [{ url: "/uploads/subject.png", label: "Subject" }], moodBoards: [{ url: "/uploads/board.png", label: "Mood Board" }]
  }));
  const result = await service.start(request);
  assert.equal(calls.length, 1); assert.equal(uploads.length, 2);
  assert.deepEqual(calls[0].input.image_urls, ["https://v3.fal.media/reference-0.png", "https://v3.fal.media/reference-1.png"]);
  assert.match(calls[0].input.prompt, /Reference image 2: MOOD BOARD/);
  assert.equal(result.item.cost.amountUsd, .32);
  assert.equal(result.item.vectorSettings.prompt, calls[0].input.prompt);
  assert.equal(histories[0].submittedPrompt, calls[0].input.prompt);
}));

test("image vectorization sends only image and mode, ignoring inactive generation settings", () => withService(async ({ service, calls }) => {
  const result = await service.start(body({ mode: "vectorize", vectorizeMode: "simple", images: [{ url: "/uploads/source.png" }], seed: 42 }));
  assert.equal(calls[0].endpoint, "ideogram/vector/image-to-vector");
  assert.deepEqual(calls[0].input, { image_url: "https://v3.fal.media/reference-0.png", mode: "simple" });
  assert.equal(result.item.cost.amountUsd, .10); assert.equal(result.item.referenceSourceUrl, "/uploads/source.png");
  assert.equal(result.item.sourceUrl, result.item.url);
}));

test("invalid requests or any invalid reference fail before uploads and paid calls", () => withService(async ({ service, calls, uploads }) => {
  for (const changes of [{ prompt: "" }, { quality: "ultra" }, { aspectRatio: "21:9" }, { seed: -1 }, { images: Array.from({ length: 6 }, () => ({ url: "/uploads/a.png" })) },
    { mode: "vectorize", images: [] }, { mode: "vectorize", vectorizeMode: "detailed", images: [{ url: "/uploads/a.png" }] }])
    await assert.rejects(service.start(body(changes)), { status: 400 });
  await assert.rejects(service.start(body({ images: [{ url: "/uploads/good.png" }, { url: "/uploads/bad.png" }] })), /valid PNG/);
  assert.equal(calls.length, 0); assert.equal(uploads.length, 0);
}, { readSource: async url => ({ buffer: url.includes("bad") ? Buffer.from("not an image") : await sharp({ create: { width: 4, height: 4, channels: 4, background: "#fff" } }).png().toBuffer() }) }));

test("duplicate concurrent requests share one submission; changed bodies reject; restart only reads completed receipts", () => withService(async ({ service, deps, calls, saves, histories }) => {
  const request = body();
  const [a, b] = await Promise.all([service.start(request), service.start(request)]);
  assert.deepEqual(a, b); assert.equal(calls.length, 1); assert.equal(saves.length, 1); assert.equal(histories.length, 1);
  await assert.rejects(service.start({ ...request, prompt: "Different" }), { status: 409 });
  const reopened = createIdeogramVectorService(deps);
  assert.deepEqual(await reopened.start(request), a); assert.deepEqual(await reopened.inspect(request.requestId), a);
  assert.equal(calls.length, 1);
}));

test("same-node repeated clicks with different IDs cannot start two provider requests", async () => {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  await withService(async ({ service }) => {
    const first = service.start(body()); await ready;
    await assert.rejects(service.start(body()), { status: 409 });
    release(); await first;
  }, { subscribe: async () => { entered(); await gate; return { data: { images: [{ url: "https://v3.fal.media/vector.svg" }] } }; } });
});

test("provider failure is durable and does not replay paid submissions", async () => {
  let calls = 0;
  await withService(async ({ service, deps }) => {
    const request = body();
    for (const instance of [service, service, createIdeogramVectorService(deps)]) await assert.rejects(instance.start(request), /not automatically retried/);
    assert.equal(calls, 1);
    assert.equal((await service.inspect(request.requestId)).status, "failed");
  }, { subscribe: async () => { calls++; throw Object.assign(new Error("Content policy refusal"), { status: 422 }); } });
});

test("known provider request after transport failure recovers with read-only lookup and no new upload", async () => {
  let calls = 0;
  await withService(async ({ service, deps, uploads, queries }) => {
    const request = body({ images: [{ url: "/uploads/source.png" }] });
    await assert.rejects(service.start(request), /not automatically retried/);
    const result = await createIdeogramVectorService(deps).inspect(request.requestId);
    assert.equal(result.status, "completed"); assert.equal(calls, 1); assert.equal(uploads.length, 1);
    assert.deepEqual(queries.map(query => query.kind), ["status", "result"]);
  }, { subscribe: async (_endpoint, options) => { calls++; options.onEnqueue("provider-request"); throw new Error("connection ended"); } });
});

test("unknown submission survives restart as uncertain and never resubmits", async () => {
  let calls = 0;
  await withService(async ({ service, deps }) => {
    const request = body();
    await assert.rejects(service.start(request), /could not be confirmed/);
    const reopened = createIdeogramVectorService(deps);
    const status = await reopened.inspect(request.requestId);
    assert.equal(status.status, "uncertain"); assert.match(status.error, /Check Fal History/);
    await assert.rejects(reopened.start(request), /could not be confirmed/); assert.equal(calls, 1);
  }, { subscribe: async () => { calls++; throw new Error("lost acknowledgement"); } });
});

test("local download failure is recoverable without another generation and history stays idempotent", async () => {
  let reads = 0;
  await withService(async ({ service, deps, calls, histories }) => {
    const request = body();
    await assert.rejects(service.start(request), /local saving failed/);
    const result = await createIdeogramVectorService(deps).inspect(request.requestId);
    assert.equal(result.status, "completed"); assert.equal(calls.length, 1); assert.equal(histories.length, 1);
  }, { readGenerated: async () => { if (++reads === 1) throw new Error("offline"); return Buffer.from(svg); } });
});

test("missing Fal key blocks uploads", () => withService(async ({ service, calls, uploads }) => {
  await assert.rejects(service.start(body()), /Enable your existing Fal/); assert.equal(uploads.length, 0); assert.equal(calls.length, 0);
}, { getKey: () => "" }));

test("history write failure preserves complete editable result with an honest warning", () => withService(async ({ service }) => {
  const result = await service.start(body()); assert.equal(result.status, "completed"); assert.ok(result.item.svgUrl); assert.match(result.warning, /History/);
}, { recordHistory: async () => { throw new Error("disk error"); } }));

test("SVG downloads reject remote redirects, unknown hosts and oversized bodies without unbounded fetching", async () => {
  let fetched = 0;
  const fakeFetch = async (_url, options) => { fetched++; assert.equal(options.redirect, "error"); return new Response(svg); };
  for (const url of ["http://localhost/a.svg", "https://example.com/a.svg", "https://fal.media.evil.test/a.svg", "https://user:pass@fal.media/a.svg", "https://fal.media:8080/a.svg", "file:///tmp/a.svg"]) await assert.rejects(readGeneratedVector(url, fakeFetch), /unsupported|invalid/);
  assert.equal(fetched, 0);
  assert.equal((await readGeneratedVector("https://v3.fal.media/a.svg", fakeFetch)).toString(), svg);
  await assert.rejects(readGeneratedVector("https://v3.fal.media/a.svg", async () => new Response(svg, { headers: { "content-length": String(21 * 1024 * 1024) } })), /20 MB/);
});

test("image validation rejects SVG and oversized files before model upload", async () => {
  await assert.rejects(validateVectorImage({ buffer: Buffer.from(svg) }), /PNG, JPEG or WebP/);
  await assert.rejects(validateVectorImage({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }), /10 MB/);
  await assert.rejects(validateVectorImage({ buffer: Buffer.alloc(50 * 1024 * 1024 + 1) }, { mode: "vectorize" }), /50 MB/);
  assert.deepEqual(ideogramVectorProviderInput({ mode: "vectorize", vectorizeMode: "default" }, ["image"]), { image_url: "image", mode: "default" });
});

test("HTTP routes expose health-independent read-only status and a detached client does not cancel saving", async () => {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  await withService(async ({ service, saves, histories }) => {
    const app = express(); app.use(express.json());
    registerIdeogramVectorRoutes(app, { service, sendError: (res, error) => res.status(error.status || 500).json({ error: error.message }) });
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/node/ideogram-vector`, request = body();
    try {
      const controller = new AbortController();
      const pending = fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: controller.signal }).catch(error => error);
      await ready; controller.abort(); await pending;
      const running = await (await fetch(`${base}/${request.requestId}`)).json(); assert.equal(running.status, "running");
      release();
      // History is recorded before the final receipt write. Observe the public
      // terminal state, rather than using that earlier internal side effect.
      const deadline = Date.now() + 5000;
      let response, complete;
      do {
        response = await fetch(`${base}/${request.requestId}`, { signal: AbortSignal.timeout(2000) });
        complete = await response.json();
        if (complete.status !== "running") break;
        await new Promise(resolve => setTimeout(resolve, 20));
      } while (Date.now() < deadline);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(complete.status, "completed", `Detached generation did not finish: ${JSON.stringify(complete)}`);
      assert.equal(saves.length, 1); assert.equal(histories.length, 1);
    } finally {
      release();
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
  }, { subscribe: async () => { entered(); await gate; return { data: { images: [{ url: "https://v3.fal.media/vector.svg" }] } }; } });
});


test("the captured Fal key is required for recovery, while receipt JSON never contains the key", async () => {
  let key = "fixture-key";
  await withService(async ({ service, deps, directory, queries }) => {
    const request = body();
    await assert.rejects(service.start(request), /could not be confirmed/);
    const stored = await readFile(path.join(directory, `${request.requestId}.json`), "utf8");
    assert.equal(stored.includes("fixture-key"), false);
    key = "rotated-key";
    await assert.rejects(createIdeogramVectorService(deps).inspect(request.requestId), /original enabled Fal key/);
    assert.equal(queries.length, 0);
    key = "fixture-key";
    assert.equal((await service.inspect(request.requestId)).status, "completed");
  }, { getKey: () => key, subscribe: async (_endpoint, options) => { options.onEnqueue("provider-request"); throw new Error("lost response"); } });
});

test("concurrent recovery checks share one local save and History write", async () => {
  let reads = 0;
  await withService(async ({ service, deps, calls, saves, histories }) => {
    const request = body();
    await assert.rejects(service.start(request), /local saving failed/);
    const reopened = createIdeogramVectorService(deps);
    const [first, second, third] = await Promise.all([reopened.inspect(request.requestId), reopened.inspect(request.requestId), reopened.start(request)]);
    assert.deepEqual(first, third);
    assert.deepEqual(first, second); assert.equal(calls.length, 1); assert.equal(saves.length, 1); assert.equal(histories.length, 1);
  }, { readGenerated: async () => { if (++reads === 1) throw new Error("offline"); return Buffer.from(svg); } });
});

test("Fal SDK adapter submits only once and polls the root Vector queue endpoint", async () => {
  for (const endpoint of ["ideogram/vector/text-to-vector", "ideogram/vector/image-to-vector"]) {
    let posts = 0;
    const client = createSingleSubmissionFalClient({ credentials: "fixture-key", endpoint, model: "Ideogram Vector" }, async () => { posts++; throw new TypeError("Network error"); });
    await assert.rejects(client.queue.submit(endpoint, { input: {} }), /Check Fal history/);
    await assert.rejects(client.queue.submit(endpoint, { input: {} }), /did not resubmit/);
    assert.equal(posts, 1);
    const urls = [];
    const reader = createSingleSubmissionFalClient({ credentials: "fixture-key", endpoint, model: "Ideogram Vector" }, async input => {
      urls.push(String(input)); return new Response(JSON.stringify({ status: "COMPLETED", images: [{ url: "https://v3.fal.media/result.svg" }] }), { headers: { "content-type": "application/json" } });
    });
    await reader.queue.status(endpoint, { requestId: "id", logs: false });
    await reader.queue.result(endpoint, { requestId: "id" });
    assert.match(urls[0], /^https:\/\/queue.fal.run\/ideogram\/vector\/requests\/id\/status/);
    assert.match(urls[1], /^https:\/\/queue.fal.run\/ideogram\/vector\/requests\/id$/);
  }
});


test("SVG document security headers also cover encoded and uppercase file extensions", () => {
  for (const path of ["/art.svg", "/art%2Esvg", "/art%2ESVG", "/sub%20folder/art.sv%67"]) {
    const headers = {}; let next = 0;
    secureVectorAssetResponse({ path }, { setHeader: (key, value) => { headers[key] = value; } }, () => { next++; });
    assert.match(headers["Content-Security-Policy"], /default-src 'none'.*sandbox/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff"); assert.equal(next, 1);
  }
  const headers = {};
  secureVectorAssetResponse({ path: "/art.png" }, { setHeader: (key, value) => { headers[key] = value; } }, () => {});
  assert.deepEqual(headers, {});
});

test("anonymous direct requests cannot bypass the two-job concurrency limit", async () => {
  let release, started = 0;
  const gate = new Promise(resolve => { release = resolve; });
  await withService(async ({ service }) => {
    const first = service.start(body({ nodeId: "" }));
    while (started < 1) await new Promise(resolve => setTimeout(resolve, 1));
    const second = service.start(body({ nodeId: "" }));
    while (started < 2) await new Promise(resolve => setTimeout(resolve, 1));
    await assert.rejects(service.start(body({ nodeId: "" })), { status: 429 });
    release(); await Promise.all([first, second]);
  }, { subscribe: async () => { started++; await gate; return { data: { images: [{ url: "https://v3.fal.media/vector.svg" }] } }; } });
});

test("post-generation local validation failures retain a recoverable receipt and cannot look like preflight errors", () => withService(async ({ service }) => {
  const request = body();
  await assert.rejects(service.start(request), { status: 502 });
  const status = await service.inspect(request.requestId);
  assert.equal(status.status, "uncertain"); assert.match(status.error, /local saving failed/);
}, { render: async () => { throw Object.assign(new Error("unsupported SVG"), { status: 400 }); } }));


test("read-only Vector pricing exposes only validated configured rates without submitting a request", async () => {
  const routes = new Map(); let runs = 0;
  const app = { get: (route, handler) => routes.set(route, handler), post: () => {} };
  registerIdeogramVectorRoutes(app, {
    service: { start: async () => { runs++; } },
    getRates: () => ({ low: .08, medium: .11, high: .17, highReference: .26, vectorize: .09, credential: "must-not-be-returned" }),
    sendError: (_res, error) => { throw error; }
  });
  const headers = {}; let payload;
  const res = { setHeader: (key, value) => { headers[key] = value; }, json: value => { payload = value; } };
  await routes.get("/api/node/ideogram-vector-pricing")({}, res);
  assert.deepEqual(payload.rates, { low: .08, medium: .11, high: .17, highReference: .26, vectorize: .09 });
  assert.equal(payload.checkedAt, "2026-10-26"); assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(JSON.stringify(payload).includes("must-not-be-returned"), false); assert.equal(runs, 0);
  registerIdeogramVectorRoutes(app, { service: {}, getRates: () => ({ low: -1, medium: Infinity, high: "0.20", vectorize: 0 }), sendError: (_res, error) => { throw error; } });
  await routes.get("/api/node/ideogram-vector-pricing")({}, res);
  assert.deepEqual(payload.rates, { low: null, medium: null, high: null, highReference: null, vectorize: 0 });
});
