import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/SettingsPage.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const renderStatus = (props) => renderToStaticMarkup(React.createElement(module.exports.RepositoryStatus, props));

test("repository status retains update state, branch and version in a compact row", () => {
  const html = renderStatus({ settings: { branch: "main", version: "3.0.0-beta.0", branchStatus: { state: "up-to-date", label: "Up-to-date", detail: "main" } } });
  assert.match(html, /role="status"/);
  assert.match(html, /tone-good/);
  assert.match(html, /Up-to-date/);
  assert.match(html, /main \/ v3.0.0-beta.0/);
  assert.doesNotMatch(html, /metric-card/);
});

test("repository status preserves warnings and does not show stale success during updates", () => {
  const settings = { branch: "main", version: "v3.0.0-beta.0", branchStatus: { state: "update-available", label: "Update available", detail: "2 commits behind" } };
  const html = renderStatus({ settings });
  assert.match(html, /tone-warn/);
  assert.match(html, /Update available/);
  assert.match(html, /2 commits behind \/ v3.0.0-beta.0/);
  const updating = renderStatus({ settings, updating: true });
  assert.match(updating, /Updating\.\.\./);
  assert.doesNotMatch(updating, /tone-warn|Update available/);
  assert.match(renderStatus({ loading: true }), /Checking\.\.\./);
  assert.match(renderStatus({}), /Unknown/);
});

test("Settings places the branch status under Repository instead of the metric grid", () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  const metrics = html.slice(html.indexOf('class="stats-metrics settings-metrics"'), html.indexOf('class="settings-grid"'));
  assert.doesNotMatch(metrics, /Branch|settings-repository-status/);
  assert.match(html, /Repository<\/span><small>Current branch<\/small><\/div><div class="settings-repository-status"/);
  assert.match(html, />Update<\/span>/);
});

test("Settings keeps server status and restart only in the compact Workspace section", () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  const metrics = html.slice(html.indexOf('class="stats-metrics settings-metrics"'), html.indexOf('class="settings-grid"'));
  assert.doesNotMatch(metrics, /Server|Local app|Running|Restarting/);
  for (const label of ["Fal Key", "Google API", "Krea API", "OpenAI API", "ElevenLabs API", "Atlas Cloud API"]) {
    assert.ok(metrics.includes(`<small>${label}</small>`));
  }
  const workspace = html.slice(html.indexOf('settings-workspace-panel'));
  assert.match(workspace, /Server <small role="status">Ready<\/small>/);
  assert.match(workspace, /title="Restart local server"/);
  assert.match(workspace, />Restart<\/span>/);
});
