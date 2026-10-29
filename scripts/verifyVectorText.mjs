import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { editVectorDocument } from "../server/vector-layers.js";
import { vectorTextDefaults } from "../src/vectorArtwork.js";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-text-qa-"));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect id="paper" width="400" height="300" fill="#fff"/><rect id="art" x="40" y="220" width="100" height="30" fill="#e65b65"/></svg>';
const png = await sharp(Buffer.from(svg)).png().toBuffer(), assets = new Map(), errors = [], forbidden = [];
let inspections = 0;
const service = createVectorLayerService({ readSource: async url => { inspections++; return assets.get(url) || Buffer.from(svg); }, saveAssets: async (body, art) => {
  const base = `/outputs/vector-qa/${body.requestId}`;
  assets.set(`${base}.svg`, Buffer.from(art.svg)); assets.set(`${base}.png`, art.png); assets.set(`${base}-alpha.png`, art.alpha);
  return { url: `${base}.png`, svgUrl: `${base}.svg`, alphaUrl: `${base}-alpha.png` };
}, recordHistory: async () => {}, describeLayers: () => assert.fail("No paid naming") });
const fixture = await startVectorQaServer({ svg, png, assets, service });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { forbidden.push(route.request().url()); return route.abort(); });
  await page.goto(`${fixture.url}/test/browser/vector.html`);
  const button = name => page.getByRole("button", { name, exact: true });
  const modal = page.getByRole("dialog", { name: "Vector Layers editor" });
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const ops = async () => (await state()).vectorLayerDrafts[0]?.operations || [];
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll('.vector-layers-dialog footer button')].find(el => el.textContent === 'Save Version')?.disabled === false);
  const preview = () => page.locator('.vle-artwork img').evaluate(async img => { await img.decode(); return (await fetch(img.src)).text(); });
  const size = page.getByLabel("Text size", { exact: true });
  const ink = () => page.locator('.vle-artwork img').evaluate(async img => {
    await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let pixels = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 64 && data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) pixels++;
    return pixels;
  });
  const waitPreview = async (matches, message) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { const svg = await preview(); if (matches(svg)) return svg; } catch { /* Previous blob can be revoked during a preview swap. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(message);
  };
  const waitSize = value => waitPreview(svg => svg.includes(`font-size="${value}"`), `The artwork never previewed text size ${value}`);
  await page.locator('.vector-generate').click(); await button('Edit Artwork').click(); await ready();
  await button('Add editable text').click(); await page.getByLabel('Editable text', { exact: true }).fill('STUDIO'); await size.fill('20'); await waitSize(20);
  assert.ok(await ink() > 0, 'New text is visible before Apply');
  assert.equal(await modal.getByRole('button', { name: 'Save Version', exact: true }).isDisabled(), true);
  await button('Apply Text').click(); await ready();
  const id = (await ops()).at(-1).id; const small = await ink(); assert.ok(small > 0);
  await button('Edit Text').click(); await size.fill('40'); await button('Apply Text').click(); await ready();
  assert.ok((await ink()) > small * 2, 'Apply Text must change the rendered size');
  await button('Undo layer edit').click(); await ready(); assert.equal(await ink(), small);
  const count = (await ops()).length, requests = inspections;
  await button('Edit Text').click(); await size.fill('50'); await waitSize(50);
  await size.press('ArrowUp'); await waitSize(51); await size.press('ArrowDown'); await waitSize(50);
  assert.ok((await ink()) > small * 3, 'Typing a font size must immediately change the artwork');
  assert.equal((await ops()).length, count, 'Live text edits do not create undo steps');
  assert.equal(inspections, requests, 'Live text edits stay local');
  await modal.screenshot({ path: path.join(directory, 'text-size-desktop.png') });
  await size.fill(''); assert.equal(await size.inputValue(), ''); await waitSize(50);
  await size.fill('1001'); await waitSize(50);
  await size.fill('50'); await waitSize(50);
  await page.locator('.vle-text-editor').getByRole('button', { name: 'Cancel', exact: true }).click(); await waitSize(20);
  assert.equal(await ink(), small); assert.equal((await ops()).length, count);
  await button('Edit Text').click(); await size.fill('35'); await waitSize(35);
  const beforeApply = await ink(); await button('Apply Text').click(); await ready();
  assert.equal(await ink(), beforeApply, 'Apply must match the local preview'); assert.equal((await ops()).length, count + 1);
  await button('Undo layer edit').click(); await ready(); assert.equal(await ink(), small);
  await button('Redo layer edit').click(); await ready(); assert.equal(await ink(), beforeApply);
  await button('Edit Text').click(); await page.setViewportSize({ width: 390, height: 844 }); await size.fill('45'); await waitSize(45);
  assert.ok(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)); await modal.screenshot({ path: path.join(directory, 'text-size-mobile.png') });
  await button('Apply Text').click(); await ready(); await page.setViewportSize({ width: 1440, height: 1000 });
  await modal.getByRole('button', { name: 'Save Version', exact: true }).click(); await modal.waitFor({ state: 'detached' });
  const saved = (await state()).resultItems.at(-1); assert.match(assets.get(saved.svgUrl).toString(), /font-size="45"/);
  await button('Save / Reopen').click(); await button('Edit Artwork').click(); await ready();
  await page.locator(`[data-layer-key="${id}"]`).click(); await page.getByRole('tab', { name: 'Properties', exact: true }).click(); await button('Edit Text').click();
  assert.equal(await size.inputValue(), '45'); await waitSize(45);
  // Leaving the text form discards a preview, never changing another selection.
  const savedOps = await ops(); await size.fill('65'); await waitSize(65);
  await page.getByRole('tab', { name: 'Layers', exact: true }).click(); await waitSize(45); assert.deepEqual(await ops(), savedOps);
  await page.locator('[data-layer-key="art"]').click(); await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  await button('Replace with Text').click(); await page.getByLabel('Editable text', { exact: true }).fill('LABEL'); await size.fill('16'); await waitSize(16);
  assert.match(await preview(), /id="art"[^>]*display="none"/);
  await page.locator('.vle-text-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitPreview(svg => !svg.includes('LABEL'), 'Cancel must remove replacement text'); assert.deepEqual(await ops(), savedOps);
  await button('Add editable text').click(); await page.getByLabel('Editable text', { exact: true }).fill('DISCARD');
  await waitPreview(svg => svg.includes('DISCARD'), 'New text should preview');
  await page.getByRole('tab', { name: 'Layers', exact: true }).click();
  await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  assert.equal(await page.getByRole('form', { name: 'Text properties' }).count(), 0);
  await waitPreview(svg => !svg.includes('DISCARD'), 'Leaving Properties cancels the draft'); assert.deepEqual(await ops(), savedOps);

  // Compare local preview pixels against the real saved SVG operation, including
  // scaled/rotated nested text, multiline spacing, escaping and viewBox mapping.
  const textId = 'newt-text-11111111-1111-4111-8111-111111111111';
  const nested = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="10 5 200 200" transform="translate(4 6)"><g id="group" transform="translate(12 8) rotate(8)"><text id="' + textId + '" x="40" y="60" font-size="12" font-family="sans-serif" font-weight="400" text-anchor="middle" letter-spacing="0" fill="#202020" transform="translate(40 60) scale(1.2)"><tspan x="0" dy="0">Studio</tspan></text></g></svg>';
  for (const operation of [
    { type: 'text', key: textId, text: { ...vectorTextDefaults, content: '<Studio> & Co\nLine two', size: 25, spacing: 1, lineHeight: 1.7 } },
    { type: 'addText', id: 'newt-text-22222222-2222-4222-8222-222222222222', replaceKeys: [textId], x: 200, y: 150, text: { ...vectorTextDefaults, content: 'NEW', size: 32 } }
  ]) {
    const doc = editVectorDocument(nested), expected = editVectorDocument(nested, { operations: [operation] });
    const comparison = await page.evaluate(async ({ doc, operation, expected }) => {
      const { createVectorLayerRenderer } = await import('/src/vectorLayerCanvas.js');
      const renderer = createVectorLayerRenderer(doc), svg = renderer.textSvg(operation);
      async function pixels(svg) {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          const img = new Image(); img.src = url; await img.decode();
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
        } finally { URL.revokeObjectURL(url); }
      }
      const a = await pixels(svg), b = await pixels(expected.svg);
      return { same: a.length === b.length && a.every((byte, i) => byte === b[i]), visible: a.some((byte, i) => i % 4 === 3 && byte > 0), original: renderer.isolatedSvg([doc.layers[0].key]) };
    }, { doc, operation, expected });
    assert.equal(comparison.same, true); assert.equal(comparison.visible, true);
    assert.ok(!comparison.original.includes('Line two'), 'Preview never mutates the source tree');
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  console.log(JSON.stringify({ ok: true, directory, paidCalls: 0, checks: ['size pixels', 'local live preview', 'invalid values', 'cancel', 'single undo step', 'redo', 'save/reopen', 'desktop/mobile', 'replace preview', 'selection scope', 'preview/save pixel parity with nested transforms and viewBox'] }, null, 2));
} catch (error) { console.error({ directory, errors }); throw error; }
finally { await browser.close(); await fixture.close(); }
