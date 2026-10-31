export const nonHumanCharacterIdentityPrompt = "Preserve the reference character's species, recognizable design, silhouette, proportions, posture, markings, surface materials, and exact number and arrangement of limbs, eyes, heads, and other appendages. Keep any existing fur, feathers, scales, horns, wings, tails, claws, shells, or fantasy features consistent across views. Do not humanize the character, normalize its anatomy to a human template, remove unusual features, or invent missing facial features or appendages.";

const renderingPrompt = "Preserve the reference's visual medium and degree of stylization, whether photographic, illustrated, animated, sculpted, or fantastical. Do not force photorealism, human skin texture, human skin tones, pores, or a realistic human face onto the design. Render fine detail only when appropriate to the original material and style.";
const cinematicPrompt = "Use polished cinematic lighting, controlled highlights, clear dimensional form, and a cohesive film-quality finish appropriate to the reference's own medium. Cinematic treatment must not change species, exaggeration, materials, or stylization.";
const foundationPrompt = "Foundation wardrobe rule: preserve natural surface coverage and integral design features. For an animal or other naturally unclothed non-humanoid, retain its natural covering; do not force swimwear, shoes, or human clothing onto it. For a clothed or humanoid design needing coverage, use simple opaque matte charcoal foundation clothing adapted to its existing body. Do not infer male or female human anatomy or change the body to fit a garment. Keep coverage consistent across views. Do not treat fur, feathers, scales, shells, horns, or integral armor as removable clothing. No explicit anatomy, nudity, branding, or invented accessories.";
const grayBackgroundPrompt = "Use the same solid, evenly lit neutral gray background in every panel, targeting sRGB RGB(125, 125, 125), HEX #7D7D7D. Keep the exposed backdrop uniform, with no gradients, vignettes, texture, or color casts. Apply cinematic lighting and color treatment to the character without tinting, brightening, or darkening the backdrop. Keep the white spacing between panels white.";

export function nonHumanCharacterBasePrompt({ cinematic = false, video = false } = {}) {
  const layout = video
    ? `Create exactly three panels and exactly three depictions of the same character:
- On the left, place two tall body-reference panels side by side, one front view and one back view. Preserve the character's natural stance and appendage arrangement; never force a bipedal pose. Where its anatomy permits, crop the head out at the natural head/body junction without erasing or detaching it. If there is no distinct head or neck, keep the whole character instead of inventing a junction. Keep the remaining body, tail, wings, and extremities within the panel.
- On the right, place one large square identity close-up based on the original portrait, preserving its exact design and features. Use a subtle three-quarter angle only where the anatomy supports it. Keep the gaze slightly off-camera when eyes exist, without adding eyes or forcing both eyes into view. Suggest a gentle mid-speech expression only if the character has a mouth and its design supports this; otherwise retain its natural expression. For a faceless design, show its distinctive identity region without inventing a face.`
    : `Create exactly six panels and exactly six total depictions of the same character:
- On the left, place two tall full-body panels side by side: one front view, then one side profile. Preserve the natural stance, including quadrupedal or other non-bipedal posture. Fit the complete silhouette, tail, wings, horns, and extremities inside each panel with comfortable margins; do not change anatomy to fit.
- On the right, place four equal square identity close-ups in a clean 2 by 2 grid: top left is the left profile, top right is the right profile, bottom left is a front view with the character's natural neutral expression, and bottom right is a front view with a subtle talking expression only if the design has a mouth and supports it. Otherwise keep a natural expression. For a faceless design, use its distinctive identity region without inventing a face.`;
  return [
    video ? "Edit the provided Original Character Portrait into one CU video reference sheet of this non-human character."
      : "Make one horizontal character reference sheet from the provided portrait of this non-human character.",
    "The original portrait is the sole authority for identity and design. Do not average, reinterpret, replace, beautify, or create a new likeness.",
    nonHumanCharacterIdentityPrompt,
    renderingPrompt,
    cinematic || video ? cinematicPrompt : "",
    video ? "Use a consistent neutral studio background." : cinematic ? grayBackgroundPrompt : "Use a clean white background.",
    layout,
    "Each panel contains exactly one view only. Keep panels evenly spaced with narrow white dividers. Never add extra depictions, merged panels, alternate designs, comparison sheets, labels, text, props, decorative frames, or borders.",
    foundationPrompt
  ].filter(Boolean).join("\n\n");
}

export function nonHumanCharacterWardrobePrompt({ video = false } = {}) {
  const sheet = video ? "Base Identity CU Video Sheet" : "Base Identity Character Sheet";
  return `Edit the provided ${sheet}. Treat the first image as the locked master image and sole authority for identity, anatomy, composition, and rendering. Preserve its exact canvas dimensions, panel layout, dividers, background, crops, camera views, poses, expressions, lighting, color treatment, surface texture, and visual medium. Do not redraw or humanize the character.

${nonHumanCharacterIdentityPrompt}

Change only the clothing, footwear, and wearable accessories explicitly shown in the selected wardrobe reference. Ignore the wardrobe model's identity, species, anatomy, face, pose, background, and unrelated objects. Adapt the referenced garments to the existing body, never the body to the garments. Preserve natural surface coverage, integral shells or armor, appendages, and markings wherever they are not covered by the outfit. Do not invent a torso, hands, feet, eyes, ears, or other anatomy to accommodate clothing. Omit an anatomically incompatible item rather than altering the character.

Wear one complete, consistent layered outfit in all ${video ? "three" : "six"} views wherever visible, including outerwear and clothing visible within close-up crops. Replace the foundation clothing wherever the new outfit covers it. Include referenced hats, caps, glasses, sunglasses, and other wearable accessories without requiring extra text when the existing anatomy supports them. Preserve each accessory's shape, material, placement, color, and lens tint/opacity. Honor the reference's wearing position; keep helmet-mounted goggles separate from sunglasses over the eyes. Do not merge or substitute accessories, move eyewear to uncover the eyes, or replace tinted lenses with clear lenses. Allow natural occlusion and local contact shadows without changing underlying identity or anatomy. Never extend or reposition a panel crop to reveal an accessory.

Return one complete, seamless sheet, not isolated patches or pasted face cutouts. Do not redesign, reframe, relight, beautify, or regenerate unrelated areas. Keep existing head crops unchanged. Do not add alternate outfits, comparisons, labels, text, borders, or extra views.`;
}
