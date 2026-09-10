import assert from "node:assert/strict";
import test from "node:test";
import { atlasImageModels, buildAtlasImageRequest, supportsAtlasImageModel } from "../src/atlasImages.js";
import { imageModelNames, imageModelOptions, nanoImageAspectRatios, reve21AspectRatios } from "../src/modelOptions.js";

const prompt = "Preserve the product and change the lighting.";
const maskUrl = "https://example.com/mask.png";
const references = (count) => Array.from({ length: count }, (_, index) => `https://example.com/full-${index}.png`);
const variants = [imageModelNames.openAiImage25Sunburst, imageModelNames.openAiImage25Flare];
const openAiModels = [imageModelNames.openAiImage2, ...variants];
const nanoModels = [imageModelNames.nanoBanana2, imageModelNames.nanoBananaPro];

// Contract snapshots from the public Atlas schemas, not live generation calls or local cache dependencies.
// https://static.atlascloud.ai/model/schema/<model-id-with-dashes>.json (2026-09-10)
const contracts = [
  [imageModelNames.openAiImage2, "openai/gpt-image-2", 10],
  [imageModelNames.openAiImage25Sunburst, "openai/gpt-image-2.5-sunburst", 16],
  [imageModelNames.openAiImage25Flare, "openai/gpt-image-2.5-flare", 16],
  [imageModelNames.nanoBanana2, "google/nano-banana-2", 14],
  [imageModelNames.nanoBananaPro, "google/nano-banana-pro", 10],
  [imageModelNames.reve21, "reve-ai/reve-2.1", 6]
];
const settings = (model, overrides = {}) => ({ model, prompt,
  ...(model === imageModelNames.reve21 ? { resolution: "4K" } : {}), ...overrides });
function rejects(options, pattern) {
  assert.throws(() => buildAtlasImageRequest(options), (error) => {
    assert.equal(error.status, 400);
    assert.match(error.message, pattern);
    return true;
  });
}

test("only exact canonical image models are supported, with no substitutions or LLMs", () => {
  assert.deepEqual(new Set(atlasImageModels), new Set(imageModelOptions.filter((name) => name !== imageModelNames.krea2Large)));
  assert.ok(Object.isFrozen(atlasImageModels));
  for (const model of atlasImageModels) assert.equal(supportsAtlasImageModel(model), true);
  for (const model of [undefined, null, {}, 2, "", "toString", "__proto__", "OpenAI Image 2.5", "OpenAI Image 2.5 Sunburst Developer",
    "openai/gpt-image-2-developer/edit", "OpenAI Image 2 Developer", "google/nano-banana-2/text-to-image-developer",
    "Nano Banana 2 Lite", "Nano Banana Pro Ultra", "Gemini 3.1 Pro", "gemini-3.1-flash", "google/gemini-3-pro",
    "REVE", "REVE 2", "Krea 2 Large", "Krea 2 Turbo", "nano banana 2", " OpenAI Image 2 "]) {
    assert.equal(supportsAtlasImageModel(model), false);
    rejects({ model, prompt }, /Unsupported Atlas image model/);
  }
});

for (const [model, id, limit] of contracts) {
  test(`${model}: exact text/edit routes and complete ordered references`, () => {
    for (const count of [0, 1, 2, limit]) {
      const images = references(count);
      const result = buildAtlasImageRequest(settings(model, { images }));
      const mode = model === imageModelNames.reve21 && count > 1 ? "remix" : count ? "edit" : "text-to-image";
      assert.equal(result.model, `${id}/${mode}`);
      assert.equal(result.prompt, prompt);
      assert.equal(result.output_format, "png");
      assert.equal(result.enable_sync_mode, false);
      assert.equal("input" in result, false);
      assert.equal("endpoint" in result, false);
      assert.equal("image_urls" in result, false);
      assert.equal("image_url" in result, false);
      if (model === imageModelNames.reve21 && count === 1) {
        assert.equal(result.image, images[0]);
        assert.equal("images" in result, false);
      } else if (count) {
        assert.deepEqual(result.images, images);
        assert.notEqual(result.images, images);
        assert.equal("image" in result, false);
      } else {
        assert.equal("images" in result, false);
        assert.equal("image" in result, false);
      }
    }
  });

  test(`${model}: over-limit references fail before a mocked submission`, (t) => {
    const submit = t.mock.fn();
    const images = Object.freeze(references(limit + 1));
    assert.throws(() => submit(buildAtlasImageRequest(settings(model, { images }))), new RegExp(`${limit} reference images`));
    assert.equal(submit.mock.callCount(), 0);
    assert.equal(images.length, limit + 1);
  });

  test(`${model}: invalid prompts, settings and reference entries are rejected`, () => {
    for (const value of [undefined, null, 123, {}, "", " \n\t"]) rejects(settings(model, { prompt: value }), /prompt/);
    for (const images of [null, "image", {}, [""], [" "], [null], [undefined], [123], new Array(1)]) {
      rejects(settings(model, { images }), /image/);
    }
    for (const quality of [null, "", "ultra", false]) rejects(settings(model, { quality }), /quality/);
    for (const resolution of [null, "", "0.5K", "512", "8K", 2048]) rejects(settings(model, { resolution }), /resolution/);
    for (const background of [null, "", "white", false]) rejects(settings(model, { background }), /background/);
    for (const mask of [null, false, {}, " "]) rejects(settings(model, { maskUrl: mask }), /maskUrl/);
    for (const aspectRatio of [null, "", "16:9 (Landscape)", "16/9", {}, "0:0"]) {
      rejects(settings(model, { aspectRatio }), /aspectRatio/);
    }
  });
}

