export const characterVideoSheetPrompt = `Make one image:

Study the reference image of the character and preserve the person's identity, physical features, body proportions, and selected wardrobe as closely as possible. The result must look realistic and authentic, with natural skin texture, true-to-life skin tones, fine detail, subtle film grain, and restrained cinematic finishing. Photograph the character with the appearance of a real cinema camera and a high-quality 35mm prime lens, high dynamic range, natural lens softness, and feature-film production quality.

Create one clean character reference sheet containing exactly three panels and exactly three depictions of the same character on a consistent neutral studio background.

Follow this layout precisely:

- On the left, place two tall vertical wardrobe-reference panels side by side.
- The first panel shows the character's selected wardrobe from the front, framed cleanly from the base of the neck through the feet.
- The second panel shows the same selected wardrobe from the back, framed cleanly from the base of the neck through the feet.
- In both wardrobe panels, crop the composition at the base of the neck so the head is entirely outside the frame. Do not erase, detach, or distort the head or neck.
- Preserve the exact clothing, footwear, fit, materials, proportions, and wardrobe details across both views.

- On the right, place one large 1:1 square close-up portrait of the character.
- Use a subtle three-quarter portrait: rotate the head approximately 15 degrees away from the camera while keeping both eyes visible.
- Direct the eyes slightly farther off camera in the same direction. The character must not look into the lens.
- Use a natural mid-speech expression with the mouth slightly open, relaxed facial muscles, and no exaggerated emotion.
- Preserve the character's identity precisely, including facial structure, hair, complexion, and defining physical features.

Each panel must contain exactly one view. Keep the layout clean, evenly spaced, and separated by narrow white dividers. Do not generate additional views, duplicate characters, merged panels, comparison sheets, alternate wardrobes, text, labels, props, decorative frames, or borders.`;

export const characterVideoBasicWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all three panels. Replace the current wardrobe with a minimal form-fitting plain black one-piece wardrobe, consistently represented in both body views and the visible neckline of the portrait. Do not show the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";

export const characterVideoWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all three panels. Study the selected wardrobe sheet reference and apply only its clothing design, garments, footwear, materials, colors, fit, and styling consistently to the character. If any person, model, face, body, skin, hair, pose, environment, background, text, or unrelated subject appears in the wardrobe reference, ignore it completely. Do not transfer that person's identity, anatomy, facial features, pose, body shape, or composition. The character portrait reference is the only source for character identity. Do not show the basic black outfit, the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";

export const characterVideoCustomSheetWardrobePrompt =
  "Wardrobe rule: preserve exactly the one selected outfit visible in the supplied completed character sheet. Reconstruct its clothing, footwear, fit, materials, colors, and styling consistently in both body panels and the visible neckline of the portrait. Do not introduce alternate clothing or a wardrobe comparison.";

const defaultWardrobeId = "__default-wardrobe__";

export function activeCharacterSheetVariant(data = {}) {
  const targetId = data.activeWardrobeId || defaultWardrobeId;
  const variants = Array.isArray(data.characterSheetVariants) ? data.characterSheetVariants : [];
  return variants.find((variant) => variant?.wardrobeId === targetId) || variants[0] || null;
}

export function characterVideoSheetForNode(node) {
  if (!node?.data?.cuVideoGeneration) return null;
  return activeCharacterSheetVariant(node.data)?.videoGenerated || null;
}

export function preferredCharacterReferenceForVideo(node) {
  const videoSheet = characterVideoSheetForNode(node);
  if (videoSheet?.url) return { ...videoSheet, usesCuVideoSheet: true };

  const imageSheet = activeCharacterSheetVariant(node?.data)?.generated;
  const fallbackUrl = imageSheet?.url || node?.data?.resultUrl || "";
  return fallbackUrl
    ? { ...(imageSheet || {}), url: fallbackUrl, usesCuVideoSheet: false }
    : null;
}
