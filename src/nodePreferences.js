export const nodePreferencesEvent = "newtnode:node-settings-updated";

export function normalizeNodePreferences(value, { hasUsedNewt = false } = {}) {
  return { myNewt: typeof value?.myNewt === "boolean" ? value.myNewt : hasUsedNewt === true };
}

export function dispatchNodePreferences(value) {
  window.dispatchEvent(new CustomEvent(nodePreferencesEvent, { detail: normalizeNodePreferences(value) }));
}
