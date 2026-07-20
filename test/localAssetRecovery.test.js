import assert from "node:assert/strict";
import test from "node:test";

import { findRemoteHistoryAssetUrl } from "../server/local-asset-recovery.js";

test("missing generated assets recover from the matching full-resolution history entry", () => {
  const history = [{
    localImage: "/outputs/NIagen/generated.png",
    localThumbnail: "/outputs/NIagen/generated-preview.jpg",
    remoteImage: { url: "https://cdn.example.com/generated.png" }
  }];

  assert.equal(
    findRemoteHistoryAssetUrl(history, "/outputs/Niagen/generated.png"),
    "https://cdn.example.com/generated.png"
  );
});

test("asset recovery never substitutes a thumbnail or unrelated remote output", () => {
  const history = [{
    localImage: "/outputs/project/generated.png",
    localThumbnail: "/outputs/project/generated-preview.jpg",
    remoteImage: { url: "https://cdn.example.com/generated.png" }
  }];

  assert.equal(findRemoteHistoryAssetUrl(history, "/outputs/project/generated-preview.jpg"), "");
  assert.equal(findRemoteHistoryAssetUrl(history, "/outputs/project/missing.png"), "");
});

test("asset recovery supports matching multi-output history entries", () => {
  const history = [{
    localImages: ["/outputs/project/one.png", "/outputs/project/two.png"],
    remoteImages: [
      { url: "https://cdn.example.com/one.png" },
      { url: "https://cdn.example.com/two.png" }
    ]
  }];

  assert.equal(
    findRemoteHistoryAssetUrl(history, "/outputs/project/two.png"),
    "https://cdn.example.com/two.png"
  );
});
