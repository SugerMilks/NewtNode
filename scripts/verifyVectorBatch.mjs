import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { startVectorQaServer } from "./vectorQaServer.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-vector-batch-"));
const svg = await readFile(new URL("../test/fixtures/vector-design.svg", import.meta.url), "utf8");
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const fixture = await startVectorQaServer({ svg, png });
const browser = await chromium.launch({ headless: true, channel: process.env.VECTOR_BROWSER_CHANNEL || "chrome" });
const errors = [], apiCalls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
  const fresh = () => page.goto(`${fixture.url}/test/browser/vector.html`);
  const state = () => page.getByLabel("Vector state").textContent().then(JSON.parse);
  const calls = () => page.getByLabel("Provider calls").textContent().then(JSON.parse);
  const run = () => page.locator(".vector-generate").click();
  const count = page.getByLabel("Vector generations", { exact: true });
  const waitResults = total => page.waitForFunction(n => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).resultItems.length >= n, total);
  const waitIdle = () => page.waitForFunction(() => !document.querySelector(".vector-generate").disabled);
  const check = () => page.getByRole("button", { name: "Check existing request; does not generate again" }).click();

  await fresh();
  assert.equal(await count.inputValue(), "1");
  assert.deepEqual(await count.locator("option").allTextContents(), ["1", "2", "3", "4", "5", "6"]);
  await count.selectOption("6");
  await page.getByLabel("Vector quality").selectOption("high");
  await page.getByLabel("Vector seed").fill("2147483646");
  await page.getByLabel("Connect source", { exact: true }).check();
  await page.getByLabel("Connect Mood Board", { exact: true }).check();
  await page.getByLabel("Slow response", { exact: true }).check();
  await page.waitForFunction(() => document.querySelector(".vector-generate").textContent.includes("$1.92"));
  assert.equal((await calls()).generate, 0, "settings alone never generate");
  await page.locator(".vector-generate").evaluate(button => { button.click(); button.click(); });
  await waitResults(1);
  const first = (await state()).resultItems[0];
  await page.getByLabel("Design brief").fill("A different brief for the next batch");
  await page.getByLabel("Vector quality").selectOption("low");
  await count.selectOption("2");
  await page.getByLabel("Connect source", { exact: true }).uncheck();
  await waitResults(2);
  await page.locator(".vector-variants button").first().click();
  assert.match(await page.locator(".vector-job").textContent(), /Generating 3 of 6/);
  await waitResults(6); await waitIdle();
  const batch = (await calls()).items;
  assert.equal(batch.length, 6, "double click starts only the requested batch");
  assert.equal(new Set(batch.map(request => request.requestId)).size, 6);
  assert.deepEqual(batch.map(request => request.seed), [2147483646, 2147483647, 0, 1, 2, 3]);
  for (const request of batch) {
    assert.equal(request.quality, "high"); assert.equal(request.images.length, 2);
    assert.doesNotMatch(request.prompt, /different brief/);
    assert.equal(request.batchCount, undefined, "each provider request remains single-output");
  }
  assert.equal((await state()).resultUrl, first.url, "later completions never steal manual selection");
  assert.equal((await state()).batchCount, "2", "mid-batch setting edits survive completion");
  assert.equal((await state()).resultItems.every(item => item.svgUrl && item.cost.amountUsd === .16), true);
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
  assert.equal(await count.inputValue(), "2"); assert.equal((await state()).resultItems.length, 6);
  await count.selectOption("6");
  await page.locator(".node-card.vector").screenshot({ path: path.join(directory, "desktop.png") });
  await page.getByLabel("Show costs", { exact: true }).uncheck();
  assert.doesNotMatch(await page.locator(".vector-generate").textContent(), /\$|Est\./);
  await page.setViewportSize({ width: 420, height: 1000 });
  assert.ok(await page.locator(".vector-run-controls").evaluate(el => {
    const select = el.querySelector("label").getBoundingClientRect(), button = el.querySelector("button").getBoundingClientRect();
    return select.right < button.left && el.scrollWidth <= el.clientWidth + 1 && button.right <= el.getBoundingClientRect().right + 1;
  }), "count and run button fit without overlap on narrow nodes");
  await page.locator(".node-card.vector").screenshot({ path: path.join(directory, "narrow.png") });
  await page.setViewportSize({ width: 1300, height: 1100 });

  await fresh();
  await count.selectOption("6"); await page.getByLabel("Fail on call", { exact: true }).fill("3");
  await run();
  await page.waitForFunction(() => JSON.parse(document.querySelector('[aria-label="Vector state"]').textContent).vectorJob?.status === "uncertain");
  assert.equal((await state()).resultItems.length, 2); assert.equal((await calls()).generate, 3);
  assert.match((await state()).vectorJob.error, /3 remaining generations were not started/);
  await check();
  assert.equal((await state()).vectorJob.status, "failed"); assert.equal((await calls()).generate, 3);

  for (const action of ["stop", "reopen", "unmount", "project"]) {
    await fresh();
    await count.selectOption("6"); await page.getByLabel("Slow response", { exact: true }).check();
    await run();
    if (action === "stop") await page.getByRole("button", { name: "Stop waiting; provider work may still finish and be billed" }).click();
    if (action === "reopen") await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
    if (action === "unmount") await page.getByRole("button", { name: "Unmount node", exact: true }).click();
    if (action === "project") await page.getByRole("button", { name: "Switch project", exact: true }).click();
    await page.waitForTimeout(1700);
    assert.equal((await calls()).generate, 1, `${action} stops unstarted calls`);
    assert.equal((await state()).resultItems.length, 0, `${action} ignores late response`);
    if (action === "project") { assert.equal((await state()).vectorJob, null); continue; }
    if (action === "unmount") await page.getByRole("button", { name: "Mount node", exact: true }).click();
    await check(); await waitResults(1); await waitIdle();
    assert.equal((await calls()).generate, 1, "check is read-only, never resumes the paid queue");
    assert.equal((await calls()).check, 1);
    assert.match((await state()).vectorWarning, /5 remaining generations were not started/);
    assert.equal(await count.inputValue(), "6");
  }

  await fresh();
  await page.getByLabel("Vector task").selectOption("vectorize");
  await page.getByLabel("Connect source", { exact: true }).check(); await count.selectOption("2");
  await page.waitForFunction(() => document.querySelector(".vector-generate").textContent.includes("$0.20"));
  await run(); await waitResults(2); await waitIdle();
  for (const request of (await calls()).items) {
    assert.equal(request.mode, "vectorize"); assert.equal(request.images.length, 1);
    assert.equal(request.seed, undefined); assert.equal(request.prompt, undefined);
  }
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots: directory, checks: ["1-6 selector/default/persistence", "six independent snapshotted requests", "seed sequence", "batch estimates/visibility", "selection while generating", "partial failure", "stop/reopen/unmount/project safety", "read-only recovery", "image conversion", "desktop/narrow layout"] }, null, 2));
} finally { await browser.close(); await fixture.close(); }
