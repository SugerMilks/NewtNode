// Section IDs, priorities and compiled prompt format match kungfukoi/Newt_Node.
export const lookStyleSections = [
  { id: "medium", label: "Medium & rendering", placeholder: "Materials, process and degree of abstraction" },
  { id: "lighting", label: "Light & contrast", placeholder: "Light quality, highlights and shadow behavior" },
  { id: "texture", label: "Texture & detail", placeholder: "Surface grain, mark making and detail hierarchy" },
  { id: "shape", label: "Shape & edges", placeholder: "Line quality, contours and shape language" },
  { id: "depth", label: "Depth & atmosphere", placeholder: "Spatial treatment, softness and depth cues" },
  { id: "mood", label: "Mood & character", placeholder: "Transferable visual atmosphere and energy" }
];
export const lookStylePriorities = ["absolute", "primary", "secondary", "advisory"];
const defaultCategories = ["Fine art", "Illustration", "Photography", "Graphic design", "Cinematography", "3D visualization", "Character design", "Game art", "Brand identity", "Packaging design", "UI/UX", "Various"];
export function lookTags(values = []) {
  const seen = new Set();
  return values.filter(value => typeof value === "string").map(value => value.trim().slice(0, 80)).filter(value => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 16);
}
export const lookCategories = (values = []) => [...new Set([...defaultCategories, ...values.filter(value => typeof value === "string" && value.trim() && value.length <= 80)])].sort((a, b) => a.localeCompare(b)).slice(0, 80);
export function lookStyleBlocks(value = {}) {
  return lookStyleSections.map(({ id }) => {
    const source = Array.isArray(value) ? value.find(item => item?.id === id) : { text: value[id] };
    return { id, text: typeof source?.text === "string" ? source.text.trim().slice(0, 600) : "", enabled: source?.enabled !== false,
      weight: lookStylePriorities.includes(source?.weight) ? source.weight : id === "medium" ? "primary" : ["depth", "mood"].includes(id) ? "advisory" : "secondary" };
  });
}
export function compileLookStyle(blocks) {
  return lookStyleBlocks(blocks).filter(block => block.enabled && block.text).map(block =>
    `### ${lookStyleSections.find(section => section.id === block.id).label} \u00b7 ${block.weight}\n${block.text}`).join("\n\n");
}
export function validLookPalette(value) {
  return Array.isArray(value) && value.length <= 6 && value.every(color => color && typeof color.name === "string" && color.name.length <= 80 && /^#[a-f\d]{6}$/i.test(color.hex));
}
export function validLookStyleBlocks(value) {
  return Array.isArray(value) && value.length === 6 && new Set(value.map(block => block?.id)).size === 6 && value.every(block => block &&
    lookStyleSections.some(section => section.id === block.id) && typeof block.text === "string" && block.text.length <= 600 && typeof block.enabled === "boolean" && lookStylePriorities.includes(block.weight));
}

export const createLookAnalysisSchema = {
  type: "object", additionalProperties: false, required: ["stylePrompt", "tags", "visualStyle", "palette"], properties: {
    stylePrompt: { type: "string", minLength: 80, maxLength: 2000 },
    tags: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 80 } },
    visualStyle: { type: "object", additionalProperties: false, required: lookStyleSections.map(section => section.id),
      properties: Object.fromEntries(lookStyleSections.map(section => [section.id, { type: "string", maxLength: 600 }])) },
    palette: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["name", "hex"],
      properties: { name: { type: "string", maxLength: 80 }, hex: { type: "string", pattern: "^#[a-fA-F0-9]{6}$" } } } }
  }
};
