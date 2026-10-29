import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, stat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { registerVideoPreviewRoute } from "../server/routes/videoPreview.js";
const execute = promisify(execFile);
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; }, setHeader() {}, redirect(status, location) { this.statusCode = status; this.location = location; } });

test("MOV preview is a cached display-only H264 proxy, retains audio, and rejects remote/unmanaged inputs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-outpaint-preview-"));
  try {
    const source = path.join(directory, "source.mov"), cacheDir = path.join(directory, "cache");
    await mkdir(cacheDir);
    await execute(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc2=s=64x48:r=24", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "0.5", "-c:v", "prores_ks", "-profile:v", "5", "-pix_fmt", "yuv444p10le", "-c:a", "pcm_s16le", source], { timeout: 30000, windowsHide: true });
    const original = await stat(source);
    let handler, transcodes = 0, resolves = 0;
    registerVideoPreviewRoute({ get: (route, limiter, fn) => { assert.equal(route, "/api/video-preview"); handler = fn; } }, {
      limiter: (_req, _res, next) => next(), cacheDir,
      resolveAsset: async () => { resolves++; return { filePath: source }; },
      runFfmpeg: async args => { transcodes++; return execute(ffmpeg, args, { timeout: 30000, windowsHide: true }); }
    });
    const run = async url => { const res = response(); await handler({ query: { url } }, res); return res; };
    const [first, second] = await Promise.all([run("/outputs/source.mov"), run("/outputs/source.mov")]);
    assert.equal(first.statusCode, 302); assert.equal(first.location, second.location); assert.equal(transcodes, 1);
    assert.equal((await run("/outputs/source.mov")).location, first.location); assert.equal(transcodes, 1);
    const proxy = path.join(cacheDir, path.basename(first.location));
    const { stdout } = await execute(ffprobe.path, ["-v", "error", "-show_streams", "-of", "json", proxy], { timeout: 10000, windowsHide: true });
    const streams = JSON.parse(stdout).streams;
    assert.equal(streams.find(stream => stream.codec_type === "video").codec_name, "h264");
    assert.equal(streams.find(stream => stream.codec_type === "audio").codec_name, "aac");
    assert.equal((await stat(source)).mtimeMs, original.mtimeMs);
    assert.deepEqual(await readdir(cacheDir), [path.basename(proxy)]);
    const count = resolves;
    for (const url of ["https://example.org/source.mov", "/private/source.mov", "/outputs/source.mp4"]) assert.equal((await run(url)).statusCode, 400);
    assert.equal(resolves, count);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
