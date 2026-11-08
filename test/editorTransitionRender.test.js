import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { transitionTimeline } from "./fixtures/editorTransitions.js";
import { editorSetTransition } from "../src/editorTransitions.js";
import { buildEditorRenderArgs, executeEditorFfmpeg } from "../server/editor-render.js";
const exec = promisify(execFile);
const decode = async file => (await exec(ffmpeg, ["-v", "error", "-i", file, "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" })).stdout;
async function sources(dir) {
  const files = new Map();
  for (const [color, frequency] of [["red", 440], ["blue", 880]]) {
    const filePath = path.join(dir, `${color}.mp4`);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=30:d=4`, "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=4`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", filePath]);
    files.set(color, { filePath });
  }
  return files;
}

test("dissolve and dip exports match every frame, partial ranges and stills at all sequence frame rates", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-transitions-"));
  try {
    const files = await sources(dir);
    for (const fps of [24, 25, 30, 60]) for (const type of ["crossDissolve", "dipToBlack"]) {
      const timeline = editorSetTransition(transitionTimeline(fps), "v1-red", "v1-blue", type, fps);
      const duration = timeline.transitions[0].duration, start = fps * 2 - duration / 2;
      for (const [inFrame, outFrame] of [[0, fps * 4], [start + 3, start + duration - 2]]) {
        const output = path.join(dir, `${fps}-${type}-${inFrame}.mp4`);
        await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs({ ...timeline, inFrame, outFrame }, files, output));
        const pixels = await decode(output);
        assert.equal(pixels.length / 3, outFrame - inFrame);
        for (let f = inFrame; f < outFrame; f++) {
          const p = Math.min(1, Math.max(0, (f - start) / duration));
          const expected = type === "dipToBlack" ? [255 * Math.max(0, 1 - 2 * p), 255 * Math.max(0, 2 * p - 1)] : [255 * (1 - p), 255 * p];
          const pixel = pixels.subarray((f - inFrame) * 3, (f - inFrame + 1) * 3);
          assert.ok(Math.abs(pixel[0] - expected[0]) < 12 && Math.abs(pixel[2] - expected[1]) < 12 && pixel[1] < 12,
            `${fps} ${type} range ${inFrame}, frame ${f}: ${[...pixel]} expected R/B ${expected}`);
        }
      }
      const output = path.join(dir, `${fps}-${type}.png`);
      await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(timeline, files, output, { frame: fps * 2 }));
      const pixels = await decode(output);
      assert.ok(type === "dipToBlack" ? [...pixels].every(v => v < 8) : pixels[0] > 115 && pixels[2] > 115 && pixels[1] < 8);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("audio crossfade mixes both sources smoothly without changing timing, including a partial export", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-audio-fade-"));
  try {
    const files = await sources(dir), timeline = editorSetTransition(transitionTimeline(), "a1-red", "a1-blue", "crossFade");
    for (const [inFrame, outFrame] of [[0, 96], [43, 56]]) {
      const output = path.join(dir, `audio-${inFrame}.mp4`);
      await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs({ ...timeline, inFrame, outFrame }, files, output));
      const { stdout } = await exec(ffmpeg, ["-v", "error", "-i", output, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 2e6 });
      const amplitude = (time, frequency) => {
        const first = Math.round((time - inFrame / 24 - .025) * 48000), n = 2400; let sin = 0, cos = 0;
        for (let i = first; i < first + n; i++) { const v = stdout.readFloatLE(i * 4), phase = 2 * Math.PI * frequency * i / 48000; sin += v * Math.sin(phase); cos += v * Math.cos(phase); }
        return 2 * Math.hypot(sin, cos) / n;
      };
      for (const time of inFrame === 0 ? [1.55, 1.75, 2, 2.25, 2.45] : [1.9, 2, 2.2]) {
        const p = time - 1.5;
        assert.ok(Math.abs(amplitude(time, 440) - .125 * (1 - p)) < .012, `outgoing ${time}`);
        assert.ok(Math.abs(amplitude(time, 880) - .125 * p) < .012, `incoming ${time}`);
      }
      assert.equal((await decode(output)).length / 3, outFrame - inFrame);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("missing video handles hold edges and upper-track dips stay opaque over lower footage", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-transition-handles-"));
  try {
    const files = await sources(dir);
    let timeline = transitionTimeline();
    timeline.clips = timeline.clips.filter(c => c.trackId === "v1").map(c => ({ ...c, sourceIn: 0, start: c.start ? 96 : 0, duration: 96, trackId: "v2" }));
    timeline.clips.push({ ...timeline.clips[0], id: "under", trackId: "v1", start: 80, duration: 32 });
    for (const type of ["crossDissolve", "dipToBlack"]) {
      const t = { ...editorSetTransition(timeline, "v1-red", "v1-blue", type), inFrame: 84, outFrame: 108 };
      const output = path.join(dir, `${type}.mp4`);
      await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(t, files, output));
      const pixels = await decode(output); assert.equal(pixels.length / 3, 24);
      const center = pixels.subarray(36, 39);
      assert.ok(type === "dipToBlack" ? [...center].every(v => v < 8) : center[0] > 115 && center[2] > 115);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
