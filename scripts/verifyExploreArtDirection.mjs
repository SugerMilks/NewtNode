import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "newtnode-explore-art-direction-"));
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [], apiCalls = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { apiCalls.push(route.request().url()); return route.abort(); });
  await page.route("**/outputs/**", route => route.abort());
  await page.goto(`${process.env.EXPLORE_QA_URL || "http://127.0.0.1:5185"}/test/browser/explore.html`);
  const state = () => page.getByLabel("Explore state", { exact: true }).textContent().then(JSON.parse);
  const plans = () => page.getByLabel("Planning requests", { exact: true }).textContent().then(JSON.parse);
  const waitResults = count => page.waitForFunction(n => {
    const state = JSON.parse(document.querySelector('[aria-label="Explore state"]').textContent);
    return state.resultItems.length === n && state.status !== "running";
  }, count);
  const references = page.getByRole("button", { name: "References", exact: true });
  const assertCollapsedReferences = async () => {
    assert.equal(await references.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".explore-inputs").count(), 0);
    assert.equal(await page.locator('[data-port-key="qa-explore:styleIn"]').count(), 0);
    for (const port of ["imageIn", "characterIn", "transferIn", "cameraIn"]) {
      const anchor = await page.locator(`[data-port-key="qa-explore:${port}"]`).boundingBox();
      assert.ok(anchor && anchor.width > 0 && anchor.height > 0, `${port} retains a measurable anchor`);
    }
  };
  await assertCollapsedReferences();
  await page.getByRole("button", { name: "Expand references", exact: true }).click();
  assert.equal(await references.getAttribute("aria-expanded"), "true");
  assert.equal(await page.getByLabel("Style reference", { exact: true }).count(), 0);
  for (const name of ["Image / Product", "Character", "Mood Board", "Camera"]) {
    assert.equal(await page.getByLabel(`${name} reference`, { exact: true }).isVisible(), true);
  }
  await references.click();
  await assertCollapsedReferences();
  assert.equal(await page.getByLabel("Explore Mode", { exact: true }).isChecked(), true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Style family", { exact: true }).selectOption("Claymation");
  await page.getByLabel("Creative brief", { exact: true }).fill("A tree");
  await page.getByRole("button", { name: "Explore 9 images", exact: true }).click();
  await waitResults(9);
  const batch = await state(), plan = (await plans())[0];
  assert.equal(plan.directionBriefs.length, 9);
  assert.equal(new Set(plan.directionBriefs.map(brief => brief.camera)).size, 9);
  assert.equal(new Set(batch.resultItems.map(item => item.prompt)).size, 9);
  batch.resultItems.forEach((item, index) => {
    assert.equal(item.exploreSettings.styleFamily, "Claymation");
    assert.deepEqual(item.exploreSettings.contrastBrief, plan.directionBriefs[index]);
    assert.match(item.prompt, /Composition \/ camera: Asymmetric framing/);
    assert.match(item.prompt, /Exploration strategy/);
    assert.doesNotMatch(item.prompt, /miniature set design, soft lighting, charming handcrafted aesthetic/);
  });
  assert.equal(await page.getByLabel("Provider calls", { exact: true }).textContent(), "1 plans; 9 images");
  await references.click();
  await page.getByRole("button", { name: "Save / Reopen", exact: true }).click();
  await assertCollapsedReferences();
  assert.deepEqual((await state()).resultItems, batch.resultItems);
  await page.locator(".node-card.explore").screenshot({ path: path.join(directory, "desktop.png") });
  await page.getByLabel("Explore Mode", { exact: true }).uncheck();
  await page.getByLabel("Directions", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Explore 2 images", exact: true }).click();
  await waitResults(11);
  assert.deepEqual((await plans())[1].directionBriefs, []);
  assert.match((await state()).resultItems.at(-1).prompt, /restrained, faithful/);
  await page.getByLabel("Explore Mode", { exact: true }).check();
  await page.getByLabel("Connect sample references", { exact: true }).check();
  await assertCollapsedReferences();
  assert.equal(await page.getByRole("button", { name: "Expand references", exact: true }).evaluate(button => button.classList.contains("connected")), true);
  await page.getByRole("button", { name: "Explore 2 images", exact: true }).click();
  await waitResults(13);
  assert.deepEqual(Object.keys((await plans())[2].directionBriefs[0]), ["lighting", "palette", "texture", "tonalDesign"]);
  assert.match((await state()).resultItems.at(-1).prompt, /CONTENT LOCK/);
  assert.equal(await page.getByLabel("Provider calls", { exact: true }).textContent(), "3 plans; 13 images");
  await page.setViewportSize({ width: 420, height: 1000 });
  await page.locator(".node-card.explore").screenshot({ path: path.join(directory, "narrow.png") });
  assert.deepEqual(errors, []); assert.deepEqual(apiCalls, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots: directory, checks: ["no Style input", "References defaults closed including reopened nodes", "collapsed connection anchors", "nine fixed-medium contrast assignments", "full direction reaches image prompts", "one planning call", "save/reopen", "restrained mode", "reference content lock", "desktop/narrow rendering"] }, null, 2));
} finally { await browser.close(); }
