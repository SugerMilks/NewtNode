import test from "node:test";
import assert from "node:assert/strict";
import { coverageLensOptions, coverageLensLabel, coverageLensSettings, coverageLensPrompt, cameraCoverageRefinePrompt, cameraCoverageFreezePrompt,
  cameraCoverageDefaults, normalizeCameraCoverageData, coverageOutputPatch, applyCoverageVersion, selectCoverageVersion, isCoverageImageJob,
  coverageLensSource, coverageRefineRatio } from "../src/cameraCoverage.js";
import { resetCopiedNodeRuntime, clearStaleRunningState, remapImportedGraph } from "../src/workflowState.js";
import { runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";
import { nodeApi } from "../src/api/newtApi.js";

const shot = id => ({ id, label: `Shot ${id}`, originalUrl: `/outputs/${id}.png`, versionId: "original",
  versions: [{ id: "original", url: `/outputs/${id}.png`, kind: "original", type: "image" }] });
const lens = { targetMm: 18, framing: "camera", equivalent: "full-frame", approximate: true };

test("every lens target uses the first clean refinement, independent of selected and later versions", () => {
  const base = { id: "base", url: "/outputs/base.png", kind: "refine", sourceVersionId: "original", width: 1600, height: 900 };
  const s = { ...shot("a"), versions: [...shot("a").versions, base,
    { id: "lens", url: "/outputs/lens.png", kind: "lens", lens, sourceVersionId: "base", width: 900, height: 1600 },
    { id: "lens-refine", url: "/outputs/lens-refine.png", kind: "refine", sourceVersionId: "lens", lens },
    { id: "upscale", url: "/outputs/upscale.png", kind: "upscale", sourceVersionId: "lens-refine", lens },
    { id: "later-clean", url: "/outputs/later.png", kind: "refine", sourceVersionId: "base" }] };
  const before = structuredClone(s);
  for (const version of s.versions) {
    for (const lensTarget of coverageLensOptions) {
      const current = { ...s, versionId: version.id, lensTarget };
      assert.equal(coverageLensSource(current).versionId, "base");
      assert.equal(coverageRefineRatio(current, ["9:16", "16:9"], coverageLensSource(current)), "16:9");
    }
  }
  assert.equal(coverageRefineRatio({ ...s, versionId: "lens" }, ["9:16", "16:9"]), "9:16", "ordinary Refine still uses the displayed version");
  assert.deepEqual(s, before, "source resolution does not mutate saved versions");
  const data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([s, shot("b")], "a") };
  for (const restored of [normalizeCameraCoverageData(JSON.parse(JSON.stringify(data))), resetCopiedNodeRuntime(data)]) {
    assert.equal(coverageLensSource(restored.coverageShots[0]).url, base.url);
    assert.equal(coverageLensSource(restored.coverageShots[1]).url, "/outputs/b.png");
  }
});

test("lens ancestry is excluded even without inherited lens metadata or version IDs", () => {
  for (const useIds of [true, false]) {
    const parent = v => useIds ? { sourceVersionId: v.id } : { sourceUrl: v.url };
    const original = shot("a").versions[0];
    const edited = { id: "lens", url: "/outputs/lens.png", kind: "lens", ...parent(original) };
    const upscale = { id: "upscale", url: "/outputs/upscale.png", kind: "upscale", ...parent(edited) };
    const refined = { id: "refine", url: "/outputs/refine.png", kind: "refine", ...parent(upscale) };
    const s = { ...shot("a"), versionId: refined.id, versions: [original, edited, upscale, refined] };
    assert.equal(coverageLensSource(s).versionId, "original");
    const cleanUpscale = { id: "clean-upscale", url: "/outputs/clean-upscale.png", kind: "upscale", ...parent(original) };
    const cleanRefine = { id: "clean-refine", url: "/outputs/clean-refine.png", kind: "refine", ...parent(cleanUpscale) };
    s.versions.push(cleanUpscale, cleanRefine);
    assert.equal(coverageLensSource(s).versionId, "clean-refine", "a later refinement is valid when its ancestry leads only to the original");
  }
  const inherited = { id: "refine", url: "/outputs/refine.png", kind: "refine", lens: { ...lens, targetMm: 8, projection: "fisheye" } };
  assert.equal(coverageLensSource({ ...shot("a"), versions: [...shot("a").versions, inherited] }).versionId, "original");
});

