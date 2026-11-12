import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, copyFile, symlink, readdir, realpath } from "node:fs/promises";
import sharp from "sharp";
import { readPsd, initializeCanvas } from "ag-psd";
import { createLayersPsdService, normalizePsdExportPath, renderLayersPsd } from "../server/image-layers-psd.js";
import { chooseLayersPsdPath } from "../src/imageLayersPsd.js";
import { imageLayersApi } from "../src/api/newtApi.js";
import { transformedLayerPixels, placedLayerPixels } from "../server/image-layers.js";
import { resetCopiedNodeRuntime } from "../src/workflowState.js";
import { nodeIsWorking } from "../src/projectCanvases.js";

initializeCanvas(() => { throw new Error("PSD tests must not need a browser canvas"); }, (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
const decode = buffer => readPsd(buffer, { useImageData: true, skipThumbnail: true });

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newtnode-psd-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, width, height, background] of [["base", 100, 60, "#203040"], ["subject", 30, 20, { r: 240, g: 20, b: 30, alpha: .5 }], ["hidden", 10, 10, "#00ff00"]]) {
    await sharp({ create: { width, height, channels: 4, background } }).png().toFile(path.join(directory, `${name}.png`));
  }
  const document = { id: "document-1", width: 100, height: 60, name: "Layers", sourceUrl: "/uploads/base.png", layers: [
    { id: "base", name: "Background", url: "/outputs/base.png", x: 0, y: 0, width: 100, height: 60, opacity: 1, visible: true },
    { id: "subject", name: "Subject", url: "/outputs/subject.png", x: -10, y: 5, width: 60, height: 40, opacity: .5, visible: true },
    { id: "hidden", name: "Hidden label", url: "/outputs/hidden.png", x: 80, y: 50, width: 20, height: 20, opacity: 1, visible: false, locked: true }
  ] };
  let renderCount = 0, targetCount = 0;
  const dependencies = {
    resolveAsset: async url => {
      if (!/^\/(outputs|uploads)\/[\w-]+\.png$/.test(url)) throw new Error("unmanaged source");
      return { filePath: path.join(directory, path.basename(url)) };
    },
    createTarget: async (_context, _kind, extension) => {
      const fileName = `managed-${++targetCount}${extension}`;
      return { filePath: path.join(directory, fileName), publicPath: `/outputs/${fileName}`, fileName };
    },
    render: async (...args) => { renderCount++; return renderLayersPsd(...args); }, ...overrides
  };
  const service = createLayersPsdService(dependencies);
  const body = { requestId: randomUUID(), document, exportFilePath: path.join(directory, "Artwork.psd"), projectId: "qa" };
  const settle = async () => {
    for (let i = 0; i < 500; i++) {
      const job = service.inspect(body.requestId); if (job.status !== "running") return job;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("PSD export never settled");
  };
  return { directory, document, dependencies, service, body, settle, renderCount: () => renderCount };
}

test("PSD save dialog has a safe name, no default overwrite and quiet cancellation", async () => {
  const value = await chooseLayersPsdPath({ title: "My / Layers", workflowContext: { workflowPackagePath: "/project" } }, async body => {
    assert.deepEqual(body, { title: "Name and save the layered Photoshop file", defaultName: "My _ Layers.psd", defaultPath: "/project", extension: "psd" });
    return { response: { ok: true }, data: { path: "/project/Art.psd" } };
  });
  assert.equal(value, "/project/Art.psd");
  assert.equal(await chooseLayersPsdPath({}, async () => ({ response: { ok: false }, data: { canceled: true } })), null);
  await assert.rejects(chooseLayersPsdPath({}, async () => ({ response: { ok: false }, data: { error: "unavailable" } })), /unavailable/);
});

test("PSD path validation never writes PNGs or relative destinations", () => {
  const file = path.join(os.tmpdir(), "artwork");
  assert.equal(normalizePsdExportPath(file), `${file}.psd`);
  assert.equal(normalizePsdExportPath(`${file}.PSD`), `${file}.PSD`);
  for (const invalid of ["", null, "../art.psd", `${file}.png`, `${file}\n.psd`]) assert.throws(() => normalizePsdExportPath(invalid));
});

