import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { transitionTimeline } from "./fixtures/editorTransitions.js";
import { editorSetClipPosition } from "../src/editorTimeline.js";
import { editorSetTransition } from "../src/editorTransitions.js";
import { buildEditorRenderArgs, executeEditorFfmpeg } from "../server/editor-render.js";
const exec = promisify(execFile);
const decode = async file => (await exec(ffmpeg, ["-v", "error", "-i", file, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", maxBuffer: 12e6 })).stdout;
const pixel = (data, frame, x, y) => [...data.subarray((frame * 160 * 90 + y * 160 + x) * 3, (frame * 160 * 90 + y * 160 + x) * 3 + 3)];
const close = (actual, expected) => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < 12), `${actual} expected ${expected}`);

test("positioned MP4s and stills agree for cuts, transitions, positive/negative offsets and partial ranges", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-position-"));
  try {
    const files = new Map();
    for (const color of ["red", "blue"]) {
      const filePath = path.join(dir, `${color}.mp4`);
      await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=30:d=4`, "-c:v", "libx264", "-pix_fmt", "yuv420p", filePath]);
      files.set(color, { filePath });
    }
    let base = transitionTimeline(); base.clips = base.clips.filter(c => c.trackId === "v1");
    base = editorSetClipPosition(base, "v1-red", { positionX: 25, positionY: 20 });
    base = editorSetClipPosition(base, "v1-blue", { positionX: -25, positionY: -20 });
    for (const type of [null, "crossDissolve", "dipToBlack"]) {
      const timeline = type ? editorSetTransition(base, "v1-red", "v1-blue", type) : base;
      for (const frame of [20, 48, 70]) {
        const png = path.join(dir, `${type}-${frame}.png`), mp4 = path.join(dir, `${type}-${frame}.mp4`);
        await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(timeline, files, png, { frame }));
        await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs({ ...timeline, inFrame: frame, outFrame: frame + 2 }, files, mp4));
        const still = await decode(png), video = await decode(mp4);
        assert.equal(video.length, 160 * 90 * 3 * 2);
        const expected = frame < 48 ? [[0, 0, 0], [255, 0, 0], [255, 0, 0]]
          : frame > 48 || !type ? [[0, 0, 255], [0, 0, 255], [0, 0, 0]]
            : type === "dipToBlack" ? [[0, 0, 0], [0, 0, 0], [0, 0, 0]] : [[0, 0, 128], [128, 0, 128], [128, 0, 0]];
        [[10, 10], [80, 45], [150, 80]].forEach(([x, y], i) => {
          close(pixel(still, 0, x, y), expected[i]); close(pixel(video, 0, x, y), expected[i]);
        });
      }
    }
    for (const position of [-100, 100]) {
      const timeline = editorSetClipPosition(base, "v1-red", { positionX: position, positionY: position });
      const output = path.join(dir, `edge-${position}.png`);
      await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(timeline, files, output, { frame: 20 }));
      assert.ok([...(await decode(output))].every(v => v < 8), "Moving entirely outside the frame leaves black, not repeated edge pixels");
    }
    const portrait = path.join(dir, "portrait.mp4");
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=white:s=80x90:r=24:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", portrait]);
    files.set("red", { filePath: portrait });
    for (const direction of [-1, 1]) {
      const timeline = editorSetClipPosition(base, "v1-red", { positionX: direction * .6, positionY: direction * 1.1 });
      const output = path.join(dir, `portrait-${direction}.png`);
      await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(timeline, files, output, { frame: 20 }));
      const data = await decode(output), left = 40 + direction;
      close(pixel(data, 0, left - 1, 45), [0, 0, 0]); close(pixel(data, 0, left, 45), [255, 255, 255]);
      close(pixel(data, 0, 80, direction > 0 ? 0 : 89), [0, 0, 0]);
      close(pixel(data, 0, 80, 45), [255, 255, 255]);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
