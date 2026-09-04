import test from "node:test";
import assert from "node:assert/strict";

import {
  activeCharacterSheetId,
  activeCharacterSheetVariant,
  characterSheetChoices,
  customCharacterSheetId,
  generatedCharacterSheetId,
  normalizeCharacterCustomSheets
} from "../src/characterSheetLibrary.js";

function libraryData(patch = {}) {
  return {
    activeWardrobeId: "wardrobe-blue",
    characterSheetVariants: [
      { wardrobeId: "wardrobe-black", wardrobeFileName: "Black", generated: { url: "/outputs/black.png" } },
      { wardrobeId: "wardrobe-blue", wardrobeFileName: "Blue", generated: { url: "/outputs/blue.png" } }
    ],
    characterCustomSheets: [
      { id: "custom-one", fileName: "Client Sheet.png", localUrl: "/uploads/client-sheet.png" },
      { id: "custom-two", fileName: "Alt Sheet.png", localUrl: "/uploads/alt-sheet.png" }
    ],
    ...patch
  };
}

test("generated and custom character sheets coexist as selectable choices", () => {
  const choices = characterSheetChoices(libraryData());
  assert.deepEqual(choices.map((choice) => choice.source), ["generated", "generated", "custom", "custom"]);
  assert.deepEqual(choices.map((choice) => choice.label), ["Black", "Blue", "Client Sheet.png", "Alt Sheet.png"]);
});

test("an explicitly selected custom sheet becomes the active full-resolution reference", () => {
  const data = libraryData({ activeCharacterSheetId: customCharacterSheetId("custom-two") });
  const active = activeCharacterSheetVariant(data);
  assert.equal(active.source, "custom");
  assert.equal(active.generated.url, "/uploads/alt-sheet.png");
  assert.equal(active.generated.localUrl, "/uploads/alt-sheet.png");
});

test("generated wardrobe selection remains the default for existing projects", () => {
  const data = libraryData();
  assert.equal(activeCharacterSheetId(data), generatedCharacterSheetId("wardrobe-blue"));
  assert.equal(activeCharacterSheetVariant(data).generated.url, "/outputs/blue.png");
});

test("legacy single custom overrides migrate into the custom library without replacing generations", () => {
  const data = libraryData({
    useCustomCharacterSheet: true,
    customCharacterSheet: { fileName: "Legacy.png", localUrl: "/uploads/legacy.png" },
    characterCustomSheets: []
  });
  const sheets = normalizeCharacterCustomSheets(data);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].localUrl, "/uploads/legacy.png");
  assert.equal(activeCharacterSheetVariant(data).generated.url, "/uploads/legacy.png");
  assert.equal(characterSheetChoices(data).length, 3);
});

test("legacy override does not appear twice when it was stored as a generated variant", () => {
  const legacyUrl = "/uploads/legacy.png";
  const data = {
    useCustomCharacterSheet: true,
    customCharacterSheet: { fileName: "Legacy.png", localUrl: legacyUrl },
    characterSheetVariants: [
      {
        wardrobeId: "__default-wardrobe__",
        wardrobeFileName: "Default wardrobe",
        generated: { url: legacyUrl, localUrl: legacyUrl }
      }
    ]
  };

  const choices = characterSheetChoices(data);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].source, "custom");
  assert.equal(choices[0].item.localUrl, legacyUrl);
});

test("the neutral generated foundation is labeled as Base Identity", () => {
  const choices = characterSheetChoices({
    characterSheetVariants: [{
      wardrobeId: "__default-wardrobe__",
      wardrobeFileName: "Default black wardrobe",
      generated: { url: "/outputs/base.png" }
    }]
  });
  assert.equal(choices[0].label, "Base Identity");
  assert.equal(choices[0].isBase, true);
});

test("a locally restored Base Identity remains selectable", () => {
  const choices = characterSheetChoices({
    characterSheetVariants: [{
      wardrobeId: "__default-wardrobe__",
      generated: { localUrl: "/outputs/restored-base.png" }
    }]
  });
  assert.equal(choices.length, 1);
  assert.equal(choices[0].item.url, "/outputs/restored-base.png");
});
