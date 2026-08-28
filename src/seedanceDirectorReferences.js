export const seedanceImageReferenceLimit = 9;
export const seedance25ImageReferenceLimit = 30;

export function mergeSeedanceDirectorReferences({
  directUrls = [],
  directLabels = [],
  directorReferences = [],
  limit = seedanceImageReferenceLimit
} = {}) {
  const directorItems = directorReferences.map((reference) => ({
    url: reference?.url,
    label: reference?.tag || reference?.label
  }));
  const directItems = directUrls.map((url, index) => ({
    url,
    label: directLabels[index]
  }));
  const seen = new Set();
  const references = [...directorItems, ...directItems]
    .filter((item) => {
      const url = String(item?.url || "").trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, Math.max(0, Number(limit) || seedanceImageReferenceLimit));

  return {
    urls: references.map((item) => item.url),
    labels: references.map((item) => item.label || "")
  };
}
