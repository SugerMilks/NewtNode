export const cameraCoverageEndpoint = "minimax/h3-max/camera-controls";
export const cameraCoverageUpscaleEndpoint = "fal-ai/topaz/upscale/image";
export const cameraCoverageModels = ["Nano Banana Pro", "Nano Banana 2.1", "OpenAI Image 2.5 Sunburst", "OpenAI Image 2.5 Flare", "Seedream 5.0 Pro"];
export const cameraCoverageFreezePrompt = "The reference image is one frozen instant. Only the camera moves along the supplied camera trajectory. Preserve every person and object in exactly the same world position, orientation, shape and pose. Keep faces, expressions, hands, clothing, liquids and background motionless. Maintain identities, subject count, wardrobe, props, spatial relationships, lighting direction and color treatment. Camera parallax is the only source of apparent movement. No cuts, added objects, subject motion or redesign. Move smoothly between the requested positions and hold where the trajectory holds. Do not return to the original position unless the trajectory requests it. Keep focal length unchanged; distance changes are camera travel, not digital zoom.";
export const cameraCoverageRefinePrompt = "Improve the realism, quality, and fidelity of this image. Treat this exact image as the composition authority. Preserve the exact camera viewpoint, perspective, lens distortion, framing, crop and aspect ratio. Preserve every person's identity, expression, pose, wardrobe and screen position. Preserve all objects, text, logos, environment geometry, spatial relationships, lighting direction, shadows and color treatment. Refine natural textures, believable fine detail and image clarity only. Do not restage, beautify faces, change anatomy, alter the grade, add or remove anything, or reveal a new area. This is a fidelity pass on an approved shot, not a new composition.";
export const coverageLensOptions = ["8", "18", "24", "35", "50", "85"];
export const coverageLensLabel = mm => String(mm) === "8" ? "8mm Fisheye" : `${mm}mm`;
export const coverageLensFramings = { camera: "Keep Camera Position", subject: "Keep Subject Size" };
export const coverageLensSettings = shot => ({
  lensTarget: coverageLensOptions.includes(String(shot?.lensTarget)) ? String(shot.lensTarget) : "original",
  lensFraming: Object.hasOwn(coverageLensFramings, shot?.lensFraming) ? shot.lensFraming : "camera"
});
export const isCoverageImageJob = job => ["refine", "lens"].includes(job?.kind);

export function coverageLensPrompt(targetMm, framing) {
  if (!coverageLensOptions.includes(String(targetMm)) || !Object.hasOwn(coverageLensFramings, framing)) throw new Error("Choose a supported target lens and framing mode.");
  const fisheye = String(targetMm) === "8";
  return [
    `Reinterpret this base shot as a photograph made with a ${targetMm}mm full-frame-equivalent ${fisheye ? "fisheye" : "rectilinear"} lens. This is an approximate AI lens interpretation, not measured optical calibration. The source focal length is unknown; do not assume it is 50mm or claim an exact lens conversion.`,
    framing === "camera"
      ? "Keep the camera at the same physical position and orientation: no dolly, orbit, slide, boom, pan or tilt. Change the field of view for the requested lens. Keep the same optical axis, horizon and perspective relationships. A wider field shows smaller subjects and more surroundings; a narrower field shows larger subjects and less surroundings. Do not compensate by moving the camera or scaling individual objects. Lens choice alone must not introduce new perspective parallax."
      : "Keep the principal subject or group approximately the same size and placement in the frame. Simulate changing the lens and moving only the camera along its viewing axis: closer for a wider lens or farther for a longer lens, as needed. Allow natural perspective and background-scale changes from that camera movement. Keep the camera's orientation and roll; no orbit, lateral move or independent boom. Match the whole group's framing, not one face at the expense of others. Do not resize or move people or objects to fake the result.",
    "Preserve the same frozen instant, all identities, expressions, poses, anatomy, wardrobe, props, text, logos, world-space blocking, environment structure, lighting direction, shadows, exposure, grade and aspect ratio. Only the requested optical framing and permitted camera travel may change. Keep visible scene geometry consistent; infer any newly exposed surroundings conservatively from the reference, without adding new people, props or story elements. Do not remove a principal subject. Avoid accidental cuts through faces or important held objects.",
    fisheye
      ? "Use a pronounced, coherent curvilinear fisheye projection across the entire scene: off-center architectural lines bow naturally, with stronger optical curvature toward the edges and an expansive field of view. Keep depth ordering and underlying scene geometry intact. Allow consistent optical distortion of people and surroundings while preserving facial identity and underlying anatomy; no melted, duplicated or independently warped features. Fill the rectangular image edge to edge at the source aspect ratio, with no black circular border, circular mask or pasted frame. Do not straighten or de-fisheye this intentional lens look."
      : "Use natural rectilinear rendering, with straight architectural lines remaining straight. No fisheye, artificial barrel warp, stretched faces or pasted borders.",
    "Preserve realistic detail and texture. Return one finished image, not a comparison, diagram, caption or lens label."
  ].join(" ");
}

