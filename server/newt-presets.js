import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, readdir, readFile, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./json-store.js";
import { buildNewtPresetGraph } from "../src/myNewt/presets.js";

export class NewtPresetStore {
  constructor({ directory, systemDirectory, assetsDirectory, assetsUrl, resolveAsset, collectAssetUrls, rewriteAssetUrls }) {
    Object.assign(this, { directory, systemDirectory, assetsDirectory, assetsUrl, resolveAsset, collectAssetUrls, rewriteAssetUrls });
    this.queue = Promise.resolve();
  }
  file(id) {
    if (!/^[a-f0-9-]{36}$/.test(String(id))) throw new Error("Invalid Newt Preset ID.");
    return path.join(this.directory, `${id}.json`);
  }
  async systemPresets() {
    if (!this.systemDirectory) return [];
    // A missing/broken built-in library must never make protected IDs deletable.
    try {
      const manifest = JSON.parse(await readFile(path.join(this.systemDirectory, "manifest.json"), "utf8"));
      if (manifest.version !== 1 || !Array.isArray(manifest.presets)) throw new Error("Invalid manifest.");
      const items = [];
      for (const entry of manifest.presets) {
        this.file(entry.id);
        if (items.some((item) => item.preset.id === entry.id) || !Array.isArray(entry.assets)) throw new Error("Invalid preset entry.");
        const preset = JSON.parse(await readFile(path.join(this.systemDirectory, `${entry.id}.json`), "utf8"));
        if (preset.id !== entry.id || !preset.name || !preset.graph?.nodes?.length) throw new Error("Invalid preset definition.");
        for (const asset of entry.assets) {
          if (!/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.file)) throw new Error("Invalid bundled asset.");
          const prefix = `${this.assetsUrl}/${entry.id}/`;
          if (!asset.url.startsWith(prefix)) throw new Error("Invalid preset asset URL.");
          const name = decodeURIComponent(asset.url.slice(prefix.length));
          if (!name || name === "." || name === ".." || /[/\\\x00]/.test(name)) throw new Error("Invalid preset asset name.");
        }
        const urls = new Set(entry.assets.map((asset) => asset.url));
        if ([...this.collectAssetUrls(preset.graph)].some((url) => !urls.has(url))) throw new Error("Incomplete bundled assets.");
        items.push({ preset: { ...preset, isSystem: true }, assets: entry.assets });
      }
      return items;
    } catch (error) {
      throw Object.assign(new Error(`The system preset library could not be loaded. ${error.message}`), { status: 503 });
    }
  }
  async restoreSystemAssets({ preset, assets }) {
    if (!assets.length) return;
    const folder = path.join(this.assetsDirectory, preset.id);
    await mkdir(folder, { recursive: true });
    for (const asset of assets) {
      const name = decodeURIComponent(asset.url.slice(`${this.assetsUrl}/${preset.id}/`.length));
      try {
        await copyFile(path.join(this.systemDirectory, asset.file), path.join(folder, name), constants.COPYFILE_EXCL);
      } catch (error) {
        if (error.code !== "EEXIST") throw new Error(`Could not restore the system preset's saved media. ${error.message}`);
      }
    }
  }
  async list() {
    const system = await this.systemPresets();
    const systemIds = new Set(system.map(({ preset }) => preset.id));
    await mkdir(this.directory, { recursive: true });
    const summary = (preset, isSystem) => ({ id: preset.id, name: preset.name, createdAt: preset.createdAt, nodeCount: preset.graph.nodes.length, slots: preset.graph.slots || [], isSystem });
    const items = system.map(({ preset }) => summary(preset, true));
    for (const file of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      if (systemIds.has(file.slice(0, -5))) continue;
      const preset = await readJsonFile(path.join(this.directory, file), null);
      if (`${preset?.id}.json` === file && preset.graph?.nodes?.length) items.push(summary(preset, false));
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }
  async get(id) {
    const file = this.file(id);
    const system = (await this.systemPresets()).find(({ preset }) => preset.id === id);
    if (system) {
      await this.restoreSystemAssets(system);
      return system.preset;
    }
    const preset = await readJsonFile(file, null);
    if (!preset) throw new Error("This Newt Preset is no longer available.");
    return { ...preset, isSystem: false };
  }
  save(value) {
    const operation = this.queue.catch(() => {}).then(() => this.write(value));
    this.queue = operation;
    return operation;
  }
  async write({ name, graph }) {
    const label = String(name || "").trim();
    if (!label || label.length > 80) throw new Error("Name the preset using 1 to 80 characters.");
    if (JSON.stringify(graph || {}).length > 5_000_000) throw new Error("This selection is too large for a Newt Preset.");
    const clean = buildNewtPresetGraph(graph);
    if ((await this.list()).some((preset) => preset.name.toLowerCase() === label.toLowerCase())) throw new Error("A Newt Preset with this name already exists. Choose another name.");
    const id = randomUUID(), folder = path.join(this.assetsDirectory, id), urls = new Map();
    try {
      for (const url of this.collectAssetUrls(clean)) {
        const source = await this.resolveAsset(url);
        const file = `${urls.size}-${path.basename(source.filePath)}`;
        await mkdir(folder, { recursive: true });
        await copyFile(source.filePath, path.join(folder, file));
        urls.set(url, `${this.assetsUrl}/${id}/${encodeURIComponent(file)}`);
      }
      const preset = { id, name: label, version: 2, createdAt: new Date().toISOString(), isSystem: false, graph: this.rewriteAssetUrls(clean, urls) };
      await writeJsonAtomic(this.file(id), preset);
      return preset;
    } catch (error) {
      await rm(folder, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Preset was not saved. ${error.message}`);
    }
  }
  async remove(id) {
    const file = this.file(id);
    if ((await this.systemPresets()).some(({ preset }) => preset.id === id)) {
      throw Object.assign(new Error("System presets are permanent and cannot be deleted. You can save a modified copy as a User preset."), { status: 403 });
    }
    await rm(file, { force: true });
    // Placed workflows may still reference these media copies. Keep their assets intact.
    return { ok: true };
  }
}
