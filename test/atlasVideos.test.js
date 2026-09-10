import assert from "node:assert/strict";
import test from "node:test";
import { buildAtlasVideoRequest, supportsAtlasVideoModel } from "../src/atlasVideos.js";

const image = "https://example.com/image.png";
const end = "https://example.com/end.png";
const video = "https://example.com/video.mp4";
const audio = "https://example.com/audio.mp3";
const names = ["Seedance 2.0", "Seedance 2.5", "MiniMax H3"];
const request = (overrides = {}) => buildAtlasVideoRequest({ model: "Seedance 2.0", prompt: "A camera moves through a room.", ...overrides });
const copies = (url, count) => Array(count).fill(url);
const rejects = (overrides, message) => assert.throws(() => request(overrides), (error) => error.status === 400 && message.test(error.message));

test("Atlas recognizes only verified integration models, never substitutes v3 or other variants", () => {
  for (const name of names) assert.equal(supportsAtlasVideoModel(name), true);
  assert.equal(supportsAtlasVideoModel(" seedance 2.5 "), true);
  for (const name of [undefined, null, 3, {}, "", "Kling v3.0 Pro", "Kling 3.0", "Kling O3", "Seedance 2.0 Fast", "Seedance 2.5 Pro", "MiniMax Hailuo H3", "toString"]) {
    assert.equal(supportsAtlasVideoModel(name), false);
    rejects({ model: name }, /Unsupported Atlas video model/);
  }
});

test("Seedance text requests return a flat Atlas JSON body with numeric durations and canonical casing", () => {
  assert.deepEqual(request({ duration: "8 seconds", resolution: "1080P", aspectRatio: "9:16 (Portrait)", generateAudio: false, seed: "42" }), {
    model: "bytedance/seedance-2.0/text-to-video", prompt: "A camera moves through a room.", duration: 8,
    resolution: "1080p", ratio: "9:16", generate_audio: false, seed: 42
  });
  assert.equal(request({ duration: "Auto" }).duration, -1);
  assert.equal(request({ duration: -1 }).duration, -1);
  assert.equal(request({ resolution: "720p-sr" }).resolution, "720p-SR");
  assert.equal(request({ resolution: "4K" }).resolution, "4k");
});

test("Seedance frame routes use image/last_image, with adaptive-only 2.5 framing", () => {
  for (const model of ["Seedance 2.0", "Seedance 2.5"]) {
    const result = request({ model, startImage: image, endImage: end, prompt: undefined });
    assert.equal(result.model, `bytedance/seedance-${model.slice(-3)}/image-to-video`);
    assert.equal(result.image, image);
    assert.equal(result.last_image, end);
    assert.equal(result.ratio, "adaptive");
    assert.equal("prompt" in result, false);
    assert.equal("image_url" in result, false);
  }
  assert.equal(request({ startImage: image, aspectRatio: "16:9" }).ratio, "16:9");
  rejects({ model: "Seedance 2.5", startImage: image, aspectRatio: "16:9" }, /aspectRatio/);
});

test("Seedance reference mentions convert caller syntax and preserve per-type ordering", () => {
  const prompt = "[Image1] follows @Video1; Image2 listens to Audio 1 beside Image 1.";
  const refs = { images: [image, end], videos: [video], audios: [audio] };
  const old = request({ prompt, ...refs });
  assert.equal(old.prompt, "image 1 follows video 1; image 2 listens to audio 1 beside image 1.");
  assert.deepEqual(old.reference_images, [image, end]);
  assert.deepEqual(old.reference_videos, [video]);
  assert.deepEqual(old.reference_audios, [audio]);
  const newer = request({ model: "Seedance 2.5", prompt, ...refs, duration: "Auto", aspectRatio: "Auto" });
  assert.equal(newer.prompt, "@Image1 follows @Video1; @Image2 listens to @Audio1 beside @Image1.");
  assert.equal(newer.omni_reference_task_type, "reference");
  assert.equal(newer.duration, -1);
  assert.equal(newer.ratio, "adaptive");
  assert.equal(newer.model, "bytedance/seedance-2.5/reference-to-video");
  assert.equal(request({ model: "Seedance 2.5", prompt: newer.prompt, ...refs }).prompt, newer.prompt);
  assert.equal("omni_reference_task_type" in request({ model: "Seedance 2.5" }), false);
});

test("Seedance catches dangling references without rewriting words, file names, or unrelated tags", () => {
  for (const prompt of ["[Image0]", "@Image2", "Image2.", "Video1", "[Audio1]"]) rejects({ prompt, images: [image] }, /no matching/);
  const prompt = "Keep @Emma and Image1Style in myImage1.png, Image1.png and https://example.com/Image1.png.";
  assert.equal(request({ prompt }).prompt, prompt);
});