const pose = (azimuth, elevation = 0, distance = 1) => ({ azimuth, elevation, distance });
export const coverageTravelLimits = { slide: [-0.8, 0.8], boom: [-0.25, 0.8], dolly: [0.5, 1.5] };
export function coverageTravelPosition(p) {
  const azimuth = p.azimuth * Math.PI / 180, elevation = p.elevation * Math.PI / 180;
  return { slide: Math.sin(azimuth) * Math.cos(elevation) * p.distance,
    boom: Math.sin(elevation) * p.distance, dolly: Math.cos(azimuth) * Math.cos(elevation) * p.distance };
}
export function coverageTravelPose({ slide = 0, boom = 0, dolly = 1 } = {}) {
  return pose(Math.atan2(slide, dolly) * 180 / Math.PI, Math.atan2(boom, Math.hypot(slide, dolly)) * 180 / Math.PI, Math.hypot(slide, boom, dolly));
}
const travel = (slide, boom = 0, dolly = 1) => coverageTravelPose({ slide, boom, dolly });
const travelPresets = {
  "Slide Coverage": [pose(0), travel(-0.5), travel(0.5)],
  "Boom Coverage": [pose(0), travel(0, 0.5), travel(0, -0.25)],
  "Dolly Coverage": [pose(0), travel(0, 0, 0.6), travel(0, 0, 1.5)],
  "Custom Travel": [pose(0), travel(0.4)]
};
export const coveragePresetPathMode = name => Object.hasOwn(travelPresets, name) ? "travel" : "orbit";
export const cameraCoveragePresets = {
  Coverage: [pose(0), pose(-40), pose(40), pose(0)],
  "Close Coverage": [pose(0), pose(-30, 0, 0.7), pose(0, 0, 0.6), pose(30, 0, 0.7)],
  "Height Study": [pose(0), pose(-20, -15), pose(0, 25, 1.15), pose(20, 10)],
  "Profile Study": [pose(0), pose(45), pose(90)],
  Custom: [pose(0), pose(30)], ...travelPresets
};
const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
const managedUrl = value => typeof value === "string" && /^\/(uploads|outputs|workflow-assets)\//.test(value) && !value.includes("\\");
export const newCoveragePoses = name => (cameraCoveragePresets[name] || cameraCoveragePresets.Coverage).map(item => ({ ...item }));

export function coverageFramingPoses(poses, pathMode, protectFraming, room = 20) {
  if (!protectFraming) return poses;
  const minimum = 1 + room / 100;
  return poses.map((p, index) => {
    if (!index) return { ...p }; // The source image remains the unchanged first frame.
    if (pathMode !== "travel") return { ...p, distance: Math.max(p.distance, minimum) };
    const xyz = coverageTravelPosition(p);
    // Preserve slide/boom coordinates, adding depth rather than enlarging the lateral move.
    return coverageTravelPose({ ...xyz, dolly: Math.max(xyz.dolly, minimum) });
  });
}

