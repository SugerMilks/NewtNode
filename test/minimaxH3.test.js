import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateMiniMaxH3FalCost,
  miniMaxH3FalEndpoint,
  normalizeMiniMaxH3AspectRatio,
  normalizeMiniMaxH3Duration,
  normalizeMiniMaxH3Resolution,
  rewriteMiniMaxH3ReferenceMentions
} from "../src/minimaxH3.js";

test("MiniMax H3 selects text, frame, and multimodal Fal endpoints", () => {
  assert.equal(miniMaxH3FalEndpoint(), "minimax/h3/text-to-video");
  assert.equal(miniMaxH3FalEndpoint({ startFrame: true }), "minimax/h3/image-to-video");
  assert.equal(miniMaxH3FalEndpoint({ references: true }), "minimax/h3/reference-to-video");
});

test("MiniMax H3 controls normalize to the provider schema", () => {
  assert.equal(normalizeMiniMaxH3Duration("2 seconds"), 5);
  assert.equal(normalizeMiniMaxH3Duration("18 seconds"), 15);
  assert.equal(normalizeMiniMaxH3Resolution("4k"), "4K");
  assert.equal(normalizeMiniMaxH3Resolution("1080p"), "2K");
  assert.equal(normalizeMiniMaxH3AspectRatio("Adaptive"), "adaptive");
  assert.equal(normalizeMiniMaxH3AspectRatio("9:16 (Portrait)"), "9:16");
});

test("MiniMax H3 rewrites named multimodal references in provider order", () => {
  assert.equal(
    rewriteMiniMaxH3ReferenceMentions("@Emma listens to @Dialogue beside @Room.", [
      { label: "Emma", type: "image" },
      { label: "Room", type: "image" },
      { label: "Dialogue", type: "audio" }
    ]),
    "Image 1 listens to Audio 1 beside Image 2."
  );
});

test("MiniMax H3 cost includes output seconds and images beyond five", () => {
  assert.deepEqual(
    estimateMiniMaxH3FalCost({ duration: "10 seconds", resolution: "2K", referenceImageCount: 7 }).amountUsd,
    1.46
  );
  assert.equal(
    estimateMiniMaxH3FalCost({ duration: "10 seconds", resolution: "768P" }).amountUsd,
    0.8
  );
});
