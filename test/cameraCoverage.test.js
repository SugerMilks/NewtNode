import test from "node:test";
import assert from "node:assert/strict";
import { cameraCoverageDefaults, normalizeCameraCoverageData, newCoveragePoses, coverageTrajectory, validateCoverageRequest, coverageProviderInput,
  coverageOutputPatch, applyCoverageVersion, coverageRequestedCamera, coverageCost, cameraCoverageRefinePrompt, selectCoverageVersion, coverageRefineRatio,
  coverageTravelPosition, coverageTravelPose, coverageFramingPoses } from "../src/cameraCoverage.js";
import { resetCopiedNodeRuntime, clearStaleRunningState, remapImportedGraph } from "../src/workflowState.js";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { estimatedNodeWidth } from "../src/nodeGeometry.js";

const shot = (id = "one") => ({ id, label: `Shot ${id}`, originalUrl: "/outputs/original.png", versionId: "original", versions: [{ id: "original", kind: "original", url: "/outputs/original.png" }] });
test("ReFrame has isolated defaults and a registered, wide node", () => {
  const first = cameraCoverageDefaults(), second = cameraCoverageDefaults(); first.coveragePoses[1].azimuth = 99;
  assert.equal(second.coveragePoses[1].azimuth, -40);
  assert.equal(normalizeCameraCoverageData().coveragePreset, "Coverage");
  assert.equal(first.coverageResolution, "768P"); assert.equal(first.model, "Nano Banana 2.1"); assert.equal(first.coverageAutoRefine, true);
  assert.equal(normalizeCameraCoverageData({ model: "Nano Banana Pro" }).model, "Nano Banana Pro");
  assert.equal(normalizeCameraCoverageData({ coverageAutoRefine: false }).coverageAutoRefine, false);
  assert.equal(nodeTypeDefinitions.find(n => n.type === "cameraCoverage").label, "ReFrame");
  assert.equal(estimatedNodeWidth("cameraCoverage"), 780);
});
test("ReFrame migrates only old default titles, preserving saved media and jobs", () => {
  for (const [before, after] of [[undefined, "ReFrame"], ["", "ReFrame"], ["Camera Coverage", "ReFrame"],
    ["Camera Coverage 3", "ReFrame 3"], ["Camera Coverage 3 Copy Copy", "ReFrame 3 Copy Copy"],
    ["Camera Coverage Copy", "ReFrame Copy"], ["Product angles", "Product angles"],
    ["Camera Coverage Kitchen", "Camera Coverage Kitchen"], ["ReFrame 2", "ReFrame 2"]]) {
    const raw = { ...cameraCoverageDefaults(), title: before, coverageJob: { id: "existing", kind: "pass", status: "queued" },
      ...coverageOutputPatch([shot()], "one") };
    const normalized = normalizeCameraCoverageData(raw);
    assert.equal(normalized.title, after);
    assert.deepEqual(normalized.coverageJob, raw.coverageJob);
    assert.deepEqual(normalized.coverageShots, raw.coverageShots);
    assert.equal(normalized.resultUrl, raw.resultUrl);
    assert.deepEqual(normalizeCameraCoverageData(normalized), normalized);
  }
});
test("trajectory has ordered holds, a fixed master and bounded explicit poses", () => {
  const path = coverageTrajectory(newCoveragePoses("Coverage"));
  assert.equal(path.length, 8); assert.deepEqual(path[0], { time: 0, azimuth: 0, elevation: 0, distance: 1 });
  assert.ok(path.every((p, i) => p.time < 1 && (!i || p.time > path[i - 1].time)));
  for (const poses of [[], [newCoveragePoses("Custom")[0]], [{ azimuth: 1, elevation: 0, distance: 1 }, { azimuth: 30, elevation: 0, distance: 1 }],
    [{ azimuth: 0, elevation: 0, distance: 1 }, { azimuth: NaN, elevation: 0, distance: 1 }]]) assert.throws(() => coverageTrajectory(poses));
  const requested = coverageRequestedCamera({ trajectory: path, duration: 10 }, 2.5);
  assert.equal(requested.azimuth, -40); assert.equal(requested.approximate, true);
});
test("provider pass contract freezes the scene and disables expansion", () => {
  const request = validateCoverageRequest({ kind: "pass", sourceUrl: "/outputs/master.png", poses: newCoveragePoses("Close Coverage"), duration: 10, resolution: "768P" });
  const input = coverageProviderInput(request, "https://fal.test/master.png");
  assert.equal(input.prompt_expansion_mode, "disabled"); assert.equal(input.resolution, "768P"); assert.equal(input.image_url, "https://fal.test/master.png");
  assert.match(input.prompt, /Only the camera moves/); assert.match(input.prompt, /identities/); assert.equal(input.camera_trajectory.length, 8);
  assert.deepEqual(coverageProviderInput({ kind: "upscale", upscaleFactor: 2 }, "image"), { image_url: "image", model: "High Fidelity V2", upscale_factor: 2,
    output_format: "png", crop_to_fill: false, face_enhancement: false, subject_detection: "All", enable_safety_checker: true });
});
test("every orbit path stays within Fal's 12-keyframe limit without dropping requested views", () => {
  for (let count = 2; count <= 8; count++) {
    const poses = Array.from({ length: count }, (_, i) => ({ azimuth: i * 10, elevation: 0, distance: 1 }));
    const path = coverageTrajectory(poses);
    assert.ok(path.length <= 12); assert.ok(path.every((p, i) => !i || p.time > path[i - 1].time));
    for (const pose of poses) assert.ok(path.some(p => p.azimuth === pose.azimuth));
    assert.equal(path.at(-1).azimuth, poses.at(-1).azimuth);
  }
});
test("slide and boom samples keep constant depth instead of tracing an orbit", () => {
  for (const preset of ["Slide Coverage", "Boom Coverage", "Dolly Coverage"]) {
    const poses = newCoveragePoses(preset), path = coverageTrajectory(poses, "travel");
    assert.ok(path.length <= 12 && path.length >= 6);
    assert.ok(path.every((p, i) => !i || p.time > path[i - 1].time));
    for (const p of path) {
      const xyz = coverageTravelPosition(p);
      if (preset !== "Dolly Coverage") assert.ok(Math.abs(xyz.dolly - 1) < 1e-10);
      if (preset !== "Slide Coverage") assert.ok(Math.abs(xyz.slide) < 1e-10);
      if (preset !== "Boom Coverage") assert.ok(Math.abs(xyz.boom) < 1e-10);
    }
    if (preset !== "Dolly Coverage") assert.ok(path.some(p => p.distance > 1), "distance compensation prevents a constant-radius arc");
    // Bound the small residual from the provider interpolating angles between samples.
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], start = coverageTravelPosition(a), end = coverageTravelPosition(b);
      const middle = coverageTravelPosition(coverageRequestedCamera({ duration: 1, trajectory: path }, (a.time + b.time) / 2));
      const deviation = Math.hypot(...Object.keys(start).map(key => middle[key] - (start[key] + end[key]) / 2));
      assert.ok(deviation < 0.015, `${preset} deviation ${deviation}`);
    }
  }
});
test("travel requests use only documented spherical fields and preserve recovery settings", () => {
  const raw = { kind: "pass", sourceUrl: "/outputs/master.png", poses: newCoveragePoses("Boom Coverage"), pathMode: "travel", duration: 10, resolution: "768P" };
  const request = validateCoverageRequest(raw), input = coverageProviderInput(request, "https://fal.test/master.png");
  assert.equal(request.pathMode, "travel"); assert.match(input.prompt, /physical boom movement/); assert.match(input.prompt, /same scene center/);
  assert.equal(input.camera_trajectory.length, 12);
  assert.deepEqual(Object.keys(input.camera_trajectory[0]).sort(), ["azimuth", "distance", "elevation", "time"]);
  const restored = normalizeCameraCoverageData(JSON.parse(JSON.stringify({ coveragePreset: "Boom Coverage", coveragePathMode: "travel", coveragePoses: raw.poses })));
  assert.equal(restored.coveragePathMode, "travel"); assert.equal(restored.coveragePreset, "Boom Coverage");
  assert.equal(normalizeCameraCoverageData({}).coveragePathMode, "orbit");
  for (const patch of [{ pathMode: "other" }, { poses: [...raw.poses, raw.poses[1], raw.poses[2]] },
    { poses: [raw.poses[0], coverageTravelPose({ slide: 1, boom: 0, dolly: 1 })] }]) assert.throws(() => validateCoverageRequest({ ...raw, ...patch }));
  const mixed = coverageTravelPose({ slide: -0.5, boom: 0.6, dolly: 0.7 });
  const converted = coverageTravelPosition(mixed);
  for (const [key, value] of Object.entries({ slide: -0.5, boom: 0.6, dolly: 0.7 })) assert.ok(Math.abs(converted[key] - value) < 1e-10);
});
test("invalid requests fail before any provider operation", () => {
  const base = { kind: "pass", sourceUrl: "/uploads/a.png", poses: newCoveragePoses("Custom"), duration: 10, resolution: "768P" };
  for (const patch of [{ duration: 0 }, { duration: 16 }, { duration: 5.5 }, { resolution: "4K" }, { kind: "video" }, { sourceUrl: "https://example.com/a.png" }, { sourceUrl: "file:///private/a.png" }]) assert.throws(() => validateCoverageRequest({ ...base, ...patch }));
  assert.throws(() => validateCoverageRequest({ ...base, kind: "upscale", upscaleFactor: 8 }));
});
test("versions preserve originals and canonical selected outputs through round trips", () => {
  let data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([shot(), shot("two")], "two") };
  data = { ...data, ...applyCoverageVersion(data, "one", { id: "refine1", kind: "refine", url: "/outputs/refined.png" }) };
  assert.equal(data.coverageShots[0].versions.length, 2); assert.equal(data.coverageShots[0].originalUrl, "/outputs/original.png");
  assert.equal(data.coverageShotId, "two"); assert.equal(data.selectedResultIndex, 2);
  assert.equal(data.resultItems.length, 3);
  assert.deepEqual(data.resultItems.map(i => i.versionId), ["original", "refine1", "original"]);
  assert.equal(applyCoverageVersion(data, "one", { id: "refine1", url: "/outputs/refined.png" }).coverageShots[0].versions.length, 2);
  const restored = normalizeCameraCoverageData(JSON.parse(JSON.stringify({ ...data, ...coverageOutputPatch(data.coverageShots, "one") })));
  assert.equal(restored.resultUrl, "/outputs/refined.png"); assert.equal(restored.resultItems[0].shotId, "one");
  assert.equal(coverageOutputPatch([], "one").resultUrl, "");
  assert.match(cameraCoverageRefinePrompt, /exact camera viewpoint/); assert.match(cameraCoverageRefinePrompt, /not a new composition/);
});
test("selecting any Preview version updates both shot and version without losing media", () => {
  let data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([shot(), shot("two")], "two") };
  data = { ...data, ...applyCoverageVersion(data, "one", { id: "refine", label: "Refined", kind: "refine", url: "/outputs/refined.png" }) };
  data = { ...data, ...selectCoverageVersion(data, "one", "original") };
  assert.equal(data.coverageShotId, "one"); assert.equal(data.coverageShots[0].versionId, "original");
  assert.equal(normalizeCameraCoverageData(data).resultUrl, "/outputs/original.png");
  data = { ...data, ...selectCoverageVersion(data, "one", "refine") };
  assert.equal(normalizeCameraCoverageData(data).resultUrl, "/outputs/refined.png"); assert.equal(data.selectedResultIndex, 1);
  assert.equal(data.resultItems.length, 3);
  assert.equal(selectCoverageVersion(data, "one", "missing").resultUrl, data.resultUrl);
});
test("refinement uses captured dimensions and supported ratios, including portrait frames", () => {
  const portrait = shot(); portrait.versions[0].width = 540; portrait.versions[0].height = 960;
  assert.equal(coverageRefineRatio(portrait, ["Auto", "16:9", "9:16", "1:1"]), "9:16");
  assert.equal(coverageRefineRatio(shot(), ["1:1", "16:9"]), "16:9");
});
test("copied/imported nodes do not inherit paid jobs; reopening only retains status receipts", () => {
  const data = { ...cameraCoverageDefaults(), coverageJob: { id: "receipt" }, coverageEnhancing: { id: "refine" }, ...coverageOutputPatch([shot()], "one") };
  const reopened = clearStaleRunningState({ type: "cameraCoverage", data });
  assert.equal(reopened.data.coverageJob.id, "receipt"); assert.equal(reopened.data.coverageEnhancing, null);
  assert.match(reopened.data.error, /Check History/);
  const copied = resetCopiedNodeRuntime(data); assert.equal(copied.coverageJob, null); assert.equal(copied.coverageEnhancing, null); assert.equal(copied.resultUrl, data.resultUrl);
  const imported = remapImportedGraph({ nodes: [{ id: "a", type: "cameraCoverage", data, x: 0, y: 0 }] });
  assert.equal(imported.nodes[0].data.coverageJob, null); assert.equal(imported.nodes[0].data.coverageShots.length, 1);
});
test("camera estimates remain explicit and do not claim settled billing", () => {
  assert.equal(coverageCost(10, "768P").amountUsd, 0.8); assert.equal(coverageCost(10, "1080P").amountUsd, 1.6);
  assert.equal(coverageCost(10, "1080P").estimated, true); assert.equal(coverageCost(10, "4K").amountUsd, null);
});

