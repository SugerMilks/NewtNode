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
  const errors = [], apiCalls = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/characterNonHuman.html`);
  const checkbox = page.getByRole("checkbox", { name: "Non-Human", exact: true });
  const autoWardrobe = page.getByRole("checkbox", { name: "Auto Wardrobe", exact: true });
  const state = () => page.getByLabel("Character QA state").textContent().then(JSON.parse);
  await checkbox.waitFor();
  assert.equal(await page.getByText("Headshots Only", { exact: true }).count(), 0, "uploaded portraits must not have a text overlay");
  assert.equal(await page.getByPlaceholder("Defining features, e.g. overweight beer belly, wooden prosthetic leg", { exact: true }).count(), 1);
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(await autoWardrobe.isChecked(), false);
  await autoWardrobe.check();
  assert.equal((await state()).data.autoWardrobe, true);
  assert.equal((await state()).data.characterWardrobes.length, 0);
  assert.equal(await page.getByRole("button", { name: "Remove Auto Wardrobe", exact: true }).count(), 1);
  await checkbox.check();
  assert.equal((await state()).data.nonHumanCharacter, true);
  assert.equal((await state()).runs, 0);
  await page.getByRole("checkbox", { name: /Cinematic Sheet/ }).check();
  assert.equal(await page.getByText("Cinematic lighting with the original character design", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
  assert.equal(await checkbox.isChecked(), true);
  assert.equal(await autoWardrobe.isChecked(), true);
  await page.getByRole("button", { name: "Copy Node", exact: true }).click();
  assert.equal(await checkbox.isChecked(), true);
  assert.equal(await autoWardrobe.isChecked(), true);

  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-nonhuman-qa-"));
  await checkbox.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, "desktop.png"), fullPage: true });
  const fits = () => checkbox.evaluate(input => {
    const row = input.closest("label"), text = row.querySelector("strong");
    const a = input.getBoundingClientRect(), b = text.getBoundingClientRect(), r = row.getBoundingClientRect();
    return a.right <= b.left && b.right <= r.right + 1 && b.top >= r.top && b.bottom <= r.bottom;
  });
  assert.equal(await fits(), true, "Non-Human label must fit beside its checkbox");
  await page.getByRole("button", { name: "Lock Fixture", exact: true }).click();
  assert.equal(await checkbox.isDisabled(), true);
  assert.equal(await autoWardrobe.isDisabled(), true);
  await page.getByRole("button", { name: "Compile Fixture", exact: true }).click();
  assert.equal(await checkbox.isDisabled(), true);
  assert.equal(await autoWardrobe.isDisabled(), true);
  await page.getByRole("button", { name: "Idle Fixture", exact: true }).click();
  assert.equal(await checkbox.isDisabled(), false);
  await page.getByRole("button", { name: "Load Legacy", exact: true }).click();
  assert.equal(await checkbox.isChecked(), false);
  assert.equal((await state()).data.nonHumanCharacter, false);
  assert.equal(await autoWardrobe.isChecked(), false);
  assert.equal((await state()).data.autoWardrobe, false);

  await page.getByRole("button", { name: "Clear Portrait", exact: true }).click();
  const headshotHint = page.getByText("Headshots Only", { exact: true });
  await headshotHint.waitFor();
  const hintFits = () => headshotHint.evaluate(hint => {
    const label = hint.closest(".character-main-preview").getBoundingClientRect();
    const icon = hint.previousElementSibling.getBoundingClientRect();
    const text = hint.getBoundingClientRect();
    return icon.bottom <= text.top && text.left >= label.left && text.right <= label.right && text.bottom <= label.bottom;
  });
  assert.equal(await hintFits(), true, "Headshots Only must fit below the portrait icon");
  await page.screenshot({ path: path.join(screenshots, "empty-portrait-desktop.png"), fullPage: true });

  // The production canvas zooms fixed-size nodes on smaller viewports.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".character-qa-stage").evaluate(element => Object.assign(element.style, {
    width: "820px", maxWidth: "none", transform: "scale(0.44)", transformOrigin: "top left"
  }));
  await checkbox.check();
  assert.equal(await fits(), true);
  await autoWardrobe.check();
  assert.equal(await hintFits(), true);
  await page.screenshot({ path: path.join(screenshots, "scaled-canvas.png"), fullPage: true });
  assert.equal((await state()).runs, 0, "options and persistence must not generate");
  assert.deepEqual(apiCalls, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots,
    checks: ["Non-Human and Auto Wardrobe off default", "cinematic compatibility", "portrait-backed wardrobe", "save/reopen", "copy", "legacy normalization", "locked and compiling guards", "desktop/scaled-canvas label layout", "Headshots Only empty state", "Physical Details placeholder"] }, null, 2));
} finally { await browser?.close(); await server.close(); }
