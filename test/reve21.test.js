import test from "node:test";
import assert from "node:assert/strict";

import { defaultModelPreferences, imageModelNames, imageModelOptions } from "../src/modelOptions.js";
import {
  buildReve21FalRequest,
  estimateReve21ImageCost,
  reve21AspectRatios,
  reve21CostPerImage,
  reve21FalEditEndpoint,
  reve21FalRemixEndpoint,
  reve21FalTextEndpoint,
  reve21ResolutionOptions
} from "../src/reve21.js";

test("REVE 2.1 pricing is fixed at $0.25 per image across all routes", () => {
  assert.equal(reve21CostPerImage, 0.25);

  for (const endpoint of [reve21FalTextEndpoint, reve21FalEditEndpoint, reve21FalRemixEndpoint]) {
    const cost = estimateReve21ImageCost({ endpoint });
    assert.equal(cost.amountUsd, 0.25);
    assert.equal(cost.unitRateUsd, 0.25);
    assert.equal(cost.unit, "image");
    assert.equal(cost.endpoint, endpoint);
    assert.equal(cost.pricingSource, "fal-pricing-api-2026-08-02");
  }
});

test("REVE 2.1 is registered as an opt-in native 4K image model", () => {
  assert.ok(imageModelOptions.includes(imageModelNames.reve21));
  assert.equal(defaultModelPreferences.image[imageModelNames.reve21], false);
  assert.deepEqual(reve21ResolutionOptions, ["4K"]);
  assert.ok(reve21AspectRatios.includes("4:1"));
  assert.ok(reve21AspectRatios.includes("1:4"));
});

test("REVE 2.1 uses text-to-image without references", () => {
  const request = buildReve21FalRequest({ prompt: "A typographic poster", aspectRatio: "21:9" });
  assert.equal(request.endpoint, reve21FalTextEndpoint);
  assert.equal(request.mode, "generate");
  assert.equal(request.input.aspect_ratio, "21:9");
  assert.equal(request.input.output_format, "png");
  assert.equal("image_url" in request.input, false);
  assert.equal("image_urls" in request.input, false);
});

test("REVE 2.1 uses edit for one labeled reference", () => {
  const request = buildReve21FalRequest({
    prompt: "Change the package color to cobalt blue",
    imageUrls: ["https://example.com/package.png"],
    imageLabels: ["Product package"],
    aspectRatio: "4:5"
  });
  assert.equal(request.endpoint, reve21FalEditEndpoint);
  assert.equal(request.mode, "edit");
  assert.equal(request.input.image_url, "https://example.com/package.png");
  assert.match(request.submittedPrompt, /<frame>0<\/frame> = Product package\./);
});

test("REVE 2.1 uses remix and caps references at eight", () => {
  const imageUrls = Array.from({ length: 10 }, (_value, index) => "https://example.com/" + index + ".png");
  const imageLabels = imageUrls.map((_url, index) => "Reference " + (index + 1));
  const request = buildReve21FalRequest({ prompt: "Combine the references", imageUrls, imageLabels });
  assert.equal(request.endpoint, reve21FalRemixEndpoint);
  assert.equal(request.mode, "remix");
  assert.equal(request.referenceCount, 8);
  assert.equal(request.input.image_urls.length, 8);
  assert.match(request.submittedPrompt, /<frame>7<\/frame> = Reference 8\./);
  assert.doesNotMatch(request.submittedPrompt, /Reference 9/);
});