test("background versions preserve manual selection, shot edits and concurrent results", () => {
  let data = { ...cameraCoverageDefaults(), ...coverageOutputPatch([shot(), shot("two")], "one"), coverageView: "pass" };
  data = { ...data, ...applyCoverageVersion(data, "one", { id: "first", url: "/outputs/first.png" }) };
  data = { ...data, ...selectCoverageVersion(data, "one", "original") };
  data.coverageShots[0].label = "Renamed during refinement";
  data = { ...data, ...applyCoverageVersion(data, "two", { id: "other", url: "/outputs/other.png" }, "original") };
  data = { ...data, ...applyCoverageVersion(data, "one", { id: "late", url: "/outputs/late.png" }, "first") };
  assert.equal(data.coverageShots[0].versionId, "original");
  assert.equal(data.coverageShots[0].label, "Renamed during refinement");
  assert.equal(data.coverageShots[1].versionId, "other");
  assert.equal(data.resultItems.length, 5); assert.equal(data.resultUrl, "/outputs/original.png");
  assert.equal(applyCoverageVersion(data, "deleted", { id: "missing", url: "/outputs/missing.png" }).resultItems.length, 5);
});

test("parallel job receipts reopen without replay and copies/imports drop every active job", () => {
  const data = { ...cameraCoverageDefaults(), coverageJob: { id: "pass", kind: "pass", status: "queued" },
    coverageShotJobs: [{ id: "refine", kind: "refine", shotId: "one", status: "running" },
      { id: "upscale", kind: "upscale", shotId: "two", status: "queued" }], ...coverageOutputPatch([shot(), shot("two")], "one") };
  const reopened = clearStaleRunningState({ data }).data;
  assert.equal(reopened.coverageJob.id, "pass");
  assert.equal(reopened.coverageShotJobs[0].status, "interrupted");
  assert.match(reopened.coverageShotJobs[0].error, /no request was replayed/);
  assert.equal(reopened.coverageShotJobs[1].status, "queued");
  assert.equal(normalizeCameraCoverageData(data).coverageShotJobs[0].status, "running", "normal rendering does not interrupt active work");
  const copied = resetCopiedNodeRuntime(data);
  assert.equal(copied.coverageJob, null); assert.deepEqual(copied.coverageShotJobs, []);
  const imported = remapImportedGraph({ nodes: [{ id: "a", type: "cameraCoverage", data, x: 0, y: 0 }] }).nodes[0].data;
  assert.equal(imported.coverageJob, null); assert.deepEqual(imported.coverageShotJobs, []);
  assert.equal(imported.resultItems.length, 2);
});

