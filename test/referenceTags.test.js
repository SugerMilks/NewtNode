import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanReferenceTag,
  promptHasReferenceTag,
  resolveTaggedImageReferences,
  taggedReferenceLabel
} from "../src/referenceTags.js";

test("image reference tags are cleaned consistently with prompt tags", () => {
  assert.equal(cleanReferenceTag("@Central Park!"), "CentralPark");
  assert.equal(cleanReferenceTag("Park_image-01"), "Park_image-01");
});

test("image reference tags match case-insensitively without partial matches", () => {
  assert.equal(promptHasReferenceTag("Place @Park behind the subject.", "Park"), true);
  assert.equal(promptHasReferenceTag("Place @park behind the subject.", "Park"), true);
  assert.equal(promptHasReferenceTag("Place @Parking behind the subject.", "Park"), false);
});

test("a used image tag becomes the exact provider reference label", () => {
  assert.equal(taggedReferenceLabel("Use @Park at sunset.", "Park", "park.png"), "@Park");
  assert.equal(taggedReferenceLabel("Use the location at sunset.", "Park", "park.png"), "park.png");
});

test("a used image tag becomes an explicit provider instruction", () => {
  assert.equal(
    resolveTaggedImageReferences("Put the actor in @Park at sunset.", ["Park"]),
    "Put the actor in the connected image reference labeled \"@Park\" at sunset."
  );
  assert.equal(
    resolveTaggedImageReferences("Use @Parking.", ["Park"]),
    "Use @Parking."
  );
});
