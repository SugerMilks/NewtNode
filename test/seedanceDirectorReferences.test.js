import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeSeedanceDirectorReferences,
  seedance25ImageReferenceLimit,
  seedanceImageReferenceLimit
} from "../src/seedanceDirectorReferences.js";

test("Seedance merges only the Film Director references already selected for the active scene", () => {
  const result = mergeSeedanceDirectorReferences({
    directUrls: ["/outputs/storyboard.png", "/outputs/kim.png"],
    directLabels: ["Storyboard", "Kim direct"],
    directorReferences: [
      { type: "character", tag: "@Kim", url: "/outputs/kim.png" },
      { type: "location", tag: "@Kitchen", url: "/outputs/kitchen.png" },
      { type: "prop", tag: "@CoffeeCup", url: "/outputs/cup.png" }
    ]
  });

  assert.deepEqual(result.urls, [
    "/outputs/kim.png",
    "/outputs/kitchen.png",
    "/outputs/cup.png",
    "/outputs/storyboard.png"
  ]);
  assert.deepEqual(result.labels, ["@Kim", "@Kitchen", "@CoffeeCup", "Storyboard"]);
});

test("Seedance deduplicates references and respects its image-reference limit", () => {
  const directorReferences = Array.from({ length: 12 }, (_value, index) => ({
    tag: `@Asset${index + 1}`,
    url: `/outputs/asset-${index + 1}.png`
  }));
  const result = mergeSeedanceDirectorReferences({ directorReferences });

  assert.equal(result.urls.length, seedanceImageReferenceLimit);
  assert.equal(result.labels.at(-1), "@Asset9");
});

test("Seedance direct references remain unchanged without a Film Director package", () => {
  const result = mergeSeedanceDirectorReferences({
    directUrls: ["/outputs/image-a.png", "/outputs/image-b.png"],
    directLabels: ["ImageA", "ImageB"]
  });

  assert.deepEqual(result, {
    urls: ["/outputs/image-a.png", "/outputs/image-b.png"],
    labels: ["ImageA", "ImageB"]
  });
});

test("Seedance 2.5 can retain up to thirty image references", () => {
  const directorReferences = Array.from({ length: 35 }, (_value, index) => ({
    tag: `@Asset${index + 1}`,
    url: `/outputs/asset-${index + 1}.png`
  }));
  const result = mergeSeedanceDirectorReferences({ directorReferences, limit: seedance25ImageReferenceLimit });

  assert.equal(result.urls.length, 30);
  assert.equal(result.labels.at(-1), "@Asset30");
});