test("legacy single upscale and refinement migrate without losing their receipts", () => {
  const old = { coverageJob: { id: "upscale", kind: "upscale", shotId: "two", status: "queued", factor: 2 },
    coverageEnhancing: { id: "refine", shotId: "one" } };
  const migrated = normalizeCameraCoverageData(old);
  assert.equal(migrated.coverageJob, null); assert.equal(migrated.coverageEnhancing, null);
  assert.equal(migrated.coverageShotJobs.length, 2);
  assert.equal(migrated.coverageShotJobs[0].id, "upscale"); assert.equal(migrated.coverageShotJobs[0].factor, 2);
  assert.equal(migrated.coverageShotJobs[1].status, "interrupted");
  assert.equal(normalizeCameraCoverageData(migrated).coverageShotJobs.length, 2);
});

test("reopening during submission keeps durable receipts checkable without a replay", () => {
  const raw = { ...cameraCoverageDefaults(), coverageJob: { id: "pass", kind: "pass", status: "submitting" },
    coverageShotJobs: [{ id: "upscale", kind: "upscale", shotId: "one", status: "submitting" }] };
  const reopened = clearStaleRunningState({ data: raw }).data;
  assert.equal(reopened.coverageJob.id, "pass"); assert.equal(reopened.coverageJob.status, "uncertain");
  assert.equal(reopened.coverageShotJobs[0].id, "upscale"); assert.equal(reopened.coverageShotJobs[0].status, "uncertain");
  assert.match(reopened.coverageJob.error, /Check the existing request/);
  assert.equal(normalizeCameraCoverageData(raw).coverageJob.status, "submitting", "normal rendering leaves active submissions alone");
});

