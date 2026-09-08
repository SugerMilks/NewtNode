import test from "node:test";
import assert from "node:assert/strict";

import {
  activateApiKeyVersion,
  addApiKeyVersion,
  apiKeyProviderPreferences,
  migrateVsApiCredentials,
  normalizeApiKeyVersions,
  removeApiKeyVersion
} from "../src/apiKeyVersions.js";

test("legacy provider keys migrate into enabled V1 entries", () => {
  const versions = normalizeApiKeyVersions({}, {
    legacyValues: { fal: "fal-legacy" },
    providerPreferences: { fal: true }
  });

  assert.deepEqual(versions.fal, [{ id: "v1", value: "fal-legacy", enabled: true }]);
});

test("VS keys migrate with the same active version and disabled providers", () => {
  const versions = normalizeApiKeyVersions(migrateVsApiCredentials({
    fal: [{ id: "personal", key: "fal-personal" }, { id: "work", key: "fal-work" }],
    krea: [{ id: "saved", key: "krea-saved" }]
  }, { fal: "work", krea: "" }));
  assert.deepEqual(versions.fal, [
    { id: "v1", value: "fal-personal", enabled: false },
    { id: "v2", value: "fal-work", enabled: true }
  ]);
  assert.equal(versions.krea[0].value, "krea-saved");
  assert.equal(versions.krea[0].enabled, false);
  assert.equal(versions.google[0].enabled, false);
  assert.equal(versions.openAi[0].enabled, false);
});

test("VS migration preserves the full 20-key library and never selects a different key", () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({ id: `key-${i}`, key: `example-key-${i}` }));
  const versions = normalizeApiKeyVersions(migrateVsApiCredentials({ fal: entries }, { fal: "key-19" }));
  assert.equal(versions.fal.length, 20);
  assert.equal(versions.fal[19].enabled, true);
  assert.equal(versions.fal.filter((entry) => entry.enabled).length, 1);
  const disabled = normalizeApiKeyVersions(migrateVsApiCredentials({ fal: entries }, { fal: "removed-key" }));
  assert.equal(apiKeyProviderPreferences(disabled).fal, false);
});

test("VS migration rejects unusable keys without enabling an environment fallback", () => {
  const versions = normalizeApiKeyVersions(migrateVsApiCredentials({
    fal: [{ id: "bad", key: "invalid\nkey" }]
  }, { fal: "bad" }));
  assert.deepEqual(versions.fal, [{ id: "v1", value: "", enabled: false }]);
});

test("activating a new API key version disables its siblings", () => {
  const withV2 = addApiKeyVersion(normalizeApiKeyVersions(), "fal");
  withV2.fal[1].value = "fal-v2";
  const activeV2 = activateApiKeyVersion(withV2, "fal", 1, true);

  assert.equal(activeV2.fal[0].enabled, false);
  assert.equal(activeV2.fal[1].enabled, true);
  assert.equal(apiKeyProviderPreferences(activeV2).fal, true);
  assert.equal(activeV2.google[0].enabled, true);
});

test("adding a version preserves metadata for an env-backed V1 key", () => {
  const versions = normalizeApiKeyVersions({
    fal: [{ value: "", enabled: true, configured: true, source: "env" }]
  });
  const withV2 = addApiKeyVersion(versions, "fal");

  assert.equal(withV2.fal[0].configured, true);
  assert.equal(withV2.fal[0].source, "env");
  assert.equal(withV2.fal[1].enabled, false);
});

test("removing an added key preserves V1 and renumbers later versions", () => {
  let versions = addApiKeyVersion(normalizeApiKeyVersions(), "krea");
  versions = addApiKeyVersion(versions, "krea");
  versions.krea[2].value = "krea-v3";
  const withoutV2 = removeApiKeyVersion(versions, "krea", 1);

  assert.deepEqual(withoutV2.krea.map(({ id, value }) => ({ id, value })), [
    { id: "v1", value: "" },
    { id: "v2", value: "krea-v3" }
  ]);
});
