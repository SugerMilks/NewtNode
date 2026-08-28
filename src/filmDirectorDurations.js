export const filmDirectorDurationOptions = [
  ...Array.from({ length: 27 }, (_value, index) => String(index + 4))
];

export function normalizeFilmDirectorDuration(value, fallback = "15") {
  const requested = String(Number.parseInt(String(value || ""), 10));
  if (filmDirectorDurationOptions.includes(requested)) return requested;

  const normalizedFallback = String(Number.parseInt(String(fallback || ""), 10));
  return filmDirectorDurationOptions.includes(normalizedFallback) ? normalizedFallback : "15";
}

export function filmDirectorDurationPromptList() {
  return filmDirectorDurationOptions.join(", ");
}
