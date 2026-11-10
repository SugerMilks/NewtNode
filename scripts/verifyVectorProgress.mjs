import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-progress-"));
const svg = await readFile(new URL("../test/fixtures/vector-design.svg", import.meta.url), "utf8");
const fixture = await startVectorQaServer({ svg, png: await sharp(Buffer.from(svg)).png().toBuffer() });
const browser = await chromium.launch({ headless: true, channel: process.env.VECTOR_BROWSER_CHANNEL || "chrome" });
const errors = [], apiCalls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
  const fresh = async () => {
    await page.goto(`${fixture.url}/test/browser/vector.html?newNode=1`);
    const time = new Date("2026-11-10T12:00:00Z");
    await page.clock.install({ time }); await page.clock.pauseAt(time);
    await page.getByLabel("Slow response", { exact: true }).check();
  };
  const model = page.getByLabel("Vector model", { exact: true });
  const monitor = page.locator(".vector-monitor"), progress = page.locator(".vector-generation-progress");
  const run = () => page.locator(".vector-generate").click();
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const busy = async expected => {
    assert.equal(await progress.count(), expected ? 1 : 0);
    assert.equal(await monitor.getAttribute("aria-busy"), String(expected));
  };

  await fresh();
  assert.equal(await model.inputValue(), "OpenAI Image 2.6 Flare");
  await busy(false);
  const before = await monitor.boundingBox();
  await run(); await busy(true);
  const during = await monitor.boundingBox();
  assert.equal(during.width, before.width, "spinner does not resize the preview");
  assert.equal(during.height, before.height, "spinner does not resize the preview");
  const style = await progress.evaluate(el => ({ color: getComputedStyle(el).color, pointer: getComputedStyle(el).pointerEvents, animation: getComputedStyle(el.firstChild).animationName, width: el.clientWidth, height: el.clientHeight }));
  assert.equal(style.color, "rgb(226, 206, 49)"); assert.equal(style.pointer, "none");
  assert.equal(style.animation, "vector-layer-spin"); assert.equal(style.width, style.height);
  await page.clock.runFor(1600); await busy(false);
  assert.equal((await state()).resultItems.length, 1);

  await page.getByLabel("Vector generations", { exact: true }).selectOption("2");
  await run(); await busy(true);
  assert.equal(await progress.getAttribute("aria-label"), "Generating 1 of 2");
  assert.equal(await page.locator(".vector-monitor img").getAttribute("draggable"), "true");
  await page.locator(".vector-variants button").first().click();
  assert.equal(await page.getByLabel("Design brief").isEditable(), true);
  await page.locator(".node-card.vector").screenshot({ path: path.join(directory, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.ok(await progress.evaluate(el => {
    const p = el.getBoundingClientRect(), m = el.parentElement.getBoundingClientRect();
    return p.left >= m.left && p.right <= m.right && p.top >= m.top && p.bottom <= m.bottom;
  }));
  await page.locator(".node-card.vector").screenshot({ path: path.join(directory, "mobile.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await progress.locator("svg").evaluate(el => getComputedStyle(el).animationName), "none");
  await page.clock.runFor(1600); await busy(true);
  assert.equal(await progress.getAttribute("aria-label"), "Generating 2 of 2");
  await page.clock.runFor(1600); await busy(false);
  assert.equal((await state()).resultItems.length, 3);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1300, height: 1100 });

  for (const name of ["Ideogram Vector", "OpenAI Image 2.6 Sunburst"]) {
    await fresh(); await model.selectOption(name);
    await run(); await busy(true); await page.clock.runFor(1600); await busy(false);
    await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
    assert.equal(await model.inputValue(), name, "saved choices survive the new default");
  }
  await fresh();
  await page.getByLabel("Vector task").selectOption("vectorize");
  assert.equal((await state()).vectorModel, "Ideogram Vector");
  await page.getByLabel("Connect source", { exact: true }).check();
  await run(); await busy(true); await page.clock.runFor(1600); await busy(false);

  for (const outcome of ["fail", "stop", "reopen"]) {
    await fresh();
    if (outcome === "fail") await page.getByLabel("Fail request", { exact: true }).check();
    await run(); await busy(true);
    if (outcome === "stop") await page.getByRole("button", { name: "Stop waiting; provider work may still finish and be billed" }).click();
    if (outcome === "reopen") await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
    await page.clock.runFor(1600); await busy(false);
    assert.equal((await state()).vectorJob.status, "uncertain");
  }
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots: directory, checks: ["Flare default and preserved choices", "all models and vectorization", "yellow circular busy overlay", "stable desktop/mobile layout", "non-blocking artwork and controls", "batch progress", "reduced motion", "completion/error/stop/reopen"] }, null, 2));
} finally { await browser.close(); await fixture.close(); }
