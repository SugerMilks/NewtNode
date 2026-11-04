export const smartTextFalDefaultModel = "openai/gpt-6-sol";
export const smartTextOpenAiDefaultModel = "gpt-6-sol";

export function resolveSmartTextFalModel(environment = {}) {
  return String(
    environment.SMART_TEXT_FAL_MODEL ||
      environment.FAL_TEXT_MODEL ||
      smartTextFalDefaultModel
  ).trim();
}

export function resolveSmartTextOpenAiModel(environment = {}) {
  return String(
    environment.SMART_TEXT_OPENAI_MODEL ||
      environment.OPENAI_TEXT_MODEL ||
      smartTextOpenAiDefaultModel
  ).trim();
}
