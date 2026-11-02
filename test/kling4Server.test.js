import assert from "node:assert/strict";
import test from "node:test";
import { createKling4Generator, validateKling4Media } from "../server/kling4.js";

const local = name => `/uploads/project/${name}`;
const image = { mimeType: "image/png", width: 1920, height: 1080, bytes: 1000 };
const video = { mimeType: "video/mp4", width: 1920, height: 1080, bytes: 1000, duration: 6, fps: 24 };
const base = { prompt: "A person walks through a park.", duration: "5 seconds", resolution: "1080p", aspectRatio: "16:9" };

function harness(overrides = {}) {
  const calls = [];
  const client = { captured: true };
  const dependencies = {
    isLocalAssetUrl: value => value.startsWith("/uploads/"),
    inspectAsset: async (url, kind) => { calls.push(["inspect", url]); return kind === "video" ? video : image; },
    createClient: options => { calls.push(["client", options]); return client; },
    uploadToFal: async (url, receivedClient) => { assert.equal(receivedClient, client); calls.push(["uploadFal", url]); return `https://assets.example/fal/${encodeURIComponent(url)}`; },
    uploadToKrea: async (url, key) => { calls.push(["uploadKrea", url, key]); return `https://assets.example/krea/${encodeURIComponent(url)}`; },
    uploadToAtlas: async (url, key) => { calls.push(["uploadAtlas", url, key]); return `https://assets.example/atlas/${encodeURIComponent(url)}`; },
    subscribeFal: async (...args) => { calls.push(["fal", ...args]); return { requestId: "fal-job", data: { video: { url: "https://output.example/fal.mp4" } } }; },
    runKreaGeneration: async options => { calls.push(["krea", options]); return { requestId: "krea-job", job: { result: { urls: ["https://output.example/krea.mp4"] } } }; },
    runAtlasGeneration: async options => { calls.push(["atlas", options]); return { requestId: "atlas-job", url: "https://output.example/atlas.mp4" }; },
    quoteAtlasInput: async (input, key) => { calls.push(["quote", input, key]); return null; },
    ...overrides
  };
  return { calls, client, generate: createKling4Generator(dependencies) };
}

test("Fal Kling 4 captures its key and submits only current T2V fields", async () => {
  const h = harness();
  const result = await h.generate({ ...base, duration: "30 seconds", aspectRatio: "21:9" }, { falKey: "fal-test", kreaKey: "krea-test", atlasKey: "atlas-test" });
  const submit = h.calls.find(call => call[0] === "fal");
  assert.equal(submit[1], "kling/v4/text-to-video");
  assert.deepEqual(submit[2].input, { prompt: base.prompt, duration: 30, resolution: "1080p", aspect_ratio: "21:9" });
  assert.equal(submit[4], h.client);
  assert.equal(submit[5], "fal-test");
  assert.equal(result.provider, "fal.ai");
  assert.equal(result.requestId, "fal-job");
  assert.equal(h.calls.filter(call => ["fal", "krea", "atlas"].includes(call[0])).length, 1);
});

test("Fal start/end frames use I2V and retain source aspect without O3 fields", async () => {
  const h = harness();
  const result = await h.generate({ ...base, startFrameUrls: [local("first.png")], endFrameUrls: [local("last.png")] }, { falKey: "fal-test" });
  const input = h.calls.find(call => call[0] === "fal")[2].input;
  assert.equal(result.endpoint, "kling/v4/image-to-video");
  assert.match(input.start_image_url, /first/);
  assert.match(input.end_image_url, /last/);
  for (const field of ["aspect_ratio", "image_url", "cfg_scale", "negative_prompt", "generate_audio", "seed", "shot_type", "multi_prompt"]) assert.equal(Object.hasOwn(input, field), false, field);
  assert.equal(result.settings.aspectRatio, "source frame");
  assert.equal(h.calls.filter(call => call[0] === "inspect").length, 2);
});