export function cameraCoverageDefaults() {
  return { coveragePreset: "Coverage", coveragePathMode: "orbit", coveragePoses: newCoveragePoses("Coverage"), coverageDuration: 10, coverageResolution: "768P",
    coveragePasses: [], coveragePassId: "", coverageReadyPassId: "", coverageJob: null, coverageShotJobs: [], coverageShots: [], coverageShotId: "", coverageView: "pass",
    masterImage: null, settingsOpen: true, coverageAutoRefine: true, coverageProtectFraming: false, coverageFramingRoom: 20,
    model: "Nano Banana 2.1", resolution: "2K", quality: "high", upscaleFactor: 2,
    resultItems: [], resultUrl: "", resultType: "image", selectedResultIndex: 0, status: "ready", error: "" };
}

export function coverageShotItem(shot) {
  const version = shot?.versions?.find(item => item.id === shot.versionId) || shot?.versions?.[0];
  return version?.url ? { ...version, versionId: version.id, type: "image", label: shot.label, shotId: shot.id, sourceUrl: shot.originalUrl,
    coveragePassId: shot.passId, frameTime: shot.frameTime, requestedCamera: shot.requestedCamera } : null;
}

export function coverageLensSource(shot) {
  if (!shot?.originalUrl) return null;
  const versions = shot.versions || [];
  const isLens = version => version.kind === "lens" || Boolean(version.lens);
  const firstLens = versions.findIndex(isLens);
  const clean = (version, visited = new Set()) => {
    if (isLens(version) || visited.has(version)) return false;
    if (version.url === shot.originalUrl) return true;
    visited.add(version);
    // Follow raw version ancestry; display items use sourceUrl for the original capture.
    const parent = versions.find(v => version.sourceVersionId && v.id === version.sourceVersionId)
      || versions.find(v => version.sourceUrl && v.url === version.sourceUrl);
    if (parent) return clean(parent, visited);
    if (version.sourceUrl === shot.originalUrl) return true;
    if (version.sourceVersionId || version.sourceUrl) return false;
    // Older refinements had no lineage. Only trust these before any lens edit existed.
    return firstLens < 0 || versions.indexOf(version) < firstLens;
  };
  const base = versions.find(v => v.url && v.kind === "refine" && clean(v))
    || versions.find(v => v.url === shot.originalUrl && !isLens(v))
    || { id: "", url: shot.originalUrl, kind: "original", label: "Original" };
  return coverageShotItem({ ...shot, versions: [base], versionId: base.id });
}

export function coverageOutputPatch(shots, selectedId) {
  const selectedShot = shots.find(shot => shot.id === selectedId) || shots[0];
  const selected = coverageShotItem(selectedShot);
  const resultItems = shots.flatMap(shot => shot.versions.map(version => ({
    ...coverageShotItem({ ...shot, versionId: version.id }),
    label: shot.versions.length > 1 ? `${shot.label} - ${version.label || version.kind || "Version"}` : shot.label
  })));
  const selectedResultIndex = Math.max(0, resultItems.findIndex(item => item.shotId === selected?.shotId && item.versionId === selected?.versionId));
  return { coverageShots: shots, coverageShotId: resultItems[selectedResultIndex]?.shotId || "", resultItems, selectedResultIndex,
    resultUrl: resultItems[selectedResultIndex]?.url || "", resultType: "image" };
}

export function selectCoverageVersion(data, shotId, versionId) {
  return { ...coverageOutputPatch(data.coverageShots.map(shot => shot.id === shotId && shot.versions.some(v => v.id === versionId)
    ? { ...shot, versionId } : shot), shotId), coverageView: "shot" };
}

export function coverageRefineRatio(shot, ratios, item = coverageShotItem(shot)) {
  const original = shot?.versions?.find(v => v.url === shot.originalUrl);
  const target = (item?.width || original?.width || 16) / (item?.height || original?.height || 9);
  return ratios.filter(r => /^\d+:\d+$/.test(r)).sort((a, b) => {
    const ratio = r => { const [w, h] = r.split(":").map(Number); return w / h; };
    return Math.abs(Math.log(ratio(a) / target)) - Math.abs(Math.log(ratio(b) / target));
  })[0] || "16:9";
}

