import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeNodePreferences } from "../src/nodePreferences.js";
import { nodeMenuEntries, nodeTypeDefinitions, nodeTypeDefinition } from "../src/nodeRegistry.js";
import { readJsonFile, writeJsonAtomic } from "../server/json-store.js";

const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/SettingsPage.jsx", import.meta.url), "utf8");
function serverFunction(name, dependencies) {
  const start = server.indexOf(`async function ${name}(`);
  const rest = server.slice(start + 1);
  const end = rest.search(/\n(?:async )?function /);
  assert.ok(start >= 0 && end > 0);
  return new Function(...Object.keys(dependencies), `${server.slice(start, start + 1 + end)}; return ${name};`)(...Object.values(dependencies));
}

test("Newt defaults off for first-time users and on for legacy users with actual task history", () => {
  for (const value of [undefined, null, {}, { myNewt: "true" }, { myNewt: 1 }]) {
    assert.deepEqual(normalizeNodePreferences(value), { myNewt: false, showApiCosts: false });
    assert.deepEqual(normalizeNodePreferences(value, { hasUsedNewt: true }), { myNewt: true, showApiCosts: false });
  }
  for (const myNewt of [true, false]) {
    for (const hasUsedNewt of [true, false]) assert.deepEqual(normalizeNodePreferences({ myNewt, unrelated: true }, { hasUsedNewt }), { myNewt, showApiCosts: false });
  }
});

test("hiding Newt changes only add menus, preserving the full catalog and all other ordering", () => {
  const before = structuredClone(nodeTypeDefinitions);
  assert.deepEqual(nodeMenuEntries(nodeTypeDefinitions), before.filter((entry) => entry.type !== "myNewt"));
  assert.deepEqual(nodeMenuEntries(nodeTypeDefinitions, { myNewt: false }), before.filter((entry) => entry.type !== "myNewt"));
  assert.deepEqual(nodeMenuEntries(nodeTypeDefinitions, { myNewt: true }), before);
  assert.deepEqual(nodeTypeDefinitions, before);
  assert.equal(nodeTypeDefinition("myNewt").label, "Newt");
});

test("the real runtime store persists explicit choices and never overwrites unrelated saved settings", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-node-settings-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtimeSettingsPath = path.join(directory, "runtime-settings.json");
  const identity = (value) => value;
  const deps = { runtimeSettingsPath, readJsonFile, writeJsonAtomic, normalizeNodePreferences,
    normalizeApiKeyVersions: identity, normalizeUpdateRepository: identity, normalizeModelPreferences: identity, normalizeApiProviderPreferences: identity };
  const write = serverFunction("writeRuntimeSettingsStore", deps);
  await writeJsonAtomic(runtimeSettingsPath, { repository: "original", apiKeyVersions: { test: "test-only-sentinel" }, modelPreferences: { image: {} } });
  for (const myNewt of [true, false]) {
    await write({ nodePreferences: { myNewt } });
    await write({ repository: "updated" });
    const saved = await readJsonFile(runtimeSettingsPath, {});
    assert.deepEqual(saved.nodePreferences, { myNewt, showApiCosts: false });
    assert.deepEqual(saved.apiKeyVersions, { test: "test-only-sentinel" });
    assert.deepEqual(saved.modelPreferences, { image: {} });
    assert.equal(saved.repository, "updated");
  }
  await write({ nodePreferences: { showApiCosts: true } });
  await write({ nodePreferences: { myNewt: true } });
  await write({ repository: "another repository" });
  assert.deepEqual((await readJsonFile(runtimeSettingsPath, {})).nodePreferences, { myNewt: true, showApiCosts: true });
  await write({ nodePreferences: { showApiCosts: false } });
  assert.deepEqual((await readJsonFile(runtimeSettingsPath, {})).nodePreferences, { myNewt: true, showApiCosts: false });
});

