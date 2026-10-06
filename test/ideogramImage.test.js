import test from "node:test";
import assert from "node:assert/strict";
import { ideogramImageModelName, ideogramImageEndpoint, isIdeogramImageModel, ideogramImageQualityOptions,
  normalizeIdeogramImageQuality, ideogramImageResolutionOptions, ideogramImageAspectRatios, ideogramImageSize,
  validateIdeogramImageRequest, buildIdeogramImageFalInput, buildIdeogramImageFalRequest, ideogramImageReferenceOrder, ideogramImageCost } from "../src/ideogramImage.js";

const prompt = "A poster reading NewtNode in clear hand-drawn lettering.";

// Independent provider whitelist; generic multiples of 32 are insufficient for this endpoint.
const supportedNativeSizes = new Set(`1024x1024 1024x3072 1120x896 1152x2944 1152x864 1248x3328 1248x832
1280x3072 1280x720 1280x800 1296x3168 1440x2560 1440x2880 1440x720 1600x2560 1664x2496 1728x2304
1792x2240 2048x2048 2240x1792 2304x1728 2496x1664 2560x1440 2560x1600 2880x1440 2944x1152
3072x1024 3072x1280 3168x1296 3328x1248 720x1280 720x1440 800x1280 832x1248 864x1152 896x1120`.split(/\s+/));

test("Ideogram generation names and UI quality migration stay distinct from editing", () => {
  assert.equal(ideogramImageModelName, "Ideogram 4.5");
  assert.equal(ideogramImageEndpoint, "ideogram/v4.5");
  assert.equal(isIdeogramImageModel("Ideogram 4.5"), true);
  for (const value of [undefined, "Ideogram 4.5 Edit", "OpenAI Image 2.5 Sunburst"]) assert.equal(isIdeogramImageModel(value), false);
  assert.deepEqual(ideogramImageQualityOptions, ["low", "medium", "high"]);
  for (const value of ideogramImageQualityOptions) assert.equal(normalizeIdeogramImageQuality(value), value);
  assert.equal(normalizeIdeogramImageQuality("very_low"), "low");
  for (const value of ["xhigh", "max", undefined, null, "unsupported"]) assert.equal(normalizeIdeogramImageQuality(value), "high");
  assert.equal(normalizeIdeogramImageQuality(" LOW "), "low");
});

test("every offered ratio maps to an exact native size in its chosen tier", () => {
  assert.deepEqual(ideogramImageResolutionOptions, ["2K", "1K"]);
  assert.deepEqual(ideogramImageAspectRatios, ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "2:1", "1:2"]);
  assert.deepEqual(ideogramImageSize(), { width: 2560, height: 1440 });
  assert.deepEqual(ideogramImageSize({ resolution: "1K", aspectRatio: "1:1" }), { width: 1024, height: 1024 });
  for (const resolution of ideogramImageResolutionOptions) for (const aspectRatio of ideogramImageAspectRatios) {
    const { width, height } = ideogramImageSize({ resolution, aspectRatio });
    assert.ok(supportedNativeSizes.has(`${width}x${height}`), `${resolution} ${aspectRatio} uses a native size`);
    const [w, h] = aspectRatio.split(":").map(Number);
    assert.equal(width * h, height * w, `${aspectRatio} retains exact geometry`);
    const area = width * height;
    assert.equal(area <= 1024 ** 2, resolution === "1K");
    assert.ok(area <= 2048 ** 2);
  }
  const size = ideogramImageSize();
  size.width = 1;
  assert.equal(ideogramImageSize().width, 2560);
});

test("raw requests reject unsupported generation settings instead of normalizing them", () => {
  const invalid = [
    { resolution: "4K" }, { resolution: "2k" }, { resolution: null }, { aspectRatio: "21:9" }, { aspectRatio: "Auto" },
    { quality: "very_low" }, { quality: "xhigh" }, { quality: "max" }, { quality: "HIGH" }, { quality: null },
    { imagePromptUrls: [""] }, { imagePromptUrls: "image.png" }, { imagePromptUrls: null },
    { editMaskDataUrl: "data:image/png;base64,fixture" }, { editMaskDataUrl: null },
    { background: "transparent" }, { background: "unknown" }, { background: null },
    { enablePromptExpansion: "false" }, { enablePromptExpansion: null },
    { seed: -1 }, { seed: 2147483648 }, { seed: 1.5 }, { seed: "1" }, { seed: NaN }, { seed: Infinity }
  ];
  for (const patch of invalid) {
    assert.throws(() => validateIdeogramImageRequest({ prompt, ...patch }), { status: 400 }, JSON.stringify(patch));
    assert.throws(() => buildIdeogramImageFalInput({ prompt, ...patch }), { status: 400 }, JSON.stringify(patch));
  }
  for (const patch of [{ resolution: "4K" }, { aspectRatio: "21:9" }, { resolution: "" }, { aspectRatio: null }]) {
    assert.throws(() => ideogramImageSize(patch), { status: 400 });
  }
});

