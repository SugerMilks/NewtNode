import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { createAtlasMedia } from "../server/atlas-media.js";
import { validateAtlasVideoAssets } from "../server/atlas-validation.js";

const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const configuration = source.slice(source.indexOf("const atlasMedia = createAtlasMedia("), source.indexOf("\nfunction atlasMediaEnabled()"));

async function setup(t, width = 600) {
  // Do not let test dependency injection hide a missing server import.
  assert.match(source, /^import sharp from ["']sharp["'];$/m);
  const network = t.mock.method(globalThis, "fetch", () => { throw new Error("Network forbidden in Atlas wiring tests"); });
  t.after(() => assert.equal(network.mock.callCount(), 0));
  const buffer = await sharp({ create: { width, height: 600, channels: 3, background: "gray" } }).png().toBuffer();
  const asset = { buffer, mimeType: "image/png", fileName: "reference.png" };
  const client = {
    upload: t.mock.fn(async () => "https://example.com/reference.png"),
    generate: t.mock.fn(async () => ({ requestId: "test-job", url: "https://example.com/video.mp4" }))
  };
  const probeVideoFile = t.mock.fn(async () => { throw new Error("Image references must use Sharp, not the video probe"); });
  const deps = {
    sharp, createAtlasMedia, validateAtlasVideoAssets, createAtlasClient: () => client,
    readLocalAsset: async () => asset,
    resolveLocalAssetPath: async () => ({ filePath: "/unused/reference.png" }),
    probeVideoFile, normalizeOpenAiImageSize: () => {}, promptWithReferenceLabels: (prompt) => prompt
  };
  const media = new Function(...Object.keys(deps), `${configuration}; return atlasMedia;`)(...Object.values(deps));
  return { media, client, asset, probeVideoFile };
}

const request = { model: "Seedance 2.5", prompt: "Preserve the references.", duration: 8, resolution: "720p", aspectRatio: "16:9" };

test("server Atlas wiring validates real image references before a video submission", async (t) => {
  const { media, client, asset, probeVideoFile } = await setup(t);
  const result = await media.video({ ...request, images: ["/uploads/reference.png", asset] }, "test-key");
  assert.equal(result.requestId, "test-job");
  assert.equal(client.upload.mock.callCount(), 2);
  assert.equal(client.generate.mock.callCount(), 1);
  assert.equal(probeVideoFile.mock.callCount(), 0);
  for (const call of client.upload.mock.calls) assert.equal(call.arguments[0], asset);
  assert.deepEqual(client.generate.mock.calls[0].arguments[0].input.reference_images, ["https://example.com/reference.png", "https://example.com/reference.png"]);
});

test("server Atlas wiring checks both start and end images", async (t) => {
  const { media, client } = await setup(t);
  await media.video({ ...request, startImage: "/uploads/start.png", endImage: "/uploads/end.png" }, "test-key");
  assert.equal(client.upload.mock.callCount(), 2);
  assert.equal(client.generate.mock.callCount(), 1);
});

test("server Atlas wiring rejects undersized images before uploading or submitting a paid job", async (t) => {
  const { media, client } = await setup(t, 200);
  await assert.rejects(media.video({ ...request, images: ["/uploads/small.png"] }, "test-key"), /dimensions between 300 and 6000/);
  assert.equal(client.upload.mock.callCount(), 0);
  assert.equal(client.generate.mock.callCount(), 0);
});
