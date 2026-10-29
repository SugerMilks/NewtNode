import React from "react";
import { cameraCoverageApi, nodeApi } from "../api/newtApi.js";
import { runImageModelGeneration } from "../nodeRunners/mediaModels.js";
import { appendWorkflowContextFormFields, workflowContextPayload } from "../workflowContext.js";
import { normalizeCameraCoverageData, coverageOutputPatch, coverageRequestedCamera, applyCoverageVersion, coverageShotItem, cameraCoverageRefinePrompt, coverageRefineRatio, coverageJobState,
  coverageLensSettings, coverageLensSource, coverageLensPrompt, coverageLensFramings, coverageLensLabel, isCoverageImageJob } from "../cameraCoverage.js";

const selection = data => [data.coverageView, data.coveragePassId, data.coverageShotId,
  data.coverageShots.find(s => s.id === data.coverageShotId)?.versionId].join(":");

export function useCameraCoverage({ node, onUpdate, workflowContext, refineOptions, api = cameraCoverageApi, refine = runImageModelGeneration }) {
  const data = normalizeCameraCoverageData(node.data);
  const latest = React.useRef({ data, node, onUpdate, workflowContext, refineOptions });
  latest.current = { data, node, onUpdate, workflowContext, refineOptions };
  const mounted = React.useRef(true), operations = React.useRef(new Set()), checking = React.useRef(new Set());
  const [working, setWorking] = React.useState({});
  const update = patch => {
    if (!mounted.current) return;
    const state = latest.current;
    latest.current = { ...state, data: { ...state.data, ...patch } };
    state.onUpdate(state.node.id, patch);
  };
  React.useEffect(() => {
    mounted.current = true;
    // Image edits have no recoverable receipt. Reopening must never replay them.
    update(coverageJobState(latest.current.data, true));
    return () => { mounted.current = false; };
  }, []);
  const context = state => ({ ...workflowContextPayload(state.workflowContext), nodeId: state.node.id, nodeTitle: state.node.data.title });
  const findJob = id => [latest.current.data.coverageJob, ...latest.current.data.coverageShotJobs].find(j => j?.id === id);
  const jobPatch = (link, next) => link.kind === "pass" ? { coverageJob: next }
    : { coverageShotJobs: next ? [...latest.current.data.coverageShotJobs.filter(j => j.id !== link.id), next]
      : latest.current.data.coverageShotJobs.filter(j => j.id !== link.id) };
  const accept = (reply, link) => {
    const current = latest.current.data;
    if (!mounted.current || !findJob(link.id)) return;
    if (reply.status === "complete" && reply.result?.url) {
      if (link.kind === "pass") {
        const pass = { ...reply.result, id: link.id, requestId: reply.requestId, label: reply.label || "Coverage", sourceUrl: reply.sourceUrl,
          createdAt: reply.createdAt, trajectory: reply.trajectory, pathMode: reply.pathMode || "orbit", protectFraming: reply.protectFraming === true,
          framingRoom: reply.framingRoom, requestedDuration: reply.duration, cost: reply.cost };
        update({ coveragePasses: current.coveragePasses.some(p => p.id === pass.id) ? current.coveragePasses : [...current.coveragePasses, pass],
          coveragePassId: current.coveragePassId || pass.id, coverageReadyPassId: pass.id, coverageJob: null, status: "complete" });
      } else {
        const source = current.coverageShots.find(s => s.id === link.shotId)?.versions.find(v => v.id === link.sourceVersionId);
        update({ ...applyCoverageVersion(current, link.shotId, { ...reply.result, id: link.id, label: `${link.factor}x Upscale`,
          kind: "upscale", cost: reply.cost, sourceUrl: reply.sourceUrl, sourceVersionId: link.sourceVersionId,
          ...(source?.lens ? { lens: source.lens } : {}) }, link.sourceVersionId), ...jobPatch(link, null), status: "complete" });
      }
    } else update(jobPatch(link, { ...link, status: reply.status, requestId: reply.requestId, error: reply.error || "" }));
  };
  const check = async id => {
    const link = findJob(id);
    if (!link || isCoverageImageJob(link) || checking.current.has(id)) return;
    checking.current.add(id);
    try { accept(await api.job(id), link); }
    catch (e) { const current = findJob(id); if (current) update(jobPatch(current, { ...current, error: `${e.message} Your saved shots are unchanged.` })); }
    finally { checking.current.delete(id); }
  };
  React.useEffect(() => {
    // Recovery only reads saved receipts; pass and upscale receipts are independent.
    const timer = setInterval(() => {
      const current = latest.current.data;
      for (const job of [current.coverageJob, ...current.coverageShotJobs]) {
        if (job && !isCoverageImageJob(job) && !["submitting", "uncertain", "failed"].includes(job.status)) void check(job.id);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [api]);

  const perform = async (name, action) => {
    if (!mounted.current || operations.current.has(name)) return;
    operations.current.add(name); setWorking(w => ({ ...w, [name]: true })); update({ error: "" });
    try { return await action(); } catch (e) { update({ error: e.message }); }
    finally { operations.current.delete(name); if (mounted.current) setWorking(w => ({ ...w, [name]: false })); }
  };
  const start = async (kind, sourceUrl, shotId) => {
    const state = latest.current, current = state.data;
    if (!mounted.current || (kind === "pass" ? current.coverageJob : current.coverageShotJobs.some(j => j.shotId === shotId))) return;
    const shot = current.coverageShots.find(s => s.id === shotId);
    if (kind === "upscale" && !shot) return;
    const link = { id: crypto.randomUUID(), kind, shotId, sourceVersionId: shot?.versionId, factor: current.upscaleFactor, status: "submitting" };
    // Persist an independent intent before the paid POST. Edits now apply only to the next request.
    update(jobPatch(link, link));
    try {
      const reply = await api.start({ requestId: link.id, kind, sourceUrl, upscaleFactor: current.upscaleFactor,
        poses: current.coveragePoses, pathMode: current.coveragePathMode, duration: current.coverageDuration, resolution: current.coverageResolution,
        protectFraming: current.coverageProtectFraming, framingRoom: current.coverageFramingRoom,
        label: `${current.coveragePreset} ${current.coveragePasses.length + 1}`, ...context(state) });
      accept(reply, link);
    } catch (e) {
      if (findJob(link.id)) update(jobPatch(link, { ...link, status: e.status && e.status < 500 ? "failed" : "uncertain", error: e.message }));
    }
  };
  const capture = async (pass, time) => {
    const saved = await perform("capture", async () => {
      const settings = latest.current, initialSelection = selection(settings.data);
      const result = await api.capture({ sourceVideoUrl: pass.url, frameTime: time, ...context(settings) });
      if (!result.image?.localUrl) throw new Error("No saved frame was returned.");
      if (!mounted.current) return;
      const current = latest.current.data, id = crypto.randomUUID(), versionId = crypto.randomUUID();
      const original = { id: versionId, url: result.image.localUrl, fileName: result.image.fileName, width: result.width, height: result.height,
        label: "Original", kind: "original", type: "image", cost: result.cost };
      const shot = { id, label: `Shot ${String(current.coverageShots.length + 1).padStart(2, "0")}`, originalUrl: original.url,
        passId: pass.id, frameTime: time, pathMode: pass.pathMode || "orbit", protectFraming: pass.protectFraming === true, framingRoom: pass.framingRoom,
        requestedCamera: coverageRequestedCamera(pass, time), versions: [original], versionId };
      const followCapture = selection(current) === initialSelection;
      update({ ...coverageOutputPatch([...current.coverageShots, shot], followCapture ? id : current.coverageShotId),
        ...(followCapture ? { coverageView: "shot" } : {}) });
      return { shot, settings };
    });
    // Release the extraction lock before refinement so another frame can be captured.
    if (saved?.settings.data.coverageAutoRefine && mounted.current) {
      await runRefinement(saved.shot, coverageRefineRatio(saved.shot, saved.settings.refineOptions.ratios), saved.settings);
    }
  };
  const upload = file => perform("upload", async () => {
    const settings = latest.current, initialSelection = selection(settings.data);
    if (!file?.type?.startsWith("image/") || file.size > 32 * 1024 * 1024) throw new Error("Choose a still image no larger than 32 MB.");
    const form = new FormData(); form.append("asset", file); appendWorkflowContextFormFields(form, settings.workflowContext);
    const result = await nodeApi.uploadAsset(form);
    if (!result.response.ok || !result.data.asset?.localUrl) throw new Error(result.data.error || "Upload failed.");
    update({ masterImage: { url: result.data.asset.localUrl, label: file.name },
      ...(selection(latest.current.data) === initialSelection ? { coverageView: "master" } : {}) });
  });
  const runImageEdit = async (shot, aspectRatio, kind, state = latest.current) => {
    const current = latest.current.data;
    const currentShot = current.coverageShots.find(s => s.id === shot.id);
    if (!mounted.current || !currentShot || current.coverageShotJobs.some(j => j.shotId === shot.id)) return;
    if (!state.refineOptions.models.includes(state.data.model) || !state.refineOptions.resolutions.includes(state.data.resolution)) {
      update({ error: "Choose an enabled refinement model and supported size in Settings. Saved frames are unchanged." }); return;
    }
    const lensEdit = kind === "lens", settings = coverageLensSettings(currentShot);
    if (lensEdit && settings.lensTarget === "original") { update({ error: "Choose a target lens before changing this shot. No generation was submitted." }); return; }
    const selected = coverageShotItem(currentShot);
    const source = lensEdit ? coverageLensSource(currentShot) : selected, id = crypto.randomUUID();
    if (!source) { update({ error: "This shot has no saved source image. No generation was submitted." }); return; }
    if (lensEdit) aspectRatio = coverageRefineRatio(currentShot, state.refineOptions.ratios, source);
    const lens = lensEdit ? { targetMm: Number(settings.lensTarget), framing: settings.lensFraming, equivalent: "full-frame", approximate: true,
      projection: settings.lensTarget === "8" ? "fisheye" : "rectilinear" } : source.lens;
    const prompt = lensEdit ? coverageLensPrompt(settings.lensTarget, settings.lensFraming) : cameraCoverageRefinePrompt;
    const label = lensEdit ? `${coverageLensLabel(settings.lensTarget)} - ${coverageLensFramings[settings.lensFraming]}` : `Refined - ${state.data.model}`;
    const link = { id, kind, shotId: shot.id, sourceVersionId: source.versionId, status: "running", ...(lensEdit ? { lens } : {}) };
    update(jobPatch(link, link));
    try {
      const items = await refine({ node: { ...state.node, data: { ...state.data, aspectRatio: "Auto",
        ...(lensEdit ? { title: `${state.data.title} - ${currentShot.label} - ${label}` } : {}) } }, prompt,
        aspectRatio, imagePromptItems: [{ ...source, label: lensEdit ? "Original shot base: scene and identity reference for the requested lens change" : "Approved shot: preserve this exact viewpoint and composition" }], workflowContext: state.workflowContext, index: 0 });
      if (!items?.[0]?.url) throw new Error(`The image provider returned no ${lensEdit ? "lens-edited" : "refined"} image. The original is unchanged.`);
      if (!mounted.current || !findJob(id)) return;
      update({ ...applyCoverageVersion(latest.current.data, shot.id, { ...items[0], id, label,
        kind, sourceUrl: source.url, sourceVersionId: source.versionId, model: state.data.model,
        ...(lens ? { lens } : {}) }, selected?.versionId), ...jobPatch(link, null) });
    } catch (e) {
      if (mounted.current && findJob(id)) update(jobPatch(link, { ...link, status: "failed", error: `${e.message} Saved frames are unchanged. Check History before retrying.` }));
    }
  };
  const runRefinement = (shot, aspectRatio, state) => runImageEdit(shot, aspectRatio, "refine", state);
  const changeLens = shot => runImageEdit(shot, undefined, "lens");
  const release = id => {
    const link = findJob(id);
    if (link && (!isCoverageImageJob(link) || ["failed", "interrupted"].includes(link.status))) update(jobPatch(link, null));
  };
  return { data, update, working, start, check, capture, upload, refineShot: runRefinement, changeLens, release };
}
