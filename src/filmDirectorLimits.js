export const filmDirectorMaximumShotCount = 25;

export function filmDirectorCutLimit(durationSeconds = "15") {
  const duration = Number.parseInt(String(durationSeconds || ""), 10);
  const safeDuration = Number.isInteger(duration) && duration > 0 ? duration : 15;
  return Math.min(filmDirectorMaximumShotCount, safeDuration);
}
