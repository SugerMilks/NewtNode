export const filmDirectorStyleDirectionMaxChars = 900;

export function filmDirectorStyleDirectionDirective() {
  return [
    `Style Direction must be a focused production brief of 3-6 concise sentences and no more than ${filmDirectorStyleDirectionMaxChars} characters.`,
    "Describe the visible cinematic look and emotional tone: capture medium, color palette and grade, lighting quality, contrast and exposure, texture, atmosphere, image finish, and grounded performance texture.",
    "Cinema-camera and lens language is welcome when it defines the visual treatment, including prime-lens softness, depth of field, bloom, halation, grain, haze, and lens-edge character.",
    "For cinematic live-action material, use concrete language in this family when appropriate: High-end cinematic scene, shot on cinema camera, soft prime lens. Based off of a 24fps film. Atmospheric visuals with subtle halation. Realistic low contrast and muted color grade. Shallow depth of field, gentle lens bloom, 35mm film grain, realistic lens edge distortions, atmospheric haze, classic film look.",
    "Adapt that language to the selected style and scene rather than repeating it mechanically.",
    "Do not include camera movement or placement, shot-by-shot framing, blocking, action choreography, plot summary, editorial instructions, metaphor, or poetic non-literal direction. Those belong in Camera Direction, Scene Overview, or the Shot List."
  ].join(" ");
}

export function compactFilmDirectorStyleDirection(value = "") {
  const source = String(value || "")
    .replace(/^STYLE_DIRECTION:\s*/i, "")
    .replace(/^Style Direction:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (source.length <= filmDirectorStyleDirectionMaxChars) return source;

  const clipped = source.slice(0, filmDirectorStyleDirectionMaxChars);
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? ")
  );
  const wordBoundary = clipped.lastIndexOf(" ");
  const boundary = sentenceBoundary >= filmDirectorStyleDirectionMaxChars * 0.55
    ? sentenceBoundary + 1
    : wordBoundary;
  return clipped.slice(0, boundary > 0 ? boundary : clipped.length).trim();
}
