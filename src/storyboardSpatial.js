import { cleanReferenceTag } from "./referenceTags.js";

const text = { type: "string", minLength: 1, maxLength: 600, pattern: "\\S" };
const tag = { type: "string", minLength: 1, maxLength: 28, pattern: "^[A-Za-z0-9_-]+$" };
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: "array", items, maxItems: 16 });

export const storyboardSpatialSchema = object({
  spaceId: text,
  cameraSetupId: text,
  view: text,
  visiblePlaces: { type: "array", items: text, maxItems: 32 },
  present: list(object({ tag, place: text })),
  hidden: list(object({ tag, reason: { type: "string", enum: ["outside-frame", "occluded"] }, explanation: text })),
  blockingChange: { type: "string", maxLength: 600 }
});

export const storyboardSpatialRules = `PHYSICAL OCCUPANCY BEFORE SHOT FOCUS: A character becoming the focus does not make their scene partner disappear. Establish fixed world positions (seats, sides of a table, doorways) before selecting the camera. Fill spatial for every panel, including inserts. Use a stable spaceId for each continuous location/time, not a new ID per panel. In present, list every known character physically there, even outside the crop, using stable world-place descriptions, not screen coordinates. Connected references are a roster, not proof that everyone is on set. Preserve present and place until an explicit entrance, exit or physical move; describe that event in blockingChange, otherwise use an empty string. A glance, line of dialogue, sip, emotional beat or change of attention is not a blocking change.
Use a stable cameraSetupId for the same camera position, lens, orientation AND crop, including a return to that setup. Change the ID only for a real reframing, angle change or move. Describe the actual field of view and frame boundaries in view: which established seats/areas are inside, which fall outside, and why. List those in-view world places in visiblePlaces using exactly the same place strings as present; include partially visible places, even if an opaque object obscures the occupant. A lens number or MS/CU label alone is not a framing explanation. For every present person, include a cast entry. Any shoulder, hand, silhouette or partially obscured body is visible, not offscreen. For a wholly unseen present person use offscreen in cast plus one hidden entry explaining a concrete crop boundary or opaque occluder. Someone who has left the location is no longer in present, not a cropped-out occupant.
Before returning, project ALL present people into the camera view, not just the active speaker. If an established seat remains in frame, keep its occupant visible. In a two-person table scene, do not leave an empty half of the same table composition where the listening partner should be. Preserve both people or genuinely reframe so that partner's seat is outside the image. A clean single, insert, reverse or motivated occlusion is valid; never force everyone into every shot. Continuous keyframes and returns to a camera setup must preserve visible occupancy unless physical blocking or actual reframing explains the change. Synchronize spatial, cast and the self-contained image prompt; do not invent an exit, occluder or camera cut just to conceal an omission.`;

const key = value => cleanReferenceTag(value).toLowerCase();
const nonempty = value => typeof value === "string" && Boolean(value.trim());

