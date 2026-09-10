import test from "node:test";
import assert from "node:assert/strict";
import { validateAtlasVideoAssets } from "../server/atlas-validation.js";

const image = { mimeType: "image/png", bytes: 1024, width: 2048, height: 1152 };
const video = { mimeType: "video/mp4", bytes: 1024, width: 1920, height: 1080, fps: 24, duration: 10 };
test("Atlas validates complete reference durations without dropping a clip", async () => {
  await validateAtlasVideoAssets({ model: "Seedance 2.5", videos: [video, video, video] }, async (asset) => asset);
  await assert.rejects(validateAtlasVideoAssets({ model: "Seedance 2.0", videos: [video, video] }, async (asset) => asset), /combined video references exceed 15/);
});
test("Atlas preflight catches unsupported media before uploading", async () => {
  for (const [asset, error] of [[{ ...image, width: 100 }, /dimensions/], [{ ...image, bytes: 30 * 1024 * 1024 }, /MB limit/], [{ ...image, mimeType: "video/mp4" }, /not a image/]]) {
    await assert.rejects(validateAtlasVideoAssets({ model: "Seedance 2.5", images: [asset] }, async (value) => value), error);
  }
  await assert.rejects(validateAtlasVideoAssets({ model: "Seedance 2.5", videos: [{ ...video, fps: 12 }] }, async (value) => value), /frame rate/);
  await assert.rejects(validateAtlasVideoAssets({ model: "MiniMax H3", audios: [{ mimeType: "audio/mpeg" }] }, async (value) => value), /between 2 and 15/);
});
