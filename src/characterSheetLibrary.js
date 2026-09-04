export const characterDefaultWardrobeId = "__default-wardrobe__";

const generatedPrefix = "generated:";
const customPrefix = "custom:";

export function generatedCharacterSheetId(wardrobeId = "") {
  return `${generatedPrefix}${wardrobeId || characterDefaultWardrobeId}`;
}

export function customCharacterSheetId(sheetId = "") {
  return sheetId ? `${customPrefix}${sheetId}` : "";
}

export function normalizeCharacterCustomSheets(data = {}) {
  const sheets = Array.isArray(data.characterCustomSheets) ? data.characterCustomSheets : [];
  const legacySheet = data.customCharacterSheet?.localUrl || data.customCharacterSheet?.url
    ? [{ ...data.customCharacterSheet, id: data.customCharacterSheet.id || "legacy-custom-sheet" }]
    : [];
  const seen = new Set();

  const variants = Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [];

  return [...sheets, ...legacySheet]
    .filter((sheet) => sheet && (sheet.localUrl || sheet.url))
    .map((sheet, index) => {
      const url = sheet.localUrl || sheet.url || "";
      const legacyVariant = variants.find((variant) => variant?.generated?.url === url);
      return {
        ...sheet,
        id: sheet.id || `custom-sheet-${index + 1}`,
        mediaType: "image",
        ...(sheet.videoGenerated || !legacyVariant?.videoGenerated ? {} : { videoGenerated: legacyVariant.videoGenerated })
      };
    })
    .filter((sheet) => {
      const key = sheet.id || sheet.localUrl || sheet.url;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function customCharacterSheetVariant(sheet) {
  if (!sheet) return null;
  const url = sheet.url || sheet.localUrl || "";
  if (!url) return null;
  const selectionId = customCharacterSheetId(sheet.id);
  return {
    sheetId: selectionId,
    source: "custom",
    wardrobeId: selectionId,
    wardrobeUrl: "",
    wardrobeFileName: sheet.fileName || "Custom character sheet",
    generated: {
      ...sheet,
      url,
      localUrl: sheet.localUrl || url,
      type: "image",
      mediaType: "image",
      label: sheet.label || sheet.fileName || "Custom character sheet"
    },
    ...(sheet.videoGenerated?.url ? { videoGenerated: sheet.videoGenerated } : {})
  };
}

export function characterSheetVariantForSelection(data = {}, selectionId = "") {
  const variants = Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [];
  const customSheets = normalizeCharacterCustomSheets(data);

  if (selectionId.startsWith(customPrefix)) {
    const sheetId = selectionId.slice(customPrefix.length);
    return customCharacterSheetVariant(customSheets.find((sheet) => sheet.id === sheetId));
  }

  if (selectionId.startsWith(generatedPrefix)) {
    const wardrobeId = selectionId.slice(generatedPrefix.length) || characterDefaultWardrobeId;
    return variants.find((variant) => variant?.wardrobeId === wardrobeId) || null;
  }

  return null;
}

export function activeCharacterSheetId(data = {}) {
  const explicitId = String(data.activeCharacterSheetId || "");
  if (explicitId && characterSheetVariantForSelection(data, explicitId)) return explicitId;

  if (data.useCustomCharacterSheet && normalizeCharacterCustomSheets(data)[0]) {
    return customCharacterSheetId(normalizeCharacterCustomSheets(data)[0].id);
  }

  const variants = Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [];
  const preferredWardrobeId = data.activeWardrobeId || characterDefaultWardrobeId;
  const preferredVariant = variants.find((variant) => variant?.wardrobeId === preferredWardrobeId) || variants[0];
  if (preferredVariant) return generatedCharacterSheetId(preferredVariant.wardrobeId);

  const firstCustomSheet = normalizeCharacterCustomSheets(data)[0];
  return firstCustomSheet ? customCharacterSheetId(firstCustomSheet.id) : "";
}

export function activeCharacterSheetVariant(data = {}) {
  const selected = characterSheetVariantForSelection(data, activeCharacterSheetId(data));
  if (selected) return selected;

  const variants = Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [];
  return variants[0] || customCharacterSheetVariant(normalizeCharacterCustomSheets(data)[0]);
}

export function characterSheetChoices(data = {}) {
  const customSheets = normalizeCharacterCustomSheets(data);
  const customUrls = new Set(
    customSheets.flatMap((sheet) => [sheet.localUrl, sheet.url].filter(Boolean))
  );
  const generated = (Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [])
    .filter((variant) => variant?.generated?.url || variant?.generated?.localUrl)
    .filter((variant) => {
      const generatedUrl = variant.generated.localUrl || variant.generated.url;
      return !customUrls.has(generatedUrl);
    })
    .map((variant) => ({
      id: generatedCharacterSheetId(variant.wardrobeId),
      source: "generated",
      isBase: variant.wardrobeId === characterDefaultWardrobeId || Boolean(variant.isBase),
      label: variant.wardrobeId === characterDefaultWardrobeId || variant.isBase
        ? "Base Identity"
        : variant.wardrobeFileName || "Generated character sheet",
      variant,
      item: {
        ...variant.generated,
        url: variant.generated.url || variant.generated.localUrl
      }
    }));
  const custom = customSheets
    .map((sheet) => {
      const variant = customCharacterSheetVariant(sheet);
      return {
        id: customCharacterSheetId(sheet.id),
        source: "custom",
        label: sheet.fileName || "Custom character sheet",
        sheet,
        variant,
        item: variant?.generated
      };
    })
    .filter((choice) => choice.item?.url);

  return [...generated, ...custom];
}