test("PSD contains editable pixel layers, independent alpha/opacity, original offsets, order, names and hidden/locked state", async t => {
  const f = await fixture(t); const original = await readFile(path.join(f.directory, "subject.png"));
  f.service.start(f.body); f.service.start(f.body);
  const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  assert.equal(f.renderCount(), 1); assert.equal(job.result.savedFilePath, await realpath(f.body.exportFilePath));
  const bytes = await readFile(f.body.exportFilePath), psd = decode(bytes);
  if (process.env.PSD_VERIFY_OUTPUT) await copyFile(f.body.exportFilePath, process.env.PSD_VERIFY_OUTPUT);
  assert.equal(bytes.subarray(0, 4).toString(), "8BPS"); assert.equal(bytes.readUInt16BE(4), 1);
  assert.equal(psd.width, 100); assert.equal(psd.height, 60); assert.equal(psd.bitsPerChannel, 8);
  assert.deepEqual(psd.children.map(layer => layer.name), ["Background", "Subject", "Hidden label"]);
  const layer = psd.children[1];
  assert.equal(layer.left, -10); assert.equal(layer.top, 5); assert.equal(layer.imageData.width, 60); assert.equal(layer.imageData.height, 40);
  assert.ok(Math.abs(layer.opacity - .5) <= 1 / 255);
  assert.equal(layer.imageData.data[3], 128, "opacity is not baked into the editable layer alpha");
  assert.equal(psd.children[2].hidden, true); assert.equal(psd.children[2].protected.all, true);
  const pixel = (10 * psd.width + 10) * 4;
  assert.ok(Math.abs(psd.imageData.data[pixel] - 84) <= 2, `composite includes foreground above background: ${Array.from(psd.imageData.data.slice(pixel, pixel + 4))}`);
  assert.deepEqual(Array.from(psd.imageData.data.slice(0, 4)), [32, 48, 64, 255]);
  assert.deepEqual(await readFile(path.join(f.directory, "subject.png")), original);
  assert.deepEqual(await readFile(path.join(f.directory, path.basename(job.result.url))), bytes);
  assert.equal((await readdir(f.directory)).some(name => name.endsWith(".tmp")), false);
  assert.throws(() => f.service.start({ ...f.body, exportFilePath: `${f.directory}/other.psd` }), /different settings/);
});

test("PSD keeps all hidden pixels and transparent merged preview without a forced opaque background", async t => {
  const f = await fixture(t);
  f.document.layers[0].visible = false;
  f.service.start(f.body); const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  const psd = decode(await readFile(f.body.exportFilePath));
  assert.equal(psd.imageData.data[3], 0); assert.equal(psd.children[0].imageData.data[3], 255);
  assert.ok(Math.abs(psd.imageData.data[(10 * 100 + 10) * 4 + 3] - 64) <= 1);
  assert.equal(psd.children[0].hidden, true);
});

test("PSD preserves real folders, child state and paint order while omitting hidden folders from the composite", async t => {
  const f = await fixture(t);
  f.document.folders = [{ id: "subjects", name: "People and details", visible: false, locked: true, collapsed: true }];
  f.document.layers[1].folderId = "subjects"; f.document.layers[2].folderId = "subjects";
  f.service.start(f.body); const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  const psd = decode(await readFile(f.body.exportFilePath));
  assert.deepEqual(psd.children.map(layer => layer.name), ["Background", "People and details"]);
  const folder = psd.children[1];
  assert.equal(folder.hidden, true); assert.equal(folder.opened, false); assert.equal(folder.protected.all, true);
  assert.equal(folder.blendMode, "pass through");
  assert.deepEqual(folder.children.map(layer => layer.name), ["Subject", "Hidden label"]);
  assert.equal(folder.children[0].hidden, false); assert.equal(folder.children[1].hidden, true);
  assert.equal(folder.children[0].imageData.data[3], 128);
  assert.deepEqual(Array.from(psd.imageData.data.slice((10 * 100 + 10) * 4, (10 * 100 + 10) * 4 + 4)), [32, 48, 64, 255]);
});

