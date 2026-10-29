const localImage = value => typeof value === "string" && /^\/(uploads|outputs|workflow-assets|saved_workflows)\//.test(value) ? value : "";
export const vectorGuideLimits = Object.freeze({ bytes: 10 * 1024 * 1024, marks: 500, points: 20000, pixels: 24000000 });
export const vectorDrawTools = ["pen", "eraser", "line", "rectangle", "ellipse", "arrow", "text"];

export function vectorLayoutSize(aspectRatio = "1:1", source = {}) {
  const [w, h] = String(aspectRatio).split(":").map(Number);
  const ratio = w > 0 && h > 0 ? w / h : Number(source.width) / Number(source.height) || 1;
  const bounded = Math.max(.25, Math.min(4, ratio));
  return { width: Math.round(1536 * Math.min(1, bounded)), height: Math.round(1536 / Math.max(1, bounded)) };
}

export function validateVectorMarks(marks) {
  if (!Array.isArray(marks) || marks.length > vectorGuideLimits.marks) throw new Error("Use at most 500 drawing marks per layout.");
  let count = 0;
  for (const mark of marks) {
    if (!mark || !vectorDrawTools.includes(mark.tool) || !Array.isArray(mark.points) || !mark.points.length ||
        !Number.isFinite(mark.size) || mark.size < .001 || mark.size > .12 || !/^#[\da-f]{6}$/i.test(mark.color) ||
        !Number.isFinite(mark.opacity) || mark.opacity < .1 || mark.opacity > 1 ||
        mark.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) ||
        (mark.tool === "text" && (typeof mark.text !== "string" || mark.text.length > 200))) throw new Error("The layout contains an invalid drawing mark.");
    count += mark.points.length;
  }
  if (count > vectorGuideLimits.points) throw new Error("This layout is too detailed. Remove some strokes before adding more.");
  return marks.map(mark => ({ tool: mark.tool, layer: "drawing", color: mark.color, size: mark.size, opacity: mark.opacity,
    points: mark.points.map(({ x, y }) => ({ x, y })), ...(mark.tool === "text" ? { text: mark.text } : {}) }));
}

export function normalizeVectorGuide(value, kind) {
  if (!value || !localImage(value.url)) return null;
  const base = { url: value.url, label: String(value.label || (kind === "layout" ? "Drawn layout" : "Font reference")).slice(0, 200), enabled: value.enabled !== false };
  if (kind === "font") return { ...base, kind: value.kind === "font" ? "font" : "image", sample: String(value.sample || "").slice(0, 500) };
  let marks;
  try { marks = validateVectorMarks(value.marks || []); } catch { marks = []; }
  return { ...base, width: Math.max(384, Math.min(1536, Math.round(Number(value.width) || 1536))),
    height: Math.max(384, Math.min(1536, Math.round(Number(value.height) || 1536))), marks,
    backgroundUrl: localImage(value.backgroundUrl), backgroundLabel: String(value.backgroundLabel || "Reference image").slice(0, 200) };
}

// The layout is the primary image; every subsequent reference has a separate role.
export function vectorReferences(data, images = [], moodBoards = []) {
  if (data.vectorMode === "vectorize") return images;
  return [
    ...(data.layoutReference?.enabled !== false && data.layoutReference ? [{ ...data.layoutReference, role: "layout" }] : []),
    ...images,
    ...(data.fontReference?.enabled !== false && data.fontReference ? [{ ...data.fontReference, role: "font" }] : []),
    ...(moodBoards.length ? moodBoards : data.vectorSavedMoodBoards || []).map(image => ({ ...image, role: "moodBoard" }))
  ];
}

export function vectorReferenceInstructions(references) {
  if (!references.some(image => ["moodBoard", "layout", "font"].includes(image.role))) return "";
  const names = { moodBoard: "MOOD BOARD - visual style only.", font: "TYPOGRAPHY - letterform influence only, not wording or layout.", layout: "LAYOUT SKETCH - primary composition, placement, relative proportions and shapes." };
  return [
    "REFERENCE ROLES (in the supplied image order):",
    ...references.map((image, index) => `Reference image ${index + 1}: ${names[image.role] || "SUBJECT / CONTENT reference - use for the requested subject or composition."}`),
    references.some(image => image.role === "layout") ? "Interpret the layout sketch as art direction: preserve its intended object placement, silhouette, hierarchy and negative space while rendering polished vector artwork. Use accompanying subject references for identity and details, not to override the sketch's arrangement. Underlying reference imagery is context, not a second composition to reproduce. Rough strokes, arrows, boxes and handwritten labels are instructions, not final artwork; omit guide marks and labels unless the authored brief explicitly requests them. Keep the relative layout when adapting to the requested aspect ratio." : "",
    references.some(image => image.role === "font") ? "Use the typography reference only for letter shapes, stroke contrast, terminals, proportions and spacing. Do not copy its sample words, alphabet, numbers, logos, page layout or background. Only render the exact Lettering supplied in the brief, or the visible wording explicitly requested by the author. A font reference alone is not a request to add text. Font influence is visual guidance, not an instruction to trace an entire specimen." : "",
    references.some(image => image.role === "moodBoard") ? "Use the mood board only for graphic design language: palette, shapes, linework, texture, visual rhythm and level of detail. Translate photographic references into vector-friendly graphic choices, not a photographic scene.\nDo not copy the mood board's subjects, objects, logos, lettering, panel borders or collage layout. Create one coherent original design from the design brief, not a reproduction of the board. The authored brief, exact lettering, explicit palette and subject references take priority over the mood board." : "",
    "Resolve conflicting references by their assigned roles. Explicit authored instructions and exact lettering take priority; do not treat reference labels as visible text."
  ].filter(Boolean).join("\n");
}
