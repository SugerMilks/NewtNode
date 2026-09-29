import { storyboardCastSchema, storyboardPlannedCastPatch, storyboardCastPlanIssues, storyboardCharacterMentioned, currentStoryboardCast } from "./storyboardCast.js";
import { cleanReferenceTag } from "./referenceTags.js";
import { storyboardSpatialSchema, storyboardSpatialPlanIssues, storyboardSpatialPrompt } from "./storyboardSpatial.js";

export const storyboardSkillVersion = "2.2.0";
// Narrative remains the saved/planner value; Standard is its user-facing name.
export const storyboardApproachDetails = {
  Narrative: { label: "Standard", description: "Story-first coverage of key actions, reveals, and emotional beats." },
  Dialogue: { label: "Dialogue", description: "Conversation-led coverage of speakers, listeners, reactions, and eyelines." },
  Action: { label: "Action", description: "Clear movement and cause and effect, with readable spatial continuity." },
  Commercial: { label: "Commercial", description: "Product or subject-led coverage with purposeful reveals and detail shots." },
  Montage: { label: "Montage", description: "Distinct moments or vignettes connected by an overall idea and rhythm." }
};
export const storyboardApproaches = Object.keys(storyboardApproachDetails);
export const storyboardPacing = ["Measured", "Balanced", "Energetic"];
const text = { type: "string", maxLength: 1400 };
const requiredText = { ...text, minLength: 1, pattern: "\\S" };
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const list = (items, maxItems = 35) => ({ type: "array", items, maxItems });
export const storyboardFrameSchema = object({
  id: requiredText, number: { type: "integer", minimum: 1, maximum: 35 },
  shotId: requiredText, phase: { type: "string", enum: ["single", "opening", "transition", "ending"] },
  purpose: requiredText, beat: requiredText, prompt: requiredText, notes: text,
  shot: { type: "string", enum: ["None", "CU", "MS", "WS", "ECU", "EWS"] },
  lens: { type: "string", enum: ["None", "8mm", "18mm", "35mm", "50mm", "85mm", "120mm"] },
  angle: { type: "string", enum: ["None", "Macro", "Low Angle", "High Angle", "Extreme High", "Bird's Eye View", "Extreme Low", "Portrait", "Profile", "Selfie"] },
  durationSeconds: { type: "number", minimum: 0, maximum: 600 },
  stateBefore: text, stateAfter: text, cameraSide: text, cast: storyboardCastSchema, spatial: storyboardSpatialSchema
});
export const storyboardContinuitySchema = object({
  geography: text, axis: text, lighting: text,
  props: list(object({ tag: requiredText, owner: text, state: text }), 32)
});
export const storyboardPlanSchema = object({
  sceneTitle: requiredText, analysis: requiredText, continuity: storyboardContinuitySchema,
  frames: { ...list(storyboardFrameSchema), minItems: 1 }
});
export const storyboardRevisionSchema = object({
  summary: requiredText, frames: { ...list(storyboardFrameSchema, 8), minItems: 1 },
  affectedFrameIds: list(requiredText), warnings: list(requiredText, 12)
});
export const storyboardCastRepairSchema = object({
  frames: { ...list(object({
    number: storyboardFrameSchema.properties.number,
    prompt: requiredText, beat: requiredText, notes: text, cast: storyboardCastSchema, spatial: storyboardSpatialSchema
  })), minItems: 1 }
});
export const storyboardReviewSchema = object({
  summary: requiredText,
  issues: list(object({ frameIds: list(requiredText), severity: { type: "string", enum: ["minor", "major"] }, message: requiredText }), 16)
});

export function storyboardPlanningSettings(data = {}) {
  const duration = Number(data.storyboardTargetDuration);
  return {
    approach: storyboardApproaches.includes(data.storyboardApproach) ? data.storyboardApproach : "Narrative",
    pacing: storyboardPacing.includes(data.storyboardPacing) ? data.storyboardPacing : "Balanced",
    targetDuration: Number.isFinite(duration) && duration > 0 ? Math.min(600, duration) : null
  };
}

