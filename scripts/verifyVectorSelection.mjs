import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-selection-qa-"));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect id="a" x="20" y="20" width="40" height="40" fill="#e56e54"/><rect id="between" x="100" y="20" width="40" height="40" fill="#47b879"/><rect id="c" x="180" y="20" width="40" height="40" fill="#4789da"/><rect id="d" x="260" y="20" width="40" height="40" fill="#f3cd43"/><g id="left" transform="translate(20 130)"><rect id="left-a" width="40" height="40" fill="#e56e54"/><rect id="left-b" x="60" width="40" height="40" fill="#47b879"/></g><g id="right" transform="translate(220 130)"><circle id="right-a" cx="20" cy="20" r="20" fill="#4789da"/></g><g id="protected" opacity=".5"><rect id="protected-a" x="310" y="220" width="40" height="40" fill="#9658cb"/></g></svg>';
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const assets = new Map(), errors = [], forbidden = [], history = [];
const service = createVectorLayerService({ readSource: async url => assets.get(url) || Buffer.from(svg), saveAssets: async (body, art) => {
  const base = `/outputs/vector-qa/${body.requestId}`;
  assets.set(`${base}.svg`, Buffer.from(art.svg)); assets.set(`${base}.png`, art.png); assets.set(`${base}-alpha.png`, art.alpha);
  return { url: `${base}.png`, svgUrl: `${base}.svg`, alphaUrl: `${base}-alpha.png` };
}, recordHistory: async item => history.push(item) });
const fixture = await startVectorQaServer({ svg, png, assets, service });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { forbidden.push(route.request().url()); return route.abort(); });
  await page.goto(`${fixture.url}/test/browser/vector.html`);
  const button = name => page.getByRole("button", { name, exact: true });
  const modal = page.getByRole("dialog", { name: "Vector Layers editor" });
  const row = key => page.locator(`[data-layer-key="${key}"]`);
  const choose = (key, modifiers = []) => row(key).locator(".vle-layer-name").click({ modifiers });
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const ops = async () => (await state()).vectorLayerDrafts[0]?.operations || [];
  const ready = () => page.waitForFunction(() => document.querySelector('[aria-label="Vector layers"]')?.getAttribute("aria-busy") === "false");
  const selected = () => page.locator('.vle-layer-row[aria-selected="true"]').evaluateAll(rows => rows.map(row => row.dataset.layerKey).sort());
  const waitSelection = keys => page.waitForFunction(keys => JSON.stringify([...document.querySelectorAll('.vle-layer-row[aria-selected="true"]')].map(row => row.dataset.layerKey).sort()) === JSON.stringify(keys.slice().sort()), keys);
  const pixels = () => page.locator(".vle-artwork img").evaluate(async img => { await img.decode(); const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 300; canvas.getContext("2d").drawImage(img, 0, 0, 400, 300); return canvas.toDataURL(); });
  const clickAt = async (x, y) => { const rect = await page.locator(".vle-artwork").boundingBox(); await page.mouse.click(rect.x + x / 400 * rect.width, rect.y + y / 300 * rect.height); };
  const startBox = async (x1, y1, x2, y2) => {
    const rect = await page.locator(".vle-artwork").boundingBox();
    await page.keyboard.down("Shift"); await page.mouse.move(rect.x + x1 / 400 * rect.width, rect.y + y1 / 300 * rect.height); await page.mouse.down();
    await page.mouse.move(rect.x + x2 / 400 * rect.width, rect.y + y2 / 300 * rect.height, { steps: 5 });
    await page.locator(".vle-marquee").waitFor();
  };
  const endBox = async () => { await page.mouse.up(); await page.keyboard.up("Shift"); };
  const group = async (shortcut = false) => {
    assert.equal(await button("Group").isEnabled(), true);
    if (shortcut) await page.keyboard.press("Meta+g"); else await button("Group").click();
    await ready(); const operation = (await ops()).at(-1);
    assert.equal(operation.type, "group"); assert.equal(operation.mode, "selection");
    const name = page.getByLabel(`Layer name ${operation.id}`, { exact: true }); await name.waitFor(); await name.press("Escape");
    return operation;
  };
  const undo = async () => { await button("Undo layer edit").click(); await ready(); };
  await page.locator(".vector-generate").click(); await button("Edit Artwork").click(); await ready();
  const original = await pixels();

  await choose("a"); await choose("c", ["Meta"]); await waitSelection(["a", "c"]);
  const separated = await group(); assert.deepEqual(separated.keys, ["a", "c"]);
  assert.equal(await pixels(), original); assert.equal(await row("between").getAttribute("aria-selected"), "false");
  await undo(); await button("Redo layer edit").click(); await ready(); assert.equal(await row(separated.id).count(), 1); await undo();

  const selectionHistory = await ops();
  await choose("d"); await startBox(15, 15, 230, 70);
  await modal.screenshot({ path: path.join(directory, "shift-drag-desktop.png") });
  await endBox(); await waitSelection(["a", "between", "c", "d"]);
  assert.equal(await pixels(), original); assert.deepEqual(await ops(), selectionHistory, "marquee does not edit or move artwork");
  await choose("a"); await startBox(35, 35, 225, 65); await endBox(); await waitSelection(["a", "between", "c"]);
  assert.equal(await pixels(), original, "Shift-drag can start over selected artwork without moving it");
  await choose("d"); await startBox(230, 70, 15, 15); await endBox(); await waitSelection(["a", "between", "c", "d"]);
  await choose("d"); await startBox(15, 15, 230, 70); await page.keyboard.press("Escape"); await endBox();
  await page.locator(".vle-marquee").waitFor({ state: "detached" }); assert.deepEqual(await selected(), ["d"]); assert.equal(await modal.isVisible(), true);
  await startBox(15, 15, 230, 70); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await endBox();
  assert.deepEqual(await selected(), ["d"]); assert.equal(await page.locator(".vle-marquee").count(), 0);
  await startBox(15, 15, 230, 70); await page.locator(".vle-artwork").dispatchEvent("pointercancel", { pointerId: 1 }); await endBox();
  assert.deepEqual(await selected(), ["d"]);
  await page.getByLabel("Layers zoom").selectOption("0.5"); await startBox(15, 15, 230, 70); await endBox(); await waitSelection(["a", "between", "c", "d"]);
  await button("Fit artwork").click();

  await choose("left");
  const isolatedBounds = await page.locator(".vle-artwork").boundingBox();
  await page.mouse.dblclick(isolatedBounds.x + 40 / 400 * isolatedBounds.width, isolatedBounds.y + 150 / 300 * isolatedBounds.height);
  await page.locator(".vle-isolation").waitFor();
  await startBox(10, 120, 270, 180); await endBox(); await waitSelection(["left-a", "left-b"]);
  await page.keyboard.press("Escape"); await page.locator(".vle-isolation").waitFor({ state: "detached" });
  await row("a").getByRole("button", { name: "Lock a", exact: true }).click(); await ready();
  await row("between").getByRole("button", { name: "Hide between", exact: true }).click(); await ready();
  await choose("d"); await startBox(15, 15, 230, 70); await endBox(); await waitSelection(["c", "d"]);
  await undo(); await undo(); assert.equal(await pixels(), original);

  // Force overlapping asynchronous hit tests; these are actual pointer clicks.
  await page.evaluate(() => { window.originalDecode = HTMLImageElement.prototype.decode; HTMLImageElement.prototype.decode = async function() { await new Promise(resolve => setTimeout(resolve, 80)); return window.originalDecode.call(this); }; });
  await choose("between"); await clickAt(40, 40); await page.keyboard.down("Shift"); await clickAt(200, 40); await clickAt(280, 40); await page.keyboard.up("Shift");
  await waitSelection(["a", "c", "d"]);
  await page.keyboard.down("Shift"); await clickAt(380, 280); await page.keyboard.up("Shift");
  await page.waitForTimeout(150); assert.deepEqual(await selected(), ["a", "c", "d"], "modified blank click preserves selection");
  await page.keyboard.down("Shift"); await clickAt(200, 40); await page.keyboard.up("Shift"); await waitSelection(["a", "d"]);
  const canvas = await group(true); assert.deepEqual(canvas.keys, ["a", "d"]); await undo();
  await clickAt(280, 40); await startBox(15, 15, 230, 70); await endBox(); await waitSelection(["a", "between", "c", "d"]);
  await clickAt(40, 40); await choose("c"); await page.waitForTimeout(700); assert.deepEqual(await selected(), ["c"], "late canvas picks cannot replace newer row selection");
  await page.evaluate(() => { HTMLImageElement.prototype.decode = window.originalDecode; });

  if (await button("Collapse all groups").count()) await button("Collapse all groups").click();
  await button("Expand all groups").click();
  await choose("left-a"); await choose("right-a", ["Shift"]); await waitSelection(["left-a", "right-a"]);
  const mixed = await group(true); assert.deepEqual(mixed.keys, ["left-a", "right-a"]);
  assert.equal(await pixels(), original, "cross-folder grouping retains positions");
  await undo();
  await choose("left"); await choose("left-a", ["Meta"]); await choose("c", ["Meta"]);
  const roots = await group(); assert.deepEqual(roots.keys, ["c", "left"]); assert.equal(await pixels(), original); await undo();
  await choose("a"); await choose("d", ["Shift"]); await waitSelection(["a", "between", "c", "d"]);
  const range = await group(); assert.deepEqual(range.keys, ["a", "between", "c", "d"]); await undo();

  await choose("a"); await choose("protected-a", ["Meta"]);
  assert.equal(await button("Group").isDisabled(), true); assert.match(await button("Group").getAttribute("title"), /clipping or appearance/);
  await page.keyboard.press("Meta+g"); assert.match(await page.getByRole("alert").textContent(), /whole folder/);
  await choose("a"); await choose("protected", ["Meta"]); const intact = await group(); assert.deepEqual(intact.keys, ["a", "protected"]); assert.equal(await pixels(), original); await undo();
  await row("a").getByRole("button", { name: "Lock a", exact: true }).click(); await ready();
  await choose("a"); await choose("c", ["Meta"]); assert.equal(await button("Group").isDisabled(), true); assert.match(await button("Group").getAttribute("title"), /Unlock/);
  await undo();

  await button("Box select").click();
  const bounds = await page.locator(".vle-artwork").boundingBox();
  await page.mouse.move(bounds.x + 15 / 400 * bounds.width, bounds.y + 15 / 300 * bounds.height); await page.mouse.down();
  await page.mouse.move(bounds.x + 230 / 400 * bounds.width, bounds.y + 70 / 300 * bounds.height, { steps: 5 }); await page.mouse.up();
  await waitSelection(["a", "between", "c"]); await group();
  await modal.screenshot({ path: path.join(directory, "grouped-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.ok(await page.locator(".vle-group-tools").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await modal.screenshot({ path: path.join(directory, "grouped-mobile.png") });
  const mobileHistory = await ops(), mobileGroup = mobileHistory.at(-1).id;
  await button("Select layer (Shift-drag to add layers; Alt-click inside a group)").click();
  await choose("d"); await waitSelection(["d"]); await startBox(5, 5, 230, 70);
  await modal.screenshot({ path: path.join(directory, "shift-drag-mobile.png") }); await endBox();
  await waitSelection(["d", mobileGroup]);
  assert.deepEqual(await ops(), mobileHistory, "selection stays local on narrow screens");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal.getByRole("button", { name: "Save Version", exact: true }).click(); await modal.waitFor({ state: "detached" });
  assert.equal((await state()).resultItems.length, 2); assert.equal(history.length, 1);
  await button("Save / Reopen").click(); await button("Edit Artwork").click(); await ready(); assert.equal(await pixels(), original);
  await button("Cancel").click(); await modal.waitFor({ state: "detached" });

  await button("Switch project").click(); await page.locator(".vector-generate").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems?.length === 1);
  const many = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${Array.from({ length: 60 }, (_, i) => `<rect id="shape-${i}" x="${i % 10 * 40}" y="${Math.floor(i / 10) * 40}" width="24" height="24" fill="#4789da"/>`).join("")}</svg>`;
  const largeItem = (await state()).resultItems[0]; assets.set(largeItem.svgUrl, Buffer.from(many));
  await button("Edit Artwork").click(); await ready(); await button("Next").click();
  await choose("shape-0"); await choose("shape-2", ["Meta"]);
  const paged = await group(); assert.deepEqual(paged.keys, ["shape-0", "shape-2"]);
  assert.equal(await row(paged.id).isVisible(), true, "a new group on a later page remains visible for rename");
  await button("Cancel").click(); await modal.waitFor({ state: "detached" });
  const calls = JSON.parse(await page.getByLabel("Provider calls").textContent()); assert.equal(calls.generate, 2); assert.equal(calls.naming || 0, 0);
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  console.log(JSON.stringify({ ok: true, directory, paidCalls: 0, checks: ["Shift-drag additive selection", "Shift-drag over selected artwork", "reverse/zoomed marquee", "Escape/blur/pointer cancellation", "isolated group selection", "hidden/locked exclusion", "separated row selection", "quick Shift canvas picks", "queued click then drag", "blank-click preservation", "stale pick cancellation", "cross-folder Shift selection", "ancestor normalization", "sibling Shift range", "protected appearance", "locks", "marquee grouping", "undo/redo", "save/reopen", "desktop/mobile", "paginated grouping/rename"] }, null, 2));
} finally { await browser.close(); await fixture.close(); }
