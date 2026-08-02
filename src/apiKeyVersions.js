export const apiKeyProviderIds = Object.freeze(["fal", "google", "krea", "openAi"]);
export const maxApiKeyVersionsPerProvider = 9;

export function normalizeApiKeyVersions(value = {}, { legacyValues = {}, providerPreferences = {} } = {}) {
  const incoming = value && typeof value === "object" ? value : {};

  return Object.fromEntries(
    apiKeyProviderIds.map((provider) => {
      const supplied = Array.isArray(incoming[provider]) ? incoming[provider] : [];
      const source = supplied.length
        ? supplied
        : [{
            value: legacyValues?.[provider] || "",
            enabled: Boolean(providerPreferences?.[provider] ?? true)
          }];
      let activeClaimed = false;
      const versions = source
        .slice(0, maxApiKeyVersionsPerProvider)
        .map((entry, index) => {
          const enabled = Boolean(entry?.enabled) && !activeClaimed;
          if (enabled) activeClaimed = true;
          const normalizedEntry = {
            id: `v${index + 1}`,
            value: String(entry?.value || ""),
            enabled
          };
          if (entry?.configured !== undefined) normalizedEntry.configured = Boolean(entry.configured);
          if (entry?.source) normalizedEntry.source = String(entry.source);
          return normalizedEntry;
        });

      return [provider, versions.length ? versions : [{ id: "v1", value: "", enabled: true }]];
    })
  );
}

export function activateApiKeyVersion(value, provider, versionIndex, enabled = true) {
  const normalized = normalizeApiKeyVersions(value);
  if (!apiKeyProviderIds.includes(provider)) return normalized;

  normalized[provider] = normalized[provider].map((entry, index) => ({
    ...entry,
    enabled: Boolean(enabled) && index === versionIndex
  }));
  return normalized;
}

export function addApiKeyVersion(value, provider) {
  const normalized = normalizeApiKeyVersions(value);
  if (!apiKeyProviderIds.includes(provider)) return normalized;
  if (normalized[provider].length >= maxApiKeyVersionsPerProvider) return normalized;

  normalized[provider] = [
    ...normalized[provider],
    {
      id: `v${normalized[provider].length + 1}`,
      value: "",
      enabled: false
    }
  ];
  return normalized;
}

export function removeApiKeyVersion(value, provider, versionIndex) {
  const normalized = normalizeApiKeyVersions(value);
  if (!apiKeyProviderIds.includes(provider) || versionIndex <= 0) return normalized;

  const remaining = normalized[provider].filter((_entry, index) => index !== versionIndex);
  normalized[provider] = remaining.map((entry, index) => ({ ...entry, id: `v${index + 1}` }));
  return normalized;
}

export function apiKeyProviderPreferences(value) {
  const normalized = normalizeApiKeyVersions(value);
  return Object.fromEntries(
    apiKeyProviderIds.map((provider) => [provider, normalized[provider].some((entry) => entry.enabled)])
  );
}
