import assert from "node:assert/strict";
import test from "node:test";
import { buildKling4Input, validateKling4Request, rewriteKling4ReferenceMentions, estimateKling4Cost, kling4KreaEndpoint } from "../src/kling4.js";
import { estimateVideoRunCost, generationEstimate } from "../src/generationPricing.js";
import { setPricingCatalog } from "../src/pricingCatalog.js";
import { parseKreaPricing } from "../server/pricing-sources.js";

const image = "https://assets.example/frame.png";
const video = "https://assets.example/action.mp4";
const base = { prompt: "A detective crosses a rainy street.", duration: "30 seconds", resolution: "1080p", aspectRatio: "21:9" };

test("Fal Kling 4 selects distinct text, image and reference contracts without O3 fields", () => {
  assert.deepEqual(buildKling4Input(base), { endpoint: "kling/v4/text-to-video", input: {
    prompt: base.prompt, duration: 30, resolution: "1080p", aspect_ratio: "21:9"
  } });
  const framed = buildKling4Input({ ...base, startFrames: [image], endFrames: [image] });
  assert.equal(framed.endpoint, "kling/v4/image-to-video");
  assert.deepEqual(framed.input, { prompt: base.prompt, duration: 30, resolution: "1080p", start_image_url: image, end_image_url: image });
  const refs = buildKling4Input({ ...base, startFrames: [image], images: [image], videos: [video] });
  assert.equal(refs.endpoint, "kling/v4/reference-to-video");
  assert.deepEqual(refs.input.image_urls, [image]);
  assert.deepEqual(refs.input.video_urls, [video]);
  assert.equal(refs.input.start_image_url, image);
  assert.equal(refs.input.aspect_ratio, "21:9");
  for (const field of ["generate_audio", "negative_prompt", "cfg_scale", "seed", "shot_type", "image_url"]) assert.equal(field in refs.input, false);
  assert.equal(buildKling4Input({ ...base, endFrames: [image] }).endpoint, "kling/v4/reference-to-video");
});

test("Krea maps reference arrays and frames exactly, respecting documented end-frame restrictions", () => {
  const result = buildKling4Input({ ...base, provider: "krea", images: [image], videos: [video] });
  assert.deepEqual(result, { endpoint: "/generate/video/kling/kling-4", input: { prompt: base.prompt,
    duration: 30, resolution: "1080p", aspect_ratio: "21:9", reference_images: [image], reference_videos: [video] } });
  assert.deepEqual(buildKling4Input({ ...base, provider: "krea", startFrames: [image], endFrames: [image] }).input,
    { prompt: base.prompt, duration: 30, resolution: "1080p", aspect_ratio: "21:9", start_image: image, end_image: image });
  assert.throws(() => buildKling4Input({ ...base, provider: "krea", endFrames: [image] }), /requires Start Frame/);
  assert.throws(() => buildKling4Input({ ...base, provider: "krea", startFrames: [image], endFrames: [image], images: [image] }), /cannot be combined/);
  assert.throws(() => buildKling4Input({ ...base, provider: "krea", images: [image + "a".repeat(1024)] }), /1,024/);
});

test("Atlas Cloud uses its actual Kling 4 model IDs and native fields", () => {
  assert.deepEqual(buildKling4Input({ ...base, provider: "atlas" }), {
    endpoint: "kwaivgi/kling-v4.0/text-to-video", input: { model: "kwaivgi/kling-v4.0/text-to-video", prompt: base.prompt,
      duration: 30, resolution: "1080p", aspect_ratio: "21:9" }
  });
  const framed = buildKling4Input({ ...base, provider: "atlas", startFrames: [image], endFrames: [image] });
  assert.equal(framed.input.model, "kwaivgi/kling-v4.0/image-to-video");
  assert.equal(framed.input.image, image);
  assert.equal(framed.input.last_image, image);
  assert.equal("aspect_ratio" in framed.input, false);
  const refs = buildKling4Input({ ...base, provider: "atlas", startFrames: [image], images: [image], videos: [video] });
  assert.equal(refs.input.model, "kwaivgi/kling-v4.0/reference-to-video");
  assert.deepEqual(refs.input.reference_images, [image]);
  assert.deepEqual(refs.input.reference_videos, [video]);
});