test("Seedance enforces every output duration boundary and resolution enum without clamping", () => {
  for (const model of ["Seedance 2.0", "Seedance 2.5"]) {
    const max = model.endsWith("2.5") ? 30 : 15;
    for (let duration = 4; duration <= max; duration++) assert.equal(request({ model, duration }).duration, duration);
    rejects({ model, duration: 3 }, /duration/);
    rejects({ model, duration: max + 1 }, /duration/);
  }
  for (const resolution of ["480p", "720p", "720p-sr", "720p-esr", "1080p", "1080p-sr", "1080p-esr", "1080p-esr & 60fps", "1440p-sr", "1440p-esr", "4k-esr"]) {
    assert.equal(request({ model: "Seedance 2.5", resolution }).resolution, resolution);
  }
  rejects({ model: "Seedance 2.5", resolution: "4k" }, /resolution/);
  rejects({ resolution: "720p-esr" }, /resolution/);
});

test("Seedance caps references without truncating and permits audio-only only on 2.5", () => {
  for (const [model, caps] of [["Seedance 2.0", [9, 3, 3]], ["Seedance 2.5", [30, 10, 10]]]) {
    const refs = { images: copies(image, caps[0]), videos: copies(video, caps[1]), audios: copies(audio, caps[2]) };
    const result = request({ model, ...refs });
    for (const [index, key] of ["images", "videos", "audios"].entries()) {
      assert.equal(result[`reference_${key}`].length, caps[index]);
      rejects({ model, ...refs, [key]: [...refs[key], refs[key][0]] }, /at most/);
    }
  }
  rejects({ audios: [audio] }, /require an image or video/);
  assert.deepEqual(request({ model: "Seedance 2.5", audios: [audio], prompt: "[Audio1] drives the scene." }).reference_audios, [audio]);
});

test("MiniMax maps all route-specific fields and case-sensitive values", () => {
  const text = request({ model: "MiniMax H3", duration: "4 seconds", resolution: "768p", aspectRatio: "21:9" });
  assert.deepEqual(text, { model: "minimax/h3/text-to-video", prompt: "A camera moves through a room.", resolution: "768P", duration: 4, ratio: "21:9", prompt_expansion: false });
  const frame = request({ model: "MiniMax H3", startImage: image, endImage: end });
  assert.equal(frame.model, "minimax/h3/image-to-video");
  assert.equal(frame.image, image);
  assert.equal(frame.end_image, end);
  assert.equal(frame.ratio, "adaptive");
  assert.equal(frame.duration, 8);
  const ref = request({ model: "MiniMax H3", images: [image, end], videos: [video], audios: [audio], aspectRatio: "16:9" });
  assert.equal(ref.model, "minimax/h3/reference-to-video");
  assert.deepEqual(ref.refers, [{ url: image, type: "image" }, { url: end, type: "image" }, { url: video, type: "video" }, { url: audio, type: "audio" }]);
  assert.equal("generate_audio" in ref, false);
  assert.equal("aspect_ratio" in ref, false);
});

test("MiniMax rejects disputed/unsupported settings and enforces per-kind plus combined counts", () => {
  const model = "MiniMax H3";
  for (const resolution of ["480P", "4K", "1080p"]) rejects({ model, resolution }, /480P|resolution/);
  for (const duration of [3, 16, "Auto", -1]) rejects({ model, duration }, /duration/);
  rejects({ model, aspectRatio: "Auto" }, /aspectRatio/);
  rejects({ model, startImage: image, aspectRatio: "16:9" }, /aspectRatio/);
  rejects({ model, audios: [audio] }, /require an image or video/);
  rejects({ model, generateAudio: false }, /disable-audio/);
  rejects({ model, images: copies(image, 10) }, /at most 9/);
  rejects({ model, videos: copies(video, 4) }, /at most 3/);
  rejects({ model, images: [image], audios: copies(audio, 4) }, /at most 3/);
  rejects({ model, images: copies(image, 9), videos: copies(video, 3), audios: [audio] }, /12 reference/);
  assert.equal(request({ model, images: copies(image, 9), videos: copies(video, 3) }).refers.length, 12);
});

test("Kling O3 is explicitly excluded until Director reference bindings can be verified", () => {
  for (const model of ["Kling O3 Pro", "Kling O3 4K", " kling o3 pro "]) {
    assert.equal(supportsAtlasVideoModel(model), false);
    for (const refs of [{}, { startImage: image }, { startImage: image, endImage: end }, { images: [image] }, { videos: [video] }, { audios: [audio] }]) {
      rejects({ model, ...refs }, /Kling O3 is excluded.*mention syntax.*elements\[\].*Kling v3 will not be substituted/);
    }
  }
});

