import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const errors = [], apiCalls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const request = new URL(route.request().url());
    if (request.origin === base && request.pathname === "/api/media-thumbnail") return route.continue(); // Vite serves the bundled fixture.
    apiCalls.push(route.request().url()); return route.abort();
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-preview-zoom-"));
  const stage = page.locator("[data-image-viewport]");
  const image = page.locator(".output-lightbox-image-editor");
  const header = page.locator(".output-lightbox header");
  const view = () => image.evaluate(element => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const open = async (portrait = false) => {
    await page.goto(`${base}/test/browser/image-edit.html`);
    await page.getByRole("button", { name: portrait ? "Open portrait" : "Open landscape", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".output-lightbox-image-editor")?.style.width);
    await settle();
  };
  const wheel = async (deltaY, options = {}) => {
    const rect = await stage.boundingBox();
    await stage.dispatchEvent("wheel", { deltaY, deltaMode: 0, clientX: rect.x + rect.width * .6, clientY: rect.y + rect.height * .6, ...options });
    await settle();
  };
  const fit = async () => {
    for (let i = 0; i < 3; i++) await wheel(10000);
    assert.deepEqual(await view(), { scale: 1, x: 0, y: 0 });
  };

  await open();
  const original = await image.boundingBox(), fixedHeader = await header.boundingBox();
  assert.equal(await page.getByRole("button", { name: "Fit image", exact: true }).count(), 0);
  await wheel(10000);
  assert.deepEqual(await image.boundingBox(), original, "scrolling out from the original fit cannot shrink or move the image");
  const originalUrl = await image.locator("img").getAttribute("src");
  const point = { x: original.x + original.width * .6, y: original.y + original.height * .55 };
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -130); await settle();
  const enlarged = await image.boundingBox();
  assert.ok(enlarged.width > original.width * 1.5);
  assert.ok(Math.abs((point.x - enlarged.x) / enlarged.width - .6) < .001, "cursor stays anchored horizontally");
  assert.ok(Math.abs((point.y - enlarged.y) / enlarged.height - .55) < .001, "cursor stays anchored vertically");
  assert.deepEqual(await header.boundingBox(), fixedHeader, "header never zooms");
  const beforePan = await view();
  const rect = await stage.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 100, rect.y + rect.height / 2 + 60, { steps: 8 }); await page.mouse.up();
  assert.ok((await view()).x > beforePan.x + 90, "drag pans zoomed image");
  await page.screenshot({ path: path.join(screenshots, "desktop-zoom.png") });

  const pan = await view();
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 150, rect.y + rect.height / 2 + 80, { steps: 5 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  assert.deepEqual(await view(), pan, "Escape cancels only the pan");
  assert.equal(await page.getByRole("dialog").count(), 1);
  await fit();
  assert.deepEqual(await image.boundingBox(), original, "zooming out after panning restores the original framing");
  await wheel(-80, { ctrlKey: true });
  assert.ok((await view()).scale > 1, "trackpad pinch zooms the image");
  assert.equal(await page.evaluate(() => window.visualViewport.scale), 1, "no page zoom");
  await wheel(10000, { ctrlKey: true }); assert.deepEqual(await view(), { scale: 1, x: 0, y: 0 });
  for (let i = 0; i < 4; i++) await wheel(-10000);
  assert.equal((await view()).scale, 8);
  await stage.focus(); await page.keyboard.press("0"); assert.equal((await view()).scale, 1);
  await page.keyboard.press("+"); assert.equal((await view()).scale, 1.2);
  await page.keyboard.press("-"); assert.equal((await view()).scale, 1);
  await page.keyboard.press("-"); assert.deepEqual(await view(), { scale: 1, x: 0, y: 0 });
  assert.equal(await image.locator("img").getAttribute("src"), originalUrl);
  assert.equal(await page.getByLabel("QA report").textContent(), "No request");

  // Crop geometry uses the transformed image bounds, never viewport coordinates.
  await page.getByLabel("Crop image", { exact: true }).click();
  await wheel(-30);
  const crop = page.locator(".output-crop-box"), cropStart = await crop.boundingBox();
  const imageStart = await image.boundingBox(), viewStart = await view();
  await page.mouse.move(cropStart.x + cropStart.width / 2, cropStart.y + cropStart.height / 2); await page.mouse.down();
  await page.mouse.move(cropStart.x + cropStart.width / 2 + imageStart.width * .03, cropStart.y + cropStart.height / 2, { steps: 5 });
  await wheel(-100); assert.deepEqual(await view(), viewStart, "active crop drag suppresses viewport changes");
  await page.mouse.up();
  assert.ok(Math.abs(await crop.evaluate(el => parseFloat(el.style.left)) - 11) < .1);
  await page.getByLabel("Cancel crop", { exact: true }).click();
  await fit();
  await page.getByLabel("Text overlay", { exact: true }).click();
  await page.getByPlaceholder("Type overlay text", { exact: true }).fill("QA");
  await wheel(-40);
  const text = page.locator(".output-text-overlay"), textStart = await text.boundingBox();
  const textImage = await image.boundingBox(), textView = await view();
  await page.mouse.move(textStart.x + textStart.width / 2, textStart.y + textStart.height / 2); await page.mouse.down();
  await page.mouse.move(textStart.x + textStart.width / 2 + textImage.width * .05, textStart.y + textStart.height / 2, { steps: 6 });
  await wheel(-80); assert.deepEqual(await view(), textView);
  await page.mouse.up();
  assert.ok(Math.abs(await text.evaluate(el => parseFloat(el.style.left)) - 55) < .1, "text placement stays in image coordinates");
  await page.getByLabel("Cancel text overlay", { exact: true }).click();
  await fit();
  for (const [type, scale] of [["gesturestart", 1], ["gesturechange", 1.5], ["gestureend", 1.5]]) {
    await stage.evaluate((element, { type, scale }) => {
      const rect = element.getBoundingClientRect(), event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
      element.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error("Native gesture was not contained");
    }, { type, scale });
  }
  await settle(); assert.equal((await view()).scale, 1.5, "native gesture events use incremental pinch scale");
  await fit();
  await page.getByLabel("Adjust brightness, contrast, saturation, and curves", { exact: true }).click();
  const panel = page.locator(".output-adjust-panel");
  const panelBounds = await panel.boundingBox();
  await wheel(-80);
  assert.deepEqual(await panel.boundingBox(), panelBounds, "adjustment panel stays fixed");
  await page.getByLabel("Close preview", { exact: true }).click();
  await page.getByRole("button", { name: "Open portrait", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".output-lightbox-image-editor")?.style.width);
  assert.equal((await view()).scale, 1, "reopen starts fitted");
  await wheel(-80); assert.ok((await view()).scale > 1);
  await page.screenshot({ path: path.join(screenshots, "portrait-zoom.png") });

  await page.setViewportSize({ width: 390, height: 844 }); await fit();
  await stage.focus(); await page.keyboard.press("+");
  const mobileHeader = await header.boundingBox();
  await wheel(-70); assert.deepEqual(await header.boundingBox(), mobileHeader);
  const close = await page.getByLabel("Close preview", { exact: true }).boundingBox();
  assert.ok(close.x >= 0 && close.x + close.width <= 390, "mobile close remains accessible");
  await page.screenshot({ path: path.join(screenshots, "mobile-zoom.png") });
  await page.getByLabel("Close preview", { exact: true }).click();

  // The rail opens the same viewer via an actual double-click, without edit controls.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/test/browser/output-drawer.html`);
  await page.locator(".project-output-thumb").first().dblclick();
  await page.waitForFunction(() => document.querySelector(".output-lightbox-image-editor")?.style.width);
  await wheel(-100); assert.ok((await view()).scale > 1);
  await fit();
  // Ensure the real canvas capture guard allows pinch events to reach the new viewport.
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  for (const name of ["blockPagePinchOutsideCanvas", "blockBrowserGestureOutsideCanvas"]) {
    const guard = editor.slice(editor.indexOf(`function ${name}(`), editor.indexOf(`function ${name}(`) + 550);
    assert.ok(guard.indexOf('[data-image-viewport]') < guard.indexOf("event.preventDefault()"));
  }
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ ok: true, screenshots, paidCalls: 0, checks: ["cursor-anchored scroll zoom", "trackpad pinch", "bounded drag pan", "fixed controls", "keyboard and reset", "crop mapping", "desktop and mobile", "double-click rail preview"] }, null, 2));
} finally { await browser?.close(); await server.close(); }
