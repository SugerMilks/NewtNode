const shotScaleOrder = ["ECU", "CU", "MCU", "MS", "MWS", "WS", "EWS"];

export function normalizeFilmDirectorShotFrame(value = "") {
  const frame = String(value || "")
    .toUpperCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(ECU|XCU|EXTREME CLOSE(?: UP)?)$/.test(frame)) return "ECU";
  if (/^(CU|CLOSE(?: UP)?)$/.test(frame)) return "CU";
  if (/^(MCU|MEDIUM CLOSE(?: UP)?)$/.test(frame)) return "MCU";
  if (/^(MS|MEDIUM(?: SHOT)?)$/.test(frame)) return "MS";
  if (/^(MWS|MEDIUM WIDE(?: SHOT)?)$/.test(frame)) return "MWS";
  if (/^(WS|WIDE(?: SHOT)?)$/.test(frame)) return "WS";
  if (/^(EWS|EXTREME WIDE(?: SHOT)?)$/.test(frame)) return "EWS";
  return frame;
}

export function filmDirectorShotScaleDistance(left = "", right = "") {
  const leftIndex = shotScaleOrder.indexOf(normalizeFilmDirectorShotFrame(left));
  const rightIndex = shotScaleOrder.indexOf(normalizeFilmDirectorShotFrame(right));
  return leftIndex >= 0 && rightIndex >= 0 ? Math.abs(leftIndex - rightIndex) : null;
}

export function filmDirectorMentionedCharacterTags(description = "", characterTags = []) {
  const source = String(description || "").toLowerCase();
  return [...new Set(characterTags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .filter((tag) => source.includes(tag.toLowerCase())))];
}

export function filmDirectorAdjacentCoverageIssue(previous = {}, current = {}, characterTags = []) {
  const distance = filmDirectorShotScaleDistance(previous.shotFrame, current.shotFrame);
  if (distance === null || distance > 1) return "";

  const previousSubjects = filmDirectorMentionedCharacterTags(previous.description, characterTags);
  const currentSubjects = filmDirectorMentionedCharacterTags(current.description, characterTags);
  const cleanCharacterTags = [...new Set(characterTags.map((tag) => String(tag || "").trim()).filter(Boolean))];
  const clearlyChangedSubject =
    cleanCharacterTags.length > 1 &&
    previousSubjects.length === 1 &&
    currentSubjects.length === 1 &&
    previousSubjects[0].toLowerCase() !== currentSubjects[0].toLowerCase();

  if (clearlyChangedSubject) return "";
  return "use a more distinct adjacent shot size unless the cut clearly changes to another character";
}