test("the real settings reader resolves history only when the user has not saved a preference", async () => {
  for (const saved of [undefined, { myNewt: false }, { myNewt: true }]) {
    for (const hasUsedNewt of [true, false]) {
      const read = serverFunction("readRuntimeSettings", {
        resolveUpdateRepository: async () => "", currentGitBranch: async () => "main",
        readRuntimeSettingsStore: async () => ({ nodePreferences: saved }), readEnvFileValues: async () => ({}),
        resolveBranchStatus: async () => ({}), myNewtService: { ready: Promise.resolve(), jobs: new Map(hasUsedNewt ? [["existing-task", {}]] : []) },
        normalizeNodePreferences, resolveApiKeyVersions: () => ({ fal: [], google: [], krea: [], openAi: [] }),
        apiKeyProviderPreferences: () => ({}), apiKeyProviderIds: [], preferredApiKeySource: () => "", publicApiKeyVersions: () => ({}),
        appVersion: "test", normalizeModelPreferences: () => ({}), updatePromise: null, restartRequested: false
      });
      const result = await read();
      assert.deepEqual(result.nodePreferences, normalizeNodePreferences(saved, { hasUsedNewt }));
      assert.equal(result.secrets, undefined);
    }
  }
});

test("settings saves accept only an explicit boolean and do not reset visibility on other saves", async () => {
  const patches = [];
  const save = serverFunction("saveRuntimeSettings", {
    submittedRuntimeSetting: (value) => value, normalizeUpdateRepository: (value) => value,
    readRuntimeSettingsStore: async () => ({}), normalizeNodePreferences, normalizeModelPreferences: (value) => value,
    writeRuntimeSettingsStore: async (patch) => patches.push(patch), refreshRuntimeConfigFromEnvFile: async () => {}, readRuntimeSettings: async () => ({}),
    myNewtService: { ready: Promise.resolve(), jobs: new Map() }
  });
  await save({ nodePreferences: { myNewt: false } });
  assert.deepEqual(patches.pop(), { nodePreferences: { myNewt: false, showApiCosts: false } });
  await save({ modelPreferences: { image: {} } });
  assert.deepEqual(patches.pop(), { modelPreferences: { image: {} } });
  for (const nodePreferences of [null, {}, [], { myNewt: "false" }, { myNewt: 1 }, { showApiCosts: "false" }, { showApiCosts: 1 }, { extra: true }]) await assert.rejects(save({ nodePreferences }), { status: 400 });
  assert.equal(patches.length, 0);
});

test("the Newt switch publishes visibility only after a confirmed save, never on failure or an old backend", async () => {
  const start = settings.indexOf("  async function updateNewtPreference(");
  const source = settings.slice(start, settings.indexOf("\n  function updateModelPreference", start));
  for (const outcome of ["success", "failure", "old-backend"]) {
    const events = [], messages = [], busy = [];
    let finish;
    const request = new Promise((resolve, reject) => { finish = outcome === "failure" ? () => reject(new Error("Offline")) : () => resolve(outcome === "success" ? { nodePreferences: { myNewt: false } } : {}); });
    const deps = { setBusy: (value) => busy.push(value), queuePreferenceSave: (payload) => { assert.deepEqual(payload, { nodePreferences: { myNewt: false } }); return request; },
      normalizeNodePreferences, setNodePreferences: (value) => events.push(["state", value]), dispatchNodePreferences: (value) => events.push(["dispatch", value]), setMessage: (value) => messages.push(value) };
    const update = new Function(...Object.keys(deps), `${source}; return updateNewtPreference;`)(...Object.values(deps));
    const pending = update(false);
    assert.deepEqual(events, []);
    finish(); await pending;
    assert.deepEqual(busy, ["newt", ""]);
    if (outcome === "success") { assert.deepEqual(events, [["state", { myNewt: false, showApiCosts: false }], ["dispatch", { myNewt: false, showApiCosts: false }]]); assert.equal(messages.length, 0); }
    else { assert.deepEqual(events, []); assert.match(messages[0], outcome === "failure" ? /Offline/ : /Restart/); }
  }
});

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/WorkspaceSettings.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic" });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);

test("compact Workspace controls keep an accessible Newt switch and distinct restart action", () => {
  const toggles = [], restarts = [];
  for (const enabled of [true, false]) {
    const props = { enabled, onToggle: (value) => toggles.push(value), onRestart: () => restarts.push(true), toggleDisabled: false, restarting: false, restartDisabled: false };
    const tree = module.exports.WorkspaceSettings(props);
    const html = renderToStaticMarkup(tree);
    assert.match(html, /Workspace/);
    assert.match(html, /Newt <small><em>Access to an automation agent node<\/em><\/small>/);
    assert.match(html, new RegExp(`role="switch"[^>]*aria-label="Show Newt in node menus"[^>]*aria-checked="${enabled}"`));
    assert.doesNotMatch(html, /settings-restart-panel/);
    tree.props.children[1].props.children[1].props.onClick();
    tree.props.children[3].props.children[1].props.children.props.onClick();
  }
  assert.deepEqual(toggles, [false, true]); assert.equal(restarts.length, 2);
  const disabled = renderToStaticMarkup(React.createElement(module.exports.WorkspaceSettings, { enabled: false, toggleDisabled: true, restarting: true, restartDisabled: true }));
  assert.equal(disabled.match(/disabled=""/g).length, 3);
  assert.match(disabled, /Restarting/);
});

