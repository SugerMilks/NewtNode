import { nonHumanCharacterIdentityPrompt } from "./characterNonHuman.js";

export const characterAutoWardrobeId = "__auto-wardrobe__";

export function isAutoCharacterWardrobe(wardrobe) {
  return wardrobe?.id === characterAutoWardrobeId;
}

export function characterWardrobesForGeneration(data = {}) {
  const uploaded = Array.isArray(data.characterWardrobes) ? data.characterWardrobes : [];
  const portrait = data.characterPortrait;
  if (data.autoWardrobe !== true || !(portrait?.localUrl || portrait?.url)) return uploaded;
  return [{ ...portrait, id: characterAutoWardrobeId, fileName: "Auto Wardrobe" }, ...uploaded];
}

export function characterAutoWardrobePrompt({ video = false, nonHuman = false } = {}) {
  const sheet = video ? "Base Identity CU Video Sheet" : "Base Identity Character Sheet";
  return [
    `Edit the provided ${sheet}. The first image is the locked identity master: preserve its character identity, anatomy, proportions, visual medium, rendering, canvas dimensions, panel layout, dividers, background, lighting, camera views, poses, expressions, and crops. Change only clothing, footwear, and wearable accessories, with the local occlusion and contact shadows required to wear them. Return one complete seamless sheet, not edit patches or pasted face cutouts.`,
    video
      ? "The second image is the completed Auto Wardrobe character sheet. Use it ONLY as the finished outfit reference, not as a source of identity, pose, layout, or face crops. Copy the same garments, layering, colors, materials, fit, shoes, and accessories exactly wherever visible. Do not invent another outfit, redesign the inferred shoes, or import its panel arrangement. Ignore every face, facial expression, camera view and composition in the second image. Its full-body views with heads are NOT a template for the CU sheet."
      : "The second image is the original uploaded portrait. Visually analyze only its worn wardrobe: garments, layers, neckline, fabric, color palette, patterns, silhouette, fit, era, level of formality, and visible accessories. Preserve all clearly visible outfit details rather than replacing them with a generic look. Complete just the unseen portions into one coherent head-to-toe outfit, including coordinated lower-body clothing and a suitable matching pair of shoes when the anatomy supports footwear. If shoes are visible, reproduce them; otherwise infer footwear consistent with the shown outfit's style, materials, palette, era, setting, and practicality. Do not merely copy the portrait's crop. When little clothing is visible, infer one restrained, cohesive outfit from the available cues; do not claim unseen details were present in the portrait. Ignore the portrait's background, props, pose, crop, and lighting.",
    "Preserve visible hats, caps, glasses, sunglasses, jewelry and other worn accessories, including their placement, shape, colors and lens tint/opacity. Keep separate headwear and eyewear distinct. Do not remove accessories just to expose the face or eyes, and do not invent extra logos, text, hats, eyewear, jewelry, or unrelated props. Accessory occlusion may change visible pixels but not underlying identity. Never zoom or reposition a panel to reveal an accessory outside its crop.",
    nonHuman
      ? `${nonHumanCharacterIdentityPrompt} Fit the outfit to the existing species and body plan, never the body to clothing. Preserve natural coverings and integral armor. Include footwear only where compatible with the existing feet; never invent human feet, hands, legs, or a torso to dress the character. Retain a naturally unclothed design when no clothing is shown and clothing would contradict its design.`
      : "Keep the master's underlying facial features, hair, skin detail, body shape, and age unchanged. Use appropriate opaque coverage. No nudity.",
    video ? "CU MASTER CROP LOCK: This is a wardrobe-only edit of IMAGE ONE, not a new character-sheet generation. Keep its exact three-panel arrangement and subject scale. In the two left body panels, reproduce the first image's exact top-edge crops: if the heads are outside those crops, they MUST remain outside them. Never zoom out, shrink the bodies, extend the frame or add heads to imitate IMAGE TWO. Keep the front and back views as front and back. The large right close-up must keep IMAGE ONE's original head angle, eyeline, mouth position and expression; do not replace it with a frontal portrait or a closed-mouth expression from IMAGE TWO. Only clothing inside those existing boundaries changes." : "",
    `Apply exactly one consistent layered outfit across all ${video ? "three" : "six"} views, including outerwear and clothing visible in close-ups. Replace the base's foundation clothing wherever the outfit should cover it. Keep the same shoes in every body view, with natural left/right orientation. Preserve all existing crops${video ? ", including the head crops in the two body panels" : ""}; do not extend them to reveal clothing. No outfit alternatives, comparisons, extra views, masks, labels, borders, or changes to unrelated areas.`
  ].join("\n\n");
}