export function normalizeCameraCoverageData(raw = {}) {
  const defaults = cameraCoverageDefaults();
  const pathMode = raw.coveragePathMode === "travel" || (!raw.coveragePathMode && coveragePresetPathMode(raw.coveragePreset) === "travel") ? "travel" : "orbit";
  let poses = Array.isArray(raw.coveragePoses) && raw.coveragePoses.length >= 2 ? raw.coveragePoses.slice(0, pathMode === "travel" ? 4 : 8).map(p => ({
    azimuth: number(p?.azimuth, -180, 180, 0), elevation: number(p?.elevation, -30, 60, 0), distance: number(p?.distance, 0.4, 2, 1)
  })) : newCoveragePoses(pathMode === "travel" ? "Slide Coverage" : "Coverage");
  if (pathMode === "travel") poses = poses.map(p => {
    const xyz = coverageTravelPosition(p);
    return coverageTravelPose(Object.fromEntries(Object.entries(coverageTravelLimits).map(([key, [min, max]]) => [key, number(xyz[key], min, max, key === "dolly" ? 1 : 0)])));
  });
  poses[0] = pose(0);
  const shots = (Array.isArray(raw.coverageShots) ? raw.coverageShots : []).filter(s => s?.id && s.originalUrl && Array.isArray(s.versions)).map(s => ({
    ...s, ...(s.lensTarget != null || s.lensFraming != null ? coverageLensSettings(s) : {}),
    label: String(s.label ?? "Shot").slice(0, 120), versions: s.versions.filter(v => v?.id && v.url)
  })).filter(s => s.versions.length);
  return { ...defaults, ...raw, ...coverageJobState(raw), coveragePathMode: pathMode, coveragePoses: poses,
    title: typeof raw.title !== "string" || !raw.title.trim() ? "ReFrame"
      : /^Camera Coverage(?: \d+)?(?: Copy)*$/.test(raw.title) ? raw.title.replace(/^Camera Coverage/, "ReFrame") : raw.title,
    coverageProtectFraming: raw.coverageProtectFraming === true, coverageFramingRoom: Math.round(number(raw.coverageFramingRoom, 0, 40, 20)),
    coverageDuration: Math.round(number(raw.coverageDuration, 5, 15, 10)),
    coverageResolution: ["480P", "768P", "1080P"].includes(raw.coverageResolution) ? raw.coverageResolution : "768P",
    coveragePreset: Object.hasOwn(cameraCoveragePresets, raw.coveragePreset) && coveragePresetPathMode(raw.coveragePreset) === pathMode ? raw.coveragePreset
      : raw.coveragePreset ? pathMode === "travel" ? "Custom Travel" : "Custom" : pathMode === "travel" ? "Slide Coverage" : "Coverage",
    coveragePasses: (Array.isArray(raw.coveragePasses) ? raw.coveragePasses : []).filter(p => p?.id && p.url),
    ...coverageOutputPatch(shots, raw.coverageShotId) };
}

export const coverageInterruptedRefinement = "Refinement was interrupted. Check History and the provider before running it again; no request was replayed.";
export const coverageInterruptedLensEdit = "Lens change was interrupted. Check History and the provider before running it again; no request was replayed.";

export function coverageJobState(data, interrupted = false) {
  const jobs = (Array.isArray(data.coverageShotJobs) ? data.coverageShotJobs : []).filter(j => j?.id && j.shotId && ["refine", "lens", "upscale"].includes(j.kind));
  const legacy = [data.coverageJob?.kind === "upscale" ? data.coverageJob : null,
    data.coverageEnhancing ? { ...data.coverageEnhancing, kind: "refine", status: "interrupted", error: coverageInterruptedRefinement } : null];
  for (const job of legacy) if (job && !jobs.some(j => j.id === job.id)) jobs.push(job);
  const recover = job => {
    if (!job || !interrupted) return job;
    if (isCoverageImageJob(job) && !["failed", "interrupted"].includes(job.status)) return { ...job, status: "interrupted", error: job.kind === "lens" ? coverageInterruptedLensEdit : coverageInterruptedRefinement };
    if (job.status === "submitting") return { ...job, status: "uncertain", error: "Submission was interrupted. Check the existing request and provider History before starting another; no request was replayed." };
    return job;
  };
  return { coverageJob: recover(data.coverageJob?.kind === "upscale" ? null : data.coverageJob || null), coverageEnhancing: null,
    coverageShotJobs: jobs.map(recover) };
}

