import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateImageRunCost,
  estimateVideoRunCost,
  formatPricedRunLabel,
  generationProviderFromSettings
} from "../src/generationPricing.js";

test("image run estimates include quality, edit route, provider, and batch count", () => {
  assert.equal(estimateImageRunCost({
    model: "OpenAI Image 2",
    resolution: "4K",
    aspectRatio: "16:9",
    quality: "high",
    batchCount: 4
  }), 1.604);
  assert.equal(estimateImageRunCost({
    model: "OpenAI Image 2",
    resolution: "4K",
    aspectRatio: "16:9",
    quality: "high",
    referenceCount: 1,
    batchCount: 4
  }), 1.652);
  assert.equal(estimateImageRunCost({
    model: "Nano Banana 2",
    resolution: "2K",
    provider: "fal",
    batchCount: 4
  }), 0.488);
  assert.equal(estimateImageRunCost({
    model: "Nano Banana 2",
    resolution: "2K",
    provider: "krea",
    batchCount: 4
  }), 0.48);
});

test("video run estimates include duration, audio, references, provider, and batch count", () => {
  assert.equal(estimateVideoRunCost({
    model: "Kling O3 Pro",
    duration: "8 seconds",
    generateAudio: true,
    provider: "fal"
  }), 1.12);
  assert.equal(estimateVideoRunCost({
    model: "Kling O3 Pro",
    duration: "8 seconds",
    generateAudio: false,
    provider: "krea"
  }), 1.8816);
  assert.equal(estimateVideoRunCost({
    model: "MiniMax H3",
    duration: "10 seconds",
    resolution: "768P",
    provider: "fal",
    batchCount: 2
  }), 1.6);
  assert.equal(estimateVideoRunCost({
    model: "MiniMax H3",
    duration: "10 seconds",
    referenceImageCount: 7,
    provider: "krea"
  }), 1.449);
});

test("provider selection follows the enabled configured key priority", () => {
  assert.equal(generationProviderFromSettings({
    falKeyConfigured: true,
    kreaApiKeyConfigured: true,
    providerPreferences: { fal: true, krea: true }
  }), "fal");
  assert.equal(generationProviderFromSettings({
    falKeyConfigured: true,
    kreaApiKeyConfigured: true,
    providerPreferences: { fal: false, krea: true }
  }), "krea");
  assert.equal(formatPricedRunLabel("Run Video", 4.22), "Run Video ($4.22)");
});
