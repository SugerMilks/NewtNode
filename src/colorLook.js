const defaultPaletteSize = 7;

export const colorLookPreservationInstruction =
  "Apply the palette primarily to lighting, shadows, reflections, environmental tones, wardrobe accents, and background elements. Preserve natural skin tones, product colors, food colors, brand colors, neutral materials, and realistic object coloration.";

export const coolGradePalette = Object.freeze([
  "#052432",
  "#063348",
  "#07415C",
  "#0B99AC",
  "#087D8F",
  "#09AFCA",
  "#07546D",
  "#065F84",
  "#041018",
  "#0FC7E5",
  "#EDFCFC",
  "#0673AA",
  "#77E4F1",
  "#417B77"
]);

export const coolGradeDescription =
  "Cool, polished commercial photography with deep blue-green shadows, soft cyan highlights, controlled contrast, clean skin tones, subtle atmospheric depth, and realistic practical lighting.";

export const warmGradePalette = Object.freeze([
  "#321B0E",
  "#482612",
  "#5C3218",
  "#AC5C2F",
  "#8F4524",
  "#CA6F32",
  "#6D3C20",
  "#84502A",
  "#180D07",
  "#E58B42",
  "#FFF3E3",
  "#AA5A28",
  "#F1B879",
  "#7B6448"
]);

export const warmGradeDescription =
  "Warm, polished commercial photography with deep umber shadows, terracotta and copper midtones, soft ivory highlights, restrained amber accents, controlled contrast, clean skin tones, subtle atmospheric depth, and realistic practical lighting.";

export const referenceGradePresets = Object.freeze({
  "Refn Beauty": Object.freeze({
    description: "Airy high-key beauty photography with milky cyan-white highlights, porcelain neutrals, delicate blush midtones, soft champagne warmth, lifted shadows, very low contrast, restrained saturation, and subtle powder-blue accents.",
    palette: Object.freeze([
      "#EDF5F2", "#E6E1D9", "#F7F5EC", "#D3C3C1", "#D7C3D0", "#BCABA6", "#A6958D",
      "#8F7D74", "#77645D", "#5F4C45", "#46342D", "#454B5E", "#78B6D3", "#B3D9E3"
    ])
  }),
  "Spiky Nike": Object.freeze({
    description: "Soft warm sepia photography with tobacco-brown shadows, muted tan skin-adjacent midtones, creamy yellowed highlights, subtle olive neutrality, low contrast, gentle highlight rolloff, and deep oxblood-red accents.",
    palette: Object.freeze([
      "#2A1609", "#462F1D", "#62462F", "#795C43", "#94775C", "#AC9078", "#B9AC88",
      "#CEC198", "#E6DDB9", "#6F1211", "#8F2422", "#AF6868", "#4E4738", "#C0AA77"
    ])
  }),
  "Vintage Son": Object.freeze({
    description: "Vintage analog warmth with mustard-yellow and ochre midtones, olive-brown shadows, tobacco accents, aged cream highlights, restrained cyan-green countertones, moderate grain-friendly contrast, and a sun-faded period-film finish.",
    palette: Object.freeze([
      "#2A2016", "#473517", "#5C4B28", "#7B5F2E", "#907B49", "#A09461", "#B8B187",
      "#D7CFAB", "#9E802C", "#C4A33D", "#723A1B", "#B58153", "#607879", "#91A7A1"
    ])
  }),
  "Dusty Brothers": Object.freeze({
    description: "Sun-bleached western color grade with parchment highlights, dusty khaki and sage neutrals, weathered ochre midtones, restrained brown shadows, softened contrast, dry atmospheric warmth, and lightly desaturated cyan-gray distance.",
    palette: Object.freeze([
      "#181611", "#30281B", "#754C2C", "#786542", "#8D7E5B", "#8D8F7B", "#A99260",
      "#BAAE8C", "#C5BFA4", "#E8E6D1", "#F4F1DC", "#657171", "#A5A78E", "#D6C8A4"
    ])
  }),
  "Moody Meadow": Object.freeze({
    description: "Low-key clinical mood with deep green-black shadows, muted cyan-teal ambience, sickly olive-gray midtones, restrained cool highlights, compressed exposure, subdued saturation, and a faint burgundy accent for a tense atmospheric finish.",
    palette: Object.freeze([
      "#0D1513", "#151B14", "#1D2821", "#1E2E29", "#2C342D", "#2E4343", "#404237",
      "#484C44", "#595A4E", "#61655B", "#7B8176", "#203D3C", "#563442", "#9A6A78"
    ])
  }),
  "Classy Kubric": Object.freeze({
    description: "Elegant saturated interior color grade with rich crimson and oxblood shadows, warm peach and tungsten skin-adjacent midtones, deep mahogany neutrals, luminous cream highlights, and a deliberate cobalt-blue counterlight creating bold theatrical color contrast.",
    palette: Object.freeze([
      "#2F1814", "#470906", "#611812", "#72331D", "#764A30", "#8C634A", "#C4A88E",
      "#D4BBA6", "#F2D7B5", "#3E4C9B", "#7590EF", "#97AEFF", "#352A51", "#A62C28"
    ])
  }),
  "Coney Color": Object.freeze({
    description: "Warm sun-baked color grade with bronze and amber skin-adjacent midtones, deep olive-brown shadows, soft peach highlights, moderate contrast, gently aged saturation, and muted swimming-pool aqua and eucalyptus-green countertones.",
    palette: Object.freeze([
      "#1F1904", "#4D3416", "#5E4B2B", "#786345", "#92785E", "#A98B76", "#BFA192",
      "#D8B7A2", "#F0CAB2", "#627263", "#4A5948", "#749694", "#86B6B4", "#C98B78"
    ])
  })
});

