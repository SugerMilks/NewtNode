import test from "node:test";
import assert from "node:assert/strict";

import {
  characterVideoSheetPrompt,
  preferredCharacterReferenceForVideo
} from "../src/characterVideoSheets.js";

function characterNode({ enabled = true, includeVideo = true } = {}) {
  return {
    type: "character",
    data: {
      cuVideoGeneration: enabled,
      activeWardrobeId: "wardrobe-blue",
      resultUrl: "/outputs/character-standard-fallback.png",
      characterSheetVariants: [
        {
          wardrobeId: "wardrobe-black",
          generated: { url: "/outputs/character-black-image.png" },
          videoGenerated: { url: "/outputs/character-black-video.png" }
        },
        {
          wardrobeId: "wardrobe-blue",
          generated: { url: "/outputs/character-blue-image.png" },
          ...(includeVideo ? { videoGenerated: { url: "/outputs/character-blue-video.png" } } : {})
        }
      ]
    }
  };
}

test("CU video sheet prompt fixes the requested three-panel layout and off-camera portrait", () => {
  assert.match(characterVideoSheetPrompt, /exactly three panels/i);
  assert.match(characterVideoSheetPrompt, /base of the neck through the feet/i);
  assert.match(characterVideoSheetPrompt, /from the back/i);
  assert.match(characterVideoSheetPrompt, /approximately 15 degrees away/i);
  assert.match(characterVideoSheetPrompt, /must not look into the lens/i);
  assert.match(characterVideoSheetPrompt, /mouth slightly open/i);
});

test("video generation prefers the active wardrobe CU sheet when enabled", () => {
  const reference = preferredCharacterReferenceForVideo(characterNode());
  assert.equal(reference.url, "/outputs/character-blue-video.png");
  assert.equal(reference.usesCuVideoSheet, true);
});

test("image sheet remains the video fallback when CU generation is disabled", () => {
  const reference = preferredCharacterReferenceForVideo(characterNode({ enabled: false }));
  assert.equal(reference.url, "/outputs/character-blue-image.png");
  assert.equal(reference.usesCuVideoSheet, false);
});

test("older saved characters without a CU sheet remain video-compatible", () => {
  const reference = preferredCharacterReferenceForVideo(characterNode({ includeVideo: false }));
  assert.equal(reference.url, "/outputs/character-blue-image.png");
  assert.equal(reference.usesCuVideoSheet, false);
});

test("a selected custom sheet is passed to video generation without deleting generated variants", () => {
  const node = characterNode();
  node.data.activeCharacterSheetId = "custom:client-sheet";
  node.data.characterCustomSheets = [{
    id: "client-sheet",
    fileName: "Client Sheet.png",
    localUrl: "/uploads/client-sheet.png"
  }];
  const reference = preferredCharacterReferenceForVideo(node);
  assert.equal(reference.url, "/uploads/client-sheet.png");
  assert.equal(reference.usesCuVideoSheet, false);
  assert.equal(node.data.characterSheetVariants.length, 2);
});
