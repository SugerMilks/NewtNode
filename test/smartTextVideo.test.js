import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { createSmartTextVideoSampler, smartTextVideoSampleTimes } from "../server/smart-text-video.js";
import { processSmartText } from "../server/smart-text.js";

const exec = promisify(execFile);
const video = { type: "video", url: "/uploads/clip.mp4", label: "@Clip" };

test("video sampling covers the clip chronologically with bounded frames, including very short clips", () => {
  for (const duration of [0.01, 0.08, 1, 10, 3600]) {
    const times = smartTextVideoSampleTimes(duration);
    assert.ok(times.length > 0 && times.length <= 8);
    assert.equal(times[0], 0);
    assert.ok(times.every((time, i) => time >= 0 && time < duration && (!i || time > times[i - 1])));
    if (duration > 1) assert.ok(times.at(-1) > duration * 0.9);
  }
  for (const duration of [0, -1, NaN, Infinity]) assert.throws(() => smartTextVideoSampleTimes(duration), /duration/);
  assert.deepEqual(smartTextVideoSampleTimes(10, 0), smartTextVideoSampleTimes(10, 24));
});

test("real local video extraction produces bounded JPEG frames and cleans up before review", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "smart-text-video-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "clip.mp4");
  await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=10", "-t", "1", "-c:v", "mpeg4", "-pix_fmt", "yuv420p", filePath]);
  let extractedDirectory;
  const sampler = createSmartTextVideoSampler({
    resolveAsset: async url => { assert.equal(url, video.url); return { filePath }; },
    probeVideo: async source => { assert.equal(source, filePath); return { width: 1280, height: 720, duration: 1, fps: 10 }; },
    runFfmpeg: async (args, _label, timeout) => {
      extractedDirectory = path.dirname(args.at(-1));
      assert.ok(args.includes("-an")); assert.equal(timeout, 30000);
      await exec(ffmpeg, args, { timeout });
    }
  });
  const result = await sampler([video]);
  assert.equal(result.frames.length, 8); assert.equal(result.videos.length, 1);
  assert.deepEqual(result.videos[0].sampleTimes, smartTextVideoSampleTimes(1, 10));
  assert.equal(result.videos[0].url, video.url);
  for (const [index, frame] of result.frames.entries()) {
    const metadata = await sharp(frame.asset.buffer).metadata();
    assert.equal(metadata.format, "jpeg"); assert.equal(metadata.width, 1024); assert.equal(metadata.height, 576);
    assert.equal(frame.asset.mimeType, "image/jpeg");
    assert.match(frame.label, new RegExp(`Video 1 \\(@Clip\\), sample ${index + 1}/8`));
    assert.equal(frame.url, undefined);
  }
  await assert.rejects(stat(extractedDirectory), error => error.code === "ENOENT");
  assert.ok((await stat(filePath)).size > 0, "The source video must remain untouched");
});

test("invalid video inputs fail locally and extraction failure removes temporary files", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "smart-text-video-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "clip.mp4");
  await writeFile(filePath, "fixture");
  let resolved = 0, extractedDirectory;
  const deps = {
    resolveAsset: async () => { resolved++; return { filePath }; },
    probeVideo: async () => ({ width: 320, height: 180, duration: 2, fps: 24 }),
    runFfmpeg: async args => { extractedDirectory = path.dirname(args.at(-1)); throw new Error("Decoder failed"); }
  };
  const sample = createSmartTextVideoSampler(deps);
  assert.deepEqual(await sample([]), { frames: [], videos: [] });
  for (const url of ["https://example.com/video.mp4", "/etc/passwd", "file:///private/video.mp4", ""]) {
    await assert.rejects(sample([{ url }]), /managed project videos/);
  }
  await assert.rejects(sample(Array(4).fill(video)), /up to 3/);
  assert.equal(resolved, 0);
  await assert.rejects(sample([video]), /Decoder failed/);
  await assert.rejects(stat(extractedDirectory), error => error.code === "ENOENT");
  await assert.rejects(createSmartTextVideoSampler({ ...deps, probeVideo: async () => ({ duration: 2 }) })([video]), /video track/);
  await assert.rejects(createSmartTextVideoSampler({ ...deps, probeVideo: async () => ({ width: 1, height: 1, duration: 0 }) })([video]), /duration/);
  await assert.rejects(createSmartTextVideoSampler({ ...deps, resolveAsset: async () => ({ filePath, fileName: "audio.mp3" }) })([video]), /playable video/);
});

test("video and image references share one request and remain available on revisions", async () => {
  const image = { url: "/outputs/ref.png", label: "@Still", type: "image" };
  const second = { ...video, url: "/outputs/second.mp4", label: "@Second" };
  const frames = [video, second].map((clip, index) => ({ type: "image", label: `Video ${index + 1} (${clip.label}), sample 1/1, 1.000s of 5.000s`, asset: { buffer: Buffer.from(`sample-${index}`), fileName: `${index}.jpg`, mimeType: "image/jpeg" } }));
  let calls = 0;
  const deps = {
    falTextModel: "openai/gpt-6-sol", openAiTextModel: "gpt-6-sol",
    sampleVideos: async inputs => { assert.deepEqual(inputs, [video, second]); return { frames, videos: [video, second] }; },
    runTextLlm: () => assert.fail("No separate paid text call"),
    runMediaDescriptionLlm: async request => {
      calls++;
      assert.deepEqual(request.inputs, [image, ...frames]);
      assert.equal(request.mediaType, "image");
      assert.match(request.prompt, /1: @Still/); assert.match(request.prompt, /2: Video 1 \(@Clip\)/); assert.match(request.prompt, /3: Video 2 \(@Second\)/);
      assert.match(request.prompt, /Audio has not been reviewed/);
      assert.match(request.systemPrompt, /sparse, chronological still frames/);
      assert.match(request.systemPrompt, /one coherent representative moment/);
      assert.match(request.systemPrompt, /do not invent dialogue/);
      if (calls === 2) assert.match(request.prompt, /Make it monochrome/);
      return { text: "A still-image prompt", provider: "fal", model: request.falModel, usage: { cost: 0.02 } };
    }
  };
  for (const action of ["generate", "revise"]) {
    const result = await processSmartText({ text: "Use the clip's staging with @Still's lighting", imageInputs: [image], videoInputs: [video, second], action, currentPrompt: "Previous prompt", revisionNote: "Make it monochrome" }, deps);
    assert.deepEqual(result.videoReview, [video, second]); assert.equal(result.usage.cost, 0.02);
    assert.deepEqual(result.helperUsages, []);
  }
  assert.equal(calls, 2);
  await assert.rejects(processSmartText({ videoInputs: [video, second] }, { ...deps, sampleVideos: async () => { throw new Error("Invalid video"); } }), /Invalid video/);
  await assert.rejects(processSmartText({ videoInputs: [video, second] }, { ...deps, sampleVideos: async () => ({ frames: [], videos: [] }) }), /did not complete/);
  assert.equal(calls, 2, "Bad videos must not fall back to a paid text-only run");
});
