import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import sharp from "sharp";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1300 } });
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/reframeUtility.html`);
  const state = () => page.locator('[aria-label="State"]').textContent().then(JSON.parse);
  const videoTool = () => page.getByRole("combobox", { name: "Video utility tool" });
  await page.locator(".model-settings-drawer select").first().selectOption("ReFrame");
  await videoTool().waitFor();
  assert.equal((await state()).data.model, "Nano Banana 2.1");
  assert.equal(await page.getByRole("tab", { name: "Video", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await page.locator('[data-port-role="input"]').getAttribute("data-port-id"), "imageIn");
  assert.equal(await page.locator('[data-port-role="output"]').getAttribute("data-port-id"), "utilityOut");
  assert.equal(await page.getByRole("button", { name: "Run Wan Fun Control", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Load legacy ReFrame" }).click();
  await page.getByRole("button", { name: "Select Wide" }).waitFor();
  assert.equal((await state()).type, "utility");
  assert.equal((await state()).data.model, "Nano Banana Pro");
  await videoTool().selectOption("RIFE Video");
  await page.locator(".model-settings-drawer select").first().selectOption("ReFrame");
  await page.getByRole("button", { name: "Select Wide" }).waitFor();
  assert.equal((await state()).data.resultItems.length, 2);
  assert.equal((await state()).data.model, "Nano Banana Pro");
  await page.getByRole("tab", { name: "Image", exact: true }).click();
  await page.getByRole("tab", { name: "Video", exact: true }).click();
  await videoTool().waitFor();
  assert.match((await state()).data.resultUrl, /refined/);
  await page.getByRole("button", { name: "Simulate pending work" }).click();
  assert.equal(await videoTool().isDisabled(), true);
  assert.equal(await page.getByRole("tab", { name: "Image", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Clear simulated work" }).click();
  await page.getByRole("button", { name: "Save / Reopen" }).click();
  await videoTool().waitFor();
  assert.match((await state()).data.resultUrl, /refined/);
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-reframe-utility-"));
  for (const [name, width, height] of [["desktop", 1440, 1300], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => document.querySelector(".coverage-monitor img")?.naturalWidth > 0);
    const canvas = page.locator(".coverage-diagram canvas");
    await canvas.scrollIntoViewIfNeeded();
    const pixels = await sharp(await canvas.screenshot()).stats();
    assert.ok(pixels.channels.some(channel => channel.stdev > 15), `${name}: camera diagram is not blank`);
    const before = await canvas.screenshot();
    await page.getByRole("spinbutton", { name: "Orbit", exact: true }).fill("80");
    await page.waitForTimeout(150);
    assert.ok(!before.equals(await canvas.screenshot()), `${name}: camera diagram responds`);
    await page.getByRole("spinbutton", { name: "Orbit", exact: true }).fill("0");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no page overflow`);
    const bounds = await videoTool().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.locator("article").screenshot({ path: path.join(screenshots, `${name}.png`) });
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log(`ReFrame Utility browser checks passed without API calls. Screenshots: ${screenshots}`);
} finally { await browser?.close(); await server.close(); }
