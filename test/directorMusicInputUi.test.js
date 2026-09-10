import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filmDirectorApproachOptions } from "../src/filmDirectorApproaches.js";

const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../src/components/NodeBodies.jsx", import.meta.url))], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"] });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);

test("Director Music field and connection dot gray out for unsupported approaches and locked/running setups", () => {
  const config = { input: ["characterIn", "locationIn", "imageIn", "styleIn", "referenceVideoIn", "musicIn"].map((id) => ({ id, label: id === "musicIn" ? "Music" : id, color: "#ff8d25" })), output: [{ id: "directorOut", label: "Director", color: "#ffd800" }] };
  for (const { value: skillApproach } of filmDirectorApproachOptions) {
    for (const state of ["unlocked", "locked", "running"]) {
      const html = renderToStaticMarkup(React.createElement(module.exports.SkillDirectorNodeBody, {
        node: { id: "director", data: { sceneName: "Test", skillApproach, skillVideoModel: "Seedance 2.5", skillDirectorLocks: { setup: state === "locked" } } }, config, outputPort: config.output[0],
        incoming: { musicIn: [{ source: { id: "track", data: { title: "Saved track", resultUrl: "/uploads/test.wav" } } }] },
        connectedPortKeys: new Set(["director:musicIn"]), running: state === "running", sourceLabel: () => "Asset"
      }));
      const port = html.match(/<button[^>]*data-port-id="musicIn"[^>]*>/)[0];
      const field = html.match(/<button[^>]*>Saved track<\/button>/)[0];
      const enabled = ["music-video", "montage"].includes(skillApproach) && state === "unlocked";
      assert.equal(port.includes('disabled=""'), !enabled, `${skillApproach} ${state} port`);
      assert.equal(field.includes('disabled=""'), !enabled, `${skillApproach} ${state} field`);
      if (!enabled) assert.match(port, /class="[^"]*disabled/);
      if (!["music-video", "montage"].includes(skillApproach)) assert.match(port, /Music is available for Music Video and Montage only/);
    }
  }
});