export const gradePresetPrompts = Object.freeze({
  None: "",
  Cool: `COLOR GRADE:\n${coolGradeDescription}\n\nCOLOR PALETTE:\nUse the following colors as a loose visual palette, not as literal flat colors:\n[${coolGradePalette.map((hex) => `"${hex}"`).join(", ")}]\n\n${colorLookPreservationInstruction}`,
  Warm: `COLOR GRADE:\n${warmGradeDescription}\n\nCOLOR PALETTE:\nUse the following colors as a loose visual palette, not as literal flat colors:\n[${warmGradePalette.map((hex) => `"${hex}"`).join(", ")}]\n\n${colorLookPreservationInstruction}`,
  ...Object.fromEntries(Object.entries(referenceGradePresets).map(([name, preset]) => [
    name,
    gradePresetPrompt(preset.description, preset.palette)
  ])),
  Custom: ""
});

export const gradePresetNames = Object.freeze(Object.keys(gradePresetPrompts));

export function normalizeGradePresetName(value, fallback = "None") {
  return gradePresetNames.includes(value) ? value : fallback;
}

function gradePresetPrompt(description, palette) {
  return `COLOR GRADE:\n${description}\n\nCOLOR PALETTE:\nUse the following colors as a loose visual palette, not as literal flat colors:\n[${palette.map((hex) => `"${hex}"`).join(", ")}]\n\n${colorLookPreservationInstruction}`;
}

export function buildColorLookPreset({
  name = "Untitled Look",
  palette = [],
  paletteSize = defaultPaletteSize,
  visualLook = "",
  userPrompt = ""
} = {}) {
  const analysis = analyzeColorLookPalette(palette, { paletteSize });
  const description = cleanSentence(visualLook) || describeColorLook(analysis);
  const hiddenPrompt = buildColorLookPrompt({
    visualLook: description,
    palette: analysis,
    userPrompt
  });

  return {
    name: String(name || "Untitled Look").trim() || "Untitled Look",
    mood: analysis.mood,
    temperature: analysis.temperature,
    contrast: analysis.contrast,
    saturation: analysis.saturation,
    shadows: analysis.shadows.map((color) => color.hex),
    midtones: analysis.midtones.map((color) => color.hex),
    highlights: analysis.highlights.map((color) => color.hex),
    neutrals: analysis.neutrals.map((color) => color.hex),
    accents: analysis.accents.map((color) => color.hex),
    palette: analysis.colors.map((color) => color.hex),
    description,
    hiddenPrompt
  };
}

