import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createAtlasMedia } from "../server/atlas-media.js";
import { estimateAtlasImageCost } from "../src/atlasPricing.js";

const prompt = "Keep the subject and change the lighting.";
const key = "mock-only-not-a-credential";
const remote = { requestId: "mock-job", url: "https://example.com/result", status: "completed" };
const asset = (fileName) => ({ fileName, buffer: Buffer.from(`native:${fileName}`), mimeType: "application/octet-stream" });
const url = (fileName) => `https://example.com/uploaded/${fileName}`;
const refs = (count) => Array.from({ length: count }, (_, index) => asset(`ref-${index}.png`));
const localRefs = (count, extension = "png") => Array.from({ length: count }, (_, index) => `/uploads/ref-${index}.${extension}`);

test.beforeEach((t) => {
  const network = t.mock.method(globalThis, "fetch", () => { throw new Error("Network forbidden in Atlas media tests"); });
  t.after(() => assert.equal(network.mock.callCount(), 0));
});

function setup(t) {
  const events = [];
  const client = {
    upload: t.mock.fn(async (input, credential) => {
      events.push(["upload", input.fileName]);
      assert.equal(credential, key);
      return url(input.fileName);
    }),
    generate: t.mock.fn(async (request) => {
      events.push(["generate", request.mediaType]);
      assert.equal(request.key, key);
      return remote;
    })
  };
  const readLocalAsset = t.mock.fn(async (source) => {
    events.push(["read", source]);
    return asset(source.split("/").at(-1));
  });
  const imageSize = t.mock.fn(({ resolution }) => resolution === "4K" ? "3840x2160" : "2048x1152");
  const labelPrompt = t.mock.fn((text, images) => images.length ? `${text}\nReferences: ${images.map((image) => image.fileName).join(", ")}` : text);
  const validateVideoAssets = t.mock.fn(async () => { events.push(["validate", "video"]); });
  const media = createAtlasMedia({ client, readLocalAsset, imageSize, labelPrompt, validateVideoAssets });
  return { media, client, readLocalAsset, imageSize, labelPrompt, validateVideoAssets, events };
}

function submitted(harness) {
  assert.equal(harness.client.generate.mock.callCount(), 1);
  return harness.client.generate.mock.calls[0].arguments[0].input;
}

function noTransfers(harness) {
  assert.equal(harness.readLocalAsset.mock.callCount(), 0);
  assert.equal(harness.client.upload.mock.callCount(), 0);
  assert.equal(harness.client.generate.mock.callCount(), 0);
}

async function raster(fileName, width = 64, height = 32, format = "png") {
  const buffer = await sharp({ create: { width, height, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } })
    .toFormat(format).toBuffer();
  return { fileName, buffer, mimeType: `image/${format}` };
}

test("all supported image models preserve exact routes, ordered native references and result metadata", async (t) => {
  const contracts = [
    ["OpenAI Image 2", "openai/gpt-image-2"],
    ["OpenAI Image 2.5 Sunburst", "openai/gpt-image-2.5-sunburst"],
    ["OpenAI Image 2.5 Flare", "openai/gpt-image-2.5-flare"],
    ["Nano Banana 2", "google/nano-banana-2"],
    ["Nano Banana Pro", "google/nano-banana-pro"],
    ["REVE 2.1", "reve-ai/reve-2.1"]
  ];
  for (const [model, id] of contracts) for (const count of [0, 1, 2]) {
    const h = setup(t);
    const images = Object.freeze(refs(count));
    const input = Object.freeze({ model, prompt, imageInputs: images, aspectRatio: "16:9", resolution: "4K", quality: "high" });
    const result = await h.media.image(input, key);
    const body = submitted(h);
    const mode = count > 1 && model === "REVE 2.1" ? "remix" : count ? "edit" : "text-to-image";
    assert.equal(body.model, `${id}/${mode}`);
    assert.equal(body.prompt, result.submittedPrompt);
    assert.equal(body.output_format, "png");
    assert.equal(body.enable_sync_mode, false);
    assert.deepEqual(body.images ?? (body.image ? [body.image] : []), images.map((image) => url(image.fileName)));
    for (const [index, call] of h.client.upload.mock.calls.entries()) assert.equal(call.arguments[0], images[index]);
    assert.equal(h.readLocalAsset.mock.callCount(), 0);
    assert.equal(h.labelPrompt.mock.calls[0].arguments[1], images);
    assert.deepEqual(h.events, [...images.map((image) => ["upload", image.fileName]), ["generate", "image"]]);
    assert.equal(result.endpoint, body.model);
    assert.equal(result.provider, "Atlas Cloud");
    assert.equal(result.requestId, remote.requestId);
    assert.equal(result.status, remote.status);
    assert.equal(result.resolution, "4K");
    assert.equal(result.resultText, "");
    assert.deepEqual(result.remoteImage, { url: remote.url, content_type: "image/png" });
    assert.equal(result.cost.provider, "atlas");
  }
});

