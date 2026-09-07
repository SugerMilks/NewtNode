import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { createMyNewtMediaInspector } from "../server/my-newt-media.js";

const run = promisify(execFile);
test("My Newt inspects video as six timed image samples without sending it to another model", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "my-newt-video-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "clip.mp4");
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "1", "-c:v", "mpeg4", filePath]);
  const inspect = createMyNewtMediaInspector({ resolveAsset: async () => ({ filePath, fileName: "clip.mp4" }), probeVideo: async () => ({ duration: 1 }), runFfmpeg: (args) => run(ffmpeg, args) });
  const result = await inspect("/outputs/clip.mp4", "unused");
  const images = result.content.filter((item) => item.type === "input_image");
  assert.equal(images.length, 6);
  assert.ok(images.every((item) => item.image_url.startsWith("data:image/jpeg;base64,/9j/")));
  assert.match(result.content[0].text, /have NOT been observed/);
  assert.equal(result.cost, 0);
  await assert.rejects(inspect("/Users/private/clip.mp4", "unused"), /Only managed/);
});

test("My Newt audio inspection uses an OpenAI transcript with an explicit duration and cost", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "my-newt-audio-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "audio.wav");
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", filePath]);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(options.body.get("model"), "gpt-4o-transcribe");
    return { ok: true, json: async () => ({ text: "Test transcript" }) };
  };
  const inspect = createMyNewtMediaInspector({ resolveAsset: async () => ({ filePath, fileName: "audio.wav" }), probeVideo: async () => ({ duration: 1 }), runFfmpeg: (args) => run(ffmpeg, args) });
  const result = await inspect("/uploads/audio.wav", "test-key");
  assert.match(result.content[0].text, /first 1 seconds/);
  assert.match(result.content[0].text, /Test transcript/);
  assert.ok(result.cost > 0);
});