export function analyzeColorLookPalette(palette = [], { paletteSize = defaultPaletteSize } = {}) {
  const colors = uniqueColors(palette);
  if (!colors.length) throw new Error("Add at least one valid HEX color to analyze a Color Look.");

  const targetSize = Math.min(colors.length, clamp(Math.round(Number(paletteSize) || defaultPaletteSize), 6, 8));
  const remaining = [...colors];
  const buckets = {
    shadows: [],
    midtones: [],
    highlights: [],
    neutrals: [],
    accents: []
  };

  takeColor(remaining, buckets.shadows, (color) => -color.luminance + color.saturation * 0.04);
  if (targetSize >= 6) {
    takeColor(remaining, buckets.shadows, (color, selected) => (
      -color.luminance + colorDistanceScore(color, selected) * 0.12
    ));
  }

  takeColor(remaining, buckets.highlights, (color) => color.luminance * 1.4 - color.saturation * 0.22);
  takeColor(remaining, buckets.accents, (color) => (
    color.saturation * 1.25 + color.chroma * 0.55 - Math.abs(color.luminance - 0.55) * 0.25
  ));
  takeColor(remaining, buckets.neutrals, (color) => (
    (1 - color.saturation) + (1 - color.chroma) * 0.9 - Math.abs(color.luminance - 0.5) * 0.2
  ));
  takeColor(remaining, buckets.midtones, (color, selected) => (
    -Math.abs(color.luminance - 0.36) + colorDistanceScore(color, selected) * 0.08
  ));
  if (selectedCount(buckets) < targetSize) {
    takeColor(remaining, buckets.midtones, (color, selected) => (
      -Math.abs(color.luminance - 0.56) + colorDistanceScore(color, selected) * 0.08
    ));
  }

  while (remaining.length && selectedCount(buckets) < targetSize) {
    const candidate = remaining.shift();
    buckets[tonalBucket(candidate)].push(candidate);
  }

  const optimizedColors = [
    ...buckets.shadows,
    ...buckets.midtones,
    ...buckets.highlights,
    ...buckets.neutrals,
    ...buckets.accents
  ];
  const temperature = paletteTemperature(optimizedColors);
  const contrast = paletteContrast(optimizedColors);
  const saturation = paletteSaturation(optimizedColors);

  return {
    ...buckets,
    colors: optimizedColors,
    temperature,
    contrast,
    saturation,
    mood: paletteMood({ temperature, contrast, saturation })
  };
}

export function buildColorLookPrompt({ visualLook = "", palette, userPrompt = "" } = {}) {
  const analysis = Array.isArray(palette)
    ? analyzeColorLookPalette(palette)
    : palette;
  if (!analysis?.colors?.length) throw new Error("A analyzed Color Look palette is required.");

  const lookDescription = cleanSentence(visualLook) || describeColorLook(analysis);
  const gradePrompt = buildColorGradePrompt({
    description: lookDescription,
    palette: analysis
  });

  return [
    `VISUAL LOOK:\n${lookDescription}`,
    gradePrompt.replace(/^COLOR GRADE:\n[^\n]+\n\n/, "COLOR PALETTE:\n"),
    cleanSentence(userPrompt) ? `USER PROMPT:\n${cleanSentence(userPrompt)}` : ""
  ].filter(Boolean).join("\n\n");
}

export function buildColorGradePrompt({ description = "", palette } = {}) {
  const analysis = Array.isArray(palette)
    ? analyzeColorLookPalette(palette)
    : palette;
  if (!analysis?.colors?.length) throw new Error("A analyzed Color Look palette is required.");

  const gradeDescription = cleanSentence(description) || describeColorLook(analysis);
  const categoryLines = [
    promptCategory("Shadows", analysis.shadows),
    promptCategory("Midtones", analysis.midtones),
    promptCategory("Highlights", analysis.highlights),
    promptCategory("Neutrals", analysis.neutrals),
    promptCategory("Accents", analysis.accents)
  ].filter(Boolean);
  const allHex = analysis.colors.map((color) => `"${color.hex}"`).join(", ");

  return `COLOR GRADE:\n${gradeDescription}\n\nUse the following colors as a loose visual palette, not as literal flat colors:\n${categoryLines.join("\n")}\nPalette HEX values: [${allHex}]\n\n${colorLookPreservationInstruction}`;
}

export function describeColorLook(analysis) {
  const shadow = describeColorFamily(analysis.shadows[0], "deep shadows");
  const midtone = describeColorFamily(analysis.midtones[0], "controlled midtones");
  const highlight = describeColorFamily(analysis.highlights[0], "soft highlights");
  const accent = describeColorFamily(analysis.accents[0], "restrained accents");
  return `A ${analysis.temperature.toLowerCase()}, ${analysis.contrast.toLowerCase()}-contrast, ${analysis.saturation.toLowerCase()} color grade with ${shadow}, ${midtone}, ${highlight}, and ${accent}.`;
}