test("Sunburst/Flare preserve 4K, quality, alpha settings and base/wardrobe/mask upload order", async (t) => {
  const base = await raster("cu-base.png");
  const wardrobe = await raster("wardrobe.png", 32, 64);
  const mask = await raster("mask.png");
  for (const model of ["OpenAI Image 2.5 Sunburst", "OpenAI Image 2.5 Flare"]) {
    for (const quality of ["high", "xhigh", "max"]) {
      const h = setup(t);
      const result = await h.media.image({ model, prompt, imageInputs: [base, wardrobe], editMaskInput: mask,
        resolution: "4K", aspectRatio: "16:9", quality, background: "transparent" }, key);
      const body = submitted(h);
      assert.equal(body.size, "3840x2160");
      assert.equal(body.quality, quality);
      assert.equal(body.background, "transparent");
      assert.equal(body.mask, url("mask.png"));
      assert.deepEqual(body.images, [url("cu-base.png"), url("wardrobe.png")]);
      assert.equal(body.n, 1);
      assert.equal(result.size, "3840x2160");
      assert.equal(result.quality, quality);
      assert.deepEqual(h.events, [["upload", "cu-base.png"], ["upload", "wardrobe.png"], ["upload", "mask.png"], ["generate", "image"]]);
      for (const [index, original] of [base, wardrobe, mask].entries()) {
        assert.equal(h.client.upload.mock.calls[index].arguments[0].buffer, original.buffer);
      }
    }
  }
});

test("invalid mask geometry, non-PNG masks and corrupt bytes fail before any upload", async (t) => {
  const base = await raster("base.png");
  const invalidMasks = [
    await raster("wide.png", 65, 32), await raster("tall.png", 64, 33),
    await raster("wrong-format.png", 64, 32, "jpeg"), asset("corrupt.png")
  ];
  for (const editMaskInput of invalidMasks) {
    const h = setup(t);
    await assert.rejects(h.media.image({ model: "OpenAI Image 2.5 Sunburst", prompt, imageInputs: [base], editMaskInput }, key),
      /PNG mask.*same dimensions|unsupported image format/i);
    noTransfers(h);
  }
  const h = setup(t);
  await assert.rejects(h.media.image({ model: "OpenAI Image 2.5 Sunburst", prompt,
    imageInputs: [asset("corrupt-base.png")], editMaskInput: await raster("mask.png") }, key), /unsupported image format/i);
  noTransfers(h);
});

test("explicit OpenAI size is preserved and invalid explicit size is never defaulted", async (t) => {
  const h = setup(t);
  const result = await h.media.image({ model: "OpenAI Image 2.5 Sunburst", prompt, size: "1536x864" }, key);
  assert.equal(submitted(h).size, "1536x864");
  assert.equal(result.size, "1536x864");
  assert.equal(h.imageSize.mock.callCount(), 0);
  for (const size of ["", null, "4096x4096"]) {
    const bad = setup(t);
    await assert.rejects(bad.media.image({ model: "OpenAI Image 2.5 Sunburst", prompt, size }, key), /size/);
    noTransfers(bad);
  }
});

