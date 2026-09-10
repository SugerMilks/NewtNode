export const characterVideoSheetPrompt = `Edit the provided Portrait image into one CU video reference sheet:

Study the reference image of the character and preserve the person's identity, physical features and proportions as closely as possible. It's important the image is realistic with natural skin texture and natural skin tones. Preserve only the skin detail and texture naturally visible in the reference image. Do not invent, exaggerate, sharpen, or outline pores, wrinkles, blemishes, facial lines, or other skin features that are not clearly present in the reference. Skin must not look plastic, waxy, airbrushed, porcelain, oily, overly smooth, glossy, synthetic, or digitally retouched. Avoid excessive specular highlights, HDR sheen, beauty-filter smoothing, and CG skin texture. High-end cinematic still frame, shot on ARRI Alexa 35, high quality prime lens, high dynamic range, atmospheric cinematography, subtle halation, very gentle lens bloom that does not soften identity-defining detail, fine film grain, realistic lens softness, imperfect real-camera texture, high production value, feature film look.

Create one clean character reference sheet containing exactly three panels and exactly three depictions of the same exact character on a consistent neutral studio background.

Follow this layout precisely:

- On the left, place two tall vertical wardrobe-reference panels side by side.
- The first panel shows the character's body and neutral foundation garment from the front, framed cleanly from the base of the neck through the feet. Head cropped out of frame.
- The second panel shows the same body and neutral foundation garment from the back, framed cleanly from the base of the neck through the feet. Head cropped out of frame.
- In both wardrobe panels, crop the composition at the base of the neck so the head is entirely outside the frame. Do not erase, detach, or distort the head or neck.
- Preserve the exact body proportions and neutral foundation garment consistently across both views.

- On the right, place one large 1:1 square close-up portrait of the character.
- Use the face view from the Portrait, keeping the precise same character. Preserve its exact facial geometry and existing detail; reframe it without redesigning the person.
- Use a subtle three-quarter portrait: rotate the head approximately 15 degrees away from the camera while keeping both eyes visible.
- Direct the eyes slightly off camera in the same straight on direction. The character must not look into the lens.
- Use a natural mid-speech expression with the mouth slightly open, relaxed facial muscles, and no exaggerated emotion.
- Preserve the character's identity precisely, including facial structure, hair, complexion, and defining physical features.

Each panel must contain exactly one view. Keep the layout clean, evenly spaced, and separated by very narrow white dividers. Do not generate additional views, duplicate characters, merged panels, comparison sheets, alternate wardrobes, text, labels, props, decorative frames, or borders.`;

export function characterVideoBaseReferences(portrait) {
  const portraitUrl = portrait?.localUrl || portrait?.url || "";
  if (!portraitUrl) throw new Error("Upload the original character portrait before creating its CU Video Sheet.");
  return [
    { url: portraitUrl, label: "Original Character Portrait; sole identity reference for the CU base" }
  ];
}

export const characterVideoBasicWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all three panels. Replace the current wardrobe with a minimal form-fitting plain black one-piece wardrobe, consistently represented in both body views and the visible neckline of the portrait. Do not show the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";

export const characterVideoWardrobePrompt =
  "Wardrobe rule: use exactly one outfit across all three panels. Study the selected wardrobe sheet reference and apply only its clothing design, garments, footwear, materials, colors, fit, and styling consistently to the character. If any person, model, face, body, skin, hair, pose, environment, background, text, or unrelated subject appears in the wardrobe reference, ignore it completely. Do not transfer that person's identity, anatomy, facial features, pose, body shape, or composition. The character portrait reference is the only source for character identity. Do not show the basic black outfit, the original wardrobe, alternate clothing, or a wardrobe comparison. No nudity; editorial fashion styling only.";

export const characterVideoCustomSheetWardrobePrompt =
  "Wardrobe rule: preserve exactly the one selected outfit visible in the supplied completed character sheet. Reconstruct its clothing, footwear, fit, materials, colors, and styling consistently in both body panels and the visible neckline of the portrait. Do not introduce alternate clothing or a wardrobe comparison.";

export { activeCharacterSheetVariant } from "./characterSheetLibrary.js";
import { characterOutputReference } from "./characterSheetLibrary.js";

export function characterVideoSheetForNode(node) {
  const reference = preferredCharacterReferenceForVideo(node);
  return reference?.usesCuVideoSheet ? reference : null;
}

export function preferredCharacterReferenceForVideo(node) {
  return characterOutputReference(node?.data, { video: true });
}
