export const filmDirectorResolutionOptions = ["480p", "720p", "1080p", "4K"];

export function normalizeFilmDirectorResolution(value, fallback = "720p") {
  const normalized = String(value || "").trim().toLowerCase();
  const match = filmDirectorResolutionOptions.find((option) => option.toLowerCase() === normalized);
  if (match) return match;

  const normalizedFallback = String(fallback || "").trim().toLowerCase();
  return filmDirectorResolutionOptions.find((option) => option.toLowerCase() === normalizedFallback) || "720p";
}