export function coverageTrajectory(poses, pathMode = "orbit") {
  if (!["orbit", "travel"].includes(pathMode)) throw new Error("Choose Orbit or Straight Travel camera movement.");
  if (!Array.isArray(poses) || poses.length < 2 || poses.length > 8) throw new Error("Use between two and eight camera positions.");
  if (pathMode === "travel" && poses.length > 4) throw new Error("Straight Travel supports up to four positions per pass.");
  poses.forEach((p, i) => {
    for (const [field, min, max] of [["azimuth", -180, 180], ["elevation", -30, 60], ["distance", 0.4, 2]]) {
      if (typeof p?.[field] !== "number" || !Number.isFinite(p[field]) || p[field] < min || p[field] > max) throw new Error(`Camera ${i + 1}: invalid ${field}.`);
    }
    if (pathMode === "travel") {
      const xyz = coverageTravelPosition(p);
      for (const [key, [min, max]] of Object.entries(coverageTravelLimits)) {
        if (xyz[key] < min - 1e-8 || xyz[key] > max + 1e-8) throw new Error(`Camera ${i + 1}: ${key} is outside the supported travel range.`);
      }
    }
  });
  if (poses[0].azimuth !== 0 || poses[0].elevation !== 0 || poses[0].distance !== 1) throw new Error("The first position must match the master image.");
  // Fal accepts at most 12 keyframes. Retain all requested poses, then budget holds.
  const holdCount = Math.min(poses.length, 12 - poses.length);
  const holdIndices = new Set([...new Set([0, poses.length - 1, ...poses.map((_, i) => i)])].slice(0, holdCount));
  const path = poses.flatMap((p, i) => [{ time: i / poses.length, ...p }, ...(holdIndices.has(i) ? [{ time: (i + 0.3) / poses.length, ...p }] : [])]);
  if (pathMode === "orbit") return path;
  // Sample straight XYZ segments into the provider's spherical keyframes. Spend the
  // remaining budget where spherical interpolation deviates most from a straight move.
  while (path.length < 12) {
    let candidate = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], start = coverageTravelPosition(a), end = coverageTravelPosition(b);
      const midpoint = Object.fromEntries(Object.keys(start).map(key => [key, (start[key] + end[key]) / 2]));
      const curved = coverageTravelPosition(pose((a.azimuth + b.azimuth) / 2, (a.elevation + b.elevation) / 2, (a.distance + b.distance) / 2));
      const error = Math.hypot(...Object.keys(start).map(key => curved[key] - midpoint[key]));
      if (error > 1e-8 && (!candidate || error > candidate.error)) candidate = { i, error, point: { time: (a.time + b.time) / 2, ...coverageTravelPose(midpoint) } };
    }
    if (!candidate) break;
    path.splice(candidate.i, 0, candidate.point);
  }
  return path;
}

export function validateCoverageRequest(body) {
  if (!managedUrl(body?.sourceUrl)) throw new Error("Choose a master image uploaded or generated in NewtNode.");
  if (!["pass", "upscale"].includes(body.kind)) throw new Error("Unknown ReFrame operation.");
  if (body.kind === "upscale") {
    if (![2, 4].includes(body.upscaleFactor)) throw new Error("Choose 2x or 4x upscaling.");
    return { kind: "upscale", sourceUrl: body.sourceUrl, upscaleFactor: body.upscaleFactor };
  }
  if (!Number.isInteger(body.duration) || body.duration < 5 || body.duration > 15) throw new Error("Choose a pass length between 5 and 15 seconds.");
  if (!["480P", "768P", "1080P"].includes(body.resolution)) throw new Error("Choose 480p, 768p or 1080p.");
  const pathMode = body.pathMode ?? "orbit";
  if (body.protectFraming != null && typeof body.protectFraming !== "boolean") throw new Error("Protect Framing must be on or off.");
  const protectFraming = body.protectFraming === true, framingRoom = body.framingRoom ?? 20;
  if (protectFraming && (!Number.isInteger(framingRoom) || framingRoom < 0 || framingRoom > 40)) throw new Error("Choose Extra Room between 0 and 40 percent.");
  const originalTrajectory = coverageTrajectory(body.poses, pathMode);
  const effectivePoses = coverageFramingPoses(body.poses, pathMode, protectFraming, framingRoom);
  const trajectory = protectFraming ? coverageTrajectory(effectivePoses, pathMode) : originalTrajectory;
  return { kind: "pass", sourceUrl: body.sourceUrl, duration: body.duration, resolution: body.resolution, poses: body.poses,
    ...(pathMode === "travel" ? { pathMode } : {}), ...(protectFraming ? { protectFraming, framingRoom, effectivePoses } : {}),
    trajectory, label: String(body.label || "Coverage").slice(0, 120) };
}

