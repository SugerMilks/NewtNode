import { characterDefaultWardrobeId } from "./characterSheetLibrary.js";
import { normalizeCharacterSheetModel } from "./characterSheetModels.js";

export const characterBaseSheetPromptVersion = 2;
export const characterVideoSheetPromptVersion = 5;

export const characterNeutralBaseWardrobePrompt =
  "Foundation wardrobe rule: create the identity master without a designed wardrobe. Dress the character only in minimal, seamless, form-fitting, plain matte charcoal swimwear. For a male character, use men's Speedo-style swim briefs with no top. For a female character, use a one-piece swimsuit. Keep the same swimwear consistently across all views wherever it is visible within the existing panel crops; do not reframe a close-up to show the swimwear. Do not change the character's anatomy or body proportions to fit the garment. Do not add styling, branding, patterns, accessories, jewelry, hats, outerwear, layers, or fashion details. This is an anatomy and identity foundation, not a wardrobe look. No nudity.";

export const characterVideoNeutralBaseWardrobePrompt = characterNeutralBaseWardrobePrompt;

export const characterVideoIdentityContinuityPrompt =
  "Identity continuity rule: the Original Character Portrait image is the primary authority for the finished character's facial identity, facial structure, complexion, hair, age, body proportions, recognizable features, and visual treatment. Do not average, reinterpret, replace, beautify, or create a new likeness.";

export const characterWardrobeEditPrompt = `Edit the provided Base Identity Character Sheet. Treat that first image as the locked master image and preserve its exact canvas dimensions, panel layout, dividers, background, crop, camera views, poses, eyelines, facial identity, hair, skin, anatomy, body proportions, expressions, lighting, color treatment, texture, and image quality.

Change only the character's clothing, footwear, and requested wearable accessories. Study the selected wardrobe reference and transfer only its garments, materials, colors, construction, fit, footwear, and styling onto the locked character. Ignore every person, face, body, pose, environment, background, text, label, and unrelated object in the wardrobe reference. The Base Identity Character Sheet remains the sole authority for identity, anatomy, composition, and rendering.

Apply exactly one consistent wardrobe across all six views, including any clothing visible near the neckline in close-up panels. Replace the neutral foundation swimwear or existing reference garment completely wherever the selected outfit should cover the body. Do not redesign, reframe, relight, retouch, beautify, or regenerate any other part of the sheet. Do not add alternate outfits, comparisons, labels, text, borders, or extra views.`;

export const characterVideoWardrobeEditPrompt = `Edit the provided Base Identity CU Video Sheet. Treat that first image as the locked master image and preserve its exact canvas dimensions, panel layout, dividers, background, crop, camera views, poses, eyelines, facial identity, hair, skin, anatomy, body proportions, expressions, lighting, color treatment, texture, and image quality.

Change only the character's clothing, footwear, and requested wearable accessories. Study the selected wardrobe reference and transfer only its garments, materials, colors, construction, fit, footwear, and styling onto the locked character. Ignore every person, face, body, pose, environment, background, text, label, and unrelated object in the wardrobe reference. The Base Identity CU Video Sheet remains the sole authority for identity, anatomy, composition, and rendering.

Edit the exact Base Identity CU Video Sheet by changing only the wardrobe. Apply exactly one consistent wardrobe to both body panels and the clothing that would be visible in the closer panel. Replace the neutral foundation swimwear or existing reference garment completely wherever the selected outfit should cover the body. Seamlessly integrate the clothing onto the character. Keep the existing head crops unchanged; do not extend the body panels or reveal anything outside their current crops. Preserve the portrait's face, hair, head angle, eyeline, and expression exactly. Do not redesign, reframe, relight, retouch, beautify, or regenerate any other part of the sheet. Do not add alternate outfits, comparisons, labels, text, borders, or extra views.`;

export function characterBaseGenerationSignature(data = {}) {
  const portraitUrl = data.characterPortrait?.localUrl || data.characterPortrait?.url || "";
  return JSON.stringify({
    version: characterBaseSheetPromptVersion,
    portraitUrl,
    model: normalizeCharacterSheetModel(data.characterSheetModel),
    cinematic: Boolean(data.cinematicCharacterSheet),
    physicalDetails: String(data.characterPhysicalDetails || "").trim()
  });
}

