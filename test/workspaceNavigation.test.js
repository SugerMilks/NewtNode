import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imageModelOptions, videoModelOptions, enabledImageModelOptions, enabledVideoModelOptions, normalizeModelPreferences } from "../src/modelOptions.js";
import { exploreModels } from "../src/explore.js";

const shell = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("the app opens directly to Projects with only Projects, Stats and Settings navigation", () => {
  const navigation = shell.slice(shell.indexOf('<nav className="mode-switch"'), shell.indexOf("</nav>"));
  assert.deepEqual([...navigation.matchAll(/>\s*([A-Za-z]+)\s*<\/button>/g)].map(match => match[1]), ["Projects", "Stats", "Settings"]);
  assert.deepEqual([...navigation.matchAll(/setWorkspaceMode\("([^"]+)"\)/g)].map(match => match[1]), ["nodes", "stats", "settings"]);
  assert.match(shell, /\[workspaceMode, setWorkspaceMode\] = React.useState\("nodes"\)/);
  assert.doesNotMatch(shell, /generationApi|historyApi|generateImage|generateVideo|function Gallery|function SelectChip|nodeWorkspaceLoaded/);
});

test("workspace changes keep the same node editor mounted and retain shared settings and diagnostics", () => {
  assert.match(shell, /<div className=\{\x60nodes-tab-keepalive/);
  assert.match(shell, /<NodeEditor active=\{workspaceMode === "nodes"\}/);
  assert.doesNotMatch(shell, /workspaceMode === "nodes" &&[\s\S]{0,100}<NodeEditor|<NodeEditor[^>]*key=/);
  for (const name of ["installClientDiagnostics", "installGenerationChimeUnlock", "FullResolutionImageContextMenu", "usePricingSync", "nodePreferencesEvent", "newtnode:model-settings-updated", "modelPreferencesReady"]) assert.ok(shell.includes(name), name);
});

test("removing standalone pages retains all node model choices and saved preferences", () => {
  assert.deepEqual(exploreModels, imageModelOptions);
  const preferences = {
    image: Object.fromEntries(imageModelOptions.map((name, index) => [name, index % 2 === 0])),
    video: Object.fromEntries(videoModelOptions.map((name, index) => [name, index % 2 === 0]))
  };
  assert.deepEqual(normalizeModelPreferences(preferences), preferences);
  assert.deepEqual(enabledImageModelOptions(preferences), imageModelOptions.filter(name => preferences.image[name]));
  assert.deepEqual(enabledVideoModelOptions(preferences), videoModelOptions.filter(name => preferences.video[name]));
});
