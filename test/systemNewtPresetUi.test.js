import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/MyNewtNodeBody.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const render = (selectedId) => renderToStaticMarkup(React.createElement(module.exports.MyNewtNodeBody, {
  node: { id: "newt", data: {} }, config: { input: [] }, incoming: {},
  controller: { presets: { selectedId, items: [{ id: "system", name: "Standard Workflow", isSystem: true }, { id: "user", name: "My workflow", isSystem: false }], bindings: {}, candidates: [] } }
}));

test("My Newt shows preset origins, disables system deletion, and allows inserting either kind", () => {
  for (const selectedId of ["system", "user", ""]) {
    const html = render(selectedId);
    assert.match(html, /Standard Workflow \(System\)/);
    assert.match(html, /My workflow \(User\)/);
    const remove = html.match(/<button[^>]*aria-label="Delete Newt Preset"[^>]*>/)[0];
    assert.equal(remove.includes('disabled=""'), selectedId !== "user");
    const insert = html.match(/<button[^>]*aria-label="Insert Newt Preset"[^>]*>/)[0];
    assert.equal(insert.includes('disabled=""'), !selectedId);
    if (selectedId === "system") assert.match(remove, /System presets cannot be deleted/);
  }
});

test("Newt Advanced presents Auto Review and disables individual approval controls only while enabled", () => {
  for (const autoReview of [undefined, false, true]) {
    const html = renderToStaticMarkup(React.createElement(module.exports.MyNewtNodeBody, {
      node: { id: "newt", data: { autoReview } }, config: { input: [] }, incoming: {}, controller: {}
    }));
    assert.match(html, /<summary>Advanced<\/summary>/);
    const toggle = html.match(/<input[^>]*\/>Auto Review/)[0];
    assert.equal(toggle.includes('checked=""'), autoReview === true);
    for (const label of ["Approve workflow plan", "Approve each node run"]) {
      const input = html.match(new RegExp(`<input[^>]*\\/>${label}`))[0];
      assert.equal(input.includes('disabled=""'), autoReview === true);
      assert.equal(input.includes('checked=""'), autoReview !== true);
    }
    assert.doesNotMatch(html.match(/<input[^>]*\/>Generate images/)[0], /disabled|checked/);
  }
});

test("Newt favorite dropdowns show saved selections and keep disabled models unavailable", () => {
  for (const data of [{}, { favoriteImageModel: "Nano Banana Pro", favoriteVideoModel: "Seedance 2.5" }]) {
    const html = renderToStaticMarkup(React.createElement(module.exports.MyNewtNodeBody, {
      node: { id: "newt", data }, config: { input: [] }, incoming: {},
      controller: { modelOptions: { image: ["OpenAI Image 2"], video: ["Seedance 2.5"] } }
    }));
    const image = html.match(/<select aria-label="Favorite image model"[\s\S]*?<\/select>/)[0];
    const video = html.match(/<select aria-label="Favorite video model"[\s\S]*?<\/select>/)[0];
    assert.match(image, /No preference/); assert.match(video, /No preference/);
    assert.match(image, /<option value="Nano Banana Pro" disabled=""/);
    assert.match(video, /<option value="Kling O3 Pro" disabled=""/);
    if (data.favoriteImageModel) {
      assert.match(image, /<option value="Nano Banana Pro" disabled="" selected=""/);
      assert.match(video, /<option value="Seedance 2.5" selected=""/);
    } else {
      assert.match(image, /<option value="" selected="">No preference/);
      assert.match(video, /<option value="" selected="">No preference/);
    }
  }
});
