import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/NewtPresetDialog.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic" });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = (nodes) => renderToStaticMarkup(React.createElement(module.exports.NewtPresetDialog, { controller: { draft: { nodes }, save() {}, cancel() {} } }));

test("preset reusable inputs sit inside a closed Advanced disclosure", () => {
  const html = render([{ id: "image", type: "image", data: { title: "Upload Img to Edit" } }]);
  assert.match(html, /<details class="newt-preset-advanced"><summary>Advanced<\/summary><fieldset/);
  assert.doesNotMatch(html, /<details[^>]*\bopen[=>\s]/);
  assert.match(html, /Reusable inputs/);
  assert.match(html, /Upload Img to Edit/);
  assert.match(html, /aria-label="Preset name"/);
});

test("presets without reusable assets omit Advanced entirely", () => {
  const html = render([{ id: "text", type: "plainText", data: { title: "Text" } }]);
  assert.doesNotMatch(html, /<details|Reusable inputs/);
  assert.match(html, />Save<\/button>/);
});
