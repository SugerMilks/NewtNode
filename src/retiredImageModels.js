// Retain recognition only for saved-workflow migration and explicit API rejection.
export function isRetiredNanoBanana2Model(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  return /nano banana 2(?![.\d])(?:\b|$)/.test(normalized) || normalized.includes("gemini 3.1 flash image");
}