test("Kling 4 rejects unsupported settings and overflow rather than truncating", () => {
  for (const duration of [2, 31, 5.5, "-5", "5.5 seconds", "Auto", NaN]) assert.throws(() => validateKling4Request({ ...base, duration }), /3 to 30/);
  for (const resolution of ["4K", "1080p-esr", "480p"]) assert.throws(() => validateKling4Request({ ...base, resolution }), /720p or 1080p/);
  for (const patch of [{ startFrames: [image, image] }, { images: Array(11).fill(image) }, { startFrames: [image], images: Array(10).fill(image) }, { videos: Array(6).fill(video) }, { audio: [video] }]) {
    assert.throws(() => validateKling4Request({ ...base, ...patch }), error => error.status === 400);
  }
  assert.throws(() => validateKling4Request({ ...base, generateAudio: false }), /silent-output toggle/);
  assert.throws(() => validateKling4Request({ ...base, prompt: "x".repeat(26001) }), /26,000/);
  assert.throws(() => validateKling4Request({ ...base, provider: "atlas", prompt: "あ".repeat(11001) }), /11,000/);
  assert.equal(validateKling4Request({ ...base, duration: 3 }).durationSeconds, 3);
});

test("reference mentions use provider syntax and Atlas keyframe ordering without cascading", () => {
  const refs = { images: [{ label: "Hero" }, { label: "Image1" }], videos: [{ label: "Motion" }] };
  assert.equal(rewriteKling4ReferenceMentions("@Hero follows @Image1 and @Motion.", refs), "@Image1 follows @Image2 and @Video1.");
  assert.throws(() => rewriteKling4ReferenceMentions("@Heroine", refs), /no matching supplied/);
  assert.equal(rewriteKling4ReferenceMentions("@Hero and @Motion", { ...refs, provider: "krea" }), "@Image1 and @Video1");
  assert.equal(rewriteKling4ReferenceMentions("@Hero and @Motion", { ...refs, provider: "atlas", startFrames: [image], endFrames: [image] }), "@image_3 and @video_1");
  assert.throws(() => rewriteKling4ReferenceMentions("@Hero", { images: [{ label: "Hero" }, { label: "hero" }] }), /ambiguous/);
  assert.equal(rewriteKling4ReferenceMentions("@Hero is @Double", { images: [{ label: "Hero", aliases: ["Double"] }] }), "@Image1 is @Image1");
  assert.throws(() => rewriteKling4ReferenceMentions("@Image2", { images: [{ label: "Hero" }] }), /no matching supplied/);
  assert.equal(rewriteKling4ReferenceMentions("An envelope addressed to crew@example.com", {}), "An envelope addressed to crew@example.com");
});

test("Kling 4 pricing distinguishes Fal reference-video billing from Krea and unknown Atlas rates", () => {
  assert.equal(estimateKling4Cost({ provider: "fal", duration: 10, resolution: "1080p" }).amountUsd, 2.35);
  assert.equal(estimateKling4Cost({ provider: "fal", duration: 10, resolution: "720p", hasVideoReference: true }).amountUsd, null);
  assert.equal(estimateKling4Cost({ provider: "fal", duration: 10, resolution: "720p", hasVideoReference: true, referenceVideoDurationSeconds: 5 }).amountUsd, 1.88);
  assert.equal(estimateKling4Cost({ provider: "fal", duration: 10, resolution: "1080p", hasVideoReference: true, referenceVideoDurationSeconds: 25 }).amountUsd, 4.935);
  assert.equal(estimateKling4Cost({ provider: "krea", duration: 10, resolution: "720p", hasVideoReference: true, referenceVideoDurationSeconds: 25 }).amountUsd, 1.57);
  assert.equal(estimateKling4Cost({ provider: "atlas", duration: 10 }).amountUsd, null);
  assert.equal(estimateVideoRunCost({ model: "Kling 4", provider: "krea", duration: "30 seconds", resolution: "1080p", batchCount: 2 }), 14.1);
  assert.equal(estimateVideoRunCost({ model: "Kling 4", provider: "fal", hasVideoReference: true }), null);
  assert.match(generationEstimate({ kind: "video", model: "Kling 4", provider: "atlas" }).pricingBasis, /unverified/);
});

test("Krea Kling 4 uses published duration/resolution price tables and never revives invalidated prices", () => {
  const parsed = parseKreaPricing({ openapi: "3.1.0", paths: { [kling4KreaEndpoint]: { post: {
    "x-krea-pricing": { type: "fixed", currency: "USD", unit: "request", price_points: [{ amount: 1.175, dimensions: { duration: 5, resolution: "1080p" } }] }
  } } } }).find(item => item.id === `krea:${kling4KreaEndpoint}`);
  assert.equal(parsed.entry.points[0].amount, 1.175);
  try {
    setPricingCatalog({ version: 1, revision: "kling4-invalid", entries: { [`krea:${kling4KreaEndpoint}`]: { ...parsed.entry, invalidatedAt: new Date().toISOString() } } });
    assert.equal(estimateKling4Cost({ provider: "krea" }).amountUsd, null);
  } finally { setPricingCatalog({ version: 1, revision: "kling4-reset", entries: {} }); }
});
