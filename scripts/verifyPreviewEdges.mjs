import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import sharp from "sharp";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error"
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-preview-edges-"));
  const results = [], errors = [], apiCalls = [];
  for (const deviceScaleFactor of [1, 1.25, 2]) {
    const page = await browser.newPage({ viewport: { width: 1441, height: 999 }, deviceScaleFactor });
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/image-edit.html`);
    const stage = page.locator("[data-image-viewport]"), image = page.locator(".output-lightbox-image-editor");
    for (const portrait of [false, true]) {
      await page.getByRole("button", { name: portrait ? "Open portrait" : "Open landscape", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".output-lightbox-image-editor")?.style.width);
      const header = await page.locator(".output-lightbox header").boundingBox();
      const originalUrl = await image.locator("img").getAttribute("src");
      assert.equal(await stage.evaluate(element => getComputedStyle(element).overflow), "clip");
      assert.equal(await stage.evaluate(element => getComputedStyle(element).contain), "paint");
      for (const delta of [-17, -23, 9, -11, 5, 10000, -4, -37, -28, 36, 29, 10000]) {
        const bounds = await stage.boundingBox();
        await stage.dispatchEvent("wheel", { deltaY: delta, deltaMode: 0, clientX: bounds.x + bounds.width * .61, clientY: bounds.y + bounds.height * .42 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (delta < 0) {
          const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
          await page.mouse.move(x, y); await page.mouse.down();
          await page.mouse.move(x + 13, y - 7, { steps: 3 }); await page.mouse.up();
        }
        await stage.evaluate(element => { element.scrollTop = 50; element.scrollLeft = 50; });
        assert.deepEqual(await stage.evaluate(element => [element.scrollLeft, element.scrollTop]), [0, 0], "zoom must not create a hidden scrollable surface");
        assert.deepEqual(await page.locator(".output-lightbox header").boundingBox(), header);
        const stageRect = await stage.boundingBox(), imageRect = await image.boundingBox();
        const png = await page.screenshot();
        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixelScale = info.width / 1441;
        let strayPixels = 0, samples = 0;
        for (let y = Math.ceil((stageRect.y + 3) * pixelScale); y < (stageRect.y + stageRect.height - 3) * pixelScale; y++) {
          for (let x = Math.ceil((stageRect.x + 3) * pixelScale); x < (stageRect.x + stageRect.width - 3) * pixelScale; x++) {
            const px = x / pixelScale, py = y / pixelScale;
            if (px >= imageRect.x - 2 && px <= imageRect.x + imageRect.width + 2 && py >= imageRect.y - 2 && py <= imageRect.y + imageRect.height + 2) continue;
            samples++;
            const i = (y * info.width + x) * info.channels;
            if (Math.max(data[i], data[i + 1], data[i + 2]) > 15) strayPixels++;
          }
        }
        if (strayPixels) await page.screenshot({ path: path.join(screenshots, `stray-${deviceScaleFactor}-${portrait}-${delta}.png`) });
        if (delta === -23) await page.screenshot({ path: path.join(screenshots, `edges-${deviceScaleFactor}-${portrait ? "portrait" : "landscape"}.png`) });
        results.push({ deviceScaleFactor, portrait, delta, strayPixels, samples });
      }
      assert.equal(await image.locator("img").getAttribute("src"), originalUrl, "rendering changes never replace or modify the image");
      await page.getByLabel("Close preview", { exact: true }).click();
    }
    await page.close();
  }
  console.log(JSON.stringify({ screenshots, errors, apiCalls, checks: results.length, failures: results.filter(result => result.strayPixels) }, null, 2));
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  assert.ok(results.every(result => !result.strayPixels), "preview margins must not contain ghost pixels outside the transformed image");
} finally { await browser?.close(); await server.close(); }