test("Image 2 defaults are high-quality 2K landscape, PNG and async", () => {
  assert.deepEqual(buildAtlasImageRequest({ model: imageModelNames.openAiImage2, prompt }), {
    model: "openai/gpt-image-2/text-to-image", prompt, quality: "high", size: "2048x1152",
    output_format: "png", enable_sync_mode: false
  });
});

test("Sunburst and Flare retain high/xhigh/max, full size, transparency and the exact mask field", () => {
  for (const [model, variant] of variants.map((model, index) => [model, ["sunburst", "flare"][index]])) {
    assert.equal(buildAtlasImageRequest({ model, prompt }).quality, "high");
    for (const quality of ["high", "xhigh", "max"]) {
      const images = references(16);
      assert.deepEqual(buildAtlasImageRequest({ model, prompt, images, size: "3840x2160", quality, maskUrl, background: "transparent" }), {
        model: `openai/gpt-image-2.5-${variant}/edit`, prompt, images, size: "3840x2160", quality,
        mask: maskUrl, background: "transparent", n: 1, output_format: "png", enable_sync_mode: false
      });
    }
    for (const quality of ["auto", "low", "medium", "high", "xhigh", "max"]) {
      assert.equal(buildAtlasImageRequest({ model, prompt, quality }).quality, quality);
    }
    for (const background of ["auto", "opaque", "transparent"]) {
      assert.equal(buildAtlasImageRequest({ model, prompt, background }).background, background);
    }
    rejects({ model, prompt, maskUrl }, /mask needs a reference image/);
  }
});

test("unsupported masks and background controls never disappear silently", () => {
  for (const model of atlasImageModels.filter((model) => !variants.includes(model))) {
    rejects(settings(model, { images: references(1), maskUrl }), /does not support masks/);
    rejects(settings(model, { maskUrl }), /does not support masks/);
  }
  for (const model of [imageModelNames.openAiImage2, ...nanoModels]) {
    for (const background of ["opaque", "transparent"]) rejects(settings(model, { background }), /background/);
  }
});

test("Image 2 validates its own quality choices and never falls back from 2.5 tiers", () => {
  for (const quality of ["low", "medium", "high"]) {
    assert.equal(buildAtlasImageRequest({ model: imageModelNames.openAiImage2, prompt, quality }).quality, quality);
  }
  for (const quality of ["auto", "xhigh", "max"]) rejects({ model: imageModelNames.openAiImage2, prompt, quality }, /quality/);
});

test("OpenAI custom sizes are preserved, not restricted to the Atlas UI preset enum", () => {
  for (const model of openAiModels) {
    for (const size of ["256x256", "1536x864", "1280x720", "2048x880", "2880x2880", "3840x2160", "2160x3840"]) {
      assert.equal(buildAtlasImageRequest({ model, prompt, size }).size, size);
    }
    for (const size of [null, "", {}, 1024, "1024X1024", "1024x1024extra", "1024 x 1024", "1024x1000", "0x0",
      "240x768", "4096x2048", "3840x3840", "3840x1264", "1264x3840", "999999999999999999x1024"]) {
      rejects({ model, prompt, size }, /size/);
    }
    rejects({ model, prompt, size: "1024x1024", resolution: "8K" }, /resolution/);
    rejects({ model, prompt, size: "1024x1024", aspectRatio: "4:1" }, /aspectRatio/);
  }
});