test("Director references retain ordered identity and use the compiled narrative without extra generation", async () => {
  const h = harness();
  const result = await h.generate({ ...base,
    prompt: "@Hero walks across @Park following @Motion.",
    referenceImageUrls: [local("park.png")], referenceImageLabels: ["Park"],
    characterReferenceUrls: [local("hero.png")], characterReferenceLabels: ["Hero"],
    referenceVideoUrls: [local("motion.mp4")], referenceVideoLabels: ["Motion"],
    directorReferences: [{ type: "character", url: local("hero.png"), tag: "Hero" }],
    filmDirector: { finalPrompt: "@Hero walks across @Park following @Motion." }
  }, { falKey: "fal-test" });
  const input = h.calls.find(call => call[0] === "fal")[2].input;
  assert.equal(result.endpoint, "kling/v4/reference-to-video");
  assert.equal(input.prompt, "@Image2 walks across @Image1 following @Video1.");
  assert.equal(input.image_urls.length, 2);
  assert.equal(input.video_urls.length, 1);
  assert.equal(result.settings.directorPromptMode, "compiled narrative");
  assert.equal(result.settings.referenceVideoDurationSeconds, 6);
  assert.equal(result.cost.amountUsd, 1.551);
  assert.equal(h.calls.filter(call => call[0] === "fal").length, 1);
  const firstUpload = h.calls.findIndex(call => call[0] === "uploadFal");
  assert.ok(h.calls.slice(firstUpload).every(call => call[0] !== "inspect"));
});

test("Krea uses captured credentials for uploads/submission and waits for the terminal job", async () => {
  const credentials = { kreaKey: "original-krea", atlasKey: "atlas-test" };
  const h = harness({ inspectAsset: async () => { credentials.kreaKey = "changed-krea"; return image; } });
  const result = await h.generate({ ...base, startFrameUrls: [local("first.png")], endFrameUrls: [local("last.png")] }, credentials);
  const options = h.calls.find(call => call[0] === "krea")[1];
  assert.equal(options.apiKey, "original-krea");
  assert.equal(options.endpoint, "/generate/video/kling/kling-4");
  assert.equal(options.waitUntilTerminal, true);
  assert.equal(options.input.duration, 5);
  assert.equal(options.input.aspect_ratio, "16:9");
  assert.match(options.input.start_image, /first/);
  assert.match(options.input.end_image, /last/);
  assert.ok(h.calls.filter(call => call[0] === "uploadKrea").every(call => call[2] === "original-krea"));
  assert.equal(result.provider, "Krea");
  assert.equal(result.settings.aspectRatio, "source frame");
  assert.equal(result.remoteVideo.url, "https://output.example/krea.mp4");
  assert.equal(h.calls.some(call => call[0] === "atlas" || call[0] === "fal"), false);
});

test("Atlas uses the verified native reference contract and counts keyframes in its reference numbering", async () => {
  const h = harness();
  const result = await h.generate({ ...base, prompt: "@Hero follows @Motion.",
    startFrameUrls: [local("first.png")], referenceImageUrls: [local("hero.png")], referenceImageLabels: ["Hero"],
    referenceVideoUrls: [local("motion.mp4")], referenceVideoLabels: ["Motion"]
  }, { atlasKey: "atlas-test" });
  const { input, key } = h.calls.find(call => call[0] === "atlas")[1];
  assert.equal(key, "atlas-test");
  assert.equal(input.model, "kwaivgi/kling-v4.0/reference-to-video");
  assert.equal(input.prompt, "@image_2 follows @video_1.");
  assert.equal(input.resolution, "1080p");
  assert.match(input.image, /first/);
  assert.equal(input.reference_images.length, 1);
  assert.equal(input.reference_videos.length, 1);
  assert.equal(result.provider, "Atlas Cloud");
  assert.equal(result.cost.amountUsd, null);
  assert.equal(result.remoteVideo.url, "https://output.example/atlas.mp4");
});

