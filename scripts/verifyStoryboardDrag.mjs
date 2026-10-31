import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
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
const solid = async color => `data:image/png;base64,${(await sharp({ create: { width: 640, height: 360, channels: 3, background: color } }).png().toBuffer()).toString("base64")}`;
const red = await solid("#cc3333"), blue = await solid("#3366cc");
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [], apiCalls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === "/api/media-thumbnail" && /^\/outputs\/storyboard-qa-\d+\.png/.test(url.searchParams.get("url") || "")) {
      return route.fulfill({ contentType: "image/png", body: Buffer.from((/storyboard-qa-1\.png/.test(url.searchParams.get("url")) ? red : blue).split(",")[1], "base64") });
    }
    apiCalls.push(url.href); return route.abort();
  });
  await page.route("**/outputs/storyboard-qa-*.png*", route => route.fulfill({ contentType: "image/png", body: Buffer.from((/storyboard-qa-1\.png/.test(route.request().url()) ? red : blue).split(",")[1], "base64") }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/storyboard.html?drag=1`);
  const panels = () => page.getByLabel("QA panels").textContent().then(JSON.parse);
  const card = id => page.locator(`article[data-storyboard-frame-id="${id}"]`);
  const media = id => card(id).locator(".storyboard-frame-media");
  await card("f1").waitFor();
  await page.evaluate(() => {
    window.dragPreviews = [];
    const native = DataTransfer.prototype.setDragImage;
    DataTransfer.prototype.setDragImage = function(image, x, y) {
      const rect = image.getBoundingClientRect(), style = getComputedStyle(image);
      window.dragPreviews.push({ canvas: image instanceof HTMLCanvasElement, width: image.width, height: image.height,
        mounted: image.isConnected && image.parentNode === document.body, rect: rect.toJSON(),
        pointerEvents: style.pointerEvents, display: style.display, visibility: style.visibility,
        x, y, frame: this.getData("application/x-storyboard-frame-id"), types: [...this.types], output: this.getData("application/x-newtnode-output"),
        png: image.toDataURL(), center: [...image.getContext("2d").getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data] });
      return native.call(this, image, x, y);
    };
  });
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-storyboard-drag-"));
  for (const [name, viewport, scale] of [
    ["desktop", { width: 1300, height: 1100 }, 1],
    ["zoomed", { width: 1300, height: 1100 }, 0.62],
    ["narrow", { width: 390, height: 844 }, 0.29]
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Reset QA fixture", exact: true }).click();
    await page.getByRole("button", { name: "Save and reopen", exact: true }).click();
    await page.locator("section.node-card").evaluate((element, scale) => Object.assign(element.style, {
      width: "1200px", maxWidth: "none", margin: "16px 0", transform: `scale(${scale})`, transformOrigin: "top left"
    }), scale);
    await page.evaluate(async () => {
      const cards = [...document.querySelectorAll("article.storyboard-frame-card")];
      await Promise.all(cards.map(async card => {
        const image = card.querySelector(".storyboard-frame-media img");
        image.loading = "eager";
        await image.decode();
      }));
      window.dragPreviews = [];
    });
    const before = await panels();
    const bounds = await media("f1").boundingBox();
    await media("f1").dragTo(media("f2"));
    const after = await panels();
    assert.deepEqual(after.map(frame => frame.id), ["f2", "f1", "f3", "f4", "f5", "f6", "f7", "f8", "f9"]);
    assert.deepEqual(after.slice(2), before.slice(2), "no neighboring frame is moved or edited");
    const preview = await page.evaluate(() => window.dragPreviews.at(-1));
    assert.ok(preview.canvas); assert.equal(preview.frame, "f1");
    assert.ok(preview.mounted, "native drag source must have a rendered layout object, not a detached canvas");
    assert.equal(preview.rect.width, preview.width); assert.equal(preview.rect.height, preview.height);
    assert.ok(preview.rect.left >= 0 && preview.rect.top >= 0 && preview.rect.right <= viewport.width && preview.rect.bottom <= viewport.height);
    assert.equal(preview.pointerEvents, "none");
    assert.notEqual(preview.display, "none"); assert.equal(preview.visibility, "visible");
    assert.equal(await page.locator("[data-storyboard-drag-preview]").count(), 0, "drop removes the temporary overlay");
    assert.deepEqual(preview.center, [204, 51, 51, 255], "preview uses the grabbed red frame, not a blue neighbor");
    assert.ok(preview.width <= 360 && preview.height <= 360);
    assert.ok(Math.abs(preview.width - Math.round(bounds.width * Math.min(1, 360 / Math.max(bounds.width, bounds.height)))) <= 1);
    assert.ok(preview.x >= 0 && preview.x < preview.width && preview.y >= 0 && preview.y < preview.height);
    assert.ok(preview.types.includes("text/uri-list"), "full-resolution image drag payload remains available");
    assert.equal(JSON.parse(preview.output).url, "/outputs/storyboard-qa-1.png", "drag payload uses the original, never the rasterized preview");
    const png = Buffer.from(preview.png.split(",")[1], "base64");
    const pixels = await sharp(png).raw().toBuffer();
    for (let offset = 0; offset < pixels.length; offset += 4) assert.ok(!(pixels[offset + 2] > 150 && pixels[offset] < 100), "no pixels from a blue neighboring frame");
    await writeFile(path.join(screenshots, `${name}-drag-preview.png`), png);
    await page.screenshot({ path: path.join(screenshots, `${name}-reordered.png`), fullPage: true });
    const source = await media("f1").boundingBox(), target = await media("f3").boundingBox();
    const order = (await panels()).map(frame => frame.id);
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.keyboard.press("Escape"); await page.mouse.up();
    assert.deepEqual((await panels()).map(frame => frame.id), order, "cancelled drags never reorder frames");
    assert.equal(await page.locator("[data-storyboard-drag-preview]").count(), 0, "cancel removes the temporary overlay");
  }
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ ok: true, screenshots, paidCalls: 0, checks: ["mounted native preview source", "native frame reorder", "single-frame preview pixels", "drop and Escape cleanup", "desktop and scaled/mobile canvas", "image export payload", "unrelated panels unchanged"] }, null, 2));
} finally { await browser?.close(); await server.close(); }
