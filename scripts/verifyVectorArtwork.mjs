import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-artwork-qa-"));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect id="paper" width="400" height="300" fill="#fff"/><g id="mark"><title>Mark</title><rect id="red" x="50" y="50" width="100" height="100" fill="#d73535"/><circle id="dot" cx="100" cy="100" r="25" fill="#ffcc44"/></g><rect id="blue" x="220" y="80" width="80" height="120" fill="#277fbc"/></svg>';
const png = await sharp(Buffer.from(svg)).png().toBuffer(), assets = new Map(), errors = [], forbidden = [], history = [];
const service = createVectorLayerService({ readSource: async url => assets.get(url) || Buffer.from(svg), saveAssets: async (body, art) => {
  const base = `/outputs/vector-qa/${body.requestId}`;
  assets.set(`${base}.svg`, Buffer.from(art.svg)); assets.set(`${base}.png`, art.png); assets.set(`${base}-alpha.png`, art.alpha);
  return { url: `${base}.png`, svgUrl: `${base}.svg`, alphaUrl: `${base}-alpha.png` };
}, recordHistory: async item => history.push(item), describeLayers: () => assert.fail("No paid naming") });
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
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const ops = async () => (await state()).vectorLayerDrafts[0]?.operations || [];
  const ready = async () => { await modal.getByRole("button", { name: "Save Version", exact: true }).waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('.vector-layers-dialog footer button')].find(el => el.textContent === 'Save Version')?.disabled === false); };
  const pixel = (x, y) => page.locator(".vle-artwork img").evaluate(async (img, [x, y]) => { await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0); return [...ctx.getImageData(x, y, 1, 1).data]; }, [x, y]);
  const transparent = async (x, y) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await pixel(x, y))[3] === 0) return; } catch { /* Preview is changing. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Expected transparent artwork at ${x},${y}`);
  };
  const props = () => page.getByRole("tab", { name: "Properties", exact: true }).click();
  const layers = () => page.getByRole("tab", { name: "Layers", exact: true }).click();
  const stage = page.locator(".vle-artwork");
  await page.locator(".vector-generate").click(); await button("Edit Artwork").click(); await ready();
  await row("mark").click(); await props();
  await button("Replace color #d73535ff").click(); await page.getByLabel("Replacement hex color").fill("#22aa77"); await button("Apply color").click(); await ready();
  assert.deepEqual(await pixel(55, 55), [34, 170, 119, 255]);
  await button("Rotate clockwise").click(); await ready(); assert.equal((await ops()).at(-1).type, "affine");
  await button("Undo layer edit").click(); await ready();
  await button("Flip horizontally").click(); await ready(); assert.equal((await ops()).at(-1).type, "affine");
  await button("Undo layer edit").click(); await ready();
  await button("Align centers horizontally").click(); await ready(); assert.equal((await ops()).at(-1).type, "batch");
  await button("Undo layer edit").click(); await ready();

  // Isolate a group with a double-click, retaining only its children during drag previews.
  const bounds = await stage.boundingBox();
  await stage.dblclick({ position: { x: bounds.width * .25, y: bounds.height / 3 } });
  await page.locator(".vle-isolation").waitFor();
  await transparent(250, 100);
  const isolatedPixel = await pixel(250, 100);
  if (isolatedPixel[3] !== 0) console.error({ isolatedPixel, isolation: await page.locator('.vle-artwork img').evaluate(async img => ({ width: img.naturalWidth, height: img.naturalHeight, svg: await (await fetch(img.src)).text(), solo: document.querySelector('.vle-isolation')?.textContent })) });
  assert.equal(isolatedPixel[3], 0);
  await stage.click({ position: { x: bounds.width * .25, y: bounds.height / 3 } });
  await page.locator(".vle-selection").waitFor();
  const selection = await page.locator(".vle-selection").boundingBox();
  await page.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2); await page.mouse.down(); await page.mouse.move(selection.x + selection.width / 2 + 20, selection.y + selection.height / 2 + 10, { steps: 6 });
  await page.waitForFunction(() => document.querySelector('.vle-artwork')?.classList.contains('transforming'));
  await transparent(250, 100);
  assert.equal((await pixel(250, 100))[3], 0); await page.mouse.up(); await ready();
  await button("Undo layer edit").click(); await ready(); await stage.focus(); await page.keyboard.press("Escape");
  await page.locator(".vle-isolation").waitFor({ state: "detached" });

  await button("Box select").click();
  const b = await stage.boundingBox();
  await page.mouse.move(b.x + b.width * .05, b.y + b.height * .05); await page.mouse.down(); await page.mouse.move(b.x + b.width * .8, b.y + b.height * .8, { steps: 8 }); await page.mouse.up();
  await layers(); await page.waitForFunction(() => document.querySelector('.vle-selection-count')?.textContent === '2 selected');
  await button("Box select").click();
  await button("Snap to artwork and canvas guides (Alt bypasses)").click();
  await row("blue").click(); await page.locator('.vle-selection').waitFor();
  const blueBox = await page.locator('.vle-selection').boundingBox(), artBox = await stage.boundingBox();
  await page.mouse.move(blueBox.x + blueBox.width / 2, blueBox.y + blueBox.height / 2); await page.mouse.down();
  await page.mouse.move(blueBox.x + blueBox.width / 2 - 18 * artBox.width / 400, blueBox.y + blueBox.height / 2, { steps: 6 });
  await page.locator('.vle-snap-guide.vertical').waitFor(); await page.mouse.up(); await ready();
  assert.ok(Math.abs((await ops()).at(-1).matrix.e + 20) < .01); await button('Undo layer edit').click(); await ready(); await props();
  await button("Replace with Text").click(); await page.getByLabel("Editable text", { exact: true }).fill("NEW STUDIO"); await page.getByLabel("Text size", { exact: true }).fill("20"); await button("Apply Text").click(); await ready();
  const textId = (await ops()).at(-1).id;
  assert.equal((await ops()).at(-1).type, "addText"); assert.deepEqual((await ops()).at(-1).replaceKeys, ["blue"]);
  await layers(); await row(textId).click(); await props(); await button("Edit Text").click(); await page.getByLabel("Editable text", { exact: true }).fill("NEW\nSTUDIO"); await button("Apply Text").click(); await ready();
  assert.equal((await ops()).at(-1).type, "text");
  await modal.screenshot({ path: path.join(directory, "properties-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await button("Edit Text").click();
  await modal.screenshot({ path: path.join(directory, "text-mobile.png") });
  assert.ok(await page.locator(".vle-properties").evaluate(el => el.scrollHeight >= el.clientHeight));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator(".vle-text-editor").getByRole("button", { name: "Cancel", exact: true }).click();
  await stage.click({ position: { x: 3, y: 3 } }); await props(); await button("Fit Canvas").click(); await ready();
  assert.equal((await ops()).at(-1).operations[0].type, "canvas");
  await modal.getByRole("button", { name: "Save Version", exact: true }).click(); await modal.waitFor({ state: "detached" });
  const edited = (await state()).resultItems[1]; assert.ok(assets.get(edited.svgUrl).toString().includes(textId));
  assert.ok(edited.width < 400); assert.equal((await sharp(assets.get(edited.url)).ensureAlpha().raw().toBuffer())[3], 0);

  await button("Compare saved versions").click(); const compare = page.getByRole("dialog", { name: "Compare vector versions" });
  await compare.waitFor(); assert.equal(await compare.locator(".vector-compare-image").count(), 2);
  await page.getByLabel("Version 1 name").fill("Approved artwork"); await page.getByLabel("Version 1 name").press("Enter");
  await compare.getByRole("button", { name: "Approve", exact: true }).first().click();
  assert.ok((await state()).resultItems.some(item => item.label === "Approved artwork" && item.vectorApproved));
  await compare.screenshot({ path: path.join(directory, "compare-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await compare.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await compare.screenshot({ path: path.join(directory, "compare-mobile.png") });
  await compare.getByRole("button", { name: "Use Version", exact: true }).last().click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let i = 0; i < 2; i++) { await page.locator('.vector-generate').click(); await page.waitForFunction(expected => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems.length === expected, 3 + i); }
  await button("Compare saved versions").click(); await compare.getByRole('button', { name: '4', exact: true }).click(); assert.equal(await compare.locator('.vector-compare-image').count(), 4);
  await compare.screenshot({ path: path.join(directory, 'compare-four.png') }); await button('Close comparison').click();
  await page.getByLabel("Palette", { exact: true }).fill("teal, coral"); await button("Save design look").click(); await page.getByLabel("Design look name").fill("Studio palette"); await button("Confirm save look").click();
  await page.getByLabel("Palette", { exact: true }).fill("black"); await page.getByLabel("Saved design look").selectOption(""); await page.getByLabel("Saved design look").selectOption({ label: "Studio palette" });
  assert.equal((await state()).palette, "teal, coral");
  await page.locator('.node-card.vector').screenshot({ path: path.join(directory, "node-desktop.png") });
  await button("Save / Reopen").click(); assert.equal((await state()).resultItems.length, 4);
  await button("Edit Artwork").click(); await ready(); await button("Add editable text").click();
  await page.getByLabel("Editable text", { exact: true }).fill("Extra"); await button("Apply Text").click(); await ready(); assert.equal((await ops()).at(-1).type, "addText");
  const calls = JSON.parse(await page.getByLabel("Provider calls").textContent());
  assert.equal(calls.generate, 3); assert.equal(calls.naming || 0, 0); assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  console.log(JSON.stringify({ ok: true, directory, localSaves: history.length, paidCalls: 0, checks: ["solid color pixels", "rotation/flip/align undo", "isolated group and drag preview", "marquee selection", "snap toggle", "replace and edit text", "fit canvas alpha", "saved version", "compare/approve/choose", "saved looks", "desktop/mobile", "project reopen"] }, null, 2));
} catch (error) { console.error({ directory, errors }); throw error; }
finally { await browser.close(); await fixture.close(); }