test("Nano/REVE remove shared OpenAI fields before requests and pricing", async (t) => {
  for (const model of ["Nano Banana 2", "Nano Banana Pro", "REVE 2.1"]) {
    const h = setup(t);
    const options = Object.freeze({ model, prompt, size: "2048x1152", resolution: "2K", quality: "max", background: "transparent", aspectRatio: "9:16" });
    const result = await h.media.image(options, key);
    const body = submitted(h);
    assert.equal(h.imageSize.mock.callCount(), 0);
    assert.equal("size" in body, false);
    assert.equal("quality" in body, false);
    assert.equal("background" in body, false);
    assert.equal(body.aspect_ratio, "9:16");
    assert.equal(body.resolution, model === "REVE 2.1" ? "4k" : "2k");
    assert.equal(result.resolution, model === "REVE 2.1" ? "4K" : "2K");
    assert.equal(result.size, undefined);
    if (model === "REVE 2.1") assert.equal(body.remove_background, false);
    else {
      assert.equal(body.media_resolution, "high");
      assert.equal(body.thinking_level, model === "Nano Banana 2" ? "high" : undefined);
      // Verify adapter settings reach pricing cleanly; an unverified price may correctly remain null.
      assert.deepEqual(result.cost, estimateAtlasImageCost({ model, resolution: "2K", aspectRatio: "9:16", referenceCount: 0 }));
    }
    assert.equal(options.resolution, "2K");
    assert.equal(options.quality, "max");
    assert.equal(options.background, "transparent");
  }
  for (const resolution of [undefined, "4K"]) {
    const h = setup(t);
    await h.media.image({ model: "REVE 2.1", prompt, resolution }, key);
    assert.equal(submitted(h).resolution, "4k");
  }
});

test("image reference caps and unsupported native settings reject before transfers", async (t) => {
  for (const [model, cap] of [["OpenAI Image 2", 10], ["OpenAI Image 2.5 Sunburst", 16],
    ["OpenAI Image 2.5 Flare", 16], ["Nano Banana 2", 14], ["Nano Banana Pro", 10], ["REVE 2.1", 6]]) {
    const h = setup(t);
    await assert.rejects(h.media.image({ model, prompt, imageInputs: refs(cap + 1) }, key), new RegExp(`${cap} reference images`));
    noTransfers(h);
  }
  for (const options of [
    { model: "REVE 2.1", resolution: "8K" }, { model: "REVE 2.1", resolution: "1K" },
    { model: "Nano Banana 2", resolution: "0.5K" }, { model: "OpenAI Image 2", quality: "max" },
    { model: "Nano Banana Pro", editMaskInput: asset("mask.png") },
    { model: "OpenAI Image 2.5 Sunburst", editMaskInput: asset("mask.png") }, { model: "Krea 2 Large" }
  ]) {
    const h = setup(t);
    await assert.rejects(h.media.image({ prompt, ...options }, key), { status: 400 });
    noTransfers(h);
  }
});

test("image maximum references are retained, including duplicates", async (t) => {
  const h = setup(t);
  const original = asset("repeat.png");
  const imageInputs = Object.freeze(Array(16).fill(original));
  await h.media.image({ model: "OpenAI Image 2.5 Sunburst", prompt, imageInputs }, key);
  assert.deepEqual(submitted(h).images, Array(16).fill(url("repeat.png")));
  assert.equal(h.client.upload.mock.callCount(), 16);
});

test("video frame preprocessing preserves source aspect for 2.5/H3 and requested aspect for 2.0", async (t) => {
  for (const [model, id, sourceAspect] of [["Seedance 2.0", "bytedance/seedance-2.0", false],
    ["Seedance 2.5", "bytedance/seedance-2.5", true], ["MiniMax H3", "minimax/h3", true]]) {
    const h = setup(t);
    const start = asset("start.png");
    const options = Object.freeze({ model, prompt, startImage: start, endImage: "/uploads/end.png", aspectRatio: "9:16", generateAudio: false });
    const result = await h.media.video(options, key);
    const body = submitted(h);
    assert.equal(body.model, `${id}/image-to-video`);
    assert.equal(body.ratio, sourceAspect ? "adaptive" : "9:16");
    assert.equal(result.sourceAspect, sourceAspect);
    assert.equal(body.image, url("start.png"));
    assert.equal(body[model === "MiniMax H3" ? "end_image" : "last_image"], url("end.png"));
    assert.equal(body.generate_audio, model === "MiniMax H3" ? undefined : false);
    assert.equal(h.client.upload.mock.calls[0].arguments[0], start);
    assert.deepEqual(h.events, [["validate", "video"], ["upload", "start.png"], ["read", "/uploads/end.png"], ["upload", "end.png"], ["generate", "video"]]);
    assert.equal(options.aspectRatio, "9:16");
    assert.equal(options.generateAudio, false);
    assert.equal(result.input, body);
    assert.equal(result.endpoint, body.model);
    assert.deepEqual(result.remoteVideo, { url: remote.url, content_type: "video/mp4" });
  }
});