export function storyboardRevisionTargets(frames, ids, limit = 8) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("Select the panels to revise first.");
  if (ids.length > limit) throw new Error(`Revise up to ${limit} panels at a time.`);
  const targets = ids.map(id => frames.find(frame => frame.id === id));
  if (targets.some(frame => !frame)) throw new Error("A selected panel no longer exists. Select the panels again.");
  if (targets.some(frame => frame.protected)) throw new Error("Unprotect selected panels before revising them.");
  return targets;
}

export function storyboardPlanStructureIssues(frames = []) {
  const issues = [];
  const seen = new Set();
  let previousShot = "";
  for (const frame of frames) {
    if (frame.shotId !== previousShot && seen.has(frame.shotId)) issues.push(`Shot ${frame.shotId} has noncontiguous keyframes.`);
    seen.add(frame.shotId);
    previousShot = frame.shotId;
  }
  for (const shotId of seen) {
    const shot = frames.filter(frame => frame.shotId === shotId);
    if (shot.length > 1 && (shot[0].phase !== "opening" || shot.at(-1).phase !== "ending" || shot.slice(1, -1).some(frame => frame.phase !== "transition"))) {
      issues.push(`Shot ${shotId} needs opening, optional transitions, and ending keyframes.`);
    }
    if (shot.length === 1 && shot[0].phase !== "single") issues.push(`Shot ${shotId} has only one panel and must use the single phase.`);
  }
  return issues;
}

export function validateStoryboardRevisionStructure(revision, frames, ids) {
  const targets = storyboardRevisionTargets(frames, ids);
  const revised = revision?.frames;
  if (!Array.isArray(revised) || revised.length !== targets.length || new Set(revised.map(frame => frame.id)).size !== targets.length) throw new Error("The revision did not return exactly the selected panels. Existing panels are unchanged.");
  for (const frame of revised) {
    const original = targets.find(target => target.id === frame.id);
    if (!original || original.number !== frame.number) throw new Error("The revision changed panel identities or ordering. Existing panels are unchanged.");
  }
  if ((revision.affectedFrameIds || []).some(id => !frames.some(frame => frame.id === id))) throw new Error("The revision referenced an unknown panel.");
  const merged = frames.map(frame => revised.find(item => item.id === frame.id) || frame);
  const issues = storyboardPlanStructureIssues(merged.filter(frame => frame.shotId));
  if (issues.length) throw new Error(`Revision needs correction: ${issues.join(" ")} Existing panels are unchanged.`);
  return revised;
}

export function validateStoryboardRevision(revision, frames, ids, characters = []) {
  const revised = validateStoryboardRevisionStructure(revision, frames, ids);
  const merged = frames.map(frame => revised.find(item => item.id === frame.id) || frame);
  const issues = storyboardCastRepairTargets(revised, characters, merged).flatMap(target => target.issues);
  if (issues.length) throw new Error(`Revision needs correction: ${issues.join(" ")} Existing panels are unchanged.`);
  return revised.map(frame => ({ ...storyboardFrameDirection(frame), ...storyboardPlannedCastPatch(frame) }));
}

export function storyboardCastRepairTargets(frames, characters, contextFrames = frames) {
  const spatialIssues = storyboardSpatialPlanIssues(contextFrames, characters);
  return frames.flatMap(frame => {
    const issues = [...storyboardCastPlanIssues([frame], characters), ...spatialIssues.filter(issue => issue.number === frame.number).map(issue => issue.message)];
    return issues.length ? [{ number: frame.number, issues }] : [];
  });
}