test("Atlas quote failures preserve unknown cost and do not replay or block generation", async () => {
  const h = harness({ quoteAtlasInput: async () => { throw new Error("quote unavailable"); } });
  const result = await h.generate(base, { atlasKey: "atlas-test" });
  assert.equal(result.cost.amountUsd, null);
  assert.equal(h.calls.filter(call => call[0] === "atlas").length, 1);
});

test("Atlas image mode uses image/last_image without an unsupported aspect-ratio field", async () => {
  const h = harness();
  const result = await h.generate({ ...base, startFrameUrls: [local("first.png")], endFrameUrls: [local("last.png")] }, { atlasKey: "atlas-test" });
  const input = h.calls.find(call => call[0] === "atlas")[1].input;
  assert.equal(result.endpoint, "kwaivgi/kling-v4.0/image-to-video");
  assert.match(input.image, /first/);
  assert.match(input.last_image, /last/);
  assert.equal(Object.hasOwn(input, "aspect_ratio"), false);
  assert.equal(result.settings.aspectRatio, "source frame");
});

test("Krea supports image/video references and documented tags without an audio or shot field", async () => {
  const h = harness();
  const result = await h.generate({ ...base, prompt: "@Hero follows @Motion.",
    referenceImageUrls: [local("hero.png")], referenceImageLabels: ["Hero"],
    referenceVideoUrls: [local("motion.mp4")], referenceVideoLabels: ["Motion"]
  }, { kreaKey: "krea-test" });
  const input = h.calls.find(call => call[0] === "krea")[1].input;
  assert.equal(input.prompt, "@Image1 follows @Video1.");
  assert.equal(input.reference_images.length, 1);
  assert.equal(input.reference_videos.length, 1);
  assert.equal(Object.hasOwn(input, "generate_audio"), false);
  assert.equal(Object.hasOwn(input, "multi_prompt"), false);
  assert.equal(result.cost.amountUsd, 1.175);
});

test("duplicate-URL references preserve every supplied alias while uploading only once", async () => {
  const h = harness();
  const result = await h.generate({ ...base, prompt: "@Hero and @Double refer to the same person.",
    referenceImageUrls: [local("hero.png"), local("hero.png")], referenceImageLabels: ["Hero", "Double"]
  }, { falKey: "fal-test" });
  const input = h.calls.find(call => call[0] === "fal")[2].input;
  assert.equal(input.prompt, "@Image1 and @Image1 refer to the same person.");
  assert.equal(input.image_urls.length, 1);
  assert.equal(result.settings.referenceImageCount, 1);
  assert.equal(h.calls.filter(call => call[0] === "inspect").length, 1);
  assert.equal(h.calls.filter(call => call[0] === "uploadFal").length, 1);
});

test("unbound reference tags fail before inspection or uploads", async () => {
  for (const prompt of ["@Misspelled moves.", "@Image2 moves."]) {
    const h = harness();
    await assert.rejects(h.generate({ ...base, prompt,
      referenceImageUrls: [local("hero.png")], referenceImageLabels: ["Hero"]
    }, { falKey: "fal-test" }), /has no matching supplied image or video/);
    assert.deepEqual(h.calls, []);
  }
});

test("invalid and excess references fail before uploads or paid requests", async () => {
  for (const patch of [
    { referenceImageUrls: ["https://external.example/image.png"] },
    { referenceImageUrls: Array.from({ length: 11 }, (_, index) => local(`${index}.png`)) },
    { referenceAudioUrls: [local("audio.wav")] },
    { referenceVideoUrls: "not-an-array" },
    { generateAudio: false }
  ]) {
    const h = harness();
    await assert.rejects(h.generate({ ...base, ...patch }, { falKey: "fal-test" }), { status: 400 });
    assert.equal(h.calls.some(call => /upload|^(fal|krea|atlas)$/.test(call[0])), false);
  }
});

