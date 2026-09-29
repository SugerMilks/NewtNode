import { characterDefaultWardrobeId } from "./characterSheetLibrary.js";
import { normalizeCharacterSheetModel } from "./characterSheetModels.js";

export const characterBaseSheetPromptVersion = 2;
export const characterVideoSheetPromptVersion = 5;

export const characterNeutralBaseWardrobePrompt =
  "Foundation wardrobe rule: create the identity master without a designed wardrobe. Dress the character only in simple, seamless, form-fitting, plain matte charcoal swimwear. For a male character, use men's tight swim trunks with a matching opaque, form-fitting tank top that fully covers the chest, abdomen, and back. For a female character, use a one-piece swimsuit. Keep the same foundation clothing consistently across all views wherever it is visible within the existing panel crops; do not reframe a close-up to show the clothing. Do not change the character's anatomy or body proportions to fit the garment. Do not add styling, branding, patterns, accessories, jewelry, hats, outerwear, additional layers, or fashion details. This is an anatomy and identity foundation, not a wardrobe look. No nudity.";

export const characterVideoNeutralBaseWardrobePrompt = characterNeutralBaseWardrobePrompt;

export const characterVideoIdentityContinuityPrompt =
  "Identity continuity rule: the Original Character Portrait image is the primary authority for the finished character's facial identity, facial structure, complexion, hair, age, body proportions, recognizable features, and visual treatment. Do not average, reinterpret, replace, beautify, or create a new likeness.";

const characterWardrobeTransferPrompt = `Change only the character's clothing, footwear, and referenced wearable accessories, including the local occlusion and contact shadows needed to wear them naturally. Study the selected wardrobe reference as the complete outfit: transfer its garments, materials, colors, construction, fit, footwear, and wearable accessories. Accessories visible in that reference are explicitly requested even when no accompanying text names them. Include hats, caps, glasses, sunglasses, and other headwear or eyewear whether shown separately in a flat lay or worn by a person. Ignore the reference person's identity, face, body, pose, environment, background, text, labels, and unrelated objects, not the accessories they are wearing.

Headwear and eyewear are part of the outfit in every view where their wearing position is visible, including close-ups. Match their shape, placement, material, color, and lens tint/opacity consistently. Wear hats on the head and separately displayed glasses or sunglasses over the eyes by default, unless the reference explicitly shows a different wearing position. Do not omit eyewear, move it onto the forehead, or hold it in a hand just to uncover the base's eyes; do not substitute clear lenses for referenced sunglasses. Keep distinct accessories separate: do not merge, hybridize, or substitute one for another. When goggles are mounted on a hat or helmet and separate glasses or sunglasses are also supplied, keep the goggles mounted as shown and wear the separate eyewear over the eyes, rather than merging them or stacking both over the eyes. Referenced headwear may naturally cover hair, and eyewear may naturally cover the eyes or parts of the face. Preserve the underlying facial identity, anatomy, hairstyle, head angle, eyeline, and expression, not the visibility of pixels covered by an accessory. The bare head or uncovered eyes of the base are not instructions to leave accessories off. Keep the existing panel crops: show only the portion of an accessory that falls within each crop, never zoom out or reposition the character to reveal it. Do not invent garments or accessories absent from the reference.`;

export const characterWardrobeEditPrompt = `Edit the provided Base Identity Character Sheet. Treat that first image as the locked master image and preserve its exact canvas dimensions, panel layout, dividers, background, crop, camera views, poses, eyelines, facial identity, underlying hair and skin, anatomy, body proportions, expressions, lighting, color treatment, texture, and image quality. Allow only the wardrobe and accessory changes specified below. The Base Identity Character Sheet remains the sole authority for identity, anatomy, composition, and rendering.

${characterWardrobeTransferPrompt}

Apply exactly one complete, consistent outfit across all six views, including clothing visible near the neckline in close-up panels. The wardrobe reference is a single layered outfit, not a menu of alternatives: wear its inner layers, outerwear, footwear, and wearable accessories together in every view where visible. If the reference includes a coat or jacket, keep it on in both body panels and the close-ups; do not show coat-off alternatives or different stages of dressing. Replace the neutral foundation swimwear or existing reference garment completely wherever the selected outfit should cover the body. Return one complete, seamless sheet with naturally connected heads, necks, shoulders, and clothing, never an isolated edit patch or pasted face cutouts. Do not redesign, reframe, relight, retouch, beautify, or regenerate any other part of the sheet. Do not add alternate outfits, comparisons, labels, text, borders, or extra views.`;

export const characterVideoWardrobeEditPrompt = `Edit the provided Base Identity CU Video Sheet. Treat that first image as the locked master image and preserve its exact canvas dimensions, panel layout, dividers, background, crop, camera views, poses, eyelines, facial identity, underlying hair and skin, anatomy, body proportions, expressions, lighting, color treatment, texture, and image quality. Allow only the wardrobe and accessory changes specified below. The Base Identity CU Video Sheet remains the sole authority for identity, anatomy, composition, and rendering.

${characterWardrobeTransferPrompt}

Edit the exact Base Identity CU Video Sheet by changing only the wardrobe and referenced wearable accessories. Apply exactly one complete, consistent outfit to both body panels and the closer panel wherever visible. The wardrobe reference is a single layered outfit, not a menu of alternatives: wear its inner layers, outerwear, footwear, and wearable accessories together in every view where visible. If the reference includes a coat or jacket, keep it on in both body panels and the close-up; do not show coat-off alternatives or different stages of dressing. Replace the neutral foundation swimwear or existing reference garment completely wherever the selected outfit should cover the body. Return one complete, seamless sheet with naturally connected heads, necks, shoulders, and clothing, never an isolated edit patch or pasted face cutouts. Keep the existing head crops unchanged; do not extend the body panels or reveal anything outside their current crops. Do not redesign, reframe, relight, retouch, beautify, or regenerate any other part of the sheet. Do not add alternate outfits, comparisons, labels, text, borders, or extra views.`;

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
