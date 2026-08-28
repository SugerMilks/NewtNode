export const filmDirectorAspectRatioOptions = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

export function normalizeFilmDirectorAspectRatio(value, fallback = "16:9") {
  const ratio = String(value || "").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "";
  if (filmDirectorAspectRatioOptions.includes(ratio)) return ratio;

  const fallbackRatio = String(fallback || "").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "";
  return filmDirectorAspectRatioOptions.includes(fallbackRatio) ? fallbackRatio : "16:9";
}

export function filmDirectorAspectRatioPromptList() {
  return filmDirectorAspectRatioOptions.join(", ");
}