test("PSD rotation retains separate layers and off-canvas pixels and matches PNG composition", async t => {
  const f = await fixture(t);
  f.document.layers[0].visible = false;
  f.document.layers[1].rotation = 37;
  f.document.layers[2].rotation = -90;
  f.service.start(f.body); const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  const psd = decode(await readFile(f.body.exportFilePath)), child = psd.children[1];
  const source = { buffer: await readFile(path.join(f.directory, "subject.png")) };
  const transformed = await transformedLayerPixels(source, f.document.layers[1]);
  assert.deepEqual([child.left, child.top, child.imageData.width, child.imageData.height], [transformed.x, transformed.y, transformed.width, transformed.height]);
  assert.deepEqual(Buffer.from(child.imageData.data), transformed.data);
  assert.ok(child.left < 0 && child.top < 0, "PSD keeps pixels beyond the canvas");
  assert.equal(child.imageData.data[3], 0); assert.equal(psd.children[2].hidden, true); assert.equal(psd.children[2].protected.all, true);
  const placed = await placedLayerPixels(source, { ...f.document.layers[1], opacity: Math.round(.5 * 255) / 255 }, 100, 60);
  const merged = await sharp({ create: { width: 100, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([placed]).raw().toBuffer();
  // PSD's 8-bit composite white-matte round trip can quantize translucent RGB.
  // Individual editable layer pixels above remain byte-exact.
  for (let i = 0; i < merged.length; i += 4) {
    assert.equal(psd.imageData.data[i + 3], merged[i + 3]);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(psd.imageData.data[i + c] - merged[i + c]) * merged[i + 3] / 255 <= 1.5, `composite pixel ${i / 4}, channel ${c}`);
  }
});
test("PSD retains nested separation folders and inherited visibility in its merged preview", async t => {
  const f = await fixture(t);
  f.document.folders = [{ id: "parent", name: "People", visible: false }, { id: "parts", name: "Subject layers", parentId: "parent", visible: true }];
  f.document.layers[1].folderId = "parts"; f.document.layers[2].folderId = "parent";
  f.service.start(f.body); const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  const psd = decode(await readFile(f.body.exportFilePath));
  assert.equal(psd.children[1].name, "People"); assert.equal(psd.children[1].hidden, true);
  assert.equal(psd.children[1].children[0].name, "Subject layers");
  assert.equal(psd.children[1].children[0].children[0].name, "Subject");
  assert.equal(psd.children[1].children[1].name, "Hidden label");
  assert.deepEqual(Array.from(psd.imageData.data.slice((10 * 100 + 10) * 4, (10 * 100 + 10) * 4 + 4)), [32, 48, 64, 255]);
});

test("PSD failures preserve layers and a failed destination copy retains a downloadable managed file", async t => {
  const f = await fixture(t, { saveCopy: async () => { throw new Error("destination disconnected"); } });
  f.service.start(f.body); const job = await f.settle(); assert.equal(job.status, "completed");
  assert.match(job.warning, /destination disconnected/); assert.equal(job.result.savedFilePath, undefined);
  assert.ok((await readFile(path.join(f.directory, path.basename(job.result.url)))).length > 0);
  await assert.rejects(readFile(f.body.exportFilePath));
});

test("PSD bounds, failed rendering, changed destinations and symbolic links are guarded", async t => {
  const f = await fixture(t, { render: async (_document, _files, output) => { await writeFile(output, "partial"); throw new Error("renderer failed"); } });
  assert.throws(() => f.service.start({ ...f.body, document: { ...f.document, width: 90000 } }), /dimensions/);
  f.service.start(f.body); const job = await f.settle(); assert.equal(job.status, "failed"); assert.match(job.error, /renderer failed/);
  assert.equal((await readdir(f.directory)).some(name => name.startsWith("managed-")), false);
  if (process.platform !== "win32") {
    const g = await fixture(t); await symlink(path.join(g.directory, "base.png"), g.body.exportFilePath);
    g.service.start(g.body); const result = await g.settle(); assert.equal(result.status, "failed"); assert.match(result.error, /symbolic link/); assert.equal(g.renderCount(), 0);
  }
});

test("PSD export is bounded to one writer, and completed jobs are read-only on recovery", async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { render: async (...args) => { await gate; return renderLayersPsd(...args); } });
  f.service.start(f.body);
  assert.throws(() => f.service.start({ ...f.body, requestId: randomUUID() }), /already being exported/);
  release(); assert.equal((await f.settle()).status, "completed");
  assert.equal(f.service.inspect(f.body.requestId).status, "completed");
  assert.throws(() => createLayersPsdService(f.dependencies).inspect(f.body.requestId), /after a restart/);
  const data = { layersPsdJob: { requestId: f.body.requestId, status: "running" }, layersPsdExport: { url: "/outputs/export.psd" } };
  assert.equal(nodeIsWorking({ data }), true); assert.equal(resetCopiedNodeRuntime(data).layersPsdJob, null);
  assert.equal(resetCopiedNodeRuntime(data).layersPsdExport.url, "/outputs/export.psd");
});

test("PSD API requires upgraded health and never retries a write after a lost response", async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  let writes = 0, enabled = false;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ routes: { imageLayers: true, imageLayersPsd: enabled } }), { headers: { "Content-Type": "application/json" } });
    writes++; throw new Error("connection lost");
  };
  await assert.rejects(imageLayersApi.exportPsd({}), /Restart/); assert.equal(writes, 0);
  enabled = true; await assert.rejects(imageLayersApi.exportPsd({}), /connection lost/); assert.equal(writes, 1);
});

test("Rotated saves and exports cannot silently lose rotation on an older backend", async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  let writes = 0, enabled = false;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ routes: { imageLayers: true, imageLayersPsd: true, imageLayersRotation: enabled } }));
    writes++; throw new Error("connection lost");
  };
  const body = { document: { layers: [{ rotation: 45 }] } };
  await assert.rejects(imageLayersApi.save(body), /Restart/); await assert.rejects(imageLayersApi.exportPsd(body), /Restart/); assert.equal(writes, 0);
  enabled = true; await assert.rejects(imageLayersApi.save(body), /connection lost/); assert.equal(writes, 1);
});

test("Folder saves and exports stop before writing to an older backend", async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  let writes = 0, enabled = false;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ routes: { imageLayers: true, imageLayersPsd: true, imageLayerFolders: enabled } }));
    writes++; throw new Error("connection lost");
  };
  const body = { document: { folders: [{ id: "f" }], layers: [{ folderId: "f" }] } };
  await assert.rejects(imageLayersApi.save(body), /Restart/); await assert.rejects(imageLayersApi.exportPsd(body), /Restart/); assert.equal(writes, 0);
  enabled = true; await assert.rejects(imageLayersApi.save(body), /connection lost/); assert.equal(writes, 1);
});