test("text video requests preserve aspect and Seedance audio toggles without source-aspect mode", async (t) => {
  for (const model of ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"]) for (const generateAudio of [false, true]) {
    const h = setup(t);
    const result = await h.media.video({ model, prompt, aspectRatio: "1:1", generateAudio }, key);
    const body = submitted(h);
    assert.ok(body.model.endsWith("/text-to-video"));
    assert.equal(body.ratio, "1:1");
    assert.equal(result.sourceAspect, false);
    // H3 has native audio and no disable field; local silencing remains the caller's responsibility.
    assert.equal(body.generate_audio, model === "MiniMax H3" ? undefined : generateAudio);
    assert.equal(h.client.upload.mock.callCount(), 0);
    assert.equal(h.readLocalAsset.mock.callCount(), 0);
  }
});

test("video references retain native bytes, per-type order, audio and mention bindings", async (t) => {
  for (const model of ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"]) {
    const h = setup(t);
    const native = asset("native.png");
    const options = Object.freeze({ model, prompt: "[Image1] beside Image2 with [Video1] and Audio1.",
      images: Object.freeze(["/uploads/first.png", native]), videos: Object.freeze(["/uploads/clip.mp4"]),
      audios: Object.freeze(["/uploads/track.wav"]), aspectRatio: "16:9", generateAudio: false });
    const result = await h.media.video(options, key);
    const body = submitted(h);
    assert.ok(body.model.endsWith("/reference-to-video"));
    assert.equal(result.sourceAspect, false);
    assert.equal(h.client.upload.mock.calls[1].arguments[0], native);
    assert.deepEqual(h.client.upload.mock.calls.map((call) => call.arguments[0].fileName), ["first.png", "native.png", "clip.mp4", "track.wav"]);
    assert.deepEqual(h.readLocalAsset.mock.calls.map((call) => call.arguments[0]), ["/uploads/first.png", "/uploads/clip.mp4", "/uploads/track.wav"]);
    if (model === "MiniMax H3") {
      assert.deepEqual(body.refers, [{ url: url("first.png"), type: "image" }, { url: url("native.png"), type: "image" },
        { url: url("clip.mp4"), type: "video" }, { url: url("track.wav"), type: "audio" }]);
      assert.equal(body.prompt, options.prompt);
    } else {
      assert.deepEqual(body.reference_images, [url("first.png"), url("native.png")]);
      assert.deepEqual(body.reference_videos, [url("clip.mp4")]);
      assert.deepEqual(body.reference_audios, [url("track.wav")]);
      assert.equal(body.prompt, model === "Seedance 2.5" ? "@Image1 beside @Image2 with @Video1 and @Audio1."
        : "image 1 beside image 2 with video 1 and audio 1.");
      assert.equal(body.generate_audio, false);
      assert.equal(body.omni_reference_task_type, model === "Seedance 2.5" ? "reference" : undefined);
    }
  }
});

test("video preflight rejects every per-type cap, H3 total cap and invalid routes before reads/uploads", async (t) => {
  const invalid = [];
  for (const [model, caps] of [["Seedance 2.0", [9, 3, 3]], ["Seedance 2.5", [30, 10, 10]], ["MiniMax H3", [9, 3, 3]]]) {
    for (const [index, field] of ["images", "videos", "audios"].entries()) {
      invalid.push({ model, images: localRefs(1), [field]: localRefs(caps[index] + 1, field === "audios" ? "wav" : field === "videos" ? "mp4" : "png") });
    }
    invalid.push({ model, startImage: "/uploads/start.png", images: localRefs(1) }, { model, endImage: "/uploads/end.png" });
  }
  invalid.push(
    { model: "MiniMax H3", images: localRefs(9), videos: localRefs(3, "mp4"), audios: localRefs(1, "wav") },
    { model: "MiniMax H3", resolution: "480P" }, { model: "Seedance 2.5", duration: 31 },
    { model: "Seedance 2.0", duration: 16 }, { model: "Seedance 2.5", resolution: "4K" },
    { model: "Seedance 2.0", audios: localRefs(1, "wav") }, { model: "MiniMax H3", audios: localRefs(1, "wav") },
    { model: "Seedance 2.5", prompt: "[Image2] moves", images: localRefs(1) },
    { model: "Kling O3 Pro", startImage: "/uploads/start.png" }, { model: "Kling O3 4K" }
  );
  for (const options of invalid) {
    const h = setup(t);
    await assert.rejects(h.media.video({ prompt, ...options }, key), { status: 400 });
    assert.equal(h.validateVideoAssets.mock.callCount(), 0);
    noTransfers(h);
  }
});

