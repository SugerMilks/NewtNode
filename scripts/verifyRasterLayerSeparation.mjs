import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const image = await sharp(await readFile(path.join(root, "public/storyboard/MOOD_BOARD.png"))).resize(800, 450).png().toBuffer();
const subject = await sharp(image).extract({ left: 300, top: 80, width: 200, height: 280 }).png().toBuffer();
const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-layer-separation-"));
const server = await createServer({ root, configFile: path.join(root, "test/browser/storyboard.config.js"), server: { host: "127.0.0.1", port: 0, hmr: false }, logLevel: "error" });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], unexpected = [], submissions = [], saves = [], exports = [];
  let mode = "hold", complete = false, lastRequest;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/folder-*.png*", route => route.fulfill({ contentType: "image/png", body: route.request().url().includes("subject") || route.request().url().includes("child") ? subject : image }));
  const result = body => ({ id: body.requestId, name: "Separation", sourceUrl: body.sourceUrl, width: 200, height: 280,
    layerSeparation: { sourceUrl: body.sourceUrl, sourceOpacity: body.sourceOpacity, alphaProtected: true },
    layers: ["Dress", "Face"].map((name, i) => ({ id: `part-${i}`, name, url: `/outputs/folder-child-${i}.png`, x: 0, y: 0, width: 200, height: 280, opacity: 1, visible: true, locked: false })),
    items: [{ url: "/outputs/folder-result.png", type: "image" }] });
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const url = new URL(route.request().url()), body = route.request().postDataJSON();
    const reply = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/api/health") return reply({ routes: { imageLayers: true, imageLayersPsd: true, imageLayersRotation: true, imageLayerFolders: true, imageLayerSeparation: true } });
    if (url.pathname === "/api/node/image-layers") {
      submissions.push(body); lastRequest = body;
      if (mode === "reject") return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Atlas is disabled. No generation was submitted.", noSubmission: true }) });
      return reply({ requestId: body.requestId, status: mode === "recover" ? "uncertain" : "running", error: mode === "recover" ? "Connection interrupted" : "" });
    }
    if (/^\/api\/node\/image-layers\//.test(url.pathname)) return reply(complete ? { requestId: lastRequest.requestId, status: "completed", document: result(lastRequest) } : { requestId: lastRequest.requestId, status: "running" });
    if (url.pathname === "/api/node/image-layers-save") { saves.push(body); return reply({ document: { ...body.document, id: `saved-${saves.length}`, items: [{ url: "/outputs/folder-result.png", type: "image" }] } }); }
    if (url.pathname === "/api/system/select-save-path") return reply({ path: "/tmp/Separation-QA.psd" });
    if (url.pathname === "/api/node/image-layers-psd") { exports.push(body); return reply({ status: "completed", result: { documentId: body.document.id, url: "/outputs/folder-export.psd", fileName: "Separation-QA.psd" } }); }
    unexpected.push(url.pathname); return route.abort();
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/test/browser/raster-layer-folders.html`;
  const button = name => page.getByRole("button", { name, exact: true });
  const row = id => page.locator(`.layers-list-row[data-layer-id="${id}"]`);
  const panel = page.locator(".raster-layer-separation");
  const waitFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const draft = async () => { await waitFrames(); return JSON.parse(await page.getByLabel("Folder draft").textContent()); };
  await page.goto(url);
  await row("subject").locator("img").click(); await row("detail").locator("img").click({ modifiers: ["Shift"] });
  assert.ok(await button("Separate Layer").isDisabled(), "single-layer action cannot run on a multiselection");
  await button("Group selected layers (Command/Ctrl G)").click();
  assert.ok(await button("Separate Layer").isDisabled(), "a folder is not an isolated layer");
  await row("subject").locator("img").click();
  await button("Lock Subject").click(); assert.ok(await button("Separate Layer").isDisabled());
  await button("Unlock Subject").click(); await button("Hide Subject").click(); assert.ok(await button("Separate Layer").isDisabled());
  await button("Show Subject").click();
  const before = await draft();
  await button("Separate Layer").click();
  await page.getByLabel("Separation instructions").fill("Separate clothing and face");
  await page.getByLabel("Layer limit", { exact: true }).fill("3");
  await page.getByLabel("Layers resolution").selectOption("1k");
  await panel.getByRole("button", { name: "Separate Layer", exact: true }).click();
  await page.getByRole("status", { name: "Separating selected layer" }).waitFor();
  assert.ok(await button("Save Version").isDisabled()); assert.ok(await button("Export PSD").isDisabled());
  assert.deepEqual((await draft()).layers, before.layers);
  assert.equal(submissions.length, 1); assert.equal(submissions[0].sourceUrl, "/outputs/folder-subject.png");
  assert.equal(submissions[0].layerOnly, true); assert.equal(submissions[0].sourceOpacity, 1);
  assert.equal(submissions[0].limit, 3); assert.equal(submissions[0].resolution, "1k"); assert.equal(submissions[0].prompt, "Separate clothing and face");
  const spinner = await page.getByRole("status", { name: "Separating selected layer" }).boundingBox();
  await button("Zoom in").click();
  assert.deepEqual(await page.getByRole("status", { name: "Separating selected layer" }).boundingBox(), spinner);
  await page.screenshot({ path: path.join(screenshots, "separating-desktop.png") });
  complete = true;
  await page.getByLabel("Folder name Subject layers", { exact: true }).waitFor();
  assert.equal(await panel.count(), 0); assert.equal(await page.getByRole("status", { name: "Separating selected layer" }).count(), 0);
  const after = await draft(); assert.equal(after.layers.length, 4); assert.equal(after.folders.length, 2);
  assert.equal(after.folders[1].parentId, before.folders[0].id);
  assert.deepEqual(after.layers[0], before.layers[0]); assert.deepEqual(after.layers[3], before.layers[2]);
  assert.equal(after.layers[1].x, 300); assert.equal(after.layers[1].y, 80); assert.equal(after.layers[1].width, 200); assert.equal(after.layers[1].height, 280);
  await button("Undo (Command/Ctrl Z)").click(); assert.deepEqual((await draft()).layers, before.layers); assert.deepEqual((await draft()).folders, before.folders);
  await button("Redo (Command/Ctrl Shift Z)").click(); assert.deepEqual((await draft()).layers, after.layers);
  await page.screenshot({ path: path.join(screenshots, "separated-desktop.png") });
  await button("Save Version").click(); await waitFrames();
  assert.equal(JSON.parse(await page.getByLabel("Folder saved").textContent()).folders.length, 2);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("newtnode.layer-separation.")).length), 0);

  await page.goto(`${url}?embedded`); await page.getByRole("combobox", { name: "Edit method", exact: true }).selectOption("layers");
  await row("subject").locator("img").click(); await button("Separate Layer").click();
  mode = "recover"; complete = false;
  await panel.getByRole("button", { name: "Separate Layer", exact: true }).click();
  await button("Check layer separation").waitFor();
  assert.ok(await page.getByRole("combobox", { name: "Edit method", exact: true }).isDisabled());
  await page.reload(); await page.getByRole("combobox", { name: "Edit method", exact: true }).selectOption("layers");
  await button("Check layer separation").waitFor();
  assert.equal(submissions.length, 2, "reload does not resubmit a paid request");
  complete = true; await button("Check layer separation").click();
  await page.getByLabel("Folder name Subject layers", { exact: true }).waitFor();
  assert.equal(submissions.length, 2);
  await button("Export PSD").click(); await page.waitForFunction(() => document.querySelector(".layers-psd-status"));
  assert.equal(exports[0].document.layers.length, 4); assert.equal(exports[0].document.folders[0].name, "Subject layers");
  await button("Add Image to Canvas").click(); await page.waitForFunction(() => document.querySelector('[aria-label="Folder saved"]').textContent !== "null");
  const delivered = JSON.parse(await page.getByLabel("Folder saved").textContent());
  assert.equal(delivered.imageLayersDocument.layers.length, 4); assert.equal(delivered.imageLayersDocument.folders[0].name, "Subject layers");
  assert.equal(saves.length, 1);

  await page.evaluate(() => localStorage.clear()); await page.goto(url); await row("subject").locator("img").click(); await button("Separate Layer").click();
  mode = "reject"; await panel.getByRole("button", { name: "Separate Layer", exact: true }).click();
  await page.getByText("Atlas is disabled. No generation was submitted.", { exact: true }).waitFor();
  assert.equal((await draft()).layers.length, 3); assert.equal(await page.getByRole("status", { name: "Separating selected layer" }).count(), 0);
  await button("Close layer separation").click(); assert.equal(await panel.count(), 0);
  await button("Separate Layer").click(); await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshots, "separation-mobile.png") });
  assert.ok(await panel.evaluate(element => element.scrollWidth <= element.clientWidth));
  for (const field of await panel.locator("textarea,input,select").all()) assert.ok(await field.isVisible());
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ ok: true, checks: "single-layer selection, settings, isolated payload, spinner, nested insertion, unchanged siblings, Undo/Redo, save/export/delivery, reload recovery without resubmission, no-submission failure, desktop/mobile; no paid calls", screenshots }));
} finally { await browser?.close(); await server.close(); }
