export const filmDirectorStageKeys = ["setup", "style", "motion", "scene", "shotList"];

function stableFilmDirectorValue(value) {
  if (Array.isArray(value)) return value.map(stableFilmDirectorValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableFilmDirectorValue(entry)])
    );
  }
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value ?? "";
}

function compactFilmDirectorHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function filmDirectorInputSourceSignature(items = [], scope = "setup") {
  const sources = (Array.isArray(items) ? items : [])
    .map((item) => {
      const source = item?.source || item || {};
      const data = source?.data || {};
      const sourceItems = Array.isArray(data.transferImages)
        ? data.transferImages
        : Array.isArray(data.resultItems)
          ? data.resultItems
          : [];
      return stableFilmDirectorValue({
        sourceId: source.id || item?.sourceId || item?.id || "",
        outputPort: item?.edge?.from?.port || item?.outputPort || "",
        resultUrl: item?.url || data.resultUrl || "",
        fileName: data.fileName || item?.fileName || "",
        title: data.title || item?.label || "",
        characterName: data.characterName || "",
        activeResultIndex: data.activeResultIndex ?? data.resultIndex ?? item?.activeResultIndex ?? "",
        activeSheetId: data.characterActiveSheetId || data.activeSheetId || item?.activeSheetId || "",
        sourceItems: sourceItems.map((sourceItem) => ({
          id: sourceItem?.id || "",
          url: sourceItem?.fullResolutionUrl || sourceItem?.url || sourceItem?.localUrl || "",
          fileName: sourceItem?.fileName || ""
        }))
      });
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return `${String(scope || "setup")}-${compactFilmDirectorHash(JSON.stringify(sources))}`;
}

export function filmDirectorSetupInputChanges(data = {}, current = {}) {
  const previousStyle = String(data.skillDirectorLockedStyleInputSignature || "");
  const previousAssets = String(data.skillDirectorLockedAssetInputSignature || "");
  const currentStyle = String(current.style || "");
  const currentAssets = String(current.assets || "");
  return {
    styleChanged: previousStyle
      ? Boolean(currentStyle && previousStyle !== currentStyle)
      : Boolean(current.hasStyleInputs && data.styleDirection && (data.skillDirectorBuilt || data.resultText)),
    assetsChanged: Boolean(previousAssets && currentAssets && previousAssets !== currentAssets)
  };
}

function normalizedFilmDirectorReferenceTag(value = "") {
  return String(value || "").replace(/^@+/, "").trim().toLowerCase();
}

export function filmDirectorSetupManifestChanges(previous = [], current = [], referencedTags = []) {
  const activeTags = new Set(
    [...(referencedTags instanceof Set ? referencedTags : Array.isArray(referencedTags) ? referencedTags : [])]
      .map(normalizedFilmDirectorReferenceTag)
      .filter(Boolean)
  );
  const previousItems = Array.isArray(previous) ? previous.filter(Boolean) : [];
  const currentItems = Array.isArray(current) ? current.filter(Boolean) : [];
  const categories = [...new Set([...previousItems, ...currentItems].map((item) => String(item.category || "element")))];
  const changedCategories = new Set();
  const replacements = [];
  const disconnectedTags = [];

  categories.forEach((category) => {
    const before = previousItems.filter((item) => String(item.category || "element") === category);
    const after = currentItems.filter((item) => String(item.category || "element") === category);
    const beforeById = new Map(before.map((item) => [String(item.sourceId || ""), item]));
    const afterById = new Map(after.map((item) => [String(item.sourceId || ""), item]));
    const changedInPlace = before.filter((item) => {
      const next = afterById.get(String(item.sourceId || ""));
      if (!next || String(item.signature || "") === String(next.signature || "")) return false;
      return activeTags.has(normalizedFilmDirectorReferenceTag(item.tag)) || activeTags.has(normalizedFilmDirectorReferenceTag(next.tag));
    });
    const removed = before.filter((item) => !afterById.has(String(item.sourceId || "")));
    const added = after.filter((item) => !beforeById.has(String(item.sourceId || "")));
    const usedRemoved = removed.filter((item) => activeTags.has(normalizedFilmDirectorReferenceTag(item.tag)));
    const usedAdded = added.filter((item) => activeTags.has(normalizedFilmDirectorReferenceTag(item.tag)));

    changedInPlace.forEach((item) => {
      const next = afterById.get(String(item.sourceId || ""));
      if (
        next
        && activeTags.has(normalizedFilmDirectorReferenceTag(item.tag))
        && normalizedFilmDirectorReferenceTag(item.tag) !== normalizedFilmDirectorReferenceTag(next.tag)
      ) {
        replacements.push({ from: item.tag, to: next.tag });
      }
    });

    if (usedRemoved.length === 1 && added.length === 1) {
      replacements.push({ from: usedRemoved[0].tag, to: added[0].tag });
    } else {
      disconnectedTags.push(...usedRemoved.map((item) => item.tag));
    }
    if (changedInPlace.length || usedRemoved.length || usedAdded.length) changedCategories.add(category);
  });

  return {
    characterChanged: changedCategories.has("character"),
    locationChanged: changedCategories.has("location"),
    propsChanged: changedCategories.has("element") || changedCategories.has("prop"),
    replacements,
    disconnectedTags: [...new Set(disconnectedTags.filter(Boolean))]
  };
}

function escapeFilmDirectorRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyFilmDirectorReferenceChanges(text = "", changes = {}) {
  let next = String(text || "");
  (Array.isArray(changes.replacements) ? changes.replacements : []).forEach((replacement) => {
    const from = String(replacement?.from || "").replace(/^@+/, "");
    const to = String(replacement?.to || "").replace(/^@+/, "");
    if (!from || !to) return;
    next = next.replace(new RegExp(`@${escapeFilmDirectorRegExp(from)}(?![A-Za-z0-9_-])`, "gi"), `@${to}`);
  });
  (Array.isArray(changes.disconnectedTags) ? changes.disconnectedTags : []).forEach((tag) => {
    const plain = String(tag || "").replace(/^@+/, "");
    if (!plain) return;
    next = next.replace(new RegExp(`@${escapeFilmDirectorRegExp(plain)}(?![A-Za-z0-9_-])`, "gi"), plain);
  });
  return next;
}

export function filmDirectorShotListSourceSignature(data = {}) {
  const source = stableFilmDirectorValue({
    sceneOverview: data.sceneOverview ?? data.text ?? "",
    motionDirection: data.motionDirection || data.motionBrief || "",
    shotCount: data.skillShotCount || data.shotCount || "3",
    referenceNotes: data.skillReferenceNotes || {}
  });
  return `shot-list-${compactFilmDirectorHash(JSON.stringify(source))}`;
}

export function markFilmDirectorStagesStale(staleStages = {}, stages = []) {
  const affected = new Set((Array.isArray(stages) ? stages : []).filter((stage) => filmDirectorStageKeys.includes(stage)));
  return {
    ...(staleStages || {}),
    ...Object.fromEntries([...affected].map((stage) => [stage, true]))
  };
}

export function clearFilmDirectorStageStale(staleStages = {}, stage = "") {
  if (!filmDirectorStageKeys.includes(stage)) return { ...(staleStages || {}) };
  return {
    ...(staleStages || {}),
    [stage]: false
  };
}

export function updateFilmDirectorStageLock(locks = {}, stage = "", locked = false) {
  if (!filmDirectorStageKeys.includes(stage)) return { ...(locks || {}) };
  return {
    ...(locks || {}),
    [stage]: Boolean(locked)
  };
}

export function unlockFilmDirectorStages(locks = {}, stages = []) {
  const affected = new Set((Array.isArray(stages) ? stages : []).filter((stage) => filmDirectorStageKeys.includes(stage)));
  return Object.fromEntries(
    Object.entries(locks || {}).map(([stage, locked]) => [stage, affected.has(stage) ? false : locked])
  );
}

export function filmDirectorStageNeedsDraft(stage = "", data = {}) {
  if (data.skillDirectorStaleStages?.[stage]) return true;
  if (stage === "style") return !String(data.styleDirection || "").trim();
  if (stage === "shotList") {
    if (!String(data.shotList || "").trim()) return true;
    return String(data.skillDirectorShotListSourceSignature || "") !== filmDirectorShotListSourceSignature(data);
  }
  return false;
}

export function filmDirectorStageDraftForRequest(stage = "", draft = "", data = {}) {
  return data.skillDirectorStaleStages?.[stage] ? "" : draft;
}

export function filmDirectorShotListDraftsForRequest(action = "", data = {}) {
  const shotList = String(data.shotList || "");
  const shotListNotes = String(data.shotListNotes || "");
  if (action !== "shotList") return { shotList, shotListNotes, fresh: false };
  const fresh = Boolean(data.skillDirectorForceFreshShotList || filmDirectorStageNeedsDraft("shotList", data));
  return fresh
    ? { shotList: "", shotListNotes: "", fresh: true }
    : {
        shotList: filmDirectorStageDraftForRequest("shotList", shotList, data),
        shotListNotes: filmDirectorStageDraftForRequest("shotList", shotListNotes, data),
        fresh: false
      };
}