export function coverageProviderInput(request, imageUrl) {
  if (request.kind === "upscale") return { image_url: imageUrl, model: "High Fidelity V2", upscale_factor: request.upscaleFactor,
    output_format: "png", crop_to_fill: false, face_enhancement: false, subject_detection: "All", enable_safety_checker: true };
  const travelPrompt = request.pathMode === "travel" ? " Follow the sampled straight-line camera translations between holds, not a constant-radius orbit. Lateral movement is a sideways camera slide; height changes are physical boom movement; depth changes are a dolly, not a zoom. Keep aiming toward the same scene center as the supplied angles change. Subjects stay fixed; do not slide or rotate the scene to simulate the camera move." : "";
  const framingPrompt = request.protectFraming ? " Framing priority: preserve the visible extent of the principal subjects from the reference throughout the camera move. Use the supplied wider camera positions to leave comfortable headroom, look room and space around the subjects. Do not introduce new edge crops through a visible head, face, hands, feet or important held object, and do not let a principal subject drift out of frame. For a group, compose for the whole visible group, not only the central person. Preserve intentional existing close-up boundaries; do not invent missing body parts outside the reference. Keep all subjects fixed in world space; do not shrink, reposition or deform people or props to fit. Do not counteract the wider trajectory with a zoom or tighter digital crop." : "";
  return { image_url: imageUrl, prompt: cameraCoverageFreezePrompt + travelPrompt + framingPrompt, prompt_expansion_mode: "disabled",
    duration: request.duration, resolution: request.resolution, camera_trajectory: request.trajectory, enable_safety_checker: true };
}

export function coverageCost(duration, resolution) {
  const rate = { "480P": 0.05, "768P": 0.08, "1080P": 0.16 }[resolution];
  return { amountUsd: rate ? Number((duration * rate).toFixed(4)) : null, currency: "USD", unitRateUsd: rate || null,
    units: duration, unit: "second", mediaType: "video", estimated: true, pricingSource: "published-fal-camera-controls-2026-10-25",
    pricingBasis: "H3 Max Camera Controls published non-promotional rate; estimated from requested duration, actual charge may differ" };
}

export function coverageRequestedCamera(pass, time) {
  const path = pass?.trajectory || [];
  const normalized = Math.max(0, Math.min(1, time / (pass?.requestedDuration || pass?.duration || 1)));
  const after = path.findIndex(p => p.time > normalized);
  if (after <= 0) return { ...(after < 0 ? path.at(-1) : path[0]), approximate: true };
  const a = path[after - 1], b = path[after], ratio = (normalized - a.time) / (b.time - a.time);
  return { azimuth: a.azimuth + (b.azimuth - a.azimuth) * ratio, elevation: a.elevation + (b.elevation - a.elevation) * ratio,
    distance: a.distance + (b.distance - a.distance) * ratio, approximate: true };
}

export function applyCoverageVersion(data, shotId, version, expectedVersionId) {
  const shots = data.coverageShots.map(shot => shot.id === shotId && !shot.versions.some(item => item.id === version.id)
    ? { ...shot, versions: [...shot.versions, version], versionId: !expectedVersionId || shot.versionId === expectedVersionId ? version.id : shot.versionId } : shot);
  return coverageOutputPatch(shots, data.coverageShotId);
}
