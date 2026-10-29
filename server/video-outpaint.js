import { normalizeVideoOutpaintSettings, planVideoOutpaint, videoOutpaintFingerprint } from "../src/videoOutpaint.js";
import { overlapBlendFilters } from "./outpaint-boundary.js";
import { suppliedCanvasGeometry, suppliedCanvasRatio } from "./outpaint-supplied-canvas.js";
import { alignOutpaintTiming } from "./outpaint-timing.js";
import { inspectOutpaintMotion } from "./outpaint-motion.js";

export function createVideoOutpaintService({ resolveAsset, probeVideo, createTarget, runFfmpeg, statFile, reportProgress = () => {} }) {
  async function prepare(body, sourceUrl, timing = {}) {
    const originalSourceUrl = sourceUrl;
    if (body.canvasVideoUrl) sourceUrl = body.canvasVideoUrl;
    if (!sourceUrl) throw new Error("Connect a source video before preparing outpainting.");
    const asset = await resolveAsset(sourceUrl);
    const metadata = await probeVideo(asset.filePath);
    const plan = planVideoOutpaint(metadata, body.canvasVideoUrl ? { ...body.videoOutpaint, frame: null, aspectRatio: suppliedCanvasRatio(metadata) } : body.videoOutpaint);
    if (body.canvasVideoUrl) {
      const detected = await runFfmpeg(["-hide_banner", "-ss", String(plan.settings.start), "-i", asset.filePath, "-t", String(Math.min(plan.settings.duration, metadata.duration - plan.settings.start)), "-vf", "cropdetect=limit=24:round=2:reset=1:skip=0", "-an", "-f", "null", "-"], "Detect supplied canvas picture", 120000);
      Object.assign(plan, suppliedCanvasGeometry(metadata, plan, detected.stderr), { suppliedCanvas: true });
    }
    if (plan.tailPadded && Number.isInteger(timing.prerollFrames) && timing.prerollFrames >= 0) {
      plan.prerollFrames = timing.prerollFrames;
      plan.frames = Math.max(4 * plan.fps, plan.prerollFrames + plan.outputFrames + Math.ceil(0.5 * plan.fps));
      // Retained raw media must use its original submission clock, not today's
      // frame-grid preparation policy.
      if (Number.isInteger(timing.frames) && timing.frames >= plan.prerollFrames + plan.outputFrames) plan.frames = timing.frames;
      plan.duration = plan.frames / plan.fps;
      plan.loopFrames = plan.frames; plan.loopDuration = plan.duration;
    }
    const { width, height, sourceWidth, sourceHeight, left, top, fps, frames, settings } = plan;
    const padded = await createTarget(body, "outpaint-source", ".mp4", true);
    const maskIsImage = settings.model === "seedance-2.5";
    const mask = await createTarget(body, "outpaint-mask", maskIsImage ? ".png" : ".mp4", true);
    const poster = await createTarget(body, "outpaint-canvas", ".png", true);
    const crop = plan.sourceCrop;
    const cropFilter = crop ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},` : "";
    const encode = ["-an", "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
    let preparedSource = asset.filePath;
    let sourceStart = settings.start;
    let loopedSourceUrl;
    if (plan.looped) {
      const segment = await createTarget(body, "outpaint-loop-segment", ".mp4", true);
      const loopedSource = await createTarget(body, "outpaint-loop-source", ".mp4", true);
      const withAudio = ["-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"];
      await runFfmpeg(["-y", "-ss", String(settings.start), "-i", asset.filePath, "-map", "0:v:0", "-map", "0:a?", "-vf", `fps=${fps},setsar=1`, "-af", `apad,atrim=duration=${plan.loopDuration},asetpts=PTS-STARTPTS`, "-t", String(plan.loopDuration), "-frames:v", String(plan.loopFrames), ...withAudio, segment.filePath], "Prepare short outpaint segment", 120000);
      await runFfmpeg(["-y", "-i", segment.filePath, "-map", "0:v:0", "-map", "0:a?", "-vf", `loop=loop=-1:size=${plan.loopFrames}:start=0,setpts=N/(${fps}*TB)`, "-af", `aresample=48000,apad,atrim=duration=${plan.loopDuration},aloop=loop=-1:size=${Math.round(plan.loopDuration * 48000)},asetpts=N/SR/TB`, "-t", String(plan.duration), "-frames:v", String(frames), ...withAudio, loopedSource.filePath], "Loop short outpaint source", 120000);
      preparedSource = loopedSource.filePath;
      sourceStart = 0;
      loopedSourceUrl = loopedSource.publicPath;
    }
    const temporalPad = plan.tailPadded ? `trim=end_frame=${plan.outputFrames},setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=${(plan.prerollFrames || 0) / fps}:stop_mode=clone:stop_duration=${plan.duration},` : "";
    await runFfmpeg(["-y", "-ss", String(sourceStart), "-i", preparedSource, "-vf", `fps=${fps},${temporalPad}${cropFilter}scale=${sourceWidth}:${sourceHeight},setsar=1,pad=${width}:${height}:${left}:${top}:black`, "-frames:v", String(frames), ...encode, padded.filePath], "Prepare outpaint source", 120000);
    if (settings.model === "seedance-2.5" && (await statFile(padded.filePath)).size > 200 * 1024 * 1024) throw new Error("The full-resolution Seedance canvas exceeds the provider's 200 MB input limit. Choose a shorter source segment before generating.");
    // Reserve real generated pixels beneath the inward source-edge feather.
    const overlap = settings.restoreSource ? Math.ceil(settings.feather * width / plan.outputWidth) : 0;
    const ml = left > 0 ? Math.min(overlap, Math.floor(sourceWidth / 2) - 1) : 0;
    const mr = left + sourceWidth < width ? Math.min(overlap, Math.floor(sourceWidth / 2) - 1) : 0;
    const mt = top > 0 ? Math.min(overlap, Math.floor(sourceHeight / 2) - 1) : 0;
    const mb = top + sourceHeight < height ? Math.min(overlap, Math.floor(sourceHeight / 2) - 1) : 0;
    let generationVideo;
    if (maskIsImage && ml + mr + mt + mb > 0) {
      plan.generationOverlap = { left: ml, right: mr, top: mt, bottom: mb };
      plan.generationContentRect = { x: left + ml, y: top + mt, width: sourceWidth - ml - mr, height: sourceHeight - mt - mb };
      generationVideo = await createTarget(body, "outpaint-generation-canvas", ".mp4", true);
      const bands = [
        ml && `drawbox=x=${left}:y=${top}:w=${ml}:h=${sourceHeight}:color=black:t=fill`,
        mr && `drawbox=x=${left + sourceWidth - mr}:y=${top}:w=${mr}:h=${sourceHeight}:color=black:t=fill`,
        mt && `drawbox=x=${left}:y=${top}:w=${sourceWidth}:h=${mt}:color=black:t=fill`,
        mb && `drawbox=x=${left}:y=${top + sourceHeight - mb}:w=${sourceWidth}:h=${mb}:color=black:t=fill`
      ].filter(Boolean);
      await runFfmpeg(["-y", "-i", padded.filePath, "-vf", bands.join(","), "-frames:v", String(frames), ...encode, generationVideo.filePath], "Prepare inward generation overlap", 120000);
      if ((await statFile(generationVideo.filePath)).size > 200 * 1024 * 1024) throw new Error("The generation canvas exceeds the provider's 200 MB input limit. Choose a shorter source segment.");
    }
    await runFfmpeg(["-y", "-f", "lavfi", "-i", `color=white:s=${width}x${height}:r=${fps}`, "-vf", `drawbox=x=${left + ml}:y=${top + mt}:w=${sourceWidth - ml - mr}:h=${sourceHeight - mt - mb}:color=black:t=fill`, "-frames:v", maskIsImage ? "1" : String(frames), ...(maskIsImage ? [] : [...encode, "-crf", "0"]), mask.filePath], "Prepare local outpaint mask", 120000);
    let analysisMask;
    if (!maskIsImage) {
      // VACE's preprocessed input uses neutral gray for unknown pixels, including
      // the inward overlap. Keep the original canvas for analysis/restoration.
      generationVideo = await createTarget(body, "outpaint-vace-conditioning", ".mp4", true);
      const cx = left + ml, cy = top + mt, cw = sourceWidth - ml - mr, ch = sourceHeight - mt - mb;
      const regions = [[0, 0, width, cy], [0, cy + ch, width, height - cy - ch], [0, cy, cx, ch], [cx + cw, cy, width - cx - cw, ch]];
      const bands = regions.filter(([, , w, h]) => w > 0 && h > 0).map(([x, y, w, h]) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x7f7f7f:t=fill`);
      await runFfmpeg(["-y", "-i", padded.filePath, "-vf", bands.join(",") || "null", "-frames:v", String(frames), ...encode, generationVideo.filePath], "Prepare VACE neutral-gray conditioning", 120000);
      analysisMask = await createTarget(body, "outpaint-analysis-mask", ".png", true);
      await runFfmpeg(["-y", "-i", mask.filePath, "-frames:v", "1", analysisMask.filePath], "Prepare VACE analysis mask", 30000);
    }
    await runFfmpeg(["-y", "-i", generationVideo?.filePath || padded.filePath, "-frames:v", "1", poster.filePath], "Preview outpaint canvas", 30000);
    return { sourceUrl, ...(body.canvasVideoUrl ? { canvasVideoUrl: body.canvasVideoUrl } : {}), ...(loopedSourceUrl ? { loopedSourceUrl } : {}), videoUrl: padded.publicPath, ...(generationVideo ? { generationVideoUrl: generationVideo.publicPath } : {}), ...(maskIsImage ? { maskImageUrl: mask.publicPath } : { maskVideoUrl: mask.publicPath, maskImageUrl: analysisMask.publicPath }), previewUrl: poster.publicPath, fingerprint: videoOutpaintFingerprint(originalSourceUrl || "", body.videoOutpaint, body.canvasVideoUrl), plan };
  }
  async function finish(body, prepared, generated) {
    reportProgress("Finish: Blending the original source overlap…");
    const submissionPlan = prepared.plan;
    const plan = submissionPlan.tailPadded ? { ...submissionPlan, frames: submissionPlan.outputFrames, duration: submissionPlan.outputDuration } : submissionPlan;
    const settings = normalizeVideoOutpaintSettings(plan.settings);
    const native = await probeVideo(generated.filePath);
    const seedance = settings.model === "seedance-2.5";
    let preroll = (plan.prerollFrames || 0) / plan.fps;
    let temporalAlignment = { applied: false, offsetFrames: 0 };
    let motionValidation;
    if (seedance && submissionPlan.tailPadded && settings.restoreSource && prepared.videoUrl) {
      const reference = await resolveAsset(prepared.videoUrl);
      temporalAlignment = await alignOutpaintTiming({ referencePath: reference.filePath, generatedPath: generated.filePath, plan: submissionPlan, runFfmpeg });
      preroll += temporalAlignment.offsetFrames / plan.fps;
      reportProgress("Finish: Checking source motion and boundary correspondence in every frame…");
      motionValidation = await inspectOutpaintMotion({ referencePath: reference.filePath, generatedPath: generated.filePath, plan: submissionPlan, offset: temporalAlignment.offsetFrames, runFfmpeg });
    }
    if (!Number.isFinite(Number(native.duration)) || (submissionPlan.tailPadded ? Number(native.duration) + 0.5 / plan.fps < preroll + plan.duration : Math.abs(Number(native.duration) - plan.duration) > (seedance ? 0.35 : 0.15))) throw new Error("Generated timing does not cover the source segment; the raw result was kept instead of freezing or repeating delivery frames.");
    if (seedance && Math.abs(Number(native.width) / Number(native.height) - plan.width / plan.height) > 0.02) throw new Error("Seedance changed the canvas aspect ratio; the raw result was kept for review.");
    const source = await resolveAsset(prepared.loopedSourceUrl || prepared.sourceUrl);
    const sourceStart = prepared.loopedSourceUrl ? 0 : settings.start;
    // Rejected candidates are dependencies, never the requested export target.
    const motionRejected = motionValidation?.status === "needs_review";
    const target = await createTarget(body, motionRejected ? "outpaint-motion-candidate" : "video-outpaint", ".mov", motionRejected);
    const { outputWidth: w, outputHeight: h } = plan;
    const sw = Math.round(plan.sourceWidth / plan.width * w / 2) * 2;
    const sh = Math.round(plan.sourceHeight / plan.height * h / 2) * 2;
    const x = Math.round(plan.left / plan.width * w), y = Math.round(plan.top / plan.height * h);
    const overlapWidth = Math.max(0, Math.min(settings.feather, Math.floor(sw / 2) - 1, Math.floor(sh / 2) - 1));
    const feather = settings.restoreSource && plan.needsOutpaint ? overlapWidth : 0;
    const crop = plan.sourceCrop;
    const cropFilter = crop ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},` : "";
    const filters = [`[0:v]fps=${plan.fps},${seedance && !submissionPlan.tailPadded ? "tpad=stop_mode=clone:stop_duration=0.35," : ""}scale=${w}:${h},setsar=1,setpts=PTS-STARTPTS[bg]`];
    if (settings.restoreSource) {
      // Decode the original plate, never the black padded conditioning canvas.
      filters.push(`[1:v]fps=${plan.fps},${cropFilter}scale=${sw}:${sh},setsar=1,setpts=PTS-STARTPTS[source]`);
      filters.push(...overlapBlendFilters({ w, h, sw, sh, x, y, feather }));
    }
    await runFfmpeg(["-y", ...(preroll ? ["-ss", String(preroll)] : []), "-i", generated.filePath, "-ss", String(sourceStart), "-i", source.filePath, "-filter_complex", filters.join(";"), "-map", settings.restoreSource ? "[out]" : "[bg]", "-map", "1:a?", "-t", String(plan.duration), "-frames:v", String(plan.frames), "-c:v", "prores_ks", "-profile:v", "5", "-pix_fmt", "yuv444p10le", "-c:a", "pcm_s24le", "-movflags", "+faststart", target.filePath], "Blend source overlap and finish video outpaint", 600000);
    const stat = await statFile(target.filePath);
    const warning = motionValidation?.status === "needs_review" ? `Outpaint needs review: ${motionValidation.flaggedFrames} frames may not match the source motion; ${motionValidation.coverage?.missingFillFrames || 0} frames have possible unfilled outer bands. Inspect the candidate before delivery. The paid raw result is also retained.` : "";
    return { ...target, bytes: stat.size, outputFormat: "ProRes 4444 XQ MOV (10-bit processing)", mimeType: "video/quicktime", warning,
      matching: { finishVersion: 3, requested: false, applied: false, temporalAlignment, motionValidation, localApplied: feather > 0, blendWidth: feather, colorFalloffWidth: 0, overlapLimit: overlapWidth, registration: { applied: false },
        method: "Smooth inward source overlap; generated background outside the original rectangle is unchanged",
        sourcePolicy: settings.restoreSource ? "Original core is fully opaque. Only the authorized inward edge overlap mixes generated pixels; delivery scaling and ProRes encoding still apply." : "Source restoration is disabled." },
      qc: { status: "off", flags: [], segments: [] } };

  }
  return { prepare, finish };
}