test("reference ordering selects one source, preserves guides and validates every raw reference", () => {
  const urls = ["/uploads/source.png", "/workflow-assets/project/guide.png", "/outputs/other.png"];
  assert.deepEqual(ideogramImageReferenceOrder(urls), [0, 1, 2]);
  assert.deepEqual(ideogramImageReferenceOrder(urls, urls[1]), [1, 0, 2]);
  assert.deepEqual(ideogramImageReferenceOrder([], urls[0]), []);
  for (const [refs, source] of [[urls, "/uploads/missing.png"], [[urls[0], urls[0]]],
    [Array.from({ length: 6 }, (_, i) => `/uploads/${i}.png`)], [["https://example.com/image.png"]],
    [[null]], [[42]], [urls, {}]]) {
    assert.throws(() => ideogramImageReferenceOrder(refs, source), { status: 400 });
  }
});

test("reference requests use edit auto sizing and source-first role labels, never text-only options", () => {
  const options = { prompt, imagePromptUrls: ["/uploads/guide.png", "/uploads/source.png"],
    imagePromptLabels: ["Guide", "Source"], ideogramSourceUrl: "/uploads/source.png", quality: "medium",
    resolution: "2K", aspectRatio: "16:9", enablePromptExpansion: false, seed: 0 };
  assert.equal(validateIdeogramImageRequest(options), "auto");
  const { endpoint, input } = buildIdeogramImageFalRequest(options, ["https://fixture.invalid/source", "https://fixture.invalid/guide"]);
  assert.equal(endpoint, "ideogram/v4.5/edit");
  assert.equal(input.image_url, "https://fixture.invalid/source");
  assert.deepEqual(input.reference_image_urls, ["https://fixture.invalid/guide"]);
  assert.equal(input.image_size, "auto"); assert.equal(input.edit_precision, "regular");
  assert.equal(input.quality, "medium"); assert.equal(input.seed, 0);
  assert.equal(Object.hasOwn(input, "enable_prompt_expansion"), false);
  assert.match(input.prompt, /Source image \(image 1\): Source\nGuide reference 1 \(image 2\): Guide/);
  assert.throws(() => buildIdeogramImageFalInput(options), /edit endpoint/);
  assert.throws(() => buildIdeogramImageFalRequest(options, ["only-one"]), /uploaded/);
  assert.throws(() => validateIdeogramImageRequest({ ...options, prompt: "x".repeat(9999) }), /10,000/);
  assert.throws(() => validateIdeogramImageRequest({ ...options, imagePromptLabels: [42] }), /labels/);
  assert.equal(ideogramImageCost({ referenceCount: 2 }).endpoint, endpoint);
  assert.equal(ideogramImageCost({ referenceCount: 2 }).amountUsd, null);
});

test("prompt and seed boundaries are checked without altering the supplied prompt", () => {
  for (const invalidPrompt of [undefined, null, "", "   ", 42, "a".repeat(10001)]) {
    assert.throws(() => validateIdeogramImageRequest({ prompt: invalidPrompt }), { status: 400 });
  }
  for (const validPrompt of ["a", "a".repeat(10000), "  keep these spaces  "]) {
    assert.equal(buildIdeogramImageFalInput({ prompt: validPrompt }).prompt, validPrompt);
  }
  for (const seed of [0, 2147483647]) assert.equal(buildIdeogramImageFalInput({ prompt, seed }).seed, seed);
  for (const seed of [undefined, null]) assert.equal(Object.hasOwn(buildIdeogramImageFalInput({ prompt, seed }), "seed"), false);
});

test("Fal input contains only generation fields and keeps explicit toggles and seed zero", () => {
  assert.deepEqual(validateIdeogramImageRequest({ prompt }), { width: 2560, height: 1440 });
  assert.deepEqual(buildIdeogramImageFalInput({ prompt }), {
    prompt, image_size: { width: 2560, height: 1440 }, quality: "high", enable_prompt_expansion: true,
    num_images: 1, sync_mode: false
  });
  assert.deepEqual(buildIdeogramImageFalInput({ prompt, resolution: "1K", aspectRatio: "4:5", quality: "low",
    enablePromptExpansion: false, seed: 0, background: "opaque", provider: "fal", workflowName: "Local fixture" }), {
    prompt, image_size: { width: 896, height: 1120 }, quality: "low", enable_prompt_expansion: false,
    num_images: 1, sync_mode: false, seed: 0
  });
});

test("unverified generation costs stay unknown for every quality and provider", () => {
  for (const provider of ["fal", "atlas", "krea"]) for (const quality of ideogramImageQualityOptions) {
    const cost = ideogramImageCost({ provider, quality, resolution: "1K", aspectRatio: "1:1", size: "1024x1024", amountUsd: 0 });
    assert.equal(cost.amountUsd, null);
    assert.equal(cost.pricingStatus, "unavailable");
    assert.equal(cost.model, ideogramImageModelName);
    assert.equal(cost.provider, provider);
    assert.equal(cost.quality, quality);
    assert.equal(cost.size, "1024x1024");
    assert.equal(cost.endpoint, ideogramImageEndpoint);
    assert.equal(cost.currency, "USD");
    assert.equal(cost.units, 1);
    assert.match(cost.pricingBasis, /not been verified/);
  }
  assert.equal(ideogramImageCost().provider, "fal");
  assert.equal(ideogramImageCost().amountUsd, null);
});
