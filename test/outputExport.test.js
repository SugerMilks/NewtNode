import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, symlink, rename, chmod, realpath, link, stat } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import express from "express";
import { registerOutputRoutes } from "../server/routes/output.js";
import { normalizeOutputRequest, normalizeOutputDestinations, validateOutputDestinations, createOutputAssetResolver,
  probeOutputMedia, convertOutputMedia, exportOutputItem, publishOutputFile, runOutputProcess, outputRevealCommand, outputLimits, createOutputReceiptStore } from "../server/output-export.js";

const ffprobePath = ffprobe.path;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(t) {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), "newtnode-output-test-")));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const uploadsDir = path.join(dir, "uploads"), outputsDir = path.join(dir, "outputs"), destination = path.join(dir, "chosen"), packagePath = path.join(dir, "workflow");
  for (const folder of [uploadsDir, outputsDir, destination, path.join(packagePath, "inputs")]) await mkdir(folder, { recursive: true });
  await sharp({ create: { width: 16, height: 12, channels: 4, background: { r: 220, g: 35, b: 75, alpha: 0.5 } } }).png().toFile(path.join(uploadsDir, "image.wrong"));
  const resolveAsset = createOutputAssetResolver({ uploadsDir, outputsDir, findRegisteredWorkflowPackage: async id => id === "project" ? { packagePath } : null });
  return { dir, uploadsDir, outputsDir, destination, packagePath, resolveAsset,
    item: { url: "/uploads/image.wrong", type: "image", name: "Result" },
    options: { resolveAsset, ffmpegPath, ffprobePath },
    dest: (format = "original", type = "image", extra = {}) => normalizeOutputDestinations({ [type]: { path: destination, format, ...extra } }, [type])[type] };
}

