export const storyboardCameraPersonalities = ["Restrained", "Expressive", "Bold"];
export const normalizeStoryboardCameraPersonality = value => storyboardCameraPersonalities.includes(value) ? value : "Expressive";

export const storyboardCameraChoices = {
  shot: ["None", "CU", "MS", "WS", "ECU", "EWS"],
  lens: ["None", "8mm", "18mm", "35mm", "50mm", "85mm", "120mm"],
  angle: ["None", "Macro", "Low Angle", "High Angle", "Dutch Angle", "Extreme High", "Bird's Eye View", "Extreme Low", "Portrait", "Profile", "Selfie"]
};

const personalityDirection = {
  Restrained: "Use controlled, precise compositions: thoughtful camera distance, selective foreground layers, meaningful symmetry or negative space, and subtle changes in viewpoint. Favor natural perspective and level horizons unless the story or user explicitly calls for more. Restrained means intentional, not generic medium-shot coverage.",
  Expressive: "Give the sequence an authored visual personality. Use motivated changes of camera height and distance, near/far scale, layered foregrounds, off-center framing, strong leading lines, graphic symmetry or negative space to express each beat. Use wide-angle perspective or compressed longer-lens views when they strengthen the audience's relationship to the subject. Reserve Dutch angles and extreme distortion for an actual dramatic reason. Let quiet shots contrast with decisive visual accents.",
  Bold: "Make confident, heightened visual choices where the beat supports them: extreme low or high viewpoints, close wide-angle foreground scale, deep converging perspective, deliberate Dutch roll, graphic imbalance, claustrophobic crops or distant compressed observation. Describe the visible effect precisely. Balance these accents with quieter anchors; do not tilt or distort every shot. Boldness must clarify emotion or story information, not obscure it."
};

export function storyboardCinematographyPlanningPrompt(value) {
  const personality = normalizeStoryboardCameraPersonality(value);
  return `CAMERA PERSONALITY: ${personality}.
${personalityDirection[personality]}
Direct the audience's attention before selecting camera labels. Choose the viewpoint for the dramatic purpose: an ordered centered perspective can imply control; a low camera near a meaningful foreground object can magnify its threat; a distant long-lens view can feel observational; negative space can isolate or anticipate an entrance. These are possibilities, not required motifs or a checklist. Never invent props, events or architecture to obtain a composition.
For each shot, write concrete, drawable camera direction in the existing prompt (or shot description for a PDF import): camera height and distance, viewing direction, subject scale/placement, foreground-to-background relationship, and any intended optical effect. State the storytelling reason briefly in the existing purpose or production notes field. Do not return extra JSON fields. Lens labels alone do not determine perspective: establish camera position and subject distance. An 18mm close viewpoint differs from an 18mm distant wide view; longer-lens compression requires a more distant viewpoint with matching framing.
Explicit user-selected shot, lens and angle, authored shot descriptions and camera directions in a source script outrank personality. Only Auto/None settings are open for selection. Preserve every authored shot's content and order. During revisions, preserve existing camera choices unless the newest request asks to change cinematography. Never restyle unrelated panels. In review, do not fail an existing board merely for lacking visual variety or matching a different personality.
Use one coherent camera language across the scene, not random angles, obligatory lens cycling or mechanical wide/medium/close alternation. Same-shot opening/transition/ending panels retain their established camera unless scripted movement changes it. A new viewpoint must have matching camera-relative blocking, eyelines, visible places and cast; a Dutch roll is not an axis crossing. Keep established physical geography and all occupants whose places remain in view. Do not erase a listener to make a composition cleaner.
Rendering and composition are separate. Minimal black-and-white line art can still have bold perspective, foreshortening, graphic foreground shapes and expressive staging. Simplify surface detail, not the planned camera geometry. A cinematic frame need not be photorealistic, cluttered or filled with depth-of-field blur.`;
}

export function storyboardCameraRenderingPrompt(frame = {}) {
  return [
    "CAMERA EXPRESSION: Render the specific composition described for this panel, not a generic centered eye-level view. Honor its camera distance/height, foreground scale, negative space, cropping and perspective. Preserve intentional foreshortening or lens distortion while keeping identities, physical contact and geography coherent. Do not invent a tilt or optical effect that this panel does not request. Sparse line art simplifies texture, not composition.",
    frame.angle === "Dutch Angle" ? "DUTCH ANGLE: Roll the camera around its viewing axis so the horizon and scene verticals tilt together. Keep the planned direction and degree if specified; otherwise use a readable, deliberate tilt. This is camera roll, not a change of character posture or an axis crossing." : "",
    ["8mm", "18mm"].includes(frame.lens) ? "WIDE LENS: Express the specified viewpoint through visible near/far scale and converging depth. Strong foreground enlargement requires a close camera; do not distort every face indiscriminately. Preserve the requested shot size and all required visible cast." : "",
    ["85mm", "120mm"].includes(frame.lens) ? "LONG LENS: Use the planned camera distance and framing to produce compressed depth and layered planes; the lens is not an automatic request to crop out other required people or blur away the environment." : ""
  ].filter(Boolean).join("\n");
}