test("Protect Framing is opt-in and does not rewrite stored camera paths", () => {
  const poses = newCoveragePoses("Close Coverage"), original = structuredClone(poses);
  assert.equal(cameraCoverageDefaults().coverageProtectFraming, false);
  const saved = normalizeCameraCoverageData({ coveragePoses: poses, coverageProtectFraming: true, coverageFramingRoom: 30 });
  assert.deepEqual(saved.coveragePoses, poses); assert.equal(saved.coverageFramingRoom, 30);
  assert.equal(normalizeCameraCoverageData({ coverageFramingRoom: 200 }).coverageFramingRoom, 40);
  assert.deepEqual(coverageFramingPoses(poses, "orbit", false, 20), original);
  const safe = coverageFramingPoses(poses, "orbit", true, 20);
  assert.deepEqual(safe[0], poses[0]);
  safe.slice(1).forEach((p, i) => { assert.equal(p.distance, 1.2); assert.equal(p.azimuth, poses[i + 1].azimuth); assert.equal(p.elevation, poses[i + 1].elevation); });
  assert.deepEqual(poses, original);
  const wider = [...poses, { azimuth: 10, elevation: 20, distance: 1.8 }];
  assert.equal(coverageFramingPoses(wider, "orbit", true, 40).at(-1).distance, 1.8, "already wider poses stay wider");
});

