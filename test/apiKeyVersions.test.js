import test from "node:test";
import assert from "node:assert/strict";

import {
  activateApiKeyVersion,
  addApiKeyVersion,
  apiKeyProviderPreferences,
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
