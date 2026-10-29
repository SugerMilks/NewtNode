import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/NodeBodies.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"] });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const config = { input: ["characterIn", "locationIn", "imageIn", "styleIn", "referenceVideoIn", "musicIn"].map(id => ({ id, label: id, color: "#ffd800" })), output: [{ id: "directorOut", label: "Director", color: "#ffd800" }] };
const attr = (node, name) => node?.attrs?.find(item => item.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") || "").split(" ").includes(name);
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes || []) { const match = find(child, predicate); if (match) return match; }
}
function render(data = {}, props = {}) {
  return parseFragment(renderToStaticMarkup(React.createElement(module.exports.SkillDirectorNodeBody, {
    node: { id: "director", data: { sceneName: "Scene 1", skillVideoModel: "Seedance 2.5", skillResolution: "1080p", ...data } },
    config, outputPort: config.output[0], incoming: {}, connectedPortKeys: new Set(), ...props
  })));
}
const getSwitch = tree => find(tree, node => attr(node, "aria-label") === "Director Draft mode");

test("Director Draft is a compact header switch beside the lock, not a ninth grid field", () => {
  const tree = render(), actions = find(tree, node => hasClass(node, "skill-director-setup-actions"));
  const toggle = getSwitch(actions);
  assert.equal(toggle.tagName, "button");
  assert.equal(attr(toggle, "role"), "switch");
  assert.equal(attr(toggle, "aria-checked"), "false");
  assert.ok(hasClass(toggle, "node-toggle"));
  assert.ok(find(actions, node => attr(node, "aria-label") === "Lock scene setup"));
  const grid = find(tree, node => hasClass(node, "skill-director-grid"));
  assert.equal(grid.childNodes.filter(node => node.tagName === "label").length, 8);
  assert.equal(getSwitch(grid), undefined);
  assert.equal(find(tree, node => node.tagName === "input" && attr(node, "aria-label") === "Director Draft mode"), undefined);
});

test("Draft remains usable in locked/built scenes, preserves 1080p and displays 480p only while enabled", () => {
  for (const enabled of [false, true]) {
    const data = { skillSeedanceDraft: enabled, skillResolution: "1080p", skillDirectorLocks: { setup: true }, skillDirectorBuilt: true, resultText: "Saved plan" };
    const tree = render(data), toggle = getSwitch(tree);
    assert.equal(attr(toggle, "disabled"), undefined);
    assert.equal(attr(toggle, "aria-checked"), String(enabled));
    assert.equal(hasClass(toggle, "enabled"), enabled);
    const resolution = find(tree, node => node.tagName === "select" && node.childNodes.some(child => attr(child, "value") === "480p"));
    assert.equal(attr(find(resolution, node => node.tagName === "option" && attr(node, "selected") !== undefined), "value"), enabled ? "480p" : "1080p");
    assert.equal(data.skillResolution, "1080p");
    assert.equal(data.resultText, "Saved plan");
  }
});

test("Director Draft keeps provider, running-state and model guards with provider-specific hints", () => {
  for (const generationProvider of ["fal", "atlas", "krea", "unavailable"]) {
    for (const running of [false, true]) for (const enabled of [false, true]) {
      const toggle = getSwitch(render({ skillSeedanceDraft: enabled }, { generationProvider, running }));
      assert.equal(attr(toggle, "disabled") !== undefined, running || (!enabled && generationProvider === "unavailable"));
      assert.match(attr(toggle, "title"), generationProvider === "krea" ? /Krea preview only/ : /each stage is billed separately/);
    }
  }
  assert.ok(getSwitch(render({ skillVideoModel: "" })));
  assert.equal(getSwitch(render({ skillVideoModel: "Seedance 2.0", skillSeedanceDraft: true })), undefined);
});