test("protected travel adds depth without changing slide/boom or enlarging the move", () => {
  for (const room of [0, 20, 40]) for (const preset of ["Slide Coverage", "Boom Coverage", "Dolly Coverage"]) {
    const poses = newCoveragePoses(preset), safe = coverageFramingPoses(poses, "travel", true, room);
    assert.deepEqual(safe[0], poses[0]);
    safe.slice(1).forEach((p, i) => {
      const before = coverageTravelPosition(poses[i + 1]), after = coverageTravelPosition(p);
      assert.ok(Math.abs(before.slide - after.slide) < 1e-10);
      assert.ok(Math.abs(before.boom - after.boom) < 1e-10);
      assert.ok(Math.abs(after.dolly - Math.max(before.dolly, 1 + room / 100)) < 1e-10);
    });
    assert.ok(coverageTrajectory(safe, "travel").length <= 12);
  }
});

test("framing protection reaches the actual provider path and prompt, never extra API fields", () => {
  const body = { kind: "pass", sourceUrl: "/outputs/master.png", poses: newCoveragePoses("Close Coverage"), duration: 10, resolution: "768P", protectFraming: true, framingRoom: 25 };
  const request = validateCoverageRequest(body), input = coverageProviderInput(request, "https://fal.test/master.png");
  assert.equal(request.framingRoom, 25); assert.deepEqual(request.poses, body.poses);
  assert.ok(input.camera_trajectory.slice(2).every(p => p.distance >= 1.25));
  assert.match(input.prompt, /headroom/); assert.match(input.prompt, /whole visible group/); assert.match(input.prompt, /do not shrink, reposition or deform/);
  assert.match(input.prompt, /Preserve intentional existing close-up boundaries/);
  assert.equal(input.prompt_expansion_mode, "disabled");
  assert.equal(input.protectFraming, undefined); assert.equal(input.framingRoom, undefined);
  const old = validateCoverageRequest({ ...body, protectFraming: undefined, framingRoom: undefined });
  const off = validateCoverageRequest({ ...body, protectFraming: false });
  assert.deepEqual(off, old, "disabled protection preserves the legacy request fingerprint");
  assert.deepEqual(off.trajectory, coverageTrajectory(body.poses));
  assert.doesNotMatch(coverageProviderInput(off, "image").prompt, /Framing priority/);
  for (const room of [-1, 41, 20.5, "20", NaN]) assert.throws(() => validateCoverageRequest({ ...body, framingRoom: room }), /Extra Room/);
  assert.throws(() => validateCoverageRequest({ ...body, protectFraming: "yes" }), /on or off/);
  assert.throws(() => validateCoverageRequest({ ...body, poses: [body.poses[0], { ...body.poses[1], distance: -1 }] }), /invalid distance/, "validate before protection can hide bad coordinates");
});