test("all media are inspected before upload and invalid Fal video geometry prevents submission", async () => {
  const h = harness({ inspectAsset: async (_url, kind) => kind === "video" ? { ...video, width: 1280, height: 640 } : image });
  await assert.rejects(h.generate({ ...base, referenceImageUrls: [local("image.png")], referenceVideoUrls: [local("motion.mp4")] }, { falKey: "fal-test" }), /700 and 4553/);
  assert.equal(h.calls.some(call => /upload|^(fal|krea|atlas)$/.test(call[0])), false);
});

test("provider media format, size, dimensions and duration failures stop before upload", async () => {
  const cases = [
    ["fal", "image", { ...image, mimeType: "video/mp4" }, /not a image/],
    ["fal", "image", { ...image, width: 299, height: 299 }, /at least 300/],
    ["fal", "image", { ...image, bytes: 30 * 1024 * 1024 + 1 }, /MiB limit/],
    ["fal", "video", { ...video, fps: 12 }, /frame rate/],
    ["fal", "video", { ...video, duration: 2 }, /3 and 30 seconds/],
    ["fal", "video", { ...video, bytes: 300 * 1024 * 1024 + 1 }, /MiB limit/],
    ["atlas", "image", { ...image, mimeType: "image/webp" }, /JPG, JPEG or PNG/],
    ["atlas", "video", { ...video, mimeType: "video/webm" }, /MP4 or MOV/],
    ["krea", "video", { ...video, duration: NaN }, /no readable duration/]
  ];
  for (const [provider, kind, metadata, expected] of cases) {
    const h = harness({ inspectAsset: async () => metadata });
    const body = { ...base, [kind === "image" ? "referenceImageUrls" : "referenceVideoUrls"]: [local(kind === "image" ? "ref.png" : "ref.mp4")] };
    await assert.rejects(h.generate(body, { [`${provider}Key`]: "test-key" }), expected);
    assert.equal(h.calls.some(call => /upload|^(fal|krea|atlas)$/.test(call[0])), false);
  }
});

test("Krea end-frame combinations are validated before media work", async () => {
  for (const patch of [
    { endFrameUrls: [local("last.png")] },
    { startFrameUrls: [local("first.png")], endFrameUrls: [local("last.png")], referenceImageUrls: [local("ref.png")] }
  ]) {
    const h = harness();
    await assert.rejects(h.generate({ ...base, ...patch }, { kreaKey: "krea-test" }), { status: 400 });
    assert.deepEqual(h.calls, []);
  }
});

test("video-duration validation enforces the combined limit without applying Fal-only dimensions to Krea", async () => {
  const request = { provider: "krea", startFrames: [], endFrames: [], images: [], videos: [local("a.mp4"), local("b.mp4")] };
  const result = await validateKling4Media(request, async () => ({ ...video, width: 640, height: 360, duration: 15 }));
  assert.equal(result.referenceVideoDurationSeconds, 30);
  await assert.rejects(validateKling4Media(request, async () => ({ ...video, duration: 16 })), /combined video references exceed 30/);
});

test("uncertain generation and missing output never fall back or resubmit", async () => {
  for (const subscribeFal of [async () => { throw new Error("submission outcome uncertain"); }, async () => ({ requestId: "fal-job", data: {} })]) {
    let submissions = 0;
    const h = harness({ subscribeFal: async (...args) => { submissions += 1; return subscribeFal(...args); } });
    await assert.rejects(h.generate(base, { falKey: "fal-test", kreaKey: "krea-test", atlasKey: "atlas-test" }), /uncertain|no video URL/);
    assert.equal(submissions, 1);
    assert.equal(h.calls.some(call => call[0] === "krea" || call[0] === "atlas"), false);
  }
});

test("no enabled credential performs no asset or provider work", async () => {
  const h = harness();
  await assert.rejects(h.generate(base), /Enable Fal, Krea or Atlas Cloud/);
  assert.deepEqual(h.calls, []);
});
