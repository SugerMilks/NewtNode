import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectOutputItems } from "../src/projectOutputs.js";

test("project outputs preserve lightweight thumbnails for generated images", () => {
  const items = buildProjectOutputItems({
    nodes: [{
      id: "image-model-1",
      type: "imageModel",
      data: {
        title: "Image Model",
        resultUrl: "/outputs/project/full.png",
        resultItems: [{
          url: "/outputs/project/full.png",
          thumbnailUrl: "/outputs/project/full-preview.jpg",
          type: "image"
        }]
      }
    }],
    history: [],
    projectId: "project-1",
    projectName: "Project",
    getNodeResultMediaType: () => "image"
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, "/outputs/project/full.png");
  assert.equal(items[0].thumbnailUrl, "/outputs/project/full-preview.jpg");
});

test("history outputs use the matching thumbnail without replacing the full asset URL", () => {
  const items = buildProjectOutputItems({
    nodes: [],
    history: [{
      id: "history-1",
      mediaType: "image",
      project: { id: "project-1", name: "Project" },
      localImage: "/outputs/project/history.png",
      localThumbnail: "/outputs/project/history-preview.jpg"
    }],
    projectId: "project-1",
    projectName: "Project",
    getNodeResultMediaType: () => ""
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, "/outputs/project/history.png");
  assert.equal(items[0].thumbnailUrl, "/outputs/project/history-preview.jpg");
});
