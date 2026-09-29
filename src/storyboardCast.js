import { cleanReferenceTag, promptHasReferenceTag } from "./referenceTags.js";
import { storyboardSpatialPlanIssues } from "./storyboardSpatial.js";

const text = (maxLength) => ({ type: "string", maxLength });
export const storyboardCastSchema = {
  type: "array", maxItems: 16,
  items: {
    type: "object", additionalProperties: false,
    required: ["tag", "visibility", "position", "action", "eyeline"],
    properties: {
      tag: { type: "string", minLength: 1, maxLength: 28, pattern: "^[A-Za-z0-9_-]+$" },
      visibility: { type: "string", enum: ["visible", "offscreen"] },
      position: { ...text(240), minLength: 1, pattern: "\\S" },
      action: { ...text(240), minLength: 1, pattern: "\\S" },
      eyeline: text(120)
    }
  }
};

export const storyboardCastPlanningRules = `For every frame return a cast array for the relevant Known characters, using exact tags without @. Include each identity once, never one entry per view on its character sheet. Set visibility to visible or offscreen. A foreground shoulder or partially occluded person is visible; a person only spoken to or mentioned can be offscreen. Use [] for frames with no Known characters, not for anonymous descriptions of known people.
Make routine visible/offscreen staging decisions yourself from the brief, framing, action, eyelines and neighboring panels; do not ask the user to complete cast bookkeeping. Explicit user visibility instructions take priority. A close-up's offscreen listener is not another visible subject; an over-the-shoulder foreground shoulder is visible. Never default every mentioned person to visible or every omitted cast entry to offscreen. Before returning, check all known character mentions in prompt, beat and notes, including offscreen dialogue/eyeline targets: give each exactly one matching cast entry. Reconcile the text with that decision without dropping a required action or character merely to pass validation.
For every visible identity assign an explicit screen-left/center/right position AND foreground/midground/background depth, action/pose, and eyeline target. Keep this assignment attached to the exact tag in the prompt, not to "the other person" or an image's array position. Preserve physical geography and prop ownership; screen positions are camera-relative, so a reverse angle or explicit crossing may change them. Never blindly mirror a shot or swap identities to fill its composition. Distinguish one person's multiple reference-sheet views from multiple people. Do not add offscreen or other scene characters to a close-up. The cast, frame prompt, and beat must agree.
Decide physical occupancy before shot focus: people retain their established seats/places while listening. If that space is still visible, keep its occupant visible. A tighter single must actually crop the other seat out, not leave an empty half of the same composition. Justify wholly offscreen characters by the camera's view boundaries or a motivated occlusion, not by who is acting. Preserve legitimate singles, inserts and reverses without requiring everyone in every shot.`;