export function applyStoryboardCastRepair(draft, repair, characters, contextFrames = draft.frames) {
  const targets = storyboardCastRepairTargets(draft.frames, characters, contextFrames);
  const patches = repair?.frames;
  if (!targets.length || !Array.isArray(patches) || patches.length !== targets.length
    || new Set(patches.map(frame => frame.number)).size !== targets.length
    || patches.some(frame => !targets.some(target => target.number === frame.number))) {
    throw new Error("Character staging correction did not return exactly the affected panels.");
  }
  // Only staging text and cast may change; camera, identity, timing and all other panels stay intact.
  const frames = draft.frames.map(frame => {
    const patch = patches.find(item => item.number === frame.number);
    if (patch) {
      const content = [frame.prompt, frame.beat, frame.notes].filter(Boolean).join("\n");
      const required = characters.filter(character => storyboardCharacterMentioned(content, character)
        || [...(frame.cast || []), ...(frame.spatial?.present || [])].some(member => member.tag?.toLowerCase() === cleanReferenceTag(character.tag).toLowerCase()));
      if (required.some(character => !patch.cast?.some(member => member.tag?.toLowerCase() === cleanReferenceTag(character.tag).toLowerCase()))) {
        throw new Error(`Character staging correction dropped a required character from frame ${frame.number}.`);
      }
      if (frame.spatial && (patch.spatial?.spaceId !== frame.spatial.spaceId || patch.spatial?.cameraSetupId !== frame.spatial.cameraSetupId
        || patch.spatial?.blockingChange !== frame.spatial.blockingChange || patch.spatial?.view !== frame.spatial.view
        || JSON.stringify(patch.spatial?.visiblePlaces) !== JSON.stringify(frame.spatial.visiblePlaces))) {
        throw new Error(`Character staging correction changed the established camera or physical action in frame ${frame.number}.`);
      }
    }
    return patch ? { ...frame, prompt: patch.prompt, beat: patch.beat, notes: patch.notes, cast: structuredClone(patch.cast), spatial: structuredClone(patch.spatial) } : frame;
  });
  const merged = contextFrames.map(frame => frames.find(item => item.number === frame.number) || frame);
  const issues = storyboardCastRepairTargets(frames, characters, merged).flatMap(target => target.issues);
  if (issues.length) throw new Error(`Automatic character staging correction could not resolve the plan: ${issues.join(" ")}`);
  return { ...draft, frames };
}

export function storyboardFrameSnapshot(frame) {
  const { versions, status, error, ...snapshot } = frame;
  return structuredClone({ ...snapshot, ...(frame.generatedDirection || {}) });
}

export function storyboardPanelEditingLocked(node, frame) {
  return ["planning", "revising", "reviewing-sequence", "compiling-characters", "compiling-board", "exporting"].includes(node?.data?.status)
    || ["queued", "running", "reviewing"].includes(frame?.status);
}

export function storyboardFrameWithVersion(original, patch, now = Date.now()) {
  const versions = original.resultUrl || original.exportUrl
    ? [...(original.versions || []), { ...storyboardFrameSnapshot(original), savedAt: now }].slice(-8)
    : original.versions || [];
  return { ...original, ...patch, id: original.id, number: original.number, protected: original.protected === true, versions };
}

export function restoreStoryboardFrameVersion(frame, index) {
  const version = frame.versions?.[index];
  if (!version) throw new Error("That panel version is no longer available.");
  if (frame.protected) throw new Error("Unprotect the panel before restoring a version.");
  return storyboardFrameWithVersion(frame, { ...version, status: "complete", error: "", resultVersion: Date.now() });
}

export function storyboardFrameDirection(frame) {
  return Object.fromEntries(Object.keys(storyboardFrameSchema.properties).map(key => [key, frame[key] ?? (key === "spatial" ? null : key === "cast" ? [] : key === "durationSeconds" ? 0 : "")]));
}

export function storyboardFrameContext(frame) {
  return [frame.purpose && `Shot purpose: ${frame.purpose}`, frame.shotId && `Shot ${frame.shotId}, ${frame.phase || "single"} keyframe`, frame.cameraSide && `Camera side: ${frame.cameraSide}`, frame.stateBefore && `Before this moment: ${frame.stateBefore}`, frame.stateAfter && `State reached after this moment: ${frame.stateAfter}`, currentStoryboardCast(frame) && storyboardSpatialPrompt(frame.spatial)].filter(Boolean).join("\n");
}

export function storyboardBoardSignature(frames = []) {
  return JSON.stringify(frames.map(frame => [frame.id, frame.number, frame.resultUrl, frame.exportUrl, frame.prompt, frame.beat, frame.notes, frame.shot, frame.lens, frame.angle]));
}

export function storyboardEditSignature(frames = []) {
  return JSON.stringify(frames.map(frame => ({ ...storyboardFrameDirection(frame), resultUrl: frame.resultUrl || "", exportUrl: frame.exportUrl || "", protected: frame.protected === true })));
}
