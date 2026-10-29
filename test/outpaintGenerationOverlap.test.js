import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { createVideoOutpaintService } from "../server/video-outpaint.js";
const execute = promisify(execFile);

test("Seedance preparation reserves inward overlap on the submitted canvas and keeps a complete original reference", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-outpaint-overlap-"));
  const source = path.join(directory, "source.mp4");
  const run = args => execute(ffmpeg, args, { windowsHide: true, timeout: 30000 });
  try {
    await run(["-y", "-f", "lavfi", "-i", "color=red:s=64x64:r=24", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
    const service = createVideoOutpaintService({ resolveAsset: async filePath => ({ filePath }), probeVideo: async () => ({ width: 64, height: 64, fps: 24, duration: 1 }),
      createTarget: async (_body, kind, extension) => ({ filePath: path.join(directory, kind + extension), publicPath: path.join(directory, kind + extension) }), runFfmpeg: run, statFile: stat });
    const prepared = await service.prepare({ videoOutpaint: { model: "seedance-2.5", seedanceResolution: "480p", feather: 32 } }, source);
    const { left, top, sourceWidth: sw, sourceHeight: sh } = prepared.plan;
    assert.deepEqual(prepared.plan.generationOverlap, { left: 0, right: 0, top: 32, bottom: 32 });
    assert.deepEqual(prepared.plan.generationContentRect, { x: left, y: top + 32, width: sw, height: sh - 64 });
    const pixel = async (file, y) => {
      const { stdout } = await execute(ffmpeg, ["-v", "error", "-i", file, "-vf", `crop=2:2:100:${y},format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", windowsHide: true });
      return [...stdout.subarray(0, 3)];
    };
    assert.ok((await pixel(prepared.videoUrl, top + 12))[0] > 200, "Reference must retain source pixels throughout the overlap");
    assert.ok((await pixel(prepared.generationVideoUrl, top + 12)).every(v => v < 8), "Submitted top fill must extend inward, not stop at the old edge");
    assert.ok((await pixel(prepared.generationVideoUrl, top + sh - 12)).every(v => v < 8), "Submitted bottom fill must extend inward");
    assert.ok((await pixel(prepared.generationVideoUrl, top + 50))[0] > 200, "Conditioning core must remain intact");
    assert.ok((await pixel(prepared.maskImageUrl, top + 12)).every(v => v > 240), "Local mask and submitted inward overlap must agree");
    assert.equal(prepared.maskVideoUrl, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