export function assertStoryboardCharacterTags(characters = []) {
  const seen = new Set();
  for (const character of characters) {
    const tag = cleanReferenceTag(character.tag);
    if (!tag) throw new Error("Every Storyboard character needs a unique name tag before planning or generating.");
    const key = tag.toLowerCase();
    if (seen.has(key)) throw new Error(`More than one Storyboard character uses @${tag}. Give each character a unique name before planning or generating.`);
    seen.add(key);
  }
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function storyboardCharacterMentioned(value, character) {
  if (promptHasReferenceTag(value, character.tag)) return true;
  const name = String(character.name || character.tag || "").trim();
  if (!name) return false;
  return new RegExp(`(?:^|[^A-Za-z0-9_@-])${escapeRegExp(name)}(?![A-Za-z0-9_-])`, "i").test(String(value || ""));
}

export function storyboardCastPlanIssues(frames = [], characters = []) {
  const known = new Map(characters.map((item) => [cleanReferenceTag(item.tag).toLowerCase(), item]));
  const issues = [];
  for (const frame of frames) {
    const prefix = `Frame ${frame.number}:`;
    if (!Array.isArray(frame.cast)) { issues.push(`${prefix} include an explicit cast array.`); continue; }
    const seen = new Set();
    for (const member of frame.cast) {
      if (!member || typeof member.tag !== "string" || !/^[A-Za-z0-9_-]{1,28}$/.test(member.tag)) {
        issues.push(`${prefix} use an exact character tag without @.`);
        continue;
      }
      const key = cleanReferenceTag(member?.tag).toLowerCase();
      if (!known.has(key)) issues.push(`${prefix} unknown character @${member?.tag || "?"}.`);
      if (seen.has(key)) issues.push(`${prefix} @${member.tag} appears more than once in the cast.`);
      seen.add(key);
      if (!["visible", "offscreen"].includes(member?.visibility) || !String(member?.position || "").trim() || !String(member?.action || "").trim()) {
        issues.push(`${prefix} give @${member?.tag || "?"} a visibility, position and action.`);
      }
      if (member?.visibility === "visible" && !promptHasReferenceTag(frame.prompt, member.tag)) {
        issues.push(`${prefix} use visible @${member.tag} explicitly in the frame prompt.`);
      }
    }
    const content = [frame.prompt, frame.beat, frame.notes].filter(Boolean).join("\n");
    for (const [key, character] of known) {
      if (storyboardCharacterMentioned(content, character) && !seen.has(key)) issues.push(`${prefix} specify whether @${character.tag} is visible or offscreen.`);
    }
  }
  return issues;
}

export function storyboardCastFingerprint(frame = {}) {
  const fields = [frame.prompt, frame.beat, frame.notes, frame.shot, frame.lens, frame.angle].map((value) => String(value || ""));
  // Preserve legacy signatures; new spatial directions are invalidated by manual edits too.
  if (frame.spatial) fields.push(JSON.stringify(frame.spatial), String(frame.cameraSide || ""));
  return JSON.stringify(fields);
}

export function storyboardPlannedCastPatch(frame) {
  return Array.isArray(frame.cast)
    ? { cast: frame.cast.map((member) => ({ ...member })), castSource: storyboardCastFingerprint(frame) }
    : {};
}

export function currentStoryboardCast(frame = {}) {
  // A manually edited prompt must never inherit stale hidden blocking instructions.
  return Array.isArray(frame.cast) && frame.castSource === storyboardCastFingerprint(frame) ? frame.cast : null;
}

export function resolveStoryboardFrameCast(frame, characters = []) {
  assertStoryboardCharacterTags(characters);
  const cast = currentStoryboardCast(frame);
  const content = [frame.prompt, frame.beat, frame.notes].filter(Boolean).join("\n");
  if (cast) {
    const issues = [...storyboardCastPlanIssues([frame], characters), ...storyboardSpatialPlanIssues([frame], characters).map(issue => issue.message)];
    if (issues.length) throw new Error(`${issues[0]} Update the frame's @tags or plan frames again.`);
  }
  const referenced = cast
    ? cast.filter((member) => member.visibility === "visible").map((member) => characters.find((item) => cleanReferenceTag(item.tag).toLowerCase() === member.tag.toLowerCase()))
    : characters.filter((item) => storyboardCharacterMentioned(content, item));
  const peopleMentioned = /\b(character|person|people|subjects?|hero|protagonist|men|women|man|woman|boy|girl|he|she|they|their|him|her)\b/i.test(content);
  if (!cast && !referenced.length && peopleMentioned && characters.length > 1) {
    throw new Error(`Frame ${frame.number}: the character identities are ambiguous. Use their @tags in this frame or plan frames again before generating.`);
  }
  if (!cast && !referenced.length && peopleMentioned && characters.length === 1) referenced.push(characters[0]);
  for (const character of referenced) {
    if (!character.url) throw new Error(`Character sheet missing for @${character.tag}. Prepare or reconnect that character before generating frame ${frame.number}.`);
  }
  return { cast, references: referenced };
}

export function storyboardCastPrompt(frame, references = []) {
  const cast = currentStoryboardCast(frame);
  const visible = cast?.filter((member) => member.visibility === "visible");
  return [
    "FRAME CAST AND BLOCKING: This frame's prompt and cast control who is visible and where, based on physical staging and the actual camera view, not just the active speaker. The full scene and prior frames establish occupancy and geography, not instructions to add characters whose positions genuinely lie outside this view. A listener inside the visible area must not disappear; a partial body or foreground shoulder is visible.",
    cast ? `Visible referenced cast: ${visible.length} distinct ${visible.length === 1 ? "identity" : "identities"}${visible.length ? ` (${visible.map((member) => `@${member.tag}`).join(", ")})` : ""}. Depict each once unless the current prompt explicitly requests a reflection or multiple depiction of that same person. Do not invent additional people or crowd members beyond the current frame prompt.` : "Show only the characters required by the current frame. Mentioned offscreen people must stay offscreen; an eyeline target is not automatically another visible person.",
    ...(cast || []).map((member) => member.visibility === "offscreen"
      ? `@${member.tag}: OFFSCREEN, do not depict. ${member.action}. Eyeline/context: ${member.eyeline || "follow frame prompt"}.`
      : `@${member.tag}: ${member.position}. Action/pose: ${member.action}. Eyeline: ${member.eyeline || "follow frame prompt"}.`),
    ...references.map((item, index) => `Generation reference image ${index + 1}, "${item.label}", defines @${item.tag} ONLY: identity and baseline wardrobe; apply the current frame's explicit action/state changes.`),
    "Each character sheet shows multiple views of ONE identity, not a group, twins or extra cast. Never copy its panel layout or duplicate its subject. Do not blend or transfer faces, hair, clothing, physical traits, actions or positions between tags. Location/style images and previous frames cannot override the current cast or identity sheets. Screen-left and screen-right refer to this camera view, not the subject's own left/right."
  ].join("\n");
}

export function storyboardQcCharacterInputs(references = []) {
  if (!Array.isArray(references) || references.length > 16) throw new Error("Storyboard QC accepts up to 16 named character references.");
  assertStoryboardCharacterTags(references);
  return references.map((item) => {
    if (typeof item.url !== "string" || !item.url.trim()) throw new Error(`Storyboard QC needs the original sheet for @${item.tag}.`);
    return { url: item.url, label: `Identity reference for @${cleanReferenceTag(item.tag)} only (multiple views of one person)` };
  });
}
