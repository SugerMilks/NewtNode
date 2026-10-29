import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/MyNewtNodeBody.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const pickerCompiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/PresetWorkflowPicker.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic" });
const pickerModule = { exports: {} };
new Function("require", "module", "exports", pickerCompiled.outputFiles[0].text)(createRequire(import.meta.url), pickerModule, pickerModule.exports);
const presets = selectedId => ({ selectedId, items: [{ id: "system", name: "Standard Workflow", isSystem: true }, { id: "user", name: "My workflow", isSystem: false }], bindings: {}, candidates: [] });
const render = (selectedId, extra = {}) => renderToStaticMarkup(React.createElement(pickerModule.exports.PresetWorkflowPicker, {
  controller: presets(selectedId), ...extra
}));

test("sidebar presets are direct menu actions, with delete actions only for user presets", () => {
  for (const selectedId of ["system", "user", ""]) {
    const html = render(selectedId);
    assert.match(html, /aria-haspopup="menu" aria-expanded="false"/);
    assert.match(html, /aria-label="Preset Workflows"/);
    assert.match(html, /lucide-workflow/);
    assert.doesNotMatch(html, /<span>Preset Workflow<\/span>|lucide-chevron-down/);
    for (const name of ["Standard Workflow \\(System\\)", "My workflow \\(User\\)"]) {
      const insert = html.match(new RegExp(`<button[^>]*role="menuitem"[^>]*aria-label="Insert ${name}"[^>]*>`))[0];
      assert.ok(!insert.includes('disabled=""'));
    }
    assert.match(html, /role="menuitem"[^>]*aria-label="Delete My workflow"/);
    assert.doesNotMatch(html, /aria-label="Delete Standard Workflow"|<select|preset-workflow-actions|lucide-plus/);
  }
});

test("project menu icons share the sidebar header, never the Newt node", () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.MyNewtNodeBody, {
    node: { id: "newt", data: {} }, config: { input: [] }, incoming: {}, controller: { presets: presets("system") }
  }));
  assert.doesNotMatch(html, /Preset Workflow|Standard Workflow|Newt preset/);
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const sidebar = editor.slice(editor.indexOf('<aside className="node-toolbar">'), editor.indexOf("</aside>"));
  assert.ok(sidebar.indexOf("<PresetWorkflowPicker") > sidebar.indexOf("Recent Projects"));
  assert.ok(sidebar.indexOf("<PresetWorkflowPicker") < sidebar.indexOf('className="project-tools"'));
  assert.match(sidebar, /<SidebarMenu label="File" icon=\{FolderOpen\}/);
  assert.match(sidebar, /<SidebarMenu label="Recent Projects" icon=\{FolderClock\}/);
  assert.doesNotMatch(sidebar, /<span>Nodes<\/span>|file-menu-trigger|project-picker-trigger/);
  assert.match(sidebar, /<span>New Project<\/span>/);
  for (const action of ["saveProject", "saveProjectAsLocalFile", "openWorkflowFromSystemPicker", "importWorkflowFromSystemPicker"]) assert.ok(sidebar.includes(`onClick={() => ${action}()}`));
});

test("sidebar retains busy protection and recoverable errors without a second setup panel", () => {
  const controller = presets("user");
  controller.items[1].slots = [{ nodeId: "portrait", label: "Lead character", role: "Character", type: "character" }];
  controller.candidates = [{ id: "emma", type: "character", data: { characterName: "Emma" } }, { id: "wrong", type: "video", data: { title: "Wrong type" } }];
  const html = render("user", { controller, insertionDisabled: true });
  assert.match(html, /aria-label="Insert My workflow \(User\)"[^>]*disabled=""/);
  assert.doesNotMatch(html, /Preset input|Saved asset|Emma|Wrong type/);
  const busy = render("user", { controller: { ...controller, busy: true } });
  assert.match(busy, /aria-busy="true" disabled=""/);
  assert.match(busy, /aria-label="Delete My workflow" disabled=""/);
  const error = render("", { controller: { ...presets(""), items: [], error: "Could not load presets" } });
  assert.match(error, /No saved presets/); assert.match(error, /aria-label="Reload presets"/);
  assert.match(error, /role="alert">Could not load presets/);
});

test("direct preset actions pass explicit IDs and do not reuse a prior selection's bindings", () => {
  const picker = readFileSync(new URL("../src/components/PresetWorkflowPicker.jsx", import.meta.url), "utf8");
  assert.match(picker, /presets\.insert\(preset\.id, \{\}\)/);
  assert.match(picker, /presets\.remove\(preset\.id\)/);
  assert.doesNotMatch(picker, /presets\.select\(/);
  const hook = readFileSync(new URL("../src/myNewt/useNewtPresets.js", import.meta.url), "utf8");
  assert.match(hook, /const insert = \(id = selectedId, replacements = bindings\)/);
  assert.match(hook, /newtPresetsApi\.get\(id\)/);
  assert.match(hook, /live\.current\.insert\(preset\.graph, replacements\)/);
  assert.match(hook, /const remove = \(id = selectedId\)/);
  assert.match(hook, /if \(selected\?\.isSystem !== false\) return/);
  assert.match(hook, /window\.confirm/);
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
