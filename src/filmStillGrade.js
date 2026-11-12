import { colorLookPreservationInstruction } from "./colorLook.js";

// A palette belongs to one clean image, never to the look's current thumbnail index.
export function filmStillPalette(value) {
  if (value?.version !== 1 || !Array.isArray(value.colors) || value.colors.length !== 10) return null;
  const colors = value.colors.map(color => typeof color === "string" ? color.toUpperCase() : "");
  if (colors.some(hex => !/^#[A-F0-9]{6}$/.test(hex)) || new Set(colors).size !== 10) return null;
  return { version: 1, colors };
}

export function filmStillColors(value) {
  return (filmStillPalette(value)?.colors || []).map(hex => ({ hex,
    r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }));
}

export function filmStillGradePatch(image) {
  const palette = filmStillPalette(image?.filmStillPalette);
  const url = image?.localUrl || image?.url;
  if (!palette || !/^\/(uploads|workflow-assets|outputs)\//.test(url || "") || /\.\.|[?#\\]/.test(url)) return null;
  return { gradePreset: "Custom", customPalettePreviewUrl: url, customPaletteSourceName: image.fileName || "Film Still",
    customPaletteColors: filmStillColors(palette), customPaletteRgbText: "", customPaletteStatus: "", customPaletteError: "",
    filmStillGrade: { ...palette, imageUrl: url } };
}

export function activeFilmStillGrade(data = {}) {
  const palette = filmStillPalette(data.filmStillGrade);
  if (data.gradePreset !== "Custom" || !palette || data.customPalettePreviewUrl !== data.filmStillGrade.imageUrl) return null;
  if (!/^\/(uploads|workflow-assets|outputs)\//.test(data.filmStillGrade.imageUrl || "") || /\.\.|[?#\\]/.test(data.filmStillGrade.imageUrl)) return null;
  return { ...palette, imageUrl: data.filmStillGrade.imageUrl };
}

export function filmStillGradePrompt(data) {
  const grade = activeFilmStillGrade(data);
  if (!grade) return "";
  return [
    "FILM STILL COLOR GRADE ONLY:",
    "Render only the requested image. These grading instructions are not additional image content.",
    `Non-rendered color-grading reference values: ${grade.colors.join(", ")}.`,
    "Consider the complete set as color relationships for lighting, shadows, midtones, highlights and reflections. Blend naturally with continuous tonal transitions; the scene does not need a separate visible area for every reference color and is not restricted to ten flat colors.",
    "When the clean Film Still Grade reference is supplied, use it only for color relationships, contrast and tonal distribution. Never copy its actors, objects, setting, composition, lettering, borders or palette layout. The requested subject, camera and framing remain authoritative.",
    colorLookPreservationInstruction,
    "Do not turn the grading data into graphics: do not add palette strips, color swatches, color charts, HEX/RGB labels, legends, sample panels, borders or extra margins. Do not print these reference values or grading instructions anywhere in the image. Text or graphics explicitly requested by the user remain allowed; the grade itself adds none."
  ].join("\n");
}

export function filmStillGradeReferences(connections = []) {
  return connections.flatMap(({ source }) => {
    const grade = source?.type === "style" && activeFilmStillGrade(source.data);
    return grade ? [{ url: grade.imageUrl, type: "image", label: "Film Still Grade reference - color and tone only, not content or composition" }] : [];
  });
}
