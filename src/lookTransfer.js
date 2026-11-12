import { lookSnapshot, lookNodeData } from "./looks.js";
import { imagePaletteColors, loadCanvasImage } from "./canvasMedia.js";
import { filmStillColors } from "./filmStillGrade.js";

export const lookTransferChoices = [
  { id: "text", label: "Text" },
  { id: "moodBoard", label: "Mood Board" },
  { id: "style", label: "Unique Style" },
  { id: "grade", label: "Grade" }
];

export function lookTransferError(look, prompt, selected) {
  if (!lookTransferChoices.some(({ id }) => selected[id])) return "Choose at least one node.";
  if ((selected.text || (selected.style && look.custom)) && !prompt.trim()) return "Add a description for the selected nodes.";
  if ((selected.moodBoard || selected.style || selected.grade) && !look.examples?.length) return "This look has no available images.";
  return "";
}

// Prepare everything before handing off once, so failures cannot leave a partial canvas transfer.
export async function prepareLookTransfer({ look, prompt, selected }, api, extractGrade = async url => imagePaletteColors(await loadCanvasImage(url))) {
  const error = lookTransferError(look, prompt, selected);
  if (error) throw new Error(error);
  const entries = [];
  let prepared;
  if (selected.style || selected.moodBoard || selected.grade) {
    const result = await (selected.style ? api.createStyle : api.import)({ id: look.id, prompt, sharedDirectory: look.sharedDirectory });
    prepared = result.look;
    if (!lookSnapshot(prepared).examples.length) throw new Error("No local look images were prepared. Your canvas has not changed.");
  }
  if (selected.grade && !selected.style) {
    const handPicked = filmStillColors(prepared.examples[0].filmStillPalette);
    const gradeColors = handPicked.length ? handPicked : await extractGrade(prepared.examples[0].localUrl);
    if (!gradeColors.length) throw new Error("The first image has no usable grade colors. Your canvas has not changed.");
    prepared = { ...prepared, gradeColors };
  }
  if (selected.text) entries.push({ kind: "plainText", value: { name: look.name, prompt } });
  if (selected.moodBoard) entries.push({ kind: "transfer", value: prepared });
  if (selected.style) entries.push({ kind: "style", value: { ...prepared, includeGrade: Boolean(selected.grade) } });
  else if (selected.grade) entries.push({ kind: "grade", value: prepared });
  return entries;
}

export function lookRequestNodes(kind, value) {
  const entries = kind === "batch" ? value : [{ kind, value }];
  if (!Array.isArray(entries) || !entries.length || entries.length > 4) return [];
  if (entries.some(entry => !["plainText", "transfer", "style", "grade"].includes(entry?.kind) || !entry.value)) return [];
  return entries.map(entry => ({ type: entry.kind === "grade" ? "style" : entry.kind, data: lookNodeData(entry.kind, entry.value) }));
}