test("all models reject conflicting frames/references and missing required prompts", () => {
  for (const model of names) {
    rejects({ model, endImage: end }, /requires startImage/);
    for (const refs of [{ images: [image] }, { videos: [video] }, { audios: [audio] }]) rejects({ model, startImage: image, ...refs }, /cannot be combined/);
    rejects({ model, prompt: " " }, /nonempty prompt/);
    rejects({ model, prompt: {} }, /prompt must be a string/);
  }
});

test("strict validation rejects invalid explicit types, unknown fields, and malformed URLs", () => {
  for (const duration of [null, "", " ", false, [], {}, NaN, Infinity, 5.5, "5.5", "5 seconds garbage", "5-15", "5s", "0x5"]) rejects({ duration }, /duration/);
  for (const aspectRatio of [null, "", 169, "2:1", "16:9 garbage"]) rejects({ aspectRatio }, /aspectRatio/);
  for (const resolution of [null, "", 720, "unknown"]) rejects({ resolution }, /resolution/);
  for (const generateAudio of [null, "false", 0]) rejects({ generateAudio }, /boolean/);
  rejects({ negative_prompt: "blur" }, /Unsupported Atlas video settings/);
  rejects({ multi_prompt: [] }, /Unsupported Atlas video settings/);
  for (const images of [null, "https://example.com/image.png", {}, [null], new Array(1), [""], ["/unmanaged/image.png"], ["file:///tmp/image.png"], ["https://"], ["https://user:secret@example.com/image.png"], ["http://localhost/image.png"], [" https://example.com/image.png"], ["https://example.com/a\nb.png"]]) rejects({ images }, /URL/);
  rejects({ startImage: null }, /URL/);
});

test("preflight accepts NewtNode local URLs and produces the same contract after upload", () => {
  const localImages = ["/uploads/source image.png", "/outputs/scene/image.png", "/storyboard/shot.png", "/workflow-assets/project/inputs/image.png"];
  const local = request({ model: "Seedance 2.5", images: localImages, videos: ["/outputs/clip.mp4"], audios: ["/uploads/voice.mp3"], prompt: "[Image4] follows [Video1] and [Audio1].", duration: "5 seconds" });
  const uploaded = request({ model: "Seedance 2.5", images: copies(image, 4), videos: [video], audios: [audio], prompt: local.prompt, duration: "5 seconds" });
  assert.deepEqual(local.reference_images, localImages);
  assert.equal(local.model, uploaded.model);
  assert.equal(local.prompt, uploaded.prompt);
  assert.equal(local.duration, 5);
  assert.equal(request({ startImage: localImages[0], endImage: localImages[1] }).last_image, localImages[1]);
  rejects({ images: copies(localImages[0], 10) }, /at most 9/);
});

test("Director final prompts pass through supported models while explicitly supplied unsupported controls fail preflight", () => {
  const model = "Seedance 2.5";
  const prompt = "Shot 1: wide establishing shot. Shot 2: close-up with dialogue.";
  const result = request({ model, prompt, negativePrompt: undefined, cfgScale: undefined, multi_prompt: undefined });
  assert.equal(result.prompt, prompt);
  assert.equal("multi_prompt" in result, false);
  for (const settings of [{ negativePrompt: "blur" }, { negative_prompt: "blur" }, { cfgScale: 0 }, { klingCfgScale: 0.5 }, { cfg_scale: 0.5 }, { multi_prompt: [] }, { multi_shot: true }, { elements: [] }]) {
    rejects({ model, ...settings }, new RegExp(`Unsupported Atlas video settings: ${Object.keys(settings)[0]}`));
  }
});

test("seed is accepted only by Seedance 2.0, with the exact documented integer range", () => {
  for (const seed of [-1, 0, 4294967295]) assert.equal(request({ seed }).seed, seed);
  for (const seed of [-2, 4294967296, null, "", 2.5, false, Infinity]) rejects({ seed }, /seed/);
  for (const model of names.slice(1)) rejects({ model, seed: 1 }, /does not document a seed/);
});

test("builder is synchronous, JSON-serializable, deterministic, and does not mutate caller media", () => {
  const images = Object.freeze([image, image]);
  const inputs = Object.freeze({ model: "Seedance 2.5", prompt: "[Image2] moves.", images, videos: Object.freeze([]), audios: Object.freeze([]) });
  const result = buildAtlasVideoRequest(inputs);
  assert.equal(result instanceof Promise, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(buildAtlasVideoRequest(inputs), result);
  result.reference_images.pop();
  assert.equal(images.length, 2);
  assert.equal(inputs.prompt, "[Image2] moves.");
});
