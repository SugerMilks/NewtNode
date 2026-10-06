import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import * as image25 from "../src/openAiImage25.js";
import { normalizeOpenAiImage2Quality } from "../src/openAiImage2.js";
import { buildNanoBanana2FalInput } from "../src/nanoBanana2.js";
import { createSeedream5ProGenerator } from "../server/seedream5-pro.js";

const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const names = ["uploadImageInputToFal", "extensionForMime", "promptWithReferenceLabels", "openAiSizeToFalImageSize",
  "generateFalNanoBanana2", "generateFalNanoBananaPro", "generateFalOpenAiImage2FromInputs"];
const code = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return `${source.slice(start - 6, start) === "async " ? "async " : ""}${source.slice(start, source.indexOf("\n}", start) + 2)}`;
}).join("\n");
const references = [
  { fileName: "portrait.png", mimeType: "image/png", label: "@Identity", buffer: Buffer.from("portrait fixture") },
  { fileName: "wardrobe.jpg", mimeType: "image/jpeg", label: "@Wardrobe", buffer: Buffer.from("wardrobe fixture") }
];

function harness({ failUpload = false } = {}) {
  const uploads = [], submissions = [];
  const dependencies = {
    ...image25, path, buildNanoBanana2FalInput, normalizeOpenAiImage2Quality,
    imageModelNames: { openAiImage2: "OpenAI Image 2" },
    falNanoBanana2EditEndpoint: "fal-ai/nano-banana-2/edit",
    falNanoBanana2TextEndpoint: "fal-ai/nano-banana-2",
    falNanoBananaProEndpoint: "fal-ai/nano-banana-pro",
    nanoBananaProFalThinkingMode: "high",
    fal: { storage: { upload: async file => {
      uploads.push(file);
      if (failUpload) throw new Error("Fixture upload failure");
      return `https://fixture.invalid/${file.name}`;
    } } },
    readLocalAsset: async url => references.find(ref => `/uploads/${ref.fileName}` === url),
    cleanImagePromptLabel: label => label,
    normalizeImageAspectRatioForProvider: ratio => ratio,
    normalizeGeminiImageSize: resolution => resolution,
    normalizeOpenAiImageSize: () => "1280x720",
    normalizeOpenAiEditMask: async mask => mask,
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    firstFalImageResult: data => data.images[0],
    subscribeFal: async (endpoint, options) => {
      submissions.push({ endpoint, ...options });
      return { data: { images: [{ url: "https://fixture.invalid/result.png" }] } };
    }
  };
  const helpers = new Function(...Object.keys(dependencies), `${code}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
  return { ...helpers, uploads, submissions, seedream: createSeedream5ProGenerator({ ...dependencies, ...helpers }) };
}

const variants = [
  ["Nano Banana 2", (h, args) => h.generateFalNanoBanana2(args)],
  ["Nano Banana Pro", (h, args) => h.generateFalNanoBananaPro(args)],
  ...["OpenAI Image 2", ...Object.values(image25.openAiImage25Models)].map(model =>
    [model, (h, args) => h.generateFalOpenAiImage2FromInputs({ ...args, model })]),
  ["Seedream 5.0 Pro", (h, args) => h.seedream(args)]
];

function inputs(refs) {
  return { prompt: "Use the supplied references.", imageInputs: refs,
    imagePromptUrls: refs.map(ref => `/uploads/${ref.fileName}`), imagePromptLabels: refs.map(ref => ref.label),
    aspectRatio: "16:9", resolution: "2K" };
}

for (const [model, generate] of variants) {
  test(`${model} uses the real Fal upload helper for zero, one and multiple references`, async () => {
    for (const count of [0, 1, 2]) {
      const h = harness();
      const refs = references.slice(0, count);
      const result = await generate(h, inputs(refs));
      assert.equal(result.remoteImage.url, "https://fixture.invalid/result.png");
      assert.equal(h.uploads.length, count);
      assert.equal(h.submissions.length, 1);
      assert.deepEqual(h.submissions[0].input.image_urls || [], h.uploads.map(file => `https://fixture.invalid/${file.name}`));
      for (const [index, file] of h.uploads.entries()) {
        assert.equal(file.type, refs[index].mimeType);
        assert.deepEqual(Buffer.from(await file.arrayBuffer()), refs[index].buffer);
        assert.match(h.submissions[0].input.prompt, new RegExp(refs[index].label));
      }
    }
  });

  test(`${model} never submits a generation when reference upload fails`, async () => {
    const h = harness({ failUpload: true });
    await assert.rejects(generate(h, inputs(references.slice(0, 1))), /Fixture upload failure/);
    assert.equal(h.uploads.length, 1);
    assert.equal(h.submissions.length, 0);
  });
}

test("explicit edit clients stay separate from the default Fal client", async () => {
  const h = harness();
  const uploads = [];
  const client = { storage: { upload: async file => { uploads.push(file); return "https://fixture.invalid/custom.png"; } } };
  assert.equal(await h.uploadImageInputToFal(references[0], 0, client), "https://fixture.invalid/custom.png");
  assert.equal(uploads.length, 1);
  assert.equal(h.uploads.length, 0);
});

test("OpenAI masked edits upload references and the mask through the default client", async () => {
  const h = harness();
  await h.generateFalOpenAiImage2FromInputs({ ...inputs(references), model: image25.openAiImage25Models.sunburst,
    editMaskInput: { fileName: "edit-mask.png", mimeType: "image/png", buffer: Buffer.from("mask fixture") } });
  assert.equal(h.uploads.length, 3);
  assert.equal(h.submissions.length, 1);
  assert.equal(h.submissions[0].input.mask_url, "https://fixture.invalid/edit-mask.png");
});