test("legacy refinements remain usable, but untraceable post-lens and broken ancestry use the capture", () => {
  const original = shot("a").versions[0];
  const legacy = { id: "legacy", url: "/outputs/legacy.png", kind: "refine" };
  const edited = { id: "lens", url: "/outputs/lens.png", kind: "lens" };
  assert.equal(coverageLensSource({ ...shot("a"), versions: [original, legacy, edited] }).versionId, "legacy");
  assert.equal(coverageLensSource({ ...shot("a"), versions: [original, edited, legacy] }).versionId, "original");
  for (const broken of [{ sourceVersionId: "missing" }, { sourceUrl: "/outputs/missing.png" }, { sourceVersionId: "legacy" }]) {
    assert.equal(coverageLensSource({ ...shot("a"), versions: [original, { ...legacy, ...broken }] }).versionId, "original");
  }
  assert.equal(coverageLensSource({ ...shot("a"), versions: [original,
    { ...legacy, sourceVersionId: "cycle" }, { id: "cycle", url: "/outputs/cycle.png", sourceVersionId: "legacy" }] }).versionId, "original");
  const missingRecord = coverageLensSource({ ...shot("a"), versions: [edited] });
  assert.equal(missingRecord.url, original.url); assert.equal(missingRecord.kind, "original");
  assert.equal(coverageLensSource({ ...shot("a"), versions: [{ ...legacy, sourceUrl: original.url }] }).versionId, "legacy");
  assert.equal(coverageLensSource(null), null);
});

test("lens completion guards the displayed version independently from its stable source", () => {
  const s = { ...shot("a"), versionId: "lens-18", versions: [...shot("a").versions,
    { id: "base", kind: "refine", url: "/outputs/base.png", sourceVersionId: "original" },
    { id: "lens-18", kind: "lens", url: "/outputs/18.png", sourceVersionId: "base" }] };
  const data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([s], "a") };
  const result = { id: "lens-8", kind: "lens", url: "/outputs/8.png", sourceVersionId: coverageLensSource(s).versionId };
  assert.equal(applyCoverageVersion(data, "a", result, s.versionId).resultUrl, result.url);
  const changed = { ...data, ...selectCoverageVersion(data, "a", "base") };
  assert.equal(applyCoverageVersion(changed, "a", result, s.versionId).resultUrl, "/outputs/base.png");
});

test("lens preferences are opt-in, per-shot and normalized without changing saved media", () => {
  assert.deepEqual(coverageLensOptions, ["8", "18", "24", "35", "50", "85"]);
  assert.deepEqual(coverageLensSettings(), { lensTarget: "original", lensFraming: "camera" });
  assert.deepEqual(coverageLensSettings({ lensTarget: 18, lensFraming: "subject" }), { lensTarget: "18", lensFraming: "subject" });
  for (const lensTarget of [0, null, "fish-eye", "18mm", 200, {}, []]) {
    assert.deepEqual(coverageLensSettings({ lensTarget, lensFraming: "unknown" }), { lensTarget: "original", lensFraming: "camera" });
  }
  const saved = normalizeCameraCoverageData({ ...coverageOutputPatch([{ ...shot("a"), lensTarget: "24", lensFraming: "subject" }, shot("b")], "b") });
  assert.equal(saved.coverageShots[0].lensTarget, "24"); assert.equal(saved.coverageShots[0].lensFraming, "subject");
  assert.deepEqual(saved.coverageShots[1], shot("b"), "loading old shots does not rewrite them");
  assert.equal(saved.resultUrl, "/outputs/b.png"); assert.deepEqual(saved.coverageShotJobs, []);
  assert.deepEqual(normalizeCameraCoverageData(JSON.parse(JSON.stringify(saved))), saved);
});