test("video asset validation receives native sources and preprocessed ratio/audio before transfers", async (t) => {
  const h = setup(t);
  const start = asset("start.png");
  h.validateVideoAssets.mock.mockImplementation(async (options) => {
    noTransfers(h);
    assert.equal(options.model, "MiniMax H3");
    assert.equal(options.aspectRatio, "auto");
    assert.equal(options.generateAudio, true);
    assert.equal(options.startImage, start);
    assert.equal(options.endImage, "/uploads/end.png");
    assert.deepEqual(options.images, []);
  });
  await h.media.video({ model: "MiniMax H3", prompt, startImage: start, endImage: "/uploads/end.png",
    aspectRatio: "16:9", generateAudio: false }, key);
  assert.equal(h.validateVideoAssets.mock.callCount(), 1);
  assert.equal(h.client.generate.mock.callCount(), 1);

  const references = setup(t);
  const images = Object.freeze([asset("native.png")]);
  const audios = Object.freeze(["/uploads/native.wav"]);
  references.validateVideoAssets.mock.mockImplementation(async (options) => {
    noTransfers(references);
    assert.equal(options.images, images);
    assert.equal(options.audios, audios);
  });
  await references.media.video({ model: "Seedance 2.5", prompt, images, audios }, key);
  assert.equal(references.validateVideoAssets.mock.callCount(), 1);
});

test("native video/audio validation failures stop uploads and generation without retry", async (t) => {
  for (const message of ["Video dimensions exceed the limit", "Audio duration exceeds the limit"]) {
    const h = setup(t);
    const error = Object.assign(new Error(message), { status: 400 });
    h.validateVideoAssets.mock.mockImplementation(async () => { throw error; });
    await assert.rejects(h.media.video({ model: "Seedance 2.5", prompt, images: localRefs(1),
      videos: localRefs(1, "mp4"), audios: localRefs(1, "wav") }, key), (actual) => actual === error);
    assert.equal(h.validateVideoAssets.mock.callCount(), 1);
    noTransfers(h);
  }
});

test("video references at their limits are uploaded without truncation", async (t) => {
  for (const [model, counts] of [["Seedance 2.0", [9, 3, 3]], ["Seedance 2.5", [30, 10, 10]], ["MiniMax H3", [6, 3, 3]]]) {
    const h = setup(t);
    await h.media.video({ model, prompt, images: localRefs(counts[0]), videos: localRefs(counts[1], "mp4"), audios: localRefs(counts[2], "wav") }, key);
    const body = submitted(h);
    assert.equal(h.client.upload.mock.callCount(), counts.reduce((sum, count) => sum + count, 0));
    if (model === "MiniMax H3") assert.equal(body.refers.length, 12);
    else for (const [index, field] of ["images", "videos", "audios"].entries()) assert.equal(body[`reference_${field}`].length, counts[index]);
  }
});

test("upload and generation failures propagate without retrying or submitting partial references", async (t) => {
  for (const mode of ["image", "video"]) {
    const options = mode === "image" ? { model: "Nano Banana 2", prompt, imageInputs: refs(2) }
      : { model: "Seedance 2.5", prompt, images: refs(2) };
    const failedUpload = setup(t);
    const uploadError = new Error("Mock upload failure");
    failedUpload.client.upload.mock.mockImplementation(async () => { throw uploadError; });
    await assert.rejects(failedUpload.media[mode](options, key), (error) => error === uploadError);
    assert.equal(failedUpload.client.upload.mock.callCount(), 1);
    assert.equal(failedUpload.client.generate.mock.callCount(), 0);

    const failedGeneration = setup(t);
    const generationError = new Error("Mock uncertain submission");
    failedGeneration.client.generate.mock.mockImplementation(async () => { throw generationError; });
    await assert.rejects(failedGeneration.media[mode](options, key), (error) => error === generationError);
    assert.equal(failedGeneration.client.upload.mock.callCount(), 2);
    assert.equal(failedGeneration.client.generate.mock.callCount(), 1);
  }
});
