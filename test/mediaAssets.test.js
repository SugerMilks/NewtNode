import assert from "node:assert/strict";
import test from "node:test";

import {
  fullResolutionContextPreparedAttribute,
  fullResolutionImageProps,
  fullResolutionPreviewSourceAttribute,
  fullResolutionOutputItem,
  isLocalDraggableMediaUrl,
  isLocalThumbnailUrl,
  prepareFullResolutionImageForNativeSave,
  previewImageUrl,
  restoreFullResolutionImagePreview
} from "../src/mediaAssets.js";

test("thumbnail assets are display-only and cannot become draggable working media", () => {
  const localThumbnail = "/outputs/Test/thumbnails/image-preview.jpg";
  const packagedThumbnail = "/workflow-assets/project-1/thumbnails/image-preview.jpg";

  assert.equal(isLocalThumbnailUrl(localThumbnail), true);
  assert.equal(isLocalThumbnailUrl(packagedThumbnail), true);
  assert.equal(isLocalDraggableMediaUrl(localThumbnail), false);
  assert.equal(isLocalDraggableMediaUrl(packagedThumbnail), false);
});

test("drag payloads always prefer a full-resolution asset", () => {
  const item = fullResolutionOutputItem({
    type: "image",
    url: "/outputs/Test/thumbnails/image-preview.jpg",
    fullResolutionUrl: "/outputs/Test/image.png",
    thumbnailUrl: "/outputs/Test/thumbnails/image-preview.jpg"
  });

  assert.equal(item.url, "/outputs/Test/image.png");
  assert.equal(item.thumbnailUrl, "/outputs/Test/thumbnails/image-preview.jpg");
});

test("thumbnail-only drag payloads are rejected", () => {
  assert.equal(fullResolutionOutputItem({
    type: "image",
    url: "/outputs/Test/thumbnails/image-preview.jpg"
  }), null);
});

test("local canvas images use the runtime thumbnail endpoint", () => {
  assert.equal(
    previewImageUrl("/outputs/Test/full-resolution.png"),
    "/api/media-thumbnail?url=%2Foutputs%2FTest%2Ffull-resolution.png"
  );
  assert.equal(
    previewImageUrl("/uploads/reference.jpg?v=2"),
    "/api/media-thumbnail?url=%2Fuploads%2Freference.jpg%3Fv%3D2"
  );
});

test("existing thumbnails and remote images are preserved", () => {
  assert.equal(
    previewImageUrl({
      url: "/outputs/Test/full-resolution.png",
      thumbnailUrl: "/outputs/Test/thumbnails/full-resolution-preview.jpg"
    }),
    "/outputs/Test/thumbnails/full-resolution-preview.jpg"
  );
  assert.equal(previewImageUrl("https://example.com/image.png"), "https://example.com/image.png");
});

test("thumbnail context downloads point at the full-resolution image", () => {
  assert.deepEqual(
    fullResolutionImageProps({
      url: "/outputs/Test/full-resolution.png",
      thumbnailUrl: "/outputs/Test/thumbnails/full-resolution-preview.jpg",
      fileName: "final-image.png"
    }),
    {
      "data-full-resolution-url": "/outputs/Test/full-resolution.png",
      "data-full-resolution-file-name": "final-image.png"
    }
  );
});

test("thumbnail-only images do not expose a download target", () => {
  assert.deepEqual(
    fullResolutionImageProps("/outputs/Test/thumbnails/full-resolution-preview.jpg"),
    {}
  );
});

test("native image context menus temporarily expose the full-resolution source", () => {
  const attributes = new Map([
    ["src", "/api/media-thumbnail?url=%2Foutputs%2FTest%2Ffull-resolution.png"],
    ["data-full-resolution-url", "/outputs/Test/full-resolution.png"]
  ]);
  const image = {
    dataset: { fullResolutionUrl: "/outputs/Test/full-resolution.png" },
    getAttribute(name) {
      return attributes.get(name) || "";
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    }
  };

  assert.equal(prepareFullResolutionImageForNativeSave(image), true);
  assert.equal(attributes.get("src"), "/outputs/Test/full-resolution.png");
  assert.equal(attributes.get(fullResolutionContextPreparedAttribute), "true");
  assert.equal(
    attributes.get(fullResolutionPreviewSourceAttribute),
    "/api/media-thumbnail?url=%2Foutputs%2FTest%2Ffull-resolution.png"
  );

  assert.equal(restoreFullResolutionImagePreview(image), true);
  assert.equal(
    attributes.get("src"),
    "/api/media-thumbnail?url=%2Foutputs%2FTest%2Ffull-resolution.png"
  );
  assert.equal(attributes.has(fullResolutionContextPreparedAttribute), false);
  assert.equal(attributes.has(fullResolutionPreviewSourceAttribute), false);
});