test("lens prompts distinguish fixed-camera FOV from subject-matched dolly without conflicting fidelity locks", () => {
  for (const target of coverageLensOptions) {
    for (const framing of ["camera", "subject"]) {
      const prompt = coverageLensPrompt(target, framing);
      assert.match(prompt, new RegExp(`${target}mm full-frame-equivalent ${target === "8" ? "fisheye" : "rectilinear"}`));
      assert.match(prompt, /source focal length is unknown/);
      assert.match(prompt, /all identities/); assert.match(prompt, /world-space blocking/);
      assert.match(prompt, /grade and aspect ratio/); assert.match(prompt, /infer any newly exposed surroundings conservatively/);
      if (target === "8") {
        assert.match(prompt, /pronounced, coherent curvilinear fisheye projection/);
        assert.match(prompt, /no black circular border/);
        assert.match(prompt, /preserving facial identity and underlying anatomy/);
        assert.match(prompt, /Do not straighten or de-fisheye/);
        assert.doesNotMatch(prompt, /No fisheye|straight architectural lines remaining straight|rectilinear/);
      } else assert.match(prompt, /No fisheye/);
      assert.match(prompt, /not measured optical calibration/);
      assert.doesNotMatch(prompt, /preserve the exact camera viewpoint/i);
      if (framing === "camera") {
        assert.match(prompt, /same physical position and orientation/);
        assert.match(prompt, /Lens choice alone must not introduce new perspective parallax/);
        assert.doesNotMatch(prompt, /moving only the camera along its viewing axis/);
      } else {
        assert.match(prompt, /same size and placement/);
        assert.match(prompt, /closer for a wider lens or farther for a longer lens/);
        assert.match(prompt, /whole group's framing/);
      }
    }
  }
  for (const args of [["original", "camera"], ["18mm", "camera"], [18, "invalid"], [900, "subject"]]) assert.throws(() => coverageLensPrompt(...args));
  assert.match(cameraCoverageRefinePrompt, /Preserve the exact camera viewpoint, perspective, lens distortion, framing, crop and aspect ratio/);
  assert.match(cameraCoverageFreezePrompt, /Keep focal length unchanged/);
});

test("8mm Fisheye keeps an explicit label and survives saved per-shot settings", () => {
  assert.equal(coverageLensLabel("8"), "8mm Fisheye"); assert.equal(coverageLensLabel(8), "8mm Fisheye");
  assert.equal(coverageLensLabel("18"), "18mm");
  const saved = normalizeCameraCoverageData({ ...coverageOutputPatch([{ ...shot("a"), lensTarget: 8, lensFraming: "subject" }], "a") });
  assert.equal(saved.coverageShots[0].lensTarget, "8"); assert.equal(saved.coverageShots[0].lensFraming, "subject");
  const fisheye = { ...lens, targetMm: 8, projection: "fisheye" };
  const updated = { ...saved, ...applyCoverageVersion(saved, "a", { id: "fisheye", label: "8mm Fisheye - Keep Subject Size", kind: "lens", url: "/outputs/fisheye.png", lens: fisheye }, "original") };
  const restored = normalizeCameraCoverageData(JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(restored.resultItems[1].lens, fisheye);
  assert.equal(restored.resultItems[1].label, "Shot a - 8mm Fisheye - Keep Subject Size");
  assert.equal(restored.coverageShots[0].originalUrl, "/outputs/a.png");
});

test("lens edits append versions, publish all images and preserve settings, source selection and originals", () => {
  let data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([{ ...shot("a"), lensTarget: "18", lensFraming: "camera" }, shot("b")], "a") };
  data = { ...data, ...applyCoverageVersion(data, "a", { id: "lens-18", label: "18mm - Keep Camera Position", kind: "lens", url: "/outputs/18.png", lens, sourceVersionId: "original", sourceUrl: "/outputs/a.png" }, "original") };
  assert.equal(data.resultUrl, "/outputs/18.png"); assert.equal(data.resultItems.length, 3);
  assert.equal(data.resultItems[1].label, "Shot a - 18mm - Keep Camera Position"); assert.deepEqual(data.resultItems[1].lens, lens);
  data = { ...data, ...selectCoverageVersion(data, "a", "original") };
  data = { ...data, ...applyCoverageVersion(data, "a", { id: "lens-85", kind: "lens", url: "/outputs/85.png", lens: { ...lens, targetMm: 85 } }, "lens-18") };
  assert.equal(data.resultUrl, "/outputs/a.png", "manual version selection survives a background completion");
  assert.equal(data.coverageShots[0].versions.length, 3); assert.equal(data.coverageShots[0].originalUrl, "/outputs/a.png");
  assert.equal(data.coverageShots[0].lensTarget, "18");
  const restored = normalizeCameraCoverageData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.resultItems, data.resultItems);
  assert.equal(restored.coverageShots[0].versions[1].sourceVersionId, "original");
});