export function characterBaseVideoGenerationSignature(data = {}) {
  return JSON.stringify({
    version: characterVideoSheetPromptVersion,
    portraitUrl: data.characterPortrait?.localUrl || data.characterPortrait?.url || "",
    model: normalizeCharacterSheetModel(data.characterSheetModel),
    physicalDetails: String(data.characterPhysicalDetails || "").trim()
  });
}

export function characterBaseVariant({ baseSheet, baseVideoSheet = null, baseSignature = "" } = {}) {
  if (!baseSheet?.url && !baseSheet?.localUrl) return null;
  return {
    wardrobeId: characterDefaultWardrobeId,
    wardrobeUrl: "",
    wardrobeFileName: "Base Identity",
    baseSignature,
    isBase: true,
    generated: baseSheet,
    ...(baseVideoSheet?.url || baseVideoSheet?.localUrl ? { videoGenerated: baseVideoSheet } : {})
  };
}

export async function generateCharacterBaseSheets({
  baseSheet = null,
  baseVideoSheet = null,
  baseSignature = "",
  baseVideoSignature = "",
  includeVideo = false,
  generateBase,
  generateVideo,
  onCheckpoint,
  onGenerationComplete = () => {}
}) {
  const checkpoint = () => onCheckpoint({
    characterBaseSheet: baseSheet,
    characterBaseSignature: baseSignature,
    characterBaseVideoSheet: baseVideoSheet,
    characterBaseVideoSignature: baseVideoSheet ? baseVideoSignature : ""
  });
  if (!(baseSheet?.url || baseSheet?.localUrl)) {
    baseSheet = await generateBase();
    await checkpoint();
    onGenerationComplete();
  }
  if (includeVideo && !(baseVideoSheet?.url || baseVideoSheet?.localUrl)) {
    baseVideoSheet = await generateVideo();
    await checkpoint();
    onGenerationComplete();
  }
  return { baseSheet, baseVideoSheet, baseVideoSignature: baseVideoSheet ? baseVideoSignature : "" };
}

export function characterWardrobeVariantIsCurrent(
  variant,
  wardrobe,
  baseSignature = "",
  { requireVideo = false, baseVideoSignature = "" } = {}
) {
  const wardrobeUrl = wardrobe?.localUrl || wardrobe?.url || "";
  if (!variant || variant.wardrobeId !== wardrobe?.id) return false;
  if ((variant.wardrobeUrl || "") !== wardrobeUrl) return false;
  if (requireVideo) {
    if (!(variant.videoGenerated?.url || variant.videoGenerated?.localUrl)) return false;
    if (baseVideoSignature) return variant.baseVideoSignature === baseVideoSignature;
    return Boolean(variant.baseSignature && variant.baseSignature === baseSignature);
  }
  return Boolean(
    (variant.generated?.url || variant.generated?.localUrl)
    && variant.baseSignature
    && variant.baseSignature === baseSignature
  );
}

export function characterWardrobeMaskRegions(sheetKind = "image") {
  if (sheetKind === "video") {
    return [
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0.78, width: 0.5, height: 0.22 }
    ];
  }

  return [
    { x: 0, y: 0.14, width: 0.47, height: 0.86 },
    { x: 0.47, y: 0.39, width: 0.53, height: 0.11 },
    { x: 0.47, y: 0.89, width: 0.53, height: 0.11 }
  ];
}

export function upsertCharacterWardrobeVariant(variants = [], nextVariant) {
  const withoutVariant = (Array.isArray(variants) ? variants : []).filter(
    (variant) => variant?.wardrobeId !== nextVariant?.wardrobeId
  );
  if (!nextVariant?.wardrobeId) return withoutVariant;
  const base = withoutVariant.filter((variant) => variant?.wardrobeId === characterDefaultWardrobeId);
  const wardrobes = withoutVariant.filter((variant) => variant?.wardrobeId !== characterDefaultWardrobeId);
  return nextVariant.wardrobeId === characterDefaultWardrobeId
    ? [nextVariant, ...wardrobes]
    : [...base, ...wardrobes, nextVariant];
}