async function mediaFixtures(h) {
  const video = path.join(h.uploadsDir, "video.wrong"), audio = path.join(h.uploadsDir, "audio.wrong");
  await runOutputProcess(ffmpegPath, ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=32x24:rate=12:duration=0.5",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000:duration=0.5", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-f", "mp4", video]);
  await runOutputProcess(ffmpegPath, ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=24000:duration=0.3", "-c:a", "pcm_s16le", "-f", "wav", audio]);
  return { video, audio };
}

async function probeRaw(filePath) {
  return JSON.parse(await runOutputProcess(ffprobePath, ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath]));
}

async function harness(t, dependencies = {}) {
  const h = await fixture(t), app = express(), reveals = [];
  app.use(express.json());
  const { jobs } = registerOutputRoutes(app, { ...h.options, reveal: async (...args) => reveals.push(args), ...dependencies });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    for (const job of jobs.values()) job.controller.abort();
    await Promise.all([...jobs.values()].map(job => job.done));
    await new Promise(resolve => server.close(resolve));
  });
  const request = async (route, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/output/${route}`, {
      method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const body = (extra = {}) => ({ requestId: randomUUID(), items: [h.item], destinations: { image: { path: h.destination } }, ...extra });
  const finish = async id => {
    await jobs.get(id).done;
    return (await request(`jobs/${id}`)).body;
  };
  return { ...h, jobs, request, body, finish, reveals };
}

async function assertNoTemps(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.ok(!entry.name.startsWith(".newtnode-output-"), `Temporary staging remains: ${entry.name}`);
    if (entry.isDirectory()) await assertNoTemps(path.join(dir, entry.name));
  }
}

test("Output validates UUIDs, batch limits, names, quality, destination paths and safe defaults", async t => {
  const h = await fixture(t), body = { requestId: randomUUID(), items: [h.item], destinations: { image: { path: h.destination } } };
  const normalized = normalizeOutputRequest(body);
  assert.equal(normalized.collision, "number"); assert.equal(normalized.destinations.image.format, "original");
  assert.equal(normalized.destinations.image.quality, 90);
  for (const patch of [{ requestId: "not-a-uuid" }, { items: [] }, { items: Array(101).fill(h.item) }, { collision: "overwrite" }]) assert.throws(() => normalizeOutputRequest({ ...body, ...patch }));
  for (const name of ["../escape", "a/b", "a\\b", "CON", "nul.png", "bad.", " bad", "", "\nhello", "C:drive", ".", ".."]) assert.throws(() => normalizeOutputRequest({ ...body, items: [{ ...h.item, name }] }));
  for (const url of ["https://example.com/a.png", "file:///etc/passwd", "/uploads/../secret", "/uploads/%2e%2e/secret", "/uploads/a%00.png", "/uploads/%252e%252e/a", "/uploads/a?token=x"]) assert.throws(() => normalizeOutputRequest({ ...body, items: [{ ...h.item, url }] }));
  for (const patch of [{ path: "relative" }, { format: "gif" }, { quality: 0 }, { quality: 101 }, { quality: "90" }, { quality: 1.5 }, { subfolder: "../outside" }, { subfolder: "safe/../outside" }, { subfolder: "C:\\outside" }, { subfolder: "/outside" }, { subfolder: "safe\\..\\outside" }, { subfolder: "safe//nested" }]) {
    assert.throws(() => normalizeOutputRequest({ ...body, destinations: { image: { path: h.destination, ...patch } } }));
  }
});

test("preflight is non-mutating, supports safe nested folders, and explains offline/remote paths", async t => {
  const h = await harness(t), destinations = { image: { path: h.destination, subfolder: "shots/day-1" } };
  const result = await h.request("validate", "POST", { destinations, types: ["image"] });
  assert.equal(result.status, 200); assert.equal(result.body.valid, true);
  assert.equal(result.body.destinations.image.missingSubfolder, true);
  assert.equal(result.body.destinations.image.directory, path.join(h.destination, "shots", "day-1"));
  assert.deepEqual(await readdir(h.destination), []);
  const exported = await exportOutputItem(h.item, h.dest("original", "image", { subfolder: "shots/day-1" }), h.options);
  assert.equal(exported.status, "saved");
  await assertNoTemps(h.destination);
  const offline = await h.request("validate", "POST", { destinations: { image: { path: path.join(h.dir, "offline-drive") } }, types: ["image"] });
  assert.equal(offline.status, 400); assert.match(offline.body.error, /offline drive.*remote browser/);
  const remote = await h.request("validate", "POST", { destinations: { image: { path: "client-computer/Downloads" } }, types: ["image"] });
  assert.match(remote.body.error, /computer running the NewtNode server/);
  const file = path.join(h.destination, "not-a-folder"); await writeFile(file, "file");
  await assert.rejects(validateOutputDestinations({ image: { path: file } }, ["image"]), /directory/);
  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    await chmod(h.destination, 0o555);
    try { await assert.rejects(validateOutputDestinations({ image: { path: h.destination } }, ["image"]), /EACCES/); }
    finally { await chmod(h.destination, 0o755); }
  }
});

test("Original preserves exact image, video and audio bytes with actual rather than claimed extensions", async t => {
  const h = await fixture(t); await mediaFixtures(h);
  for (const [type, source, extension] of [["image", "image.wrong", ".png"], ["video", "video.wrong", ".mp4"], ["audio", "audio.wrong", ".wav"]]) {
    const original = await readFile(path.join(h.uploadsDir, source));
    const result = await exportOutputItem({ url: `/uploads/${source}`, type, name: `Original-${type}` }, h.dest("original", type), h.options);
    assert.equal(result.status, "saved"); assert.ok(result.filePath.endsWith(extension));
    assert.deepEqual(await readFile(result.filePath), original);
    assert.deepEqual(await readFile(path.join(h.uploadsDir, source)), original);
    assert.equal(result.url, undefined);
  }
  await assertNoTemps(h.destination);
});

test("Sharp conversions are real PNG/JPEG/WebP, flatten JPEG alpha white and normalize EXIF orientation", async t => {
  const h = await fixture(t), alpha = path.join(h.uploadsDir, "transparent.png");
  await sharp({ create: { width: 18, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(alpha);
  for (const format of ["png", "jpeg", "webp"]) {
    const result = await exportOutputItem({ url: "/uploads/transparent.png", type: "image", name: format }, h.dest(format), h.options);
    const metadata = await sharp(result.filePath).metadata();
    assert.equal(metadata.format, format); assert.equal(metadata.width, 18); assert.equal(metadata.height, 10);
    const pixel = await sharp(result.filePath).raw().toBuffer();
    if (format === "jpeg") { assert.equal(metadata.hasAlpha, false); assert.ok(pixel[0] >= 250 && pixel[1] >= 250 && pixel[2] >= 250); }
    else assert.equal(metadata.hasAlpha, true);
  }
  await sharp({ create: { width: 18, height: 10, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toFile(path.join(h.uploadsDir, "rotated.jpg"));
  const result = await exportOutputItem({ url: "/uploads/rotated.jpg", type: "image", name: "Upright" }, h.dest("png"), h.options);
  const metadata = await sharp(result.filePath).metadata();
  assert.equal(metadata.width, 10); assert.equal(metadata.height, 18); assert.equal(metadata.orientation, undefined);
  await assertNoTemps(h.destination);
});

test("Original also detects JPEG, WebP, GIF, TIFF and AVIF from bytes without changing them", async t => {
  const h = await fixture(t);
  for (const [format, extension] of [["jpeg", ".jpg"], ["webp", ".webp"], ["gif", ".gif"], ["tiff", ".tiff"], ["avif", ".avif"]]) {
    const file = path.join(h.uploadsDir, `${format}.wrong`);
    await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } }).toFormat(format).toFile(file);
    const result = await exportOutputItem({ url: `/uploads/${format}.wrong`, type: "image", name: format }, h.dest(), h.options);
    assert.ok(result.filePath.endsWith(extension)); assert.deepEqual(await readFile(result.filePath), await readFile(file));
  }
});

test("Original detects WebM, MP3, M4A and FLAC containers rather than copying a false filename extension", async t => {
  const h = await fixture(t);
  for (const [format, type, codec, extension] of [["webm", "video", "libvpx", ".webm"], ["mp3", "audio", "libmp3lame", ".mp3"], ["mp4", "audio", "aac", ".m4a"], ["flac", "audio", "flac", ".flac"]]) {
    const file = path.join(h.uploadsDir, `${format}.wrong`), filter = type === "video" ? "testsrc2=size=32x24:rate=4:duration=0.5" : "sine=frequency=440:duration=0.3";
    await runOutputProcess(ffmpegPath, ["-v", "error", "-nostdin", "-f", "lavfi", "-i", filter, type === "video" ? "-c:v" : "-c:a", codec, "-threads", "1", "-f", format, file]);
    const result = await exportOutputItem({ url: `/uploads/${format}.wrong`, type, name: format }, h.dest("original", type), h.options);
    assert.ok(result.filePath.endsWith(extension)); assert.deepEqual(await readFile(result.filePath), await readFile(file));
  }
});

test("FFmpeg conversions produce H264/AAC MP4 and MOV without reframing and real PCM WAV/MP3", async t => {
  const h = await fixture(t); await mediaFixtures(h);
  for (const format of ["mp4", "mov"]) {
    const result = await exportOutputItem({ url: "/uploads/video.wrong", type: "video", name: format }, h.dest(format, "video"), h.options);
    const data = await probeRaw(result.filePath), video = data.streams.find(stream => stream.codec_type === "video"), audio = data.streams.find(stream => stream.codec_type === "audio");
    assert.equal(video.codec_name, "h264"); assert.equal(audio.codec_name, "aac");
    assert.equal(video.width, 32); assert.equal(video.height, 24); assert.equal(Number(video.nb_frames), 6);
    assert.equal((await probeOutputMedia(result.filePath, ffprobePath)).extension, `.${format}`);
  }
  for (const format of ["wav", "mp3"]) {
    const result = await exportOutputItem({ url: "/uploads/audio.wrong", type: "audio", name: format }, h.dest(format, "audio", { quality: "standard" }), h.options);
    const data = await probeRaw(result.filePath), audio = data.streams.find(stream => stream.codec_type === "audio");
    assert.equal(audio.codec_name, format === "wav" ? "pcm_s16le" : "mp3");
    assert.equal(data.streams.some(stream => stream.codec_type === "video"), false);
    assert.ok(Number(data.format.duration) >= 0.29);
    assert.equal((await probeOutputMedia(result.filePath, ffprobePath)).extension, `.${format}`);
  }
  await assertNoTemps(h.destination);
});

test("odd-dimension video stays the same size instead of being silently padded", async t => {
  const h = await fixture(t), source = path.join(h.uploadsDir, "odd.mov");
  await runOutputProcess(ffmpegPath, ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc=size=33x25:rate=4:duration=0.5", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-threads", "1", source]);
  const result = await exportOutputItem({ url: "/uploads/odd.mov", type: "video", name: "Odd" }, h.dest("mp4", "video"), h.options);
  const data = await probeRaw(result.filePath);
  assert.equal(data.streams[0].width, 33); assert.equal(data.streams[0].height, 25);
});

test("actual source types, corrupt/unsupported files, external sources and symlink escapes are rejected", async t => {
  const h = await fixture(t); await mediaFixtures(h);
  for (const [url, type] of [["/uploads/image.wrong", "video"], ["/uploads/video.wrong", "audio"], ["/uploads/audio.wrong", "image"]]) {
    await assert.rejects(exportOutputItem({ url, type, name: "Wrong" }, h.dest("original", type), h.options), /contains .* connected as/);
  }
  await writeFile(path.join(h.uploadsDir, "fake.png"), "not media");
  await writeFile(path.join(h.uploadsDir, "playlist.mp4"), "#EXTM3U\nhttps://example.com/private\n");
  await writeFile(path.join(h.uploadsDir, "truncated.png"), (await readFile(path.join(h.uploadsDir, "image.wrong"))).subarray(0, 40));
  for (const source of ["fake.png", "playlist.mp4", "truncated.png"]) await assert.rejects(exportOutputItem({ ...h.item, url: `/uploads/${source}` }, h.dest(), h.options));
  await assert.rejects(h.resolveAsset("https://example.com/a.png"), /managed/);
  await assert.rejects(h.resolveAsset("/uploads/../chosen/a.png"), /unsafe/);
  await assert.rejects(h.resolveAsset("/workflow-assets/missing/inputs/a.png"), /unavailable/);
  await writeFile(path.join(h.packagePath, "inputs", "still.png"), await readFile(path.join(h.uploadsDir, "image.wrong")));
  assert.equal((await h.resolveAsset("/workflow-assets/project/inputs/still.png")).filePath, path.join(h.packagePath, "inputs", "still.png"));
  if (process.platform !== "win32") {
    await symlink(path.join(h.packagePath, "inputs", "still.png"), path.join(h.uploadsDir, "escape.png"));
    await assert.rejects(h.resolveAsset("/uploads/escape.png"), /outside/);
  }
  assert.deepEqual(await readdir(h.destination), []);
});

test("number/skip collision policies preserve files, sources, hard links and occupied symlink names", async t => {
  const h = await fixture(t), occupied = path.join(h.destination, "Result.png");
  await writeFile(occupied, "existing file");
  const numbered = await exportOutputItem(h.item, h.dest(), h.options);
  assert.equal(numbered.fileName, "Result (1).png"); assert.equal(await readFile(occupied, "utf8"), "existing file");
  const skipped = await exportOutputItem(h.item, h.dest(), { ...h.options, collision: "skip" });
  assert.equal(skipped.status, "skipped"); assert.equal(skipped.filePath, occupied);
  const source = path.join(h.uploadsDir, "source.png"), bytes = await readFile(path.join(h.uploadsDir, "image.wrong"));
  await writeFile(source, bytes);
  const same = await exportOutputItem({ url: "/uploads/source.png", type: "image", name: "source" }, { ...h.dest(), path: h.uploadsDir }, h.options);
  assert.equal(same.fileName, "source (1).png"); assert.deepEqual(await readFile(source), bytes);
  await link(source, path.join(h.destination, "Alias.png"));
  const aliased = await exportOutputItem({ ...h.item, name: "Alias" }, h.dest(), h.options);
  assert.equal(aliased.fileName, "Alias (1).png"); assert.deepEqual(await readFile(source), bytes);
  if (process.platform !== "win32") {
    await symlink(source, path.join(h.destination, "Link.png"));
    const linked = await exportOutputItem({ ...h.item, name: "Link" }, h.dest(), h.options);
    assert.equal(linked.fileName, "Link (1).png"); assert.deepEqual(await readFile(source), bytes);
  }
  await assertNoTemps(h.destination);
});

test("simultaneous publication is exclusive for both number and skip, including a late foreign collision", async t => {
  const h = await fixture(t);
  for (const collision of ["number", "skip"]) {
    const gate = deferred(); let arrived = 0;
    const convert = async (...args) => { await convertOutputMedia(...args); if (++arrived === 2) gate.resolve(); await gate.promise; };
    const results = await Promise.all([0, 1].map(() => exportOutputItem({ ...h.item, name: collision }, h.dest(), { ...h.options, collision, convert })));
    assert.equal(results.filter(result => result.status === "saved").length, collision === "number" ? 2 : 1);
    assert.equal(new Set(results.filter(result => result.status === "saved").map(result => result.filePath)).size, collision === "number" ? 2 : 1);
  }
  const result = await exportOutputItem({ ...h.item, name: "Late" }, h.dest(), { ...h.options, convert: async (...args) => {
    await convertOutputMedia(...args); await writeFile(path.join(h.destination, "Late.png"), "foreign data");
  } });
  assert.equal(result.fileName, "Late (1).png"); assert.equal(await readFile(path.join(h.destination, "Late.png"), "utf8"), "foreign data");
  await assertNoTemps(h.destination);
});

test("destination symlinks, traversal and directory replacement cannot redirect publication", async t => {
  if (process.platform === "win32") return t.skip("Symlink creation needs Windows developer privileges.");
  const h = await fixture(t), outside = path.join(h.dir, "outside"); await mkdir(outside);
  await symlink(outside, path.join(h.destination, "linked"));
  await assert.rejects(validateOutputDestinations({ image: { path: h.destination, subfolder: "linked" } }, ["image"]), /symbolic link/);
  await assert.rejects(exportOutputItem(h.item, h.dest("original", "image", { subfolder: "linked/deeper" }), h.options), /symbolic link/);
  const real = path.join(h.destination, "real"); await mkdir(real);
  await assert.rejects(exportOutputItem(h.item, h.dest("original", "image", { subfolder: "real" }), { ...h.options, convert: async (...args) => {
    await convertOutputMedia(...args);
    await rename(real, path.join(h.destination, "moved"));
    await symlink(outside, real);
  } }), /symbolic link|changed/);
  assert.deepEqual(await readdir(outside), []);
  assert.equal((await readdir(path.join(h.destination, "moved"))).includes("Result.png"), false);
  await assertNoTemps(h.destination);
});

test("changed sources and encoder failures never publish and clean temporary output", async t => {
  const h = await fixture(t);
  await assert.rejects(exportOutputItem(h.item, h.dest(), { ...h.options, convert: async (...args) => {
    await convertOutputMedia(...args); await writeFile(path.join(h.uploadsDir, "image.wrong"), "source changed externally");
  } }), /source changed/);
  await assertNoTemps(h.destination);
  const other = await fixture(t);
  await assert.rejects(exportOutputItem(other.item, other.dest(), { ...other.options, convert: async (_source, target) => { await writeFile(target, "partial"); throw new Error("Encoder failed"); } }), /Encoder failed/);
  assert.deepEqual(await readdir(other.destination), []);
});

test("route jobs return machine receipts, retain partial success, and make submission/re-poll idempotent", async t => {
  const h = await harness(t), request = h.body({ projectId: "project", nodeId: "output", items: [h.item, { ...h.item, url: "/uploads/missing.png", name: "Missing" }] });
  const submitted = await h.request("export", "POST", request);
  assert.equal(submitted.status, 202); assert.equal(submitted.body.status, "running"); assert.deepEqual(submitted.body.results, []);
  assert.equal((await h.request("export", "POST", request)).status, 200);
  const done = await h.finish(request.requestId);
  assert.equal(done.status, "partial"); assert.equal(done.progress, 1); assert.equal(done.results.length, 2);
  assert.equal(done.results[0].status, "saved"); assert.equal(done.results[1].status, "failed");
  assert.equal(done.results[1].filePath, ""); assert.match(done.results[1].error, /offline drive/);
  assert.deepEqual(Object.keys(done.results[0]).sort(), ["fileName", "filePath", "sourceUrl", "status", "type"]);
  assert.ok(path.isAbsolute(done.results[0].filePath)); assert.equal(done.results[0].sourceUrl, h.item.url);
  for (let i = 0; i < 3; i++) assert.deepEqual((await h.request(`jobs/${request.requestId}`)).body, done);
  assert.deepEqual((await h.request("export", "POST", { ...request, destinations: { image: { path: h.destination, format: "original", quality: 90 } }, collision: "number" })).body, done);
  assert.equal((await h.request("export", "POST", { ...request, items: [{ ...h.item, name: "Changed" }] })).status, 409);
  assert.deepEqual(await readdir(h.destination), ["Result.png"]);
  assert.equal((await h.request(`jobs/${randomUUID()}`)).status, 404);
  assert.equal((await h.request(`jobs/${randomUUID()}`, "DELETE")).status, 404);
});

test("cancellation stops remaining items, retains committed files, cleans staging and cannot duplicate on retry", async t => {
  const gate = deferred(); let calls = 0;
  const h = await harness(t, { convert: async (...args) => {
    calls++;
    if (calls === 1) return convertOutputMedia(...args);
    await writeFile(args[1], "incomplete"); gate.resolve();
    const { signal } = args[4];
    await new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); if (signal.aborted) reject(new Error("aborted")); });
  } });
  const request = h.body({ items: ["First", "Second", "Third"].map(name => ({ ...h.item, name })) });
  await h.request("export", "POST", request); await gate.promise;
  const running = (await h.request(`jobs/${request.requestId}`)).body;
  assert.equal(running.status, "running"); assert.equal(running.results[0].status, "saved"); assert.ok(running.progress >= 1 / 3 && running.progress < 1);
  await h.request(`jobs/${request.requestId}`, "DELETE");
  const done = await h.finish(request.requestId);
  assert.equal(done.status, "canceled"); assert.equal(done.progress, 1); assert.equal(calls, 2);
  assert.deepEqual(done.results.map(result => result.status), ["saved", "failed", "failed"]);
  assert.deepEqual(await readdir(h.destination), ["First.png"]);
  assert.deepEqual((await h.request("export", "POST", request)).body, done);
  await assertNoTemps(h.destination);
});

test("concurrency and retained-job bounds reject extra work but keep existing IDs readable", async t => {
  const gate = deferred(); let entered = 0;
  const h = await harness(t, { convert: async (...args) => {
    if (++entered === 2) gate.resolve();
    const { signal } = args[4];
    await new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); if (signal.aborted) reject(new Error("aborted")); });
  } });
  const requests = [h.body(), h.body()];
  for (const body of requests) assert.equal((await h.request("export", "POST", body)).status, 202);
  await gate.promise;
  assert.equal((await h.request("export", "POST", h.body())).status, 429);
  assert.equal((await h.request("export", "POST", requests[0])).status, 200);
  for (const body of requests) { await h.request(`jobs/${body.requestId}`, "DELETE"); await h.finish(body.requestId); }
  for (let i = h.jobs.size; i < outputLimits.jobs; i++) h.jobs.set(randomUUID(), { status: "complete", controller: new AbortController() });
  assert.equal((await h.request("export", "POST", h.body())).status, 429);
  assert.equal((await h.request("export", "POST", requests[0])).status, 200);
});

test("reveal allows only saved receipts and containing folders, never skipped/failed/arbitrary/replaced paths", async t => {
  const h = await harness(t), body = h.body();
  assert.equal((await h.request("reveal", "POST", { filePath: h.destination })).status, 403);
  await h.request("export", "POST", body);
  const done = await h.finish(body.requestId), filePath = done.results[0].filePath;
  assert.equal((await h.request("reveal", "POST", { filePath })).status, 200);
  assert.equal((await h.request("reveal", "POST", { filePath: h.destination })).status, 200);
  assert.equal(h.reveals.length, 2); assert.deepEqual(h.reveals[0], [filePath, { directory: false }]);
  assert.equal((await h.request("reveal", "POST", { filePath: h.dir })).status, 403);
  const occupied = path.join(h.destination, "Skip.png"); await writeFile(occupied, "not exported");
  const skip = h.body({ collision: "skip", items: [{ ...h.item, name: "Skip" }] });
  await h.request("export", "POST", skip); assert.equal((await h.finish(skip.requestId)).results[0].status, "skipped");
  assert.equal((await h.request("reveal", "POST", { filePath: occupied })).status, 403);
  await rename(filePath, `${filePath}.old`); await writeFile(filePath, "replacement");
  assert.equal((await h.request("reveal", "POST", { filePath })).status, 403);
  assert.equal(h.reveals.length, 2);
});

test("reveal command arguments are cross-platform and do not interpolate shell syntax", () => {
  const filePath = "/tmp/chosen/odd ; $(touch nothing).png";
  assert.deepEqual(outputRevealCommand(filePath, { platform: "darwin" }), { command: "open", args: ["-R", filePath] });
  assert.deepEqual(outputRevealCommand(filePath, { platform: "win32" }), { command: "explorer.exe", args: ["/select,", filePath] });
  assert.deepEqual(outputRevealCommand(filePath, { platform: "linux" }), { command: "xdg-open", args: [path.dirname(filePath)] });
  assert.deepEqual(outputRevealCommand(filePath, { platform: "darwin", directory: true }), { command: "open", args: [filePath] });
});

test("real FFmpeg cancellation waits for process exit and leaves no published or temporary media", async t => {
  const h = await fixture(t); await mediaFixtures(h);
  const controller = new AbortController(), entered = deferred();
  const exporting = exportOutputItem({ url: "/uploads/video.wrong", type: "video", name: "Cancel" }, h.dest("mp4", "video"), {
    ...h.options, signal: controller.signal, convert: async (_source, target, _media, _destination, { signal }) => {
      const running = runOutputProcess(ffmpegPath, ["-v", "error", "-nostdin", "-re", "-f", "lavfi", "-i", "testsrc2=size=32x24:rate=24", "-c:v", "libx264", "-threads", "1", "-f", "mp4", target], { signal, timeoutMs: 30000 });
      entered.resolve(); await running;
    }
  });
  await entered.promise; await sleep(100); controller.abort();
  await assert.rejects(exporting, /cancel/);
  assert.deepEqual(await readdir(h.destination), []);
});

test("pre-canceled exports do not resolve sources; missing tools and local-process timeouts fail clearly", async t => {
  const h = await fixture(t), controller = new AbortController(); controller.abort();
  let resolved = false;
  await assert.rejects(exportOutputItem(h.item, h.dest(), { ...h.options, signal: controller.signal, resolveAsset: () => { resolved = true; } }));
  assert.equal(resolved, false); assert.deepEqual(await readdir(h.destination), []);
  await assert.rejects(runOutputProcess(path.join(h.dir, "missing-ffprobe"), []), /local command missing-ffprobe is unavailable/);
  await assert.rejects(runOutputProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 30 }), /took too long/);
});

test("persisted receipts allow reveal after restart without restoring jobs, resolving sources or exporting anything", async t => {
  const root = await fixture(t), receiptStorePath = path.join(root.dir, "server-data", "output-receipts.json");
  const first = await harness(t, { receiptStorePath }), body = first.body();
  await first.request("export", "POST", body); const saved = await first.finish(body.requestId);
  assert.equal(saved.status, "complete"); assert.equal(saved.warning, undefined);
  const filePath = saved.results[0].filePath, bytes = await readFile(filePath), ledger = JSON.parse(await readFile(receiptStorePath, "utf8"));
  assert.equal(ledger.receipts.length, 1);
  assert.deepEqual(Object.keys(ledger.receipts[0]).sort(), ["directory", "file", "filePath", "pins"]);
  assert.deepEqual(Object.keys(ledger.receipts[0].file).sort(), ["dev", "ino", "mtimeMs", "size"]);
  assert.equal(JSON.stringify(ledger).includes("sourceUrl"), false);
  let resolutions = 0;
  const restarted = await harness(t, { receiptStorePath, resolveAsset: () => { resolutions++; throw new Error("Must not restore sources"); } });
  assert.equal((await restarted.request("reveal", "POST", { filePath })).status, 200);
  assert.equal((await restarted.request("reveal", "POST", { filePath: path.dirname(filePath) })).status, 200);
  assert.equal((await restarted.request(`jobs/${body.requestId}`)).status, 404);
  assert.equal(restarted.jobs.size, 0); assert.equal(resolutions, 0);
  assert.deepEqual(await readFile(filePath), bytes); assert.deepEqual(await readdir(restarted.destination), []);
  assert.deepEqual(await readdir(path.dirname(receiptStorePath)), ["output-receipts.json"]);
  await rename(filePath, `${filePath}.old`); await writeFile(filePath, bytes);
  assert.equal((await restarted.request("reveal", "POST", { filePath })).status, 403);
});

test("serialized ledger updates merge simultaneous route instances and remain atomically parseable", async t => {
  const root = await fixture(t), receiptStorePath = path.join(root.dir, "output-receipts.json");
  const first = await harness(t, { receiptStorePath }), second = await harness(t, { receiptStorePath });
  const a = first.body(), b = second.body();
  await Promise.all([first.request("export", "POST", a), second.request("export", "POST", b)]);
  const [one, two] = await Promise.all([first.finish(a.requestId), second.finish(b.requestId)]);
  assert.equal(one.warning, undefined); assert.equal(two.warning, undefined);
  const ledger = JSON.parse(await readFile(receiptStorePath, "utf8"));
  assert.deepEqual(new Set(ledger.receipts.map(receipt => receipt.filePath)), new Set([one.results[0].filePath, two.results[0].filePath]));
  const restarted = await harness(t, { receiptStorePath });
  for (const result of [one, two]) assert.equal((await restarted.request("reveal", "POST", { filePath: result.results[0].filePath })).status, 200);
  assert.equal((await readdir(root.dir)).some(name => name.endsWith(".lock") || name.endsWith(".tmp")), false);
});

test("persistence failures warn without failing/removing saved files or overwriting an unrelated ledger", async t => {
  const root = await fixture(t), receiptStorePath = path.join(root.dir, "output-receipts.json");
  const h = await harness(t, { receiptStorePath, convert: async (...args) => {
    await convertOutputMedia(...args); await writeFile(receiptStorePath, "unrelated file written during export");
  } });
  const body = h.body(); await h.request("export", "POST", body); const done = await h.finish(body.requestId);
  assert.equal(done.status, "complete"); assert.equal(done.results.length, 1); assert.equal(done.results[0].status, "saved");
  assert.match(done.warning, /Files already saved were retained/);
  assert.equal(await readFile(receiptStorePath, "utf8"), "unrelated file written during export");
  assert.deepEqual(await readFile(done.results[0].filePath), await readFile(path.join(h.uploadsDir, "image.wrong")));
  assert.equal((await h.request("reveal", "POST", { filePath: done.results[0].filePath })).status, 200);
  const restarted = await harness(t, { receiptStorePath });
  const reveal = await restarted.request("reveal", "POST", { filePath: done.results[0].filePath });
  assert.equal(reveal.status, 403); assert.match(reveal.body.error, /ledger is unreadable or invalid JSON/);
  assert.equal((await readdir(root.dir)).some(name => name.endsWith(".lock") || name.endsWith(".tmp")), false);
});

test("receipt ledger is bounded, path-only, and does not authorize malformed or symlinked stores", async t => {
  const h = await fixture(t), receiptStorePath = path.join(h.dir, "output-receipts.json"), store = createOutputReceiptStore(receiptStorePath);
  await store.ready;
  const directoryInfo = await stat(h.destination), fileInfo = await stat(path.join(h.uploadsDir, "image.wrong"));
  for (let index = 0; index < outputLimits.receipts + 3; index++) store.remember({ filePath: path.join(h.destination, `${index}.png`), directory: h.destination,
    file: fileInfo, pins: [{ path: h.destination, dev: directoryInfo.dev, ino: directoryInfo.ino }] });
  assert.equal(await store.persist(), "");
  const ledger = JSON.parse(await readFile(receiptStorePath, "utf8"));
  assert.equal(ledger.receipts.length, outputLimits.receipts); assert.ok((await stat(receiptStorePath)).size < outputLimits.receiptBytes);
  assert.equal(store.find(path.join(h.destination, "0.png")), undefined);
  ledger.receipts[0].filePath = "/arbitrary/path.png";
  await writeFile(receiptStorePath, JSON.stringify(ledger));
  const invalid = createOutputReceiptStore(receiptStorePath); await invalid.ready;
  assert.match(invalid.loadWarning, /invalid paths/); assert.equal(invalid.find("/arbitrary/path.png"), undefined);
  if (process.platform !== "win32") {
    const alias = path.join(h.dir, "linked-ledger.json"); await symlink(receiptStorePath, alias);
    const linked = createOutputReceiptStore(alias); await linked.ready;
    assert.match(linked.loadWarning, /not a regular bounded file/);
  }
});

const unsupportedLink = async () => { throw Object.assign(new Error("Hard links unsupported on this drive"), { code: "ENOTSUP" }); };
const fallbackPublisher = (temporary, target, options) => publishOutputFile(temporary, target, { ...options, linkFile: unsupportedLink });

test("exFAT fallback copies exclusively, retains source bytes, and records the final file's identity for restart reveal", async t => {
  const root = await fixture(t), receiptStorePath = path.join(root.dir, "receipts.json");
  const h = await harness(t, { receiptStorePath, publish: fallbackPublisher });
  await writeFile(path.join(h.destination, "Result.png"), "existing destination");
  const body = h.body(); await h.request("export", "POST", body); const done = await h.finish(body.requestId);
  assert.equal(done.status, "complete"); assert.equal(done.results[0].fileName, "Result (1).png");
  const source = await readFile(path.join(h.uploadsDir, "image.wrong"));
  assert.deepEqual(await readFile(done.results[0].filePath), source);
  assert.equal(await readFile(path.join(h.destination, "Result.png"), "utf8"), "existing destination");
  assert.deepEqual(await readFile(path.join(h.uploadsDir, "image.wrong")), source);
  assert.equal((await h.request("reveal", "POST", { filePath: done.results[0].filePath })).status, 200);
  const restarted = await harness(t, { receiptStorePath });
  assert.equal((await restarted.request("reveal", "POST", { filePath: done.results[0].filePath })).status, 200);
  await assertNoTemps(h.destination);
});

test("fallback concurrent copies cannot overwrite each other for number or skip collisions", async t => {
  const h = await fixture(t);
  for (const collision of ["number", "skip"]) {
    const results = await Promise.all([0, 1].map(() => exportOutputItem({ ...h.item, name: collision }, h.dest(), { ...h.options, collision, publish: fallbackPublisher })));
    assert.equal(results.filter(result => result.status === "saved").length, collision === "number" ? 2 : 1);
    for (const result of results.filter(result => result.status === "saved")) assert.deepEqual(await readFile(result.filePath), await readFile(path.join(h.uploadsDir, "image.wrong")));
  }
  await assertNoTemps(h.destination);
});

test("fallback failure and cancellation remove only the partially written inode they own", async t => {
  const h = await fixture(t);
  for (const mode of ["cancel", "failure", "replaced", "symlink"]) {
    if (mode === "symlink" && process.platform === "win32") continue;
    const controller = new AbortController(), target = path.join(h.destination, `${mode}.png`);
    const publish = (temporary, filePath, options) => publishOutputFile(temporary, filePath, { ...options, linkFile: unsupportedLink,
      onCopyProgress: async () => {
        if (mode === "cancel") controller.abort();
        else if (mode === "failure") throw Object.assign(new Error("Disk full during exclusive copy"), { code: "ENOSPC" });
        else {
          await rename(filePath, `${filePath}.moved`);
          if (mode === "symlink") await symlink(path.join(h.uploadsDir, "image.wrong"), filePath);
          else await writeFile(filePath, "foreign replacement");
          controller.abort();
        }
      } });
    await assert.rejects(exportOutputItem({ ...h.item, name: mode }, h.dest(), { ...h.options, signal: controller.signal, publish }));
    if (mode === "replaced") assert.equal(await readFile(target, "utf8"), "foreign replacement");
    else if (mode === "symlink") assert.deepEqual(await readFile(target), await readFile(path.join(h.uploadsDir, "image.wrong")));
    else await assert.rejects(stat(target), { code: "ENOENT" });
  }
  await assertNoTemps(h.destination);
});
