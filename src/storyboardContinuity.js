export const storyboardContinuityRules = `WORLD-SPACE CONTINUITY: Keep each person's seat, side of the table, distance to their partner, and relationship to fixed landmarks until an explicit physical move. Screen-left/right alone is not proof of correct blocking. A camera move, laptop turn or change of attention never moves a chair or brings opposite-seat partners side by side.
PROP STATE: Track owner, tabletop position, hinge/base orientation and which person the screen or working face points toward. Distinguish rotating an object from moving its operator or viewer. Preserve the preceding state until the current shot explicitly changes it; carry that changed state forward afterward. A future turn or reveal in the full scene is not permission to show it early. An object partly entering a crop still obeys continuity. Do not force a cropped-out prop into view.
CAMERA AXIS AND INSERTS: Derive the action line from the established world positions and describe the camera's physical side using a fixed landmark, not just the claim "same side". Verify what the lens can actually see: display face versus lid back, reachable keyboard, hand-entry direction, near/far shoulders and window/table sides. A screen insert does not reset the 180-degree line or permit two opposite-seat people to appear shoulder-to-shoulder. Reframe or crop to a physically possible view without moving people, mirroring the set, rotating the prop early, or forcing both shoulders into an insert. Preserve explicit requested blocking and intentional, explained axis crossings. Camera roll and lens distortion are not axis crossings.
FRAME-LOCAL TIME: Render only the current drawable instant and its stated before/after transition. Later actions, screen contents and reveals are background context, never events to depict now. A screen thumbnail can depict a later result without that event already existing outside the screen. Preserve subtle acting latitude; seat swaps, unsupported axis crossings and premature prop rotations are structural continuity errors, not performance polish.`;

export function storyboardContinuityFrames(frames, frame, referenceUrl) {
  const index = frames.findIndex(item => item.id === frame.id);
  if (index <= 0) return [];
  let prior = frames.slice(0, index);
  const spaceId = frame.spatial?.spaceId || prior.at(-1)?.spatial?.spaceId;
  if (spaceId) {
    let start = prior.length;
    while (start > 0 && prior[start - 1].spatial?.spaceId === spaceId) start--;
    prior = prior.slice(start);
  }
  const approved = prior.filter(item => referenceUrl(item));
  const previous = approved.at(-1);
  if (!previous) return [];
  // Retain the first usable geography anchor, even after an approved shot drifts.
  // Current staging/state remains authoritative for motivated later moves.
  const broad = item => {
    if (["CU", "ECU", "OTS"].includes(String(item.shot || "").toUpperCase())) return false;
    if (/\b(insert|macro|screen close[- ]?up)\b/i.test([item.purpose, item.beat].filter(Boolean).join(" "))) return false;
    return ["EWS", "WS", "MWS", "MLS", "MS"].includes(String(item.shot || "").toUpperCase());
  };
  const anchor = approved.find(broad);
  return anchor && referenceUrl(anchor) !== referenceUrl(previous) ? [previous, anchor] : [previous];
}

export function storyboardRenderSceneContext(data, sceneDescription = "", connectedDescription = "") {
  // Shot List generation already has a self-contained planned prompt. Sending
  // every authored shot again invites later prop states and reveals into this one.
  return data?.storyboardApproach === "Shot List" ? String(connectedDescription || data.sceneDescription || "") : sceneDescription;
}