test("API Cost defaults off for both new and upgrading users and preserves explicit choices", () => {
  for (const hasUsedNewt of [true, false]) {
    for (const value of [undefined, {}, { myNewt: true }, { showApiCosts: "true" }]) {
      assert.equal(normalizeNodePreferences(value, { hasUsedNewt }).showApiCosts, false);
    }
    for (const showApiCosts of [true, false]) assert.equal(normalizeNodePreferences({ showApiCosts }, { hasUsedNewt }).showApiCosts, showApiCosts);
  }
});

test("partial workspace saves preserve the other toggle, including legacy Newt visibility", async () => {
  let stored = {};
  const save = serverFunction("saveRuntimeSettings", {
    submittedRuntimeSetting: (value) => value, normalizeUpdateRepository: (value) => value,
    readRuntimeSettingsStore: async () => stored, normalizeNodePreferences, normalizeModelPreferences: (value) => value,
    writeRuntimeSettingsStore: async (patch) => { stored = { ...stored, ...patch }; },
    refreshRuntimeConfigFromEnvFile: async () => {}, readRuntimeSettings: async () => stored,
    myNewtService: { ready: Promise.resolve(), jobs: new Map([["prior-task", {}]]) }
  });
  await save({ nodePreferences: { showApiCosts: true } });
  assert.deepEqual(stored.nodePreferences, { myNewt: true, showApiCosts: true });
  await save({ nodePreferences: { myNewt: false } });
  assert.deepEqual(stored.nodePreferences, { myNewt: false, showApiCosts: true });
  await save({ nodePreferences: { showApiCosts: false } });
  assert.deepEqual(stored.nodePreferences, { myNewt: false, showApiCosts: false });
  await save({ repository: "updated" });
  assert.deepEqual(stored.nodePreferences, { myNewt: false, showApiCosts: false });
});

test("API Cost switch appears between Newt and Server and toggles independently", () => {
  const values = [];
  for (const showApiCosts of [undefined, true, false]) {
    const tree = module.exports.WorkspaceSettings({ enabled: true, showApiCosts, onApiCostToggle: (value) => values.push(value) });
    const html = renderToStaticMarkup(tree);
    assert.ok(html.indexOf('>Newt ') < html.indexOf('>API Cost<'));
    assert.ok(html.indexOf('>API Cost<') < html.indexOf('>Server '));
    assert.match(html, new RegExp(`aria-label="Show API costs on generation buttons" aria-checked="${showApiCosts === true}"`));
    tree.props.children[2].props.children[1].props.onClick();
  }
  assert.deepEqual(values, [true, false, true]);
});

test("API Cost saves publish immediately only on confirmation and retain the Newt setting", async () => {
  const start = settings.indexOf("  async function updateNewtPreference(");
  const source = settings.slice(start, settings.indexOf("\n  function updateModelPreference", start));
  for (const outcome of ["success", "failure", "old-backend"]) {
    const events = [], messages = [];
    let finish;
    const request = new Promise((resolve, reject) => { finish = () => outcome === "failure" ? reject(new Error("Offline")) : resolve({ nodePreferences: outcome === "success" ? { myNewt: true, showApiCosts: true } : { myNewt: true } }); });
    const deps = { setBusy: () => {}, queuePreferenceSave: (payload) => { assert.deepEqual(payload, { nodePreferences: { showApiCosts: true } }); return request; },
      normalizeNodePreferences, setNodePreferences: (value) => events.push(value), dispatchNodePreferences: (value) => events.push(value), setMessage: (value) => messages.push(value) };
    const update = new Function(...Object.keys(deps), `${source}; return updateApiCostPreference;`)(...Object.values(deps));
    const pending = update(true);
    assert.deepEqual(events, []);
    finish(); await pending;
    if (outcome === "success") assert.deepEqual(events, [{ myNewt: true, showApiCosts: true }, { myNewt: true, showApiCosts: true }]);
    else { assert.deepEqual(events, []); assert.match(messages[0], outcome === "failure" ? /Offline/ : /Restart/); }
  }
});
