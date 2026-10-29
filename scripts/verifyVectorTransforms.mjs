import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-transforms-qa-"));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="10 20 100 100"><g id="design" transform="translate(5 5)"><rect id="color" x="20" y="30" width="20" height="15" fill="#255d55"/></g><rect id="accent" x="60" y="60" width="10" height="10" fill="#e3bb33"/></svg>';
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const assets = new Map(), history = [], errors = [], forbidden = [];
let inspections = 0, delay = 0;
const service = createVectorLayerService({ readSource: async url => assets.get(url) || Buffer.from(svg),
  saveAssets: async (body, artwork) => {
    const base = `/outputs/vector-qa/local-${body.requestId}`;
    assets.set(`${base}.svg`, Buffer.from(artwork.svg)); assets.set(`${base}.png`, artwork.png); assets.set(`${base}-alpha.png`, artwork.alpha);
    return { url: `${base}.png`, svgUrl: `${base}.svg`, alphaUrl: `${base}-alpha.png` };
  }, recordHistory: async item => history.push(item) });
const fixtureServer = await startVectorQaServer({ svg, png, assets, service: { ...service, inspect: async body => {
  inspections++; if (delay) await new Promise(resolve => setTimeout(resolve, delay)); return service.inspect(body);
} } });
const browser = await chromium.launch({ headless: true, channel: process.env.VECTOR_BROWSER_CHANNEL || "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { forbidden.push(route.request().url()); return route.abort(); });
  await page.goto(`${fixtureServer.url}/test/browser/vector.html`);
  const button = name => page.getByRole("button", { name, exact: true });
  const modal = page.getByRole("dialog", { name: "Vector Layers editor" });
  const row = key => page.locator(`[data-layer-key="${key}"]`);
  const stage = page.locator(".vle-artwork"), selection = page.locator(".vle-selection");
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const operations = async () => (await state()).vectorLayerDrafts[0]?.operations || [];
  const ready = async () => {
    await page.waitForFunction(() => document.querySelector('[aria-label="Vector layers"]')?.getAttribute("aria-busy") === "false");
    await page.waitForFunction(() => { const img = document.querySelector('.vle-artwork img'); return img?.complete && img.naturalWidth > 0; });
  };
  const selected = async key => { await row(key).click(); await selection.waitFor(); await page.waitForFunction(() => document.querySelectorAll('.vle-resize-handle').length === 8); };
  const raster = () => page.locator(".vle-artwork img").evaluate(async image => {
    await image.decode(); const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 100;
    canvas.getContext("2d").drawImage(image, 0, 0, 200, 100); return canvas.toDataURL();
  });
  const undo = async () => { await page.keyboard.press("Meta+z"); await ready(); await selection.waitFor(); };
  const drag = async (handle, dx, dy, modifiers = []) => {
    const box = await (handle ? page.locator(`.handle-${handle}`) : selection).boundingBox();
    const canvas = await stage.boundingBox();
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx * canvas.width / 200, box.y + box.height / 2 + dy * canvas.height / 100, { steps: 8 });
    await page.mouse.up();
    for (const key of modifiers) await page.keyboard.up(key);
    await ready(); await selection.waitFor(); return (await operations()).at(-1);
  };
  await page.locator(".vector-generate").click(); await button("Edit Artwork").click(); await ready();
  const original = (await state()).resultItems[0];
  await selected("design"); const initialPixels = await raster();
  assert.equal(await page.locator(".vle-resize-handle").count(), 8);
  // Local pointer moves stay responsive; only release creates an undoable edit.
  delay = 400;
  const initialInspections = inspections, initialBox = await selection.boundingBox(), canvas = await stage.boundingBox();
  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2); await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width / 2 + canvas.width * .05, initialBox.y + initialBox.height / 2 + canvas.height * .1, { steps: 10 });
  await page.waitForTimeout(80);
  assert.equal((await operations()).length, 0); assert.equal(inspections, initialInspections);
  const livePixels = await raster(); assert.notEqual(livePixels, initialPixels);
  await page.mouse.up(); assert.equal((await operations()).length, 1);
  await page.waitForTimeout(40); assert.equal(await raster(), livePixels, "release keeps the local preview while validation is pending");
  await ready(); delay = 0;
  assert.equal(await raster(), livePixels, "validated pixels match the pointer preview");
  let matrix = (await operations()).at(-1).matrix;
  assert.ok(Math.abs(matrix.e - 10) < .01 && Math.abs(matrix.f - 10) < .01);
  await undo(); assert.equal(await raster(), initialPixels);
  await page.keyboard.press("Meta+Shift+z"); await ready(); assert.equal(await raster(), livePixels);
  await undo();
  console.log("Move, release, nested SVG, undo and redo passed");

  let op = await drag("se", 10, 2); assert.equal(op.matrix.a, op.matrix.d); assert.ok(op.matrix.a > 1.4); await undo();
  op = await drag("se", 10, 2, ["Shift"]); assert.ok(Math.abs(op.matrix.a - op.matrix.d) > .2); await undo();
  op = await drag("e", 10, 6); assert.equal(op.matrix.d, 1); assert.equal(op.matrix.f, 0); await undo();
  const base = await selection.boundingBox();
  await drag("se", 5, 3, ["Alt"]); const centered = await selection.boundingBox();
  assert.ok(Math.abs(base.x + base.width / 2 - centered.x - centered.width / 2) < 2);
  assert.ok(Math.abs(base.y + base.height / 2 - centered.y - centered.height / 2) < 2); await undo();
  await stage.focus(); await page.keyboard.press("ArrowRight"); await ready();
  assert.equal((await operations()).at(-1).matrix.e, 1); await undo();
  await stage.focus(); await page.keyboard.press("Shift+ArrowDown"); await ready();
  assert.equal((await operations()).at(-1).matrix.f, 10); await undo();
  await page.getByLabel("Layers zoom").selectOption("2");
  op = await drag(null, 3, 4); assert.ok(Math.abs(op.matrix.e - 3) < .01 && Math.abs(op.matrix.f - 4) < .01); await undo();
  await button("Fit artwork").click();
  console.log("Resize modes, keyboard nudges and zoom passed");

  await row("accent").click({ modifiers: ["Shift"] }); await selection.waitFor();
  op = await drag(null, 5, 0); assert.deepEqual([...op.keys].sort(), ["accent", "design"]); await undo();
  await selected("design"); await button("Expand design").click(); await button("Lock color").click(); await ready();
  assert.equal(await page.locator(".vle-resize-handle").count(), 0, "a locked descendant protects its whole group");
  const lockedCount = (await operations()).length;
  await stage.focus(); await page.keyboard.press("ArrowRight"); assert.equal((await operations()).length, lockedCount);
  await button("Unlock color").click(); await ready(); await selection.waitFor();
  const cancellationCount = (await operations()).length;
  for (const type of ["escape", "blur", "pointercancel"]) {
    const box = await selection.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 3 });
    if (type === "escape") await page.keyboard.press("Escape");
    else if (type === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await stage.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    assert.equal((await operations()).length, cancellationCount); assert.equal(await modal.count(), 1);
    await page.waitForTimeout(80);
    assert.equal(await raster() === initialPixels, true, `${type} restores the unchanged preview`);
  }
  console.log("Multiselect, locks and gesture cancellation passed");

  await drag(null, 10, 5); await drag("se", 5, 4);
  const finalPixels = await raster();
  await modal.screenshot({ path: path.join(directory, "transform-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.equal(await page.locator(".vle-resize-handle").count(), 8);
  await modal.screenshot({ path: path.join(directory, "transform-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal.getByRole("button", { name: "Save Version", exact: true }).click(); await modal.waitFor({ state: "detached" });
  const edited = (await state()).resultItems[1];
  assert.equal(edited.vectorSourceSvgUrl, original.svgUrl); assert.equal(edited.cost.amountUsd, 0);
  assert.match(assets.get(edited.svgUrl).toString(), /transform="matrix\(/);
  await button("Edit Artwork").click(); await ready(); assert.equal(await raster(), finalPixels);
  const browserPng = await page.evaluate(async url => {
    const img = new Image(); img.src = url; await img.decode(); const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 100;
    canvas.getContext("2d").drawImage(img, 0, 0); return canvas.toDataURL();
  }, edited.url);
  // Chrome and librsvg can differ at antialiased edges; both must retain alpha and moved content.
  const pixels = await sharp(Buffer.from(browserPng.split(",")[1], "base64")).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[3], 0); assert.ok(pixels[(25 * 200 + 80) * 4 + 3] > 0);
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  assert.equal(JSON.parse(await page.getByLabel("Provider calls").textContent()).generate, 1);
  console.log(JSON.stringify({ ok: true, directory, localSaves: history.length, paidCalls: 0,
    checks: ["live drag", "release stability", "single undo step", "nested transforms/viewBox", "proportional/free/center resize", "side handles", "zoom", "nudges", "multiselect", "locks", "Escape/blur/pointer cancellation", "desktop/mobile", "SVG/PNG/alpha save", "original preservation"] }, null, 2));
} finally { await browser.close(); await fixtureServer.close(); }
