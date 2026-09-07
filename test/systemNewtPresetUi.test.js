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