test("pending lens edits never replay on reopen, copy or import", () => {
  const job = { id: "lens-job", kind: "lens", shotId: "a", sourceVersionId: "original", status: "running", lens };
  const data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([{ ...shot("a"), lensTarget: "18", lensFraming: "subject" }], "a"), coverageShotJobs: [job] };
  assert.equal(isCoverageImageJob(job), true); assert.equal(isCoverageImageJob({ kind: "upscale" }), false);
  assert.equal(normalizeCameraCoverageData(data).coverageShotJobs[0].status, "running");
  const reopened = clearStaleRunningState({ type: "cameraCoverage", data }).data;
  assert.equal(reopened.coverageShotJobs[0].status, "interrupted"); assert.match(reopened.coverageShotJobs[0].error, /Lens change.*Check History.*no request was replayed/);
  assert.deepEqual(reopened.coverageShotJobs[0].lens, lens); assert.equal(reopened.resultUrl, data.resultUrl);
  const failed = { ...data, coverageShotJobs: [{ ...job, status: "failed", error: "Provider failed" }] };
  assert.deepEqual(clearStaleRunningState({ data: failed }).data.coverageShotJobs, failed.coverageShotJobs);
  const copied = resetCopiedNodeRuntime(data), imported = remapImportedGraph({ nodes: [{ id: "n", type: "cameraCoverage", data, x: 0, y: 0 }] }).nodes[0].data;
  for (const restored of [copied, imported]) {
    assert.deepEqual(restored.coverageShotJobs, []); assert.equal(restored.coverageShots[0].lensTarget, "18");
    assert.equal(restored.coverageShots[0].lensFraming, "subject"); assert.equal(restored.resultUrl, data.resultUrl);
  }
});

test("lens edit uses one reference through the existing image route with workflow context and cost", async t => {
  const requests = [];
  t.mock.method(nodeApi, "generateImage", async request => {
    requests.push(request);
    return { response: { ok: true }, data: { image: { localUrl: "/outputs/lens.png" }, cost: { amountUsd: 0.1 } } };
  });
  const prompt = coverageLensPrompt("18", "subject");
  const result = await runImageModelGeneration({ node: { id: "reframe", data: { ...cameraCoverageDefaults(), title: "ReFrame - Shot A - 18mm", aspectRatio: "Auto" } }, prompt,
    aspectRatio: "9:16", imagePromptItems: [{ url: "/outputs/selected-version.png", label: "Selected shot: scene and identity reference for the requested lens change" }],
    workflowContext: { projectId: "lens-project", projectName: "Lens test" }, index: 0 });
  assert.equal(requests.length, 1); assert.equal(requests[0].prompt, prompt); assert.equal(requests[0].model, "Nano Banana 2.1");
  assert.deepEqual(requests[0].imagePromptUrls, ["/outputs/selected-version.png"]);
  assert.equal(requests[0].requestedAspectRatio, "Auto"); assert.equal(requests[0].aspectRatio, "9:16");
  assert.equal(requests[0].nodeId, "reframe"); assert.equal(requests[0].projectId, "lens-project");
  assert.equal(result[0].url, "/outputs/lens.png"); assert.equal(result[0].cost.amountUsd, 0.1);
});
