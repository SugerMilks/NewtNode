import assert from "node:assert/strict";
import sharp from "sharp";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30" fill="#255d55"/></svg>';
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const fixture = await startVectorQaServer({ svg, png, service: { inspect: async () => ({ svg, layers: [], backgroundKeys: [], sourceHash: "qa" }) } });
const browser = await chromium.launch({ headless: true, channel: process.env.VECTOR_BROWSER_CHANNEL || "chrome" });
const errors = [], apiCalls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
  await page.goto(`${fixture.url}/test/browser/vector.html`);
  await page.evaluate(async () => {
    const { canDeleteCanvasSelection } = await import("/src/nodeKeyboardRouting.js");
    window.vectorDeletionLeaks = 0;
    window.addEventListener("keydown", event => {
      if (canDeleteCanvasSelection(event, document.querySelector(".node-card"))) window.vectorDeletionLeaks++;
    });
  });
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const thumbnails = page.locator(".vector-variants button");
  const count = n => page.waitForFunction(n => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems.length === n, n);
  const idle = () => page.waitForFunction(() => !document.querySelector(".vector-generate").disabled);
  const run = () => page.locator(".vector-generate").click();
  const focusedUrl = () => page.evaluate(() => document.activeElement.dataset.vectorResultUrl);
  await page.getByLabel("Vector generations", { exact: true }).selectOption("3");
  await run(); await count(3); await idle();
  const original = (await state()).resultItems;
  await thumbnails.first().focus(); await page.keyboard.press("Delete");
  assert.equal((await state()).resultItems.length, 3, "focus alone does not delete a different selected result");
  await thumbnails.nth(1).click();
  assert.equal(await focusedUrl(), original[1].url, "click gives the thumbnail keyboard focus");
  await page.keyboard.press("Delete"); await count(2);
  assert.equal((await state()).resultUrl, original[2].url);
  assert.equal(await focusedUrl(), original[2].url, "selection and focus advance together");
  await page.keyboard.press("Meta+Backspace");
  await thumbnails.last().dispatchEvent("keydown", { key: "Delete", repeat: true });
  assert.equal((await state()).resultItems.length, 2, "modifiers and held keys cannot cascade deletions");

  const brief = page.getByLabel("Design brief");
  await brief.fill("AB"); await brief.press("End"); await brief.press("Backspace");
  assert.equal(await brief.inputValue(), "A"); assert.equal((await state()).resultItems.length, 2);
  await page.locator(".vector-monitor img").dblclick();
  await thumbnails.last().dispatchEvent("keydown", { key: "Delete" });
  assert.equal((await state()).resultItems.length, 2, "modal ownership prevents thumbnail deletion");
  await page.getByRole("button", { name: "Close preview", exact: true }).click();

  // A native drag of transparent artwork must still publish the original SVG/PNG pair.
  await thumbnails.first().dragTo(page.getByLabel("Canvas drop target"));
  const dropped = JSON.parse(await page.getByLabel("Dropped output").textContent());
  assert.equal(dropped.url, original[0].url); assert.equal(dropped.svgUrl, original[0].svgUrl);
  assert.equal((await state()).resultUrl, original[2].url, "dragging a different version does not select it");
  await thumbnails.last().click(); await page.keyboard.press("Backspace"); await count(1);
  assert.equal(await focusedUrl(), original[0].url);
  await page.keyboard.press("Delete"); await count(0);
  assert.equal((await state()).resultUrl, "");
  assert.equal(await page.locator(".vector-monitor img").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.className), "vector-variants");
  await page.keyboard.press("Delete"); await page.keyboard.press("Backspace");
  assert.deepEqual(JSON.parse(await page.getByLabel("Dropped output").textContent()), dropped, "dragged copies are not removed");
  assert.equal((await page.request.get(`${fixture.url}${original[0].url}`)).status(), 200, "saved source remains available");
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
  assert.equal((await state()).resultItems.length, 0);

  await page.getByLabel("Vector generations", { exact: true }).selectOption("2");
  await run(); await count(2); await idle();
  const retained = (await state()).resultItems[0], removed = (await state()).resultItems[1];
  await page.getByLabel("Vector generations", { exact: true }).selectOption("1");
  await page.getByLabel("Slow response", { exact: true }).check(); await run();
  const job = (await state()).vectorJob;
  await thumbnails.last().click(); await page.keyboard.press("Delete"); await count(1);
  assert.deepEqual((await state()).vectorJob, job, "deletion leaves the live request untouched");
  await idle(); await count(2);
  assert.equal((await state()).resultUrl, retained.url);
  assert.equal((await state()).resultItems.some(item => item.url === removed.url), false, "late result merges without restoring deleted output");

  await page.getByRole("button", { name: "Restore layer draft", exact: true }).click();
  await thumbnails.first().click();
  page.once("dialog", dialog => dialog.dismiss()); await page.keyboard.press("Delete");
  assert.equal((await state()).resultItems.length, 2); assert.equal((await state()).vectorLayerDrafts.length, 1);
  page.once("dialog", dialog => dialog.accept()); await page.keyboard.press("Delete"); await count(1);
  assert.deepEqual((await state()).vectorLayerDrafts, []);
  assert.equal(await page.evaluate(() => window.vectorDeletionLeaks), 0, "no thumbnail delete reaches canvas node or wire deletion");
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, checks: ["Delete and Mac Backspace", "neighbor/empty-strip focus", "canvas/text/modal safety", "transparent image dragging", "files and dragged copies preserved", "save/reopen", "live generation merge", "draft discard confirmation"] }, null, 2));
} finally { await browser.close(); await fixture.close(); }
