import assert from "node:assert/strict";
import path from "node:path";
import { cameraCoverageRefinePrompt, coverageLensPrompt } from "../src/cameraCoverage.js";

export async function verifyCameraCoverageLens(page, screenshots) {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.reload();
  const state = () => page.locator('output[aria-label="State"]').textContent().then(JSON.parse);
  const calls = () => page.locator('output[aria-label="Calls"]').textContent().then(JSON.parse);
  const requests = () => page.locator('output[aria-label="Image requests"]').textContent().then(JSON.parse);
  const button = name => page.getByRole("button", { name, exact: true });
  const target = page.getByRole("combobox", { name: "Shot lens" }), framing = page.getByRole("combobox", { name: "Lens framing" });
  const change = page.locator(".coverage-lens-controls button"), refine = button("Refine"), upscale = button("Upscale");
  const waitJobs = count => page.waitForFunction(n => JSON.parse(document.querySelector('output[aria-label="State"]').textContent).coverageShotJobs.length === n, count);
  const finish = async count => { await button("Finish latest refinement").click(); await waitJobs(count); };
  await button("Load shots").click();
  assert.equal(await target.inputValue(), "original"); assert.equal(await framing.inputValue(), "camera");
  assert.equal(await framing.isDisabled(), true); assert.equal(await change.isDisabled(), true);
  await target.selectOption("18");
  assert.equal(await change.isEnabled(), true); assert.equal((await calls()).refine, 0, "changing controls alone never generates");
  await page.getByRole("checkbox", { name: "Disable models" }).check(); assert.equal(await change.isDisabled(), true);
  await page.getByRole("checkbox", { name: "Disable models" }).uncheck();
  assert.equal(await change.textContent(), "Change Lens");
  await page.getByRole("checkbox", { name: "Show costs" }).check();
  assert.match(await change.textContent(), /Change Lens.*(?:\$|Variable cost)/);
  await page.getByRole("checkbox", { name: "Show costs" }).uncheck();
  await page.getByRole("checkbox", { name: "Hold refinements" }).check();
  await refine.click(); await finish(0);
  const base = (await state()).coverageShots[0].versions.at(-1);
  assert.equal(base.kind, "refine");
  await change.dblclick();
  assert.equal((await calls()).refine, 2, "double-click starts one lens edit after the initial refinement");
  assert.equal((await calls()).start, 0, "lens editing never calls H3 or the upscale API");
  const firstJob = (await state()).coverageShotJobs[0], firstRequest = (await requests()).at(-1);
  assert.equal(firstJob.kind, "lens"); assert.equal(firstJob.lens.targetMm, 18);
  assert.equal(firstRequest.prompt, coverageLensPrompt("18", "camera"));
  assert.equal(firstRequest.references.length, 1); assert.equal(firstRequest.references[0].url, base.url);
  assert.equal(firstJob.sourceVersionId, base.id);
  assert.equal(firstRequest.model, "Nano Banana 2.1"); assert.match(firstRequest.title, /Shot 1 - 18mm/);
  assert.equal(await button("Select Shot 1").locator(".coverage-shot-progress").getAttribute("aria-label"), "Changing lens for Shot 1");
  assert.equal(await refine.isDisabled(), true); assert.equal(await upscale.isDisabled(), true); assert.equal(await change.isDisabled(), true);
  assert.equal(await page.locator(`[data-job-id="${firstJob.id}"] button`).count(), 0, "active image jobs cannot be polled or released as durable video receipts");

  // Settings for the next edit and a second shot remain usable during the first request.
  await target.selectOption("85"); await framing.selectOption("subject");
  await page.getByRole("combobox", { name: "Refinement model" }).selectOption("Nano Banana Pro");
  await button("Select Shot 2").click();
  assert.equal(await target.inputValue(), "original"); assert.equal(await framing.inputValue(), "camera");
  await target.selectOption("35"); await change.click();
  assert.equal((await calls()).refine, 3); assert.equal(await page.locator(".coverage-shot-progress").count(), 2);
  assert.equal((await requests()).at(-1).references[0].url, "/outputs/coverage-qa.png?shot=1", "unrefined shots use the capture without another paid refinement");
  await finish(1);
  const second = (await state()).coverageShots[1];
  assert.equal(second.versions.at(-1).lens.targetMm, 35); assert.equal(second.versions.at(-1).model, "Nano Banana Pro");
  await button("Select Shot 1").click(); await page.getByRole("textbox", { name: "Shot name" }).fill("Lens study");
  await page.getByRole("tab", { name: "Master", exact: true }).click(); await finish(0);
  const first = (await state()).coverageShots[0], lensVersion = first.versions.at(-1);
  assert.equal(first.label, "Lens study"); assert.equal(first.lensTarget, "85"); assert.equal(first.lensFraming, "subject");
  assert.equal(lensVersion.lens.targetMm, 18); assert.equal(lensVersion.lens.framing, "camera");
  assert.equal(lensVersion.model, "Nano Banana 2.1"); assert.equal(lensVersion.sourceVersionId, base.id);
  assert.equal((await state()).coverageView, "master", "completion does not steal the monitor");
  assert.equal((await state()).resultItems.length, 15, "original, refinement and lens versions publish to Preview");
  assert.equal(await page.locator(".coverage-shot-progress").count(), 0);
  await button("Select Lens study").click();
  await button("Select Lens study").dragTo(page.getByLabel("Canvas drop target"));
  assert.equal(JSON.parse(await page.locator('output[aria-label="Dropped"]').textContent()).url, lensVersion.url);

  // Refine remains a fidelity pass, and Refine/Upscale inherit requested lens metadata.
  await refine.click();
  assert.equal((await requests()).at(-1).prompt, cameraCoverageRefinePrompt);
  assert.equal((await requests()).at(-1).references[0].url, lensVersion.url);
  await finish(0);
  assert.deepEqual((await state()).coverageShots[0].versions.at(-1).lens, lensVersion.lens);
  await upscale.click();
  const upscaleJob = (await state()).coverageShotJobs[0];
  await page.locator(`[data-job-id="${upscaleJob.id}"]`).getByRole("button", { name: "Check existing request; never submits again" }).evaluateAll(items => items[0]?.click());
  await waitJobs(0);
  const upscaled = (await state()).coverageShots[0].versions.at(-1);
  assert.equal(upscaled.kind, "upscale"); assert.deepEqual(upscaled.lens, lensVersion.lens);

  await change.click();
  assert.equal((await requests()).at(-1).prompt, coverageLensPrompt("85", "subject"));
  assert.equal((await requests()).at(-1).references[0].url, base.url, "lens edits always return to the original refinement, not the lens-derived upscale");
  await page.getByRole("combobox", { name: "Shot version" }).selectOption({ label: "Original" });
  await target.selectOption("original"); await finish(0);
  assert.equal((await state()).resultUrl, first.originalUrl, "manual version choice survives lens completion");
  assert.equal((await state()).coverageShots[0].versions.at(-1).lens.targetMm, 85);
  assert.equal((await state()).coverageShots[0].versionId, "original"); assert.equal(await change.isDisabled(), true);

  // A failed edit preserves versions and blocks only that shot, without replaying.
  await target.selectOption("24"); await framing.selectOption("camera");
  const versionCount = (await state()).coverageShots[0].versions.length;
  await page.getByRole("checkbox", { name: "Fail refinement" }).check(); await change.click();
  await page.getByRole("checkbox", { name: "Fail refinement" }).uncheck();
  await button("Finish latest refinement").click();
  await page.getByRole("alert").filter({ hasText: "Simulated provider failure" }).waitFor();
  assert.equal((await state()).coverageShots[0].versions.length, versionCount);
  assert.equal(await page.locator(".coverage-shot-progress").count(), 0); assert.equal(await change.isDisabled(), true);
  await button("Select Shot 2").click(); await change.click();
  assert.equal((await requests()).at(-1).references[0].url, "/outputs/coverage-qa.png?shot=1", "a second lens change still uses the unrefined capture");
  await finish(1);
  assert.equal((await state()).coverageShotJobs[0].status, "failed");
  await button("Release this job from the node. Does not cancel the provider request.").click();

  // Reopen and copying must not resubmit or poll an image edit; late replies are ignored.
  await button("Select Lens study").click(); await change.click();
  const beforeReopen = await calls();
  await button("Save / Reopen").click();
  assert.equal((await state()).coverageShotJobs[0].status, "interrupted");
  assert.match((await state()).coverageShotJobs[0].error, /Lens change was interrupted/);
  assert.equal(await change.isDisabled(), true); assert.equal(await page.locator(".coverage-shot-progress").count(), 0);
  await page.waitForTimeout(4200);
  assert.equal((await calls()).read, beforeReopen.read, "lens edits never poll a camera receipt");
  assert.equal((await calls()).refine, beforeReopen.refine, "reopen does not replay a lens edit");
  await button("Finish latest refinement").click();
  assert.equal((await state()).coverageShots[0].versions.length, versionCount, "late unmounted completion is ignored");
  await button("Release this job from the node. Does not cancel the provider request.").click();
  await change.click(); const beforeCopy = await calls();
  await button("Copy node").click(); await finish(0);
  assert.equal((await calls()).refine, beforeCopy.refine); assert.equal((await state()).coverageShots[0].versions.length, versionCount);
  assert.equal(await target.inputValue(), "24"); assert.equal(await framing.inputValue(), "camera");

  // Fisheye is explicit in the UI, prompt and saved versions; fidelity passes keep its projection.
  await target.selectOption({ label: "8mm Fisheye" });
  for (const mode of ["camera", "subject"]) {
    await framing.selectOption(mode); await change.click();
    assert.equal((await requests()).at(-1).prompt, coverageLensPrompt("8", mode));
    assert.equal((await requests()).at(-1).references[0].url, base.url, "fisheye variations keep the same base after copy/reopen");
    assert.match((await requests()).at(-1).title, /8mm Fisheye/);
    await finish(0);
    const version = (await state()).coverageShots[0].versions.at(-1);
    assert.equal(version.lens.targetMm, 8); assert.equal(version.lens.projection, "fisheye"); assert.equal(version.lens.framing, mode);
    assert.match(version.label, /^8mm Fisheye - /);
    assert.equal((await state()).coverageShots[0].versionId, version.id, "lens result is selected even when its source differs from the displayed version");
  }
  await refine.click(); assert.equal((await requests()).at(-1).prompt, cameraCoverageRefinePrompt); await finish(0);
  assert.equal((await state()).coverageShots[0].versions.at(-1).lens.projection, "fisheye");
  await button("Save / Reopen").click();
  assert.equal(await target.inputValue(), "8"); assert.equal(await framing.inputValue(), "subject");
  assert.equal((await state()).coverageShots[0].versions.at(-1).lens.projection, "fisheye");
  await framing.selectOption("camera");
  await page.getByRole("checkbox", { name: "Show costs" }).check();
  await page.locator(".coverage-shot-controls").screenshot({ path: path.join(screenshots, "lens-desktop.png") });
  await page.setViewportSize({ width: 390, height: 1100 });
  await page.locator(".coverage-shot-controls").screenshot({ path: path.join(screenshots, "lens-mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const lensBounds = await page.locator(".coverage-lens-controls").boundingBox();
  for (const locator of [target, framing, change]) {
    const bounds = await locator.boundingBox();
    assert.ok(bounds.x >= lensBounds.x && bounds.x + bounds.width <= lensBounds.x + lensBounds.width + 1);
    assert.ok(await locator.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "lens controls fit at narrow widths, including cost labels");
  }
}