test("OpenAI sizes derived from Newt controls respect dimensions and pixel budgets", () => {
  for (const model of openAiModels) {
    for (const resolution of ["1K", "2K", "4K"]) {
      for (const aspectRatio of [...nanoImageAspectRatios, "1:3", "3:1", "2:1", "1:2"]) {
        const result = buildAtlasImageRequest({ model, prompt, resolution, aspectRatio });
        const [width, height] = result.size.split("x").map(Number);
        assert.ok([width, height].every((edge) => edge >= 256 && edge <= 3840 && edge % 16 === 0));
        assert.ok(width * height <= 8294400);
        assert.ok(Math.max(width / height, height / width) <= 3);
        const [rw, rh] = aspectRatio.split(":").map(Number);
        assert.ok(Math.abs(width / height - rw / rh) < 0.04);
        assert.equal("resolution" in result, false);
        assert.equal("aspect_ratio" in result, false);
      }
    }
    assert.equal(buildAtlasImageRequest({ model, prompt, resolution: "1K" }).size, "1280x720");
    assert.equal(buildAtlasImageRequest({ model, prompt, resolution: "2K" }).size, "2048x1152");
    assert.equal(buildAtlasImageRequest({ model, prompt, resolution: "4K" }).size, "3840x2160");
    assert.equal(buildAtlasImageRequest({ model, prompt, resolution: "4K", aspectRatio: "1:1" }).size, "2880x2880");
  }
});

test("automatic sizing is only sent to models that explicitly support it", () => {
  for (const model of variants) {
    assert.equal(buildAtlasImageRequest({ model, prompt, size: "auto" }).size, "auto");
    assert.equal(buildAtlasImageRequest({ model, prompt, aspectRatio: "Auto" }).size, "auto");
  }
  rejects({ model: imageModelNames.openAiImage2, prompt, size: "auto" }, /size/);
  rejects({ model: imageModelNames.openAiImage2, prompt, aspectRatio: "Auto" }, /aspectRatio/);
  for (const model of nanoModels) rejects({ model, prompt, aspectRatio: "Auto" }, /aspectRatio/);
  assert.equal(buildAtlasImageRequest(settings(imageModelNames.reve21, { aspectRatio: "Auto" })).aspect_ratio, "auto");
});

test("Nano Banana image models use standard routes and schema-supported high media/reasoning", () => {
  for (const model of nanoModels) {
    const isNano2 = model === imageModelNames.nanoBanana2;
    assert.deepEqual(buildAtlasImageRequest({ model, prompt }), {
      model: `google/nano-banana-${isNano2 ? "2" : "pro"}/text-to-image`, prompt,
      aspect_ratio: "16:9", resolution: "2k", media_resolution: "high",
      ...(isNano2 ? { thinking_level: "high" } : {}), output_format: "png", enable_sync_mode: false
    });
    for (const images of [[], references(1)]) for (const resolution of ["1K", "2K", "4K"]) {
      for (const aspectRatio of nanoImageAspectRatios) {
        const result = buildAtlasImageRequest({ model, prompt, images, resolution, aspectRatio });
        assert.equal(result.resolution, resolution.toLowerCase());
        assert.equal(result.aspect_ratio, aspectRatio);
        assert.equal(result.media_resolution, "high");
        assert.equal(result.thinking_level, isNano2 ? "high" : undefined);
        assert.equal("quality" in result, false);
        assert.equal("size" in result, false);
      }
    }
    for (const quality of ["low", "medium", "xhigh", "max", "auto"]) rejects({ model, prompt, quality }, /quality/);
    assert.deepEqual(buildAtlasImageRequest({ model, prompt, size: "2048x1152" }), buildAtlasImageRequest({ model, prompt }));
  }
});

test("REVE defaults only omitted resolution to 4K and uses its distinct background-removal field", () => {
  const model = imageModelNames.reve21;
  assert.equal(buildAtlasImageRequest({ model, prompt }).resolution, "4k");
  assert.equal(buildAtlasImageRequest({ model, prompt, resolution: undefined }).resolution, "4k");
  for (const resolution of ["1K", "2K"]) rejects({ model, prompt, resolution }, /resolution.*4k/);
  for (const images of [[], references(1), references(6)]) for (const aspectRatio of reve21AspectRatios) {
    const result = buildAtlasImageRequest({ model, prompt, images, aspectRatio, resolution: "4K", background: "transparent" });
    assert.equal(result.resolution, "4k");
    assert.equal(result.aspect_ratio, aspectRatio);
    assert.equal(result.remove_background, true);
    assert.equal("background" in result, false);
    assert.equal("quality" in result, false);
    assert.equal("size" in result, false);
  }
  assert.equal(buildAtlasImageRequest(settings(model)).remove_background, false);
  rejects(settings(model, { background: "opaque" }), /background/);
  assert.deepEqual(buildAtlasImageRequest(settings(model, { size: "3840x2160" })), buildAtlasImageRequest(settings(model)));
  rejects(settings(model, { quality: "max" }), /quality/);
});