// Check explicit planning facts, not guessed geometry from arbitrary prompt prose.
export function storyboardSpatialPlanIssues(frames = [], characters = []) {
  const known = new Set(characters.map(character => key(character.tag)));
  const issues = [];
  let previous = null;
  let setups = new Map();
  for (const frame of frames) {
    const spatial = frame.spatial;
    if (!spatial) { previous = null; setups = new Map(); continue; } // Legacy directions remain usable.
    const add = message => issues.push({ number: frame.number, message: `Frame ${frame.number}: ${message}` });
    if (!nonempty(spatial.spaceId) || !nonempty(spatial.cameraSetupId) || !nonempty(spatial.view)
      || !Array.isArray(spatial.present) || !Array.isArray(spatial.hidden) || !Array.isArray(spatial.visiblePlaces) || typeof spatial.blockingChange !== "string") {
      add("include complete physical staging and camera-view information.");
      previous = null; setups = new Map(); continue;
    }
    const present = new Map(), hidden = new Map();
    if (new Set(spatial.visiblePlaces).size !== spatial.visiblePlaces.length || spatial.visiblePlaces.some(place => !nonempty(place))) add("list each in-view world place once using its established name.");
    for (const member of spatial.present) {
      const id = key(member?.tag);
      if (!known.has(id) || present.has(id) || !nonempty(member?.place)) add(`give each on-set character one known tag and fixed world place (@${member?.tag || "?"}).`);
      present.set(id, member);
    }
    for (const member of spatial.hidden) {
      const id = key(member?.tag);
      if (!present.has(id) || hidden.has(id) || !["outside-frame", "occluded"].includes(member?.reason) || !nonempty(member?.explanation)) add(`explain one concrete framing exclusion for present @${member?.tag || "?"}.`);
      hidden.set(id, member);
    }
    const cast = new Map((frame.cast || []).map(member => [key(member?.tag), member]));
    for (const [id, member] of present) {
      if (!cast.has(id)) add(`@${member.tag} is physically present but missing from the cast; decide visibility from the camera view, not the active action.`);
      else if (cast.get(id).visibility === "offscreen" && !hidden.has(id)) add(`explain why present @${member.tag} is completely outside the frame or occluded.`);
      if (hidden.get(id)?.reason === "outside-frame" && spatial.visiblePlaces.includes(member.place)) add(`@${member.tag}'s established place (${member.place}) is still in view; they cannot be cropped out of that visible space.`);
    }
    for (const [id, member] of cast) {
      if (member?.visibility === "visible" && (!present.has(id) || hidden.has(id))) add(`visible @${member.tag} must occupy a world place and cannot also be wholly hidden.`);
      if (member?.visibility === "visible" && present.has(id) && !spatial.visiblePlaces.includes(present.get(id).place)) add(`visible @${member.tag}'s place must be within this camera view, including partial bodies.`);
    }
    const sameSpace = previous?.spatial.spaceId === spatial.spaceId;
    if (!sameSpace || nonempty(spatial.blockingChange)) setups = new Map();
    if (sameSpace && !nonempty(spatial.blockingChange)) {
      const before = new Map(previous.spatial.present.map(member => [key(member.tag), member]));
      for (const [id, member] of before) {
        if (!present.has(id)) add(`@${member.tag} disappears from the scene without an exit or location/time change.`);
        else if (present.get(id).place !== member.place) add(`@${member.tag} changes world place without physical movement; screen position is not a world place.`);
      }
      for (const [id, member] of present) if (!before.has(id)) add(`@${member.tag} enters the scene without an entrance or location/time change.`);
    }
    const held = setups.get(spatial.cameraSetupId);
    if (held) {
      if (JSON.stringify([...held.spatial.visiblePlaces].sort()) !== JSON.stringify([...spatial.visiblePlaces].sort())) add(`unchanged camera setup ${spatial.cameraSetupId} cannot silently change its visible world places.`);
      const before = new Map((held.cast || []).map(member => [key(member?.tag), member?.visibility]));
      for (const [id, member] of present) {
        if (before.has(id) && cast.has(id) && before.get(id) !== cast.get(id).visibility) add(`@${member.tag} changes visibility in unchanged camera setup ${spatial.cameraSetupId}; preserve occupancy or justify real reframing/blocking, not a change of focus.`);
      }
    }
    if (!held) setups.set(spatial.cameraSetupId, frame);
    previous = frame;
  }
  return issues;
}

export function storyboardSpatialPrompt(spatial) {
  if (!spatial) return "";
  return [
    `PHYSICAL STAGING: Space ${spatial.spaceId}; camera setup ${spatial.cameraSetupId}. Actual view: ${spatial.view}`,
    `World places inside this frame: ${spatial.visiblePlaces.join("; ") || "none of the established character places"}.`,
    `People physically in this space (not automatically all visible): ${spatial.present.map(member => `@${member.tag} at ${member.place}`).join("; ") || "none"}.`,
    ...spatial.hidden.map(member => `@${member.tag} remains in the scene but is wholly ${member.reason}: ${member.explanation}. Do not depict them in this view.`),
    `Physical blocking change: ${spatial.blockingChange || "none; retain established positions"}.`,
    "Keep every occupied seat/area that lies inside this view occupied, even when its character is only listening. Partial bodies count as visible. Do not erase a partner while leaving their established space visible. A truly cropped-out person stays outside this image; do not widen a deliberate single or insert to include them."
  ].join("\n");
}
