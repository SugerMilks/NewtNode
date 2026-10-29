import assert from "node:assert/strict";
import path from "node:path";

export async function verifyCameraCoverageConcurrency(page, screenshots) {
  await page.reload();
  const state = () => page.locator('output[aria-label="State"]').textContent().then(JSON.parse);
  const calls = () => page.locator('output[aria-label="Calls"]').textContent().then(JSON.parse);
  const button = name => page.getByRole("button", { name, exact: true });
  const generate = button("Generate Camera Pass"), refine = button("Refine"), upscale = button("Upscale");
  const assertSpinners = async count => {
    assert.equal(await page.locator(".coverage-shot-progress").count(), count);
    assert.equal(await page.locator('.coverage-gallery button[aria-busy="true"]').count(), count);
  };
  const check = async id => {
    // Polling may finish the same mock while Playwright scrolls to its check button.
    await page.locator(`[data-job-id="${id}"]`).getByRole("button", { name: "Check existing request; never submits again" }).evaluateAll(buttons => buttons[0]?.click());
    await page.waitForFunction(id => {
      const data = JSON.parse(document.querySelector('output[aria-label="State"]').textContent);
      return ![data.coverageJob, ...data.coverageShotJobs].some(job => job?.id === id);
    }, id);
  };
  const capture = async () => {
    await page.getByRole("tab", { name: "Pass", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await button("Capture full-resolution PNG at playhead").click();
  };
  await generate.click(); await check((await state()).coverageJob.id);
  await button("View newly completed camera pass").click();
  const firstPass = (await state()).coveragePassId;
  await button("Load shots").click();
  const idleThumbnail = await button("Select Shot 1").boundingBox();
  await page.getByRole("checkbox", { name: "Hold jobs", exact: true }).check();
  await page.getByRole("checkbox", { name: "Hold refinements" }).check();
  await generate.dblclick();
  const passJob = (await state()).coverageJob.id;
  const passRequest = (await calls()).lastStart;
  assert.equal((await calls()).start, 2, "double click submits one camera pass");
  await assertSpinners(0);
  await page.getByRole("combobox", { name: "Camera pass preset" }).selectOption("Height Study");
  await refine.dblclick();
  assert.equal((await calls()).refine, 1, "same-shot duplicate refinement is blocked");
  await assertSpinners(1);
  const busyThumbnail = button("Select Shot 1"), badge = busyThumbnail.locator(".coverage-shot-progress"), spinner = badge.locator("svg");
  assert.equal(await badge.getAttribute("aria-label"), "Refining Shot 1");
  assert.equal(await busyThumbnail.getAttribute("title"), "Refining Shot 1");
  const busyBounds = await busyThumbnail.boundingBox();
  assert.equal(busyBounds.width, idleThumbnail.width); assert.equal(busyBounds.height, idleThumbnail.height);
  assert.equal(await badge.evaluate(el => getComputedStyle(el).pointerEvents), "none");
  assert.equal(await spinner.evaluate(el => getComputedStyle(el).animationName), "coverage-shot-spin");
  const rotation = await spinner.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(150);
  assert.notEqual(await spinner.evaluate(el => getComputedStyle(el).transform), rotation, "progress icon rotates");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await spinner.evaluate(el => getComputedStyle(el).animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await busyThumbnail.click();
  await busyThumbnail.dragTo(page.getByLabel("Canvas drop target"));
  assert.equal(JSON.parse(await page.locator('output[aria-label="Dropped"]').textContent()).url, (await state()).resultUrl, "busy thumbnails still drag the saved image");
  assert.equal(await upscale.isDisabled(), true);
  assert.equal(await button("Remove shot from node only; saved files are kept").isDisabled(), true);
  await button("Select Shot 2").click();
  assert.equal(await refine.isEnabled(), true);
  await upscale.dblclick();
  assert.equal((await calls()).start, 3, "one upscale can run alongside the pass and another shot's refinement");
  await assertSpinners(2);
  assert.equal(await button("Select Shot 2").locator(".coverage-shot-progress").getAttribute("aria-label"), "Upscaling Shot 2");
  await page.locator(".coverage-gallery").screenshot({ path: path.join(screenshots, "thumbnail-progress.png") });
  const upscaleJob = (await state()).coverageShotJobs.find(j => j.kind === "upscale").id;
  await page.getByRole("textbox", { name: "Shot name" }).fill("Named while upscaling");
  await capture();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="Calls"]').textContent).refine === 2);
  assert.equal((await state()).coverageShots.length, 13);
  await page.getByRole("combobox", { name: "Refinement model" }).selectOption("Nano Banana Pro");
  await capture();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="Calls"]').textContent).refine === 3);
  assert.equal((await state()).coverageShots.length, 14, "capture remains available during earlier auto refinement");
  assert.equal((await calls()).lastRefine.model, "Nano Banana Pro");
  assert.equal((await state()).coverageShotJobs.length, 4);
  await assertSpinners(4);
  await button("Select Shot 1").click();
  const beforeFinish = (await state()).resultUrl;
  await button("Finish latest refinement").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === 3);
  await assertSpinners(3);
  assert.equal((await state()).coverageShotId, "shot-0"); assert.equal((await state()).resultUrl, beforeFinish);
  assert.equal((await state()).coverageShots.at(-1).versions.at(-1).model, "Nano Banana Pro");
  await button("Finish latest refinement").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === 2);
  await assertSpinners(2);
  assert.equal((await state()).coverageShots.at(-2).versions.at(-1).model, "Nano Banana 2.1", "capture keeps its snapshotted refinement model");
  await page.getByRole("checkbox", { name: "Hold jobs", exact: true }).uncheck();
  await check(upscaleJob);
  await assertSpinners(1);
  assert.equal((await state()).coverageShots[1].label, "Named while upscaling");
  assert.equal((await state()).coverageShots[1].versions.length, 2);
  await check(passJob);
  assert.equal((await state()).coveragePassId, firstPass); assert.equal((await state()).coverageView, "shot");
  assert.equal((await state()).coveragePreset, "Height Study", "next-pass settings are not replaced on completion");
  assert.equal((await state()).coveragePasses.at(-1).label, passRequest.label);
  assert.deepEqual((await state()).coveragePasses.at(-1).trajectory[2].azimuth, passRequest.poses[1].azimuth);
  await button("Finish latest refinement").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === 0);
  assert.equal((await state()).resultItems.length, 18, "all parallel results survive and publish to Preview");
  await assertSpinners(0);

  // Changing the displayed version while refining must not be undone by completion.
  await refine.click();
  await page.getByRole("combobox", { name: "Shot version" }).selectOption({ label: "Original" });
  await page.getByRole("textbox", { name: "Shot name" }).fill("Version choice preserved");
  await button("Finish latest refinement").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === 0);
  assert.equal((await state()).coverageShots[0].versionId, "original");
  assert.equal((await state()).coverageShots[0].label, "Version choice preserved");
  assert.equal((await state()).coverageShots[0].versions.length, 3);

  // One failed shot is isolated; another successful result must not hide its error.
  await page.getByRole("checkbox", { name: "Fail refinement" }).check();
  await refine.click(); await page.getByRole("checkbox", { name: "Fail refinement" }).uncheck();
  await button("Finish latest refinement").click();
  await page.getByRole("alert").filter({ hasText: "Simulated provider failure" }).waitFor();
  await assertSpinners(0);
  await button("Select Named while upscaling").click(); await refine.click();
  await button("Finish latest refinement").click();
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === 1);
  assert.equal(await page.getByRole("alert").filter({ hasText: "Simulated provider failure" }).isVisible(), true);
  page.on("dialog", dialog => dialog.accept());
  await button("Release this job from the node. Does not cancel the provider request.").click();

  // Reopen with three simultaneous operations: receipts resume by GET, refinement never replays.
  await page.getByRole("checkbox", { name: "Hold jobs", exact: true }).check();
  await generate.click();
  await button("Select Version choice preserved").click(); await refine.click();
  await button("Select Named while upscaling").click(); await upscale.click();
  const pending = await state(), counts = await calls();
  await button("Save / Reopen").click();
  assert.equal((await state()).coverageShotJobs.find(j => j.kind === "refine").status, "interrupted");
  await assertSpinners(1);
  assert.equal(await button("Select Version choice preserved").getAttribute("aria-busy"), "false");
  assert.equal((await calls()).refine, counts.refine); assert.equal((await calls()).start, counts.start);
  await button("Finish latest refinement").click();
  await page.waitForTimeout(100);
  assert.equal((await state()).coverageShots[0].versions.length, pending.coverageShots[0].versions.length, "late unmounted reply is ignored");
  await page.getByRole("checkbox", { name: "Hold jobs", exact: true }).uncheck();
  await check(pending.coverageJob.id);
  await check(pending.coverageShotJobs.find(j => j.kind === "upscale").id);
  assert.equal((await calls()).start, counts.start, "recovering receipts never resubmits");
  await button("Select Version choice preserved").click(); assert.equal(await refine.isDisabled(), true);
  await button("Release this job from the node. Does not cancel the provider request.").click();
  assert.equal(await refine.isEnabled(), true);

  // A delayed capture preserves navigation and the Auto Refine preference at click time.
  await page.getByRole("checkbox", { name: "Slow capture" }).check();
  await page.getByRole("checkbox", { name: "Hold refinements" }).uncheck();
  await capture();
  await page.getByRole("switch", { name: "Auto Refine" }).click();
  await page.getByRole("tab", { name: "Master", exact: true }).click();
  const expected = counts.refine + 1;
  await page.waitForFunction(n => JSON.parse(document.querySelector('output[aria-label="Calls"]').textContent).refine === n, expected);
  await page.waitForFunction(() => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === 0);
  assert.equal((await state()).coverageView, "master");
  assert.equal((await state()).coverageShotId, "shot-0");
  assert.equal((await state()).coverageAutoRefine, false);

  // A copy must not inherit any background operations or trigger new paid work.
  await page.getByRole("checkbox", { name: "Hold jobs", exact: true }).check();
  await page.getByRole("checkbox", { name: "Hold refinements" }).check();
  await generate.click(); await refine.click();
  await button("Select Named while upscaling").click(); await upscale.click();
  await page.screenshot({ path: path.join(screenshots, "concurrent-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 1100 });
  await page.screenshot({ path: path.join(screenshots, "concurrent-mobile.png"), fullPage: true });
  await page.locator(".coverage-gallery").screenshot({ path: path.join(screenshots, "thumbnail-progress-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const copyCalls = await calls();
  await button("Copy node").click();
  assert.equal((await state()).coverageJob, null); assert.deepEqual((await state()).coverageShotJobs, []);
  await assertSpinners(0);
  await button("Finish latest refinement").click();
  assert.equal((await calls()).start, copyCalls.start); assert.equal((await calls()).refine, copyCalls.refine);
}
