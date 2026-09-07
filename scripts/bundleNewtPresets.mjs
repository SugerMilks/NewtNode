import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomic } from "../server/json-store.js";

// Explicit IDs only: presets saved later must never be promoted automatically.
const ids = process.argv.slice(2);
if (!ids.length || ids.some((id) => !/^[a-f0-9-]{36}$/.test(id)) || new Set(ids).size !== ids.length) {
  throw new Error("Provide the saved preset UUIDs to bundle.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "server/system-newt-presets");
await mkdir(destination); // Refuse to overwrite an existing built-in library.
await mkdir(path.join(destination, "assets"));
const manifest = { version: 1, presets: [] };
for (const id of ids) {
  const preset = JSON.parse(await readFile(path.join(root, "server/data/newt-presets", `${id}.json`), "utf8"));
  if (preset.id !== id || !preset.graph?.nodes?.length) throw new Error(`Invalid preset: ${id}`);
  const urls = new Set();
  function collect(value) {
    if (typeof value === "string") {
      if (/^(data:|https?:|\/Users\/)/.test(value)) throw new Error(`Nonportable dependency in ${preset.name}.`);
      if (/^\/(outputs|uploads|workflow-assets)\//.test(value)) urls.add(value);
    } else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  collect(preset.graph);
  const assets = [];
  for (const url of urls) {
    const prefix = `/outputs/Newt-Presets/dependencies/${id}/`;
    const name = decodeURIComponent(url.slice(prefix.length));
    if (!url.startsWith(prefix) || path.basename(name) !== name || /[/\\\x00]/.test(name)) throw new Error(`Invalid dependency: ${url}`);
    const source = path.join(root, "outputs/Newt-Presets/dependencies", id, name);
    const digest = createHash("sha256").update(await readFile(source)).digest("hex");
    const file = `assets/${digest}${path.extname(name).toLowerCase()}`;
    await copyFile(source, path.join(destination, file), constants.COPYFILE_EXCL).catch((error) => { if (error.code !== "EEXIST") throw error; });
    assets.push({ url, file });
  }
  await writeJsonAtomic(path.join(destination, `${id}.json`), preset);
  manifest.presets.push({ id, assets });
  console.log(`Bundled ${preset.name}: ${preset.graph.nodes.length} nodes, ${assets.length} media references.`);
}
await writeJsonAtomic(path.join(destination, "manifest.json"), manifest);