test("shared OpenAI size is ignored for Nano/REVE without overriding native settings", () => {
  for (const model of [...nanoModels, imageModelNames.reve21]) {
    for (const images of [[], references(1), references(2)]) {
      const options = settings(model, { images, aspectRatio: "9:16" });
      const expected = buildAtlasImageRequest(options);
      for (const size of ["2048x1152", "3840x2160", "auto", "unused", null]) {
        assert.deepEqual(buildAtlasImageRequest({ ...options, size }), expected);
      }
      assert.equal(expected.aspect_ratio, "9:16");
      assert.equal("size" in expected, false);
      rejects({ ...options, size: "3840x2160", resolution: "8K" }, /resolution/);
      rejects({ ...options, size: "3840x2160", maskUrl }, /does not support masks/);
    }
  }
  rejects({ model: imageModelNames.reve21, prompt, resolution: "2K", size: "3840x2160" }, /resolution.*4k/);
});

test("Sunburst Character 4K landscape preserves base/wardrobe order and mask across preflight and native requests", (t) => {
  const options = { model: imageModelNames.openAiImage25Sunburst, prompt, aspectRatio: "16:9", resolution: "4K",
    size: "3840x2160", quality: "high" };
  const placeholder = "https://reference.invalid/image.png";
  const preflight = buildAtlasImageRequest({ ...options, images: [placeholder, placeholder], maskUrl: "https://reference.invalid/mask.png" });
  const images = ["https://example.com/native-cu-base.png", "https://example.com/native-wardrobe.png"];
  const submit = t.mock.fn();
  const native = buildAtlasImageRequest({ ...options, images, maskUrl });
  submit(native);
  assert.deepEqual(native, { ...preflight, images, mask: maskUrl });
  assert.equal(native.model, "openai/gpt-image-2.5-sunburst/edit");
  assert.equal(native.size, "3840x2160");
  assert.equal(native.quality, "high");
  assert.equal(native.output_format, "png");
  assert.equal(native.enable_sync_mode, false);
  assert.equal(submit.mock.callCount(), 1);
});

test("invalid preflight settings reject before mocked uploads or submission", (t) => {
  const upload = t.mock.fn();
  const submit = t.mock.fn();
  for (const overrides of [{ images: references(17) }, { quality: "ultra" }, { resolution: "8K" }, { size: "4096x4096" }]) {
    assert.throws(() => {
      buildAtlasImageRequest({ model: variants[0], prompt, images: references(2), maskUrl, ...overrides });
      upload();
      submit();
    }, { status: 400 });
  }
  assert.equal(upload.mock.callCount(), 0);
  assert.equal(submit.mock.callCount(), 0);
});

test("documented prompt limits differ between REVE generation, edit/remix and OpenAI 2.5", () => {
  for (const [model, images, limit] of [
    ...variants.flatMap((model) => [[model, [], 32000], [model, references(1), 32000]]),
    [imageModelNames.reve21, [], 2560], [imageModelNames.reve21, references(1), 4000], [imageModelNames.reve21, references(6), 4000]
  ]) {
    assert.equal(buildAtlasImageRequest(settings(model, { images, prompt: "a".repeat(limit) })).prompt.length, limit);
    rejects(settings(model, { images, prompt: "a".repeat(limit + 1) }), new RegExp(`prompt.*${limit}`));
  }
});

test("the builder is synchronous, deterministic, does not mutate inputs and never calls fetch", (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("No networking allowed"); });
  for (const [model] of contracts) {
    const images = Object.freeze(references(2));
    const input = Object.freeze(settings(model, { images, prompt: "  Preserve <frame>0</frame> and @Product.\n" }));
    const first = buildAtlasImageRequest(input);
    assert.deepEqual(first, buildAtlasImageRequest(input));
    assert.equal(first instanceof Promise, false);
    assert.equal(first.prompt, input.prompt);
    first.images.push("https://example.com/other.png");
    assert.deepEqual(images, references(2));
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("image strings retain order, duplicates and documented asset/base64 representations", () => {
  const images = ["asset://source", "data:image/png;base64,aGVsbG8=", "https://example.com/a.png", "asset://source"];
  const result = buildAtlasImageRequest({ model: variants[0], prompt, images, maskUrl: "asset://mask" });
  assert.deepEqual(result.images, images);
  assert.equal(result.mask, "asset://mask");
});

test("unknown fields cannot override async, PNG, model tiers or batch size", () => {
  for (const extra of [{ enable_sync_mode: true }, { output_format: "jpeg" }, { n: 10 }, { tier: "developer" },
    { thinking_level: "minimal" }, { media_resolution: "low" }, { imageUrls: references(1) }, { mask: maskUrl }]) {
    rejects({ model: variants[0], prompt, ...extra }, /unsupported setting/);
  }
  rejects(undefined, /Unsupported Atlas image model/);
  for (const options of [null, [], "model"]) rejects(options, /settings must be an object/);
});
