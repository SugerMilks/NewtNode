import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const source = await sharp(await readFile(path.join(root, "public/storyboard/MOOD_BOARD.png"))).resize(800, 450, { fit: "cover" }).png().toBuffer();
const foreground = await sharp(source).extract({ left: 300, top: 100, width: 200, height: 250 }).png().toBuffer();
const item = (url, label) => ({ url, type: "image", label, width: 800, height: 450, mimeType: "image/png", alphaUrl: url });
const document = { id: "qa-document", name: "Separation", sourceUrl: "/uploads/layers-qa-source.png", width: 800, height: 450,
  layers: [{ id: "base", url: "/outputs/layers-qa-base.png", name: "Background", x: 0, y: 0, width: 800, height: 450, visible: true, locked: false, opacity: 1 },
    { id: "fg", url: "/outputs/layers-qa-fg.png", name: "Subject", x: 300, y: 100, width: 200, height: 250, visible: true, locked: false, opacity: 1 }],
  items: [item("/outputs/layers-qa-composite.png", "Composite"), item("/outputs/layers-qa-base.png", "Background"), item("/outputs/layers-qa-fg-canvas.png", "Subject")] };
const server = await createServer({ root, configFile: path.join(root, "test/browser/storyboard.config.js"), server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors = [], unexpected = [], submitted = [], saved = [], exports = [], pickers = [];
  let cancelPicker = true, loseExportResponse = false;
  const exportPolls = new Map();
  page.on("pageerror", error => { errors.push(error.message); console.error(error.stack); });
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  page.on("response", response => { if (response.status() >= 400) console.error(response.status(), response.url()); });
  await page.route("**/layers-qa-*.png", route => route.fulfill({ contentType: "image/png", body: route.request().url().endsWith("layers-qa-fg.png") ? foreground : source }));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const body = route.request().postDataJSON();
    const reply = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/api/health") return reply({ routes: { imageLayers: true, imageLayersPsd: true, imageLayersRotation: true } });
    if (url.pathname === "/api/system/select-save-path") { pickers.push(body); return reply(cancelPicker ? { canceled: true } : { path: "/tmp/Artwork.psd" }); }
    if (url.pathname === "/api/node/image-layers-psd") {
      exports.push(body);
      if (loseExportResponse) { loseExportResponse = false; return route.abort(); }
      return reply({ requestId: body.requestId, status: "running" });
    }
    if (url.pathname.startsWith("/api/node/image-layers-psd/")) {
      const id = url.pathname.split("/").at(-1), request = exports.find(item => item.requestId === id);
      const polls = (exportPolls.get(id) || 0) + 1; exportPolls.set(id, polls);
      return reply(polls === 1 ? { requestId: id, status: "running" } : { requestId: id, status: "completed", result: { documentId: request.document.id, url: "/outputs/qa-artwork.psd", fileName: "Artwork.psd", savedFilePath: "/tmp/Artwork.psd" } });
    }
    if (url.pathname === "/api/node/image-layers") { submitted.push(body); return reply({ requestId: body.requestId, status: "running" }); }
    if (url.pathname.startsWith("/api/node/image-layers/")) return reply({ status: "completed", document });
    if (url.pathname === "/api/node/image-layers-save") { saved.push(body); return reply({ document: { ...body.document, id: "edited", items: document.items } }); }
    unexpected.push(url.pathname); return route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/imageLayers.html`);
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).waitFor({ timeout: 10000 });
  await page.locator("select").filter({ has: page.locator("option", { hasText: /^Layers$/ }) }).selectOption("Layers");
  await page.getByRole("button", { name: /^Separate Layers/ }).click();
  await page.getByRole("button", { name: "Edit Layers", exact: true }).waitFor();
  assert.equal(submitted.length, 1); assert.equal(submitted[0].limit, 8);
  const screenshotDir = await mkdtemp(path.join(tmpdir(), "newtnode-layers-browser-"));
  await page.screenshot({ path: path.join(screenshotDir, "node.png"), fullPage: true });
  const state = () => page.getByLabel("State", { exact: true }).textContent().then(JSON.parse);
  const outputs = () => page.getByLabel("Connected outputs").textContent().then(JSON.parse);
  assert.equal((await outputs()).all.length, 3);
  await page.getByRole("button", { name: "Export PSD", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.layers-actions button[title^="Export this version"]').disabled);
  assert.equal(exports.length, 0); assert.equal(pickers.length, 1); assert.equal(pickers[0].extension, "psd");
  assert.equal((await state()).data.layersPsdJob, undefined);
  cancelPicker = false;
  await page.getByRole("button", { name: "Select Subject", exact: true }).click();
  assert.equal((await outputs()).selected.label, "Subject");
  await page.getByRole("button", { name: "Select Subject", exact: true }).dragTo(page.getByLabel("Canvas drop target"));
  const dropped = JSON.parse(await page.getByLabel("Dropped image").textContent()); assert.ok(JSON.stringify(dropped).includes("layers-qa-fg-canvas.png"));
  await page.getByRole("button", { name: "Edit Layers", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Layers" }); await dialog.waitFor();
  const adjustments = dialog.getByRole("button", { name: "Layer adjustments", exact: true });
  assert.equal(await adjustments.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByLabel("Layer x", { exact: true }).isVisible(), false);
  await adjustments.click();
  await page.locator(".layers-properties-reveal").evaluate(async element => { for (const animation of element.getAnimations({ subtree: true })) await animation.finished; });
  assert.ok(await page.getByLabel("Layer x", { exact: true }).isVisible());
  await page.getByRole("button", { name: "Hide Background", exact: true }).click();
  assert.equal(await page.locator(".layers-object").count(), 1);
  const rect = await page.locator(".layers-object").boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 20, { steps: 5 }); await page.mouse.up();
  const x = page.getByLabel("Layer x", { exact: true }); assert.ok(Number(await x.inputValue()) > 300);
  await dialog.focus(); await page.keyboard.press("Control+z"); assert.equal(await x.inputValue(), "300");
  await page.keyboard.press("Control+Shift+z"); assert.ok(Number(await x.inputValue()) > 300);
  const handle = await page.getByRole("button", { name: "Resize Subject", exact: true }).boundingBox();
  await page.mouse.move(handle.x + 6, handle.y + 6); await page.mouse.down(); await page.mouse.move(handle.x + 40, handle.y + 45, { steps: 5 }); await page.mouse.up();
  assert.ok(Number(await page.getByLabel("Layer width", { exact: true }).inputValue()) > 200);
  await page.screenshot({ path: path.join(screenshotDir, "desktop.png") });
  await page.getByLabel("Name Subject", { exact: true }).fill("Foreground");
  const beforeExport = await outputs();
  await dialog.getByRole("button", { name: "Export PSD", exact: true }).click();
  await dialog.getByRole("link", { name: "Saved: Artwork.psd", exact: true }).waitFor();
  assert.equal(exports.length, 1); assert.equal(exports[0].document.layers[0].visible, false);
  assert.equal(exports[0].document.layers[1].name, "Foreground"); assert.ok(exports[0].document.layers[1].width > 200);
  assert.ok(exports[0].document.layers[1].x > 300); assert.equal(saved.length, 0);
  assert.equal((await state()).data.layersDocuments.length, 1); assert.deepEqual(await outputs(), beforeExport);
  await page.screenshot({ path: path.join(screenshotDir, "psd-export.png") });
  await page.getByRole("button", { name: "Save Version", exact: true }).click(); await dialog.waitFor({ state: "detached" });
  assert.equal(saved.length, 1); assert.equal(saved[0].document.layers[1].name, "Foreground");
  assert.equal((await state()).data.layersDocuments.length, 2);
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
  assert.equal((await state()).data.layersDocuments.length, 2); assert.equal(submitted.length, 1);
  loseExportResponse = true;
  await page.getByRole("button", { name: "Export PSD", exact: true }).click();
  await page.getByRole("button", { name: "Check PSD export", exact: true }).waitFor();
  assert.equal(exports.length, 2);
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
  assert.equal(exports.length, 2); assert.equal((await state()).data.layersPsdJob.status, "uncertain");
  await page.getByRole("button", { name: "Check PSD export", exact: true }).click();
  await page.waitForFunction(() => !JSON.parse(document.querySelector('[aria-label="State"]').textContent).data.layersPsdJob);
  assert.equal(exports.length, 2); assert.equal((await state()).data.layersPsdExport.documentId, "edited");
  assert.equal(submitted.length, 1); assert.equal((await outputs()).all.length, 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Edit Layers", exact: true }).click(); await dialog.waitFor();
  assert.equal(await adjustments.getAttribute("aria-expanded"), "false", "reopening does not persist the open drawer");
  await page.screenshot({ path: path.join(screenshotDir, "mobile.png") });
  const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
  assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
  await page.getByRole("button", { name: "Close layer editor", exact: true }).click();
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots: screenshotDir, checks: ["actual Utility selector", "single submission", "Preview/Output selection", "alpha drag", "move/resize", "undo/redo", "hide/rename", "PSD picker cancellation", "PSD includes unsaved edits", "PSD recovery without replay", "PNG outputs unchanged", "local save version", "reopen", "desktop/mobile"] }, null, 2));
} finally { await browser?.close(); await server.close(); }
