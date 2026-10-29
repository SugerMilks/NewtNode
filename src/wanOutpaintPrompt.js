// VACE conditions on a completed-scene caption, rather than Seedance media tags.
export function wanOutpaintPrompt(prompt, plan) {
  const sides = [plan.top > 0 && "top", plan.top + plan.sourceHeight < plan.height && "bottom", plan.left > 0 && "left", plan.left + plan.sourceWidth < plan.width && "right"].filter(Boolean);
  const scene = String(prompt || "").replace(/@Video\d+\b/g, "the source footage").replace(/@Image\d+\b/g, "the reference image").trim();
  return [
    "A complete, continuous full-frame shot of the same scene as the source footage.",
    scene,
    `The environment continues naturally through the ${sides.join(" and ")} outer regions all the way to the canvas edges, with the same perspective, surface detail, lighting and exposure as the adjacent source picture.`,
    "The entire scene is already present from frame one and remains complete in every frame. Only the source action and camera motion continue; the surrounding scene follows their coherent motion and parallax."
  ].join("\n\n");
}

export function wanOutpaintNegativePrompt(value) {
  return ["letterboxing, borders, black bars, gray unfilled regions, transition, reveal, fade-in, wipe, progressive filling", String(value || "").trim()].filter(Boolean).join(", ");
}
