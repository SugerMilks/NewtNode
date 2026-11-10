// Compatible with kungfukoi/Newt_Node's model-neutral Lookbook snapshots.
const text = (value, max = 12000) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function portableLookPrompt(value) {
  return text(value).replace(/--[a-z][\w-]*(?:\s+(?!--)[^\s]+)*/gi, "").trim();
}

export function lookSnapshot(value = {}) {
  const examples = (Array.isArray(value.examples) ? value.examples : []).filter(image =>
    /^\/(uploads|workflow-assets|outputs)\//.test(image?.localUrl || "") && !/\.\.|[?#\\]/.test(image.localUrl)
  ).slice(0, 8).map(image => ({ id: text(image.id, 100), localUrl: image.localUrl, fileName: text(image.fileName, 200), mimeType: text(image.mimeType, 80) }));
  let sourceUrl = "";
  try { const url = new URL(value.sourceUrl); if (url.protocol === "https:" && !url.username && !url.password) sourceUrl = url.href; } catch { /* Optional attribution. */ }
  const analysis = value.styleAnalysis;
  const prompt = analysis?.stylePrompt ? [analysis.signatureFeature ? `Defining visual feature: ${portableLookPrompt(analysis.signatureFeature)}` : "", analysis.stylePrompt].filter(Boolean).join("\n\n") : value.prompt;
  return { id: text(value.id, 100), name: text(value.name, 120), prompt: portableLookPrompt(prompt), sourceUrl, examples };
}

export function libraryLookPrompt(data = {}) {
  const prompt = portableLookPrompt(data.libraryStyle?.prompt);
  return prompt ? `Visual treatment only. Apply rendering, lighting geometry, texture and the defining visual feature below, not any color instructions in the look description. Ignore reference hues, palettes, tint, saturation and monochrome instructions, including those in older saved descriptions. The separately selected grade controls color; with no grade, leave color to the user's prompt and image model.\n${prompt}\nCarry the defining feature through concretely in the requested subject's blocking, shape relationships or rendering, instead of averaging competing features. Do not import the reference subjects, costumes, props, text, setting or contact-sheet layout. The user's content, subject count, explicit camera and composition remain authoritative; adapt the feature to those constraints. Any separately selected style preset controls the medium; retain compatible qualities from this look. Color remains governed only by the separately selected grade and the user's prompt.` : "";
}

export function lookNodeData(kind, value) {
  const look = lookSnapshot(value);
  if (kind === "style") {
    const colors = (Array.isArray(value.gradeColors) ? value.gradeColors : []).filter(color => [color?.r, color?.g, color?.b].every(n => Number.isFinite(n) && n >= 0 && n <= 255)).slice(0, 10);
    return { title: look.name, stylePreset: "None", libraryStyle: look,
      ...(look.examples[0] && colors.length ? { gradePreset: "Custom", customPalettePreviewUrl: look.examples[0].localUrl, customPaletteSourceName: look.examples[0].fileName,
        customPaletteColors: colors, customPaletteRgbText: "", customPaletteStatus: "", customPaletteError: "" } : {}) };
  }
  if (kind === "transfer") return { title: look.name, transferImages: look.examples, locked: false, activated: false };
  throw new Error("Choose Style or Mood Board.");
}

export function selectLooksPage(styles, { q = "", category = "", offset = 0, limit = 48, favorites } = {}) {
  const words = String(q).slice(0, 300).toLowerCase().split(/\s+/).filter(Boolean);
  const starred = favorites ? new Set(favorites) : null;
  const matched = styles.filter(style => (!starred || starred.has(style.id)) && (!category || style.category === category || style.tags.includes(category)) &&
    words.every(word => [style.name, style.prompt, style.category, ...style.tags].join(" ").toLowerCase().includes(word)));
  const start = Math.max(0, Math.trunc(Number(offset) || 0)), size = Math.min(96, Math.max(1, Math.trunc(Number(limit) || 48)));
  return { total: matched.length, indexed: styles.length, offset: start, limit: size, styles: matched.slice(start, start + size) };
}