export function normalizeHexColor(value) {
  const raw = typeof value === "object" && value ? value.hex : value;
  const normalized = String(raw || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized.split("").map((part) => `${part}${part}`).join("").toUpperCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(normalized) ? `#${normalized.toUpperCase()}` : "";
}

function uniqueColors(palette) {
  const seen = new Set();
  return (Array.isArray(palette) ? palette : String(palette || "").split(/[\s,;]+/))
    .map((value) => normalizeHexColor(value))
    .filter(Boolean)
    .filter((hex) => {
      if (seen.has(hex)) return false;
      seen.add(hex);
      return true;
    })
    .map(colorMetrics);
}

function colorMetrics(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return {
    hex,
    r,
    g,
    b,
    hue,
    saturation: max ? delta / max : 0,
    value: max,
    chroma: delta,
    luminance: 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue)
  };
}

function takeColor(remaining, target, score) {
  if (!remaining.length) return;
  const selected = target;
  let bestIndex = 0;
  let bestScore = -Infinity;
  remaining.forEach((color, index) => {
    const candidateScore = score(color, selected);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestIndex = index;
    }
  });
  target.push(remaining.splice(bestIndex, 1)[0]);
}

function selectedCount(buckets) {
  return Object.values(buckets).reduce((sum, colors) => sum + colors.length, 0);
}

function tonalBucket(color) {
  if (color.luminance < 0.24) return "shadows";
  if (color.luminance > 0.76) return "highlights";
  if (color.saturation < 0.16) return "neutrals";
  if (color.saturation > 0.66) return "accents";
  return "midtones";
}

function colorDistanceScore(color, selected = []) {
  if (!selected.length) return 0;
  return Math.min(...selected.map((other) => (
    Math.hypot(color.r - other.r, color.g - other.g, color.b - other.b) / 441.67
  )));
}

function paletteTemperature(colors) {
  const chromatic = colors.filter((color) => color.saturation > 0.12);
  if (!chromatic.length) return "Neutral";
  const vector = chromatic.reduce((result, color) => {
    const weight = Math.max(0.05, color.saturation * color.value);
    const radians = color.hue * Math.PI / 180;
    result.x += Math.cos(radians) * weight;
    result.y += Math.sin(radians) * weight;
    return result;
  }, { x: 0, y: 0 });
  const hue = (Math.atan2(vector.y, vector.x) * 180 / Math.PI + 360) % 360;
  if (hue >= 150 && hue <= 285) return "Cool";
  if (hue <= 80 || hue >= 330) return "Warm";
  return "Balanced";
}

function paletteContrast(colors) {
  const luminances = colors.map((color) => color.luminance);
  const range = Math.max(...luminances) - Math.min(...luminances);
  if (range >= 0.72) return "High";
  if (range >= 0.44) return "Medium";
  return "Low";
}

function paletteSaturation(colors) {
  const average = colors.reduce((sum, color) => sum + color.saturation, 0) / colors.length;
  if (average < 0.24) return "Muted";
  if (average > 0.62) return "Vivid";
  return "Controlled";
}

function paletteMood({ temperature, contrast, saturation }) {
  const descriptors = [];
  if (temperature === "Cool") descriptors.push("clean", "focused");
  else if (temperature === "Warm") descriptors.push("inviting", "human");
  else descriptors.push("balanced", "natural");
  if (contrast === "High") descriptors.push("dramatic");
  else if (contrast === "Low") descriptors.push("soft");
  else descriptors.push("polished");
  descriptors.push(saturation === "Muted" ? "restrained" : saturation === "Vivid" ? "energetic" : "controlled");
  return descriptors.join(", ");
}

function describeColorFamily(color, fallback) {
  if (!color) return fallback;
  const lightness = color.luminance < 0.16 ? "deep " : color.luminance > 0.78 ? "pale " : "";
  if (color.saturation < 0.12) return `${lightness}${color.luminance > 0.7 ? "white" : color.luminance < 0.2 ? "charcoal" : "neutral"}`;
  return `${lightness}${hueName(color.hue)}`;
}

function hueName(hue) {
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "amber";
  if (hue < 70) return "yellow";
  if (hue < 150) return "green";
  if (hue < 185) return "teal";
  if (hue < 205) return "cyan";
  if (hue < 245) return "blue";
  if (hue < 285) return "violet";
  if (hue < 330) return "magenta";
  return "crimson";
}

function promptCategory(label, colors = []) {
  return colors.length ? `${label}: ${colors.map((color) => color.hex).join(", ")}` : "";
}

function cleanSentence(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function linearChannel(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
