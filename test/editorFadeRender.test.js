import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { transitionTimeline } from "./fixtures/editorTransitions.js";
import { editorSetFade, editorClipFade } from "../src/editorFades.js";
import { buildEditorRenderArgs, executeEditorFfmpeg } from "../server/editor-render.js";
const exec = promisify(execFile);

test("edge fades export exact pixels and audio levels, including lower-track reveals, partial ranges and stills", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-fades-"));
  try {
    const files = new Map();
    for (const color of ["red", "blue"]) {
      const filePath = path.join(dir, `${color}.mp4`);
      await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=30:d=4`, "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", filePath]);
      files.set(color, { filePath });
    }
    for (const fps of [24, 25, 30, 60]) for (const lower of [false, true]) {
      let t = transitionTimeline(fps); t.clips = t.clips.filter(c => c.assetId === "red");
      t = editorSetFade(editorSetFade(t, "v1-red", "left", fps), "v1-red", "right", fps);
      t = editorSetFade(editorSetFade(t, "a1-red", "left", fps), "a1-red", "right", fps);
      const clip = t.clips[0];
      if (lower) {
        t.clips[0] = { ...clip, trackId: "v2" };
        t.clips.push({ ...clip, id: "background", trackId: "v1", assetId: "blue", fadeIn: undefined, fadeOut: undefined });
      }
      for (const [inFrame, outFrame] of [[0, fps * 2], [5, fps * 2 - 4]]) {
        const output = path.join(dir, `${fps}-${lower}-${inFrame}.mp4`);
        await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs({ ...t, inFrame, outFrame }, files, output));
        const pixels = (await exec(ffmpeg, ["-v", "error", "-i", output, "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" })).stdout;
        assert.equal(pixels.length / 3, outFrame - inFrame);
        for (let frame = inFrame; frame < outFrame; frame++) {
          const alpha = editorClipFade(clip, frame), p = pixels.subarray((frame - inFrame) * 3, (frame - inFrame + 1) * 3);
          assert.ok(Math.abs(p[0] - 255 * alpha) < 12 && Math.abs(p[2] - (lower ? 255 * (1 - alpha) : 0)) < 12 && p[1] < 12,
            `${fps} lower=${lower} frame=${frame} range=${inFrame}: ${[...p]} alpha=${alpha}`);
        }
        const audio = (await exec(ffmpeg, ["-v", "error", "-i", output, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 2000000 })).stdout;
        for (const age of [8, fps, fps * 2 - 8]) {
          let sum = 0, count = 0;
          for (let sample = Math.round((age - inFrame) * 48000 / fps); sample < Math.round((age - inFrame) * 48000 / fps) + 480 && sample * 4 < audio.length; sample++) {
            sum += audio.readFloatLE(sample * 4) ** 2; count++;
          }
          const expected = .125 / Math.sqrt(2) * editorClipFade(clip, age + .005 * fps);
          assert.ok(Math.abs(Math.sqrt(sum / count) - expected) < .012, `audio ${fps} frame=${age}: ${Math.sqrt(sum / count)} expected ${expected}`);
        }
      }
      const output = path.join(dir, `${fps}-${lower}.png`), frame = Math.floor(fps / 2);
      await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(t, files, output, { frame }));
      const p = (await exec(ffmpeg, ["-v", "error", "-i", output, "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" })).stdout;
      const alpha = editorClipFade(clip, frame);
      assert.ok(Math.abs(p[0] - 255 * alpha) < 12 && Math.abs(p[2] - (lower ? 255 * (1 - alpha) : 0)) < 12);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
