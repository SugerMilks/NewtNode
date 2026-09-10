import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activateApiKeyVersion,
  addApiKeyVersion,
  apiKeyProviderIds,
  apiKeyProviderPreferences,
  maxApiKeyVersionsPerProvider,
  normalizeApiKeyVersions,
  removeApiKeyVersion
} from "../src/apiKeyVersions.js";

const source = readFileSync(new URL("../src/SettingsPage.jsx", import.meta.url), "utf8");
// Expose existing internals only in the in-memory test build.
const compiled = buildSync({
  stdin: {
    contents: `${source}\nexport { apiKeyProviders, defaultProviderPreferences, hydrateApiKeyVersions, serializableApiKeyVersions, ApiKeyStack };`,
    resolveDir: fileURLToPath(new URL("../src", import.meta.url)),
    loader: "jsx"
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
  define: { "import.meta.env": "{}" }
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { default: SettingsPage, apiKeyProviders, defaultProviderPreferences, hydrateApiKeyVersions, serializableApiKeyVersions, ApiKeyStack } = module.exports;

test("Atlas is an enabled V1 provider by default and preserves disabled legacy keys", () => {
  assert.equal(apiKeyProviderIds.filter((provider) => provider === "atlas").length, 1);
  assert.deepEqual(normalizeApiKeyVersions().atlas, [{ id: "v1", value: "", enabled: true }]);
  const versions = normalizeApiKeyVersions({}, {
    legacyValues: { atlas: "atlas-test-legacy" },
    providerPreferences: { atlas: false }
  });
  assert.deepEqual(versions.atlas, [{ id: "v1", value: "atlas-test-legacy", enabled: false }]);
  assert.equal(apiKeyProviderPreferences(versions).atlas, false);
});

test("Atlas normalization retains metadata and permits only one active version", () => {
  const versions = normalizeApiKeyVersions({ atlas: [
    { id: "old", value: "", enabled: true, configured: true, source: "env" },
    { value: "atlas-test-v2", enabled: true },
    { value: "atlas-test-v3", enabled: false }
  ] });
  assert.deepEqual(versions.atlas, [
    { id: "v1", value: "", enabled: true, configured: true, source: "env" },
    { id: "v2", value: "atlas-test-v2", enabled: false },
    { id: "v3", value: "atlas-test-v3", enabled: false }
  ]);
  const activeV2 = activateApiKeyVersion(versions, "atlas", 1);
  assert.deepEqual(activeV2.atlas.map((entry) => entry.enabled), [false, true, false]);
  const disabled = activateApiKeyVersion(activeV2, "atlas", 1, false);
  assert.equal(apiKeyProviderPreferences(disabled).atlas, false);
  assert.deepEqual(disabled.atlas.map((entry) => entry.value), ["", "atlas-test-v2", "atlas-test-v3"]);
  for (const provider of apiKeyProviderIds.filter((id) => id !== "atlas")) {
    assert.deepEqual(disabled[provider], versions[provider]);
  }
  assert.equal(versions.atlas[0].enabled, true);
});

test("Atlas version addition and removal preserve V1, metadata and the existing limit", () => {
  const versions = normalizeApiKeyVersions({ atlas: [{ value: "", enabled: true, configured: true, source: "env" }] });
  const added = addApiKeyVersion(addApiKeyVersion(versions, "atlas"), "atlas");
  assert.deepEqual(added.atlas[0], versions.atlas[0]);
  assert.deepEqual(added.atlas[1], { id: "v2", value: "", enabled: false });
  added.atlas[2].value = "atlas-test-v3";
  const removed = removeApiKeyVersion(added, "atlas", 1);
  assert.deepEqual(removed.atlas, [versions.atlas[0], { id: "v2", value: "atlas-test-v3", enabled: false }]);
  assert.deepEqual(removeApiKeyVersion(removed, "atlas", 0), removed);
  const capped = normalizeApiKeyVersions({ atlas: Array.from({ length: maxApiKeyVersionsPerProvider + 1 }, () => ({ value: "", enabled: false })) });
  assert.equal(capped.atlas.length, maxApiKeyVersionsPerProvider);
  assert.deepEqual(addApiKeyVersion(capped, "atlas"), capped);
});

test("Atlas settings hydrate secrets.atlasApiKey without changing legacy providers", () => {
  const versions = hydrateApiKeyVersions({
    secrets: { atlasApiKey: "atlas-test-legacy", elevenLabsApiKey: "elevenlabs-test-legacy" },
    providerPreferences: { atlas: false }
  });
  assert.deepEqual(versions.atlas, [{ id: "v1", value: "atlas-test-legacy", enabled: false, configured: true, source: "settings" }]);
  assert.equal(versions.elevenLabs[0].value, "elevenlabs-test-legacy");
  assert.equal(versions.elevenLabs[0].enabled, true);
  assert.deepEqual(hydrateApiKeyVersions().atlas, [{ id: "v1", value: "", enabled: true, configured: false, source: "" }]);
});

test("Atlas settings retain public environment metadata and prefer versioned secrets", () => {
  const versions = hydrateApiKeyVersions({
    atlasApiKeyConfigured: true,
    providerPreferences: { atlas: false },
    apiKeyVersions: { atlas: [
      { enabled: true, configured: true, source: "env" },
      { enabled: false, configured: true, source: "settings" }
    ] },
    secrets: {
      atlasApiKey: "atlas-test-legacy",
      apiKeyVersions: { atlas: [{ value: "", enabled: false }, { value: "atlas-test-v2", enabled: true }] }
    }
  });
  assert.deepEqual(versions.atlas, [
    { id: "v1", value: "", enabled: true, configured: true, source: "env" },
    { id: "v2", value: "atlas-test-v2", enabled: false, configured: true, source: "settings" }
  ]);
  assert.deepEqual(serializableApiKeyVersions(versions).atlas, [
    { id: "v1", value: "", enabled: true },
    { id: "v2", value: "atlas-test-v2", enabled: false }
  ]);
});

test("Settings renders Atlas Cloud API V1 alongside the existing provider controls", () => {
  assert.equal(defaultProviderPreferences.atlas, true);
  assert.deepEqual(apiKeyProviders.map((provider) => provider.id), apiKeyProviderIds);
  assert.deepEqual(apiKeyProviders.find((provider) => provider.id === "atlas"), {
    id: "atlas", label: "Atlas Cloud API", placeholder: "Atlas Cloud API"
  });
  const html = renderToStaticMarkup(React.createElement(SettingsPage));
  assert.match(html, /aria-label="Atlas Cloud API V1"/);
  assert.match(html, /aria-label="Add another Atlas Cloud API"/);
  assert.match(html, /<small>Atlas Cloud API<\/small><strong>Not set<\/strong>/);
  for (const provider of apiKeyProviders) assert.ok(html.includes(`aria-label="${provider.label} V1"`));
});

test("Atlas key controls render environment-backed and disabled versions with existing toggles", () => {
  const html = renderToStaticMarkup(React.createElement(ApiKeyStack, {
    provider: apiKeyProviders.find((provider) => provider.id === "atlas"),
    versions: hydrateApiKeyVersions({ apiKeyVersions: { atlas: [
      { enabled: true, configured: true, source: "env" },
      { enabled: false, configured: false }
    ] } }).atlas,
    visibleApiKeys: {}
  }));
  assert.match(html, /type="password"[^>]*placeholder="Using .env key"[^>]*aria-label="Atlas Cloud API V1"/);
  const switches = html.match(/<button[^>]*role="switch"[^>]*>/g);
  assert.equal(switches.length, 2);
  assert.match(switches[0], /aria-checked="true" aria-label="Disable Atlas Cloud API V1"/);
  assert.doesNotMatch(switches[0], /disabled=/);
  assert.match(switches[1], /aria-checked="false" aria-label="Enable Atlas Cloud API V2"/);
  assert.match(switches[1], /disabled=""/);
  assert.match(html, /aria-label="Remove Atlas Cloud API V2"/);
  assert.match(html, /aria-label="Show Atlas Cloud API V1"/);
});

test("Atlas status metric uses atlasApiKeyConfigured and Atlas version metadata", () => {
  const metric = source.split("\n").find((line) => line.includes('<SettingsMetric') && line.includes('label="Atlas Cloud API"'));
  assert.ok(metric);
  assert.match(metric, /value=\{providerMetricValue\(settings\?\.atlasApiKeyConfigured, providerPreferences\.atlas\)\}/);
  assert.match(metric, /detail=\{providerKeyDetail\(settings, "atlas", status, providerPreferences\.atlas\)\}/);
  assert.match(metric, /tone=\{providerMetricTone\(settings\?\.atlasApiKeyConfigured, providerPreferences\.atlas\)\}/);
});

test("environment template documents an empty ATLAS_API_KEY", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.equal(example.split(/\r?\n/).filter((line) => line.startsWith("ATLAS_API_KEY=")).length, 1);
  assert.match(example, /^ATLAS_API_KEY=$/m);
});
