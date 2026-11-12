import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error"
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [], calls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { calls.push(route.request().url()); return route.abort(); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/seedream.html`);
  const model = page.getByLabel("Image model", { exact: true });
  await model.selectOption("Seedream 5.5");
  const state = () => page.getByLabel("Selected settings").textContent().then(JSON.parse);
  assert.equal((await state()).model, "Seedream 5.5");
  const rowSelect = label => page.locator(".node-row").filter({ has: page.locator(".node-row-label", { hasText: new RegExp(`^${label}$`) }) }).locator("select");
  const ratios = rowSelect("Aspect Ratio"), resolution = rowSelect("Resolution"), background = rowSelect("Background");
  assert.equal(await model.locator("option", { hasText: "Seedream 5.0" }).count(), 0);
  assert.equal(await resolution.locator("option", { hasText: "4K" }).count(), 0);
  await background.selectOption("transparent");
  assert.equal((await state()).background, "transparent");
  await page.getByLabel("Test provider").selectOption("atlas");
  assert.equal(await ratios.locator("option", { hasText: /^4:5$/ }).count(), 0);
  await ratios.selectOption("21:9");
  await resolution.selectOption("1K");
  assert.equal((await state()).resolution, "1K");
  await page.getByLabel("Test provider").selectOption("krea");
  await page.getByText("Enable Fal or Atlas Cloud in Settings for Seedream 5.5. Krea does not currently offer it.", { exact: true }).waitFor();
  await page.getByLabel("Test provider").selectOption("fal");
  assert.equal(await ratios.locator("option", { hasText: /^4:5$/ }).count(), 1);
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-seedream55-"));
  await page.locator(".node-card").screenshot({ path: path.join(screenshots, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const rects = await model.evaluate(element => ({ select: element.getBoundingClientRect().toJSON(), node: element.closest(".node-card").getBoundingClientRect().toJSON() }));
  assert.ok(rects.select.left >= rects.node.left && rects.select.right <= rects.node.right + 1);
  await page.locator(".node-card").screenshot({ path: path.join(screenshots, "mobile.png") });
  assert.deepEqual(errors, []);
  assert.deepEqual(calls, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots, checks: ["5.5 selector", "1K/2K only", "provider-specific ratios", "transparent PNG", "Krea warning", "desktop/mobile"] }, null, 2));
} finally { await browser?.close(); await server.close(); }
