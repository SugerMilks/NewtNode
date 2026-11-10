import { gradePresetPrompts } from "./colorLook.js";

export const preciseColorPickerGrade = "Precise Color";
export const styleGradePresetPrompts = Object.freeze({
  None: "",
  "Warm Grade": gradePresetPrompts["Dusty Brothers"],
  "Cool Grade": gradePresetPrompts["Moody Meadow"],
  "Bright Fashion": gradePresetPrompts["Refn Beauty"],
  "Modern Vintage": gradePresetPrompts["Vintage Son"],
  [preciseColorPickerGrade]: "",
  Custom: ""
});
export const styleGradePresetNames = Object.freeze(Object.keys(styleGradePresetPrompts));
const renamedGrades = Object.freeze({
  "Dusty Brothers": "Warm Grade",
  "Moody Meadow": "Cool Grade",
  "Refn Beauty": "Bright Fashion",
  "Vintage Son": "Modern Vintage",
  "Precise Color Picker": preciseColorPickerGrade
});
export function normalizeStyleGradePresetName(value) {
  const name = Object.hasOwn(renamedGrades, value) ? renamedGrades[value] : value;
  return styleGradePresetNames.includes(name) ? name : "None";
}
export const isPaletteGrade = value => value === "Custom" || value === preciseColorPickerGrade;

// Keep manual palettes separate so edits and Clear never erase an image-derived grade.
export function styleGradePaletteData(data = {}) {
  if (normalizeStyleGradePresetName(data.gradePreset) !== preciseColorPickerGrade) return data;
  const palette = data.precisePalette || {};
  return { customPaletteColors: palette.colors, customPaletteRgbText: palette.rgbText, customPalettePicker: palette.picker, customPaletteError: palette.error };
}

export function migrateStyleGradeData(data = {}) {
  const gradePreset = normalizeStyleGradePresetName(data.gradePreset || (data.stylePreset === "Custom Palette" ? "Custom" : "None"));
  const manualCustom = data.styleGradeVersion !== 1 && !data.customPalettePreviewUrl
    && !data.precisePalette && ((Array.isArray(data.customPaletteColors) && data.customPaletteColors.length > 0) || String(data.customPaletteRgbText || "").trim());
  if (!manualCustom) return { ...data, gradePreset, styleGradeVersion: 1 };
  return { ...data, gradePreset: gradePreset === "Custom" ? preciseColorPickerGrade : gradePreset, styleGradeVersion: 1,
    precisePalette: { colors: data.customPaletteColors || [], rgbText: data.customPaletteRgbText || "", picker: data.customPalettePicker || "#ddc631", error: "" },
    customPaletteColors: [], customPaletteRgbText: "", customPaletteStatus: "", customPaletteError: "" };
}
