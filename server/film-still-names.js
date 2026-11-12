import path from "node:path";
import { filmStillPalette } from "../src/filmStillGrade.js";

const shortLabels = new Set(["her", "mud", "up", "it", "us", "pi"]);
const familyHues = { red: 0, amber: 30, gold: 55, olive: 85, green: 125, teal: 175, cyan: 205, blue: 240, violet: 280, rose: 325 };

// Filename labels are evidence; archive numbers and initials are not film identities.
export function filmStillLabel(filename) {
  const stem = path.parse(String(filename || "")).name.normalize("NFKC").replace(/[\x00-\x1f\x7f]/g, "").trim();
  let label = stem.replace(/[_-]+/g, " ").replace(/\s*\(\d+\)$/, "").replace(/\s+\d{1,3}$/, "")
    .replace(/^\d+[ .]+(?=[A-Za-z])/, "").replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ").trim();
  const letters = label.replace(/[^\p{L}]/gu, "");
  if (!letters || (/^[a-z]*$/i.test(letters) && !shortLabels.has(letters.toLowerCase()) &&
      (letters.length < 4 || (letters.length <= 5 && letters === letters.toUpperCase()) || /^(.)\1+$/i.test(letters)))) return "";
  if (/^(?:film\s*colou?r|film\s*still|colou?r|image|img|dsc|dscn|photo|picture|pic|scan|screenshot|untitled|copy)(?:\s*\d+)*$/i.test(label)) return "";
  label = label.split(" ").map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  return label.slice(0, 70);
}

function colorAppearance(hex) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
  let hue = 0;
  if (chroma) hue = (((max === r ? (g - b) / chroma : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) * 60) + 360) % 360;
  const light = .2126 * r + .7152 * g + .0722 * b;
  const family = chroma < .09 || max < .12 ? "neutral"
    : hue < 16 || hue >= 350 ? "red"
    : hue < 45 ? "amber" : hue < 70 ? "gold" : hue < 100 ? "olive" : hue < 155 ? "green"
    : hue < 190 ? "teal" : hue < 220 ? "cyan" : hue < 265 ? "blue" : hue < 295 ? "violet" : "rose";
  return { family, light, chroma };
}

function familyName({ family, light, chroma }) {
  switch (family) {
    case "neutral": return light < .25 ? "Charcoal" : light > .72 ? "Ivory" : "Silver";
    case "red": return light < .28 ? "Burgundy" : light > .62 ? "Blush" : "Crimson";
    case "amber": return light < .35 ? "Copper" : chroma < .3 ? "Sand" : "Amber";
    case "gold": return light < .35 ? "Bronze" : "Gold";
    case "olive": return "Olive";
    case "green": return chroma < .3 ? "Sage" : light < .35 ? "Forest" : "Emerald";
    case "teal": return "Teal";
    case "cyan": return light > .65 ? "Ice Blue" : "Cyan";
    case "blue": return chroma < .25 ? "Slate Blue" : light < .25 ? "Midnight Blue" : "Blue";
    case "violet": return light > .65 ? "Lavender" : "Violet";
    default: return light > .6 || chroma < .5 ? "Rose" : "Magenta";
  }
}

export function filmStillLookName(palette) {
  const valid = filmStillPalette(palette);
  if (!valid) return "Cinematic Tones";
  const colors = valid.colors.map(colorAppearance), families = new Map();
  for (const color of colors) {
    const group = families.get(color.family) || { family: color.family, count: 0, score: 0, light: 0, chroma: 0 };
    group.count++; group.light += color.light; group.chroma += color.chroma;
    group.score += .5 + color.chroma;
    families.set(color.family, group);
  }
  const groups = [...families.values()].map(group => ({ ...group, light: group.light / group.count, chroma: group.chroma / group.count }))
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
  const colorful = groups.filter(group => group.family !== "neutral");
  const primary = colorful[0] || groups[0];
  // Prefer a meaningful countertone over naming two adjacent shades of the same warm/cool range.
  const secondary = colorful.slice(1).find(group => {
    const gap = Math.abs(familyHues[group.family] - familyHues[primary.family]);
    return Math.min(gap, 360 - gap) >= 45 && group.score >= primary.score * .3;
  }) || colorful[1];
  const dominant = [primary, secondary].filter(Boolean).map(familyName).join(" & ");
  const average = key => colors.reduce((sum, color) => sum + color[key], 0) / colors.length;
  const range = Math.max(...colors.map(color => color.light)) - Math.min(...colors.map(color => color.light));
  const tone = average("chroma") < .12 ? (colorful.length ? "Muted Tones" : "Tonal Study") : average("light") < .28 ? "Deep Shadows"
    : average("light") > .7 ? "Soft Light" : range > .65 ? "Bold Contrast"
    : average("chroma") < .28 ? "Muted Tones" : average("chroma") > .5 ? "Vivid Glow" : "Soft Contrast";
  return `${dominant} ${tone}`;
}

export function filmStillDisplayName(filename, palette) {
  const label = filmStillLabel(filename), look = filmStillLookName(palette);
  return label ? `${label} - ${look}`.slice(0, 120) : look;
}
