import test from "node:test";
import assert from "node:assert/strict";

import {
  characterVideoSheetPrompt,
  characterVideoBaseReferences,
  preferredCharacterReferenceForVideo
} from "../src/characterVideoSheets.js";
import { characterVideoIdentityContinuityPrompt, characterVideoNeutralBaseWardrobePrompt, characterVideoWardrobeEditPrompt } from "../src/characterSheetWorkflow.js";

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

test("CU generation uses the original portrait while wardrobe edits preserve the CU master face", () => {
  assert.match(characterVideoIdentityContinuityPrompt, /Original Character Portrait image is the primary authority/i);
  assert.match(characterVideoIdentityContinuityPrompt, /Do not average, reinterpret, replace/i);
  assert.match(characterVideoSheetPrompt, /Edit the provided Portrait image/i);
  assert.match(characterVideoSheetPrompt, /Use the face view from the Portrait/i);
  assert.match(characterVideoSheetPrompt, /ARRI Alexa 35/i);
  assert.match(characterVideoNeutralBaseWardrobePrompt, /For a female character, use a one-piece swimsuit/i);
  assert.match(characterVideoNeutralBaseWardrobePrompt, /For a male character, use men's Speedo-style swim briefs/i);
  assert.match(characterVideoWardrobeEditPrompt, /neutral foundation swimwear or existing reference garment/i);
  assert.doesNotMatch([characterVideoSheetPrompt, characterVideoIdentityContinuityPrompt].join(" "), /Base Identity Character Sheet|layout conversion|supporting identity check/i);
  assert.match(characterVideoWardrobeEditPrompt, /Base Identity CU Video Sheet remains the sole authority/i);
  assert.match(characterVideoWardrobeEditPrompt, /Preserve the portrait's face, hair, head angle, eyeline, and expression exactly/i);
  assert.doesNotMatch(characterVideoWardrobeEditPrompt, /Matching Full Character Sheet|Original Character Portrait/i);
});

test("CU requests use only the full-resolution original portrait", () => {
  const references = characterVideoBaseReferences({
    localUrl: "/uploads/portrait.png",
    url: "https://provider.example/portrait.png",
    thumbnailUrl: "/thumbnails/portrait.jpg"
  });
  assert.deepEqual(references.map((item) => item.url), ["/uploads/portrait.png"]);
  assert.match(references[0].label, /Original Character Portrait; sole identity reference/i);
});

test("CU creation requires a portrait, not a regular base or thumbnail", () => {
  assert.throws(() => characterVideoBaseReferences(null), /Upload the original character portrait/);
  assert.throws(() => characterVideoBaseReferences({ thumbnailUrl: "/thumb.jpg" }), /Upload the original character portrait/);
  assert.equal(characterVideoBaseReferences({ url: "/portrait.png" })[0].url, "/portrait.png");
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
