import { normalizeVideoOutpaintSettings, seedanceOutpaintPrompt } from "../src/videoOutpaint.js";
import { fitOutpaintPrompt, outpaintEditablePromptBudget } from "../src/outpaintPromptBudget.js";

export async function prepareSeedanceOutpaint(body, { provider, apiKey, prepare }) {
  const settings = normalizeVideoOutpaintSettings(body.videoOutpaint);
  if (body.model !== "Seedance 2.5" || settings.model !== "seedance-2.5") throw Object.assign(new Error("Seedance outpainting requires the Seedance 2.5 outpaint model."), { status: 400 });
  if (!body.canvasVideoUrl && (!Array.isArray(body.referenceVideoUrls) || body.referenceVideoUrls.length !== 1)) throw Object.assign(new Error("Connect exactly one source video or a supplied Canvas video for outpainting."), { status: 400 });
  const prepared = await prepare(body, body.referenceVideoUrls?.[0] || "");
  const prompt = String(body.prompt || "");
  if (prepared.plan.needsOutpaint) {
    // Preparation is local; validate the selected route before any provider upload.
    if (!["fal", "atlas"].includes(provider)) throw Object.assign(new Error("Seedance outpainting requires Fal or Atlas. Krea does not support this editing operation; enable Fal, or disable Krea and enable Atlas in Settings."), { status: 400 });
    if (!apiKey) throw Object.assign(new Error(`Enable the selected ${provider === "fal" ? "Fal" : "Atlas Cloud"} key for Seedance outpainting.`), { status: 400 });
    if (!prompt.trim()) throw Object.assign(new Error("Enter or draft an outpainting prompt before Run."), { status: 400 });
  }
  const referenceImageCount = (body.referenceImageUrls || []).length;
  const fittedPrompt = fitOutpaintPrompt(prompt, outpaintEditablePromptBudget(prepared.plan, settings, referenceImageCount));
  const submittedPrompt = seedanceOutpaintPrompt(fittedPrompt, false, [], settings.restoreSource ? settings.feather : 0, prepared.plan, referenceImageCount);
  // The shared Seedance adapter compacts overlong prompts. Never let it cut
  // temporal presence, geometry or overlap instructions out of an outpaint.
  return { prepared, body: {
    ...body, prompt: submittedPrompt, seedanceTask: "edit", seedanceDraft: false,
    referenceVideoUrls: [prepared.generationVideoUrl || prepared.videoUrl], referenceVideoLabels: ["Video1"],
    referenceImageUrls: body.referenceImageUrls || [],
    referenceImageLabels: (body.referenceImageUrls || []).map((_url, index) => `Image${index + 1}`),
    referenceAudioUrls: [], startFrameUrls: [], endFrameUrls: [], filmDirector: null,
    characterDialogue: null, exactDialogueAudio: false, generateAudio: false,
    resolution: settings.seedanceResolution, aspectRatio: "auto", duration: "auto",
    seed: undefined,
    outpaintUserPrompt: prompt, outpaintPromptCompacted: fittedPrompt !== prompt.trim()
  } };
}

export async function finishSeedanceOutpaint(body, prepared, rawOutput, nativeVideo, { finish, probeVideo }) {
  const details = { prepared, rawVideoUrl: rawOutput.publicPath, model: prepared.plan.settings.model, nativeWidth: nativeVideo.width, nativeHeight: nativeVideo.height, nativeDuration: nativeVideo.duration, restoredSource: false, outputFormat: "Provider original (unprocessed)" };
  try {
    const output = await finish(body, prepared, rawOutput);
    return { output, video: { ...nativeVideo, ...await probeVideo(output.filePath), ...(output.mimeType ? { mimeType: output.mimeType, content_type: output.mimeType } : {}) }, details: { ...details, outputFormat: output.outputFormat || details.outputFormat, restoredSource: prepared.plan.settings.restoreSource, matching: output.matching, qc: output.qc, warning: output.warning || "" }, warning: output.warning || "" };
  } catch (error) {
    const warning = `Outpainting finishing failed; the paid raw result was preserved: ${error.message}`;
    return { output: rawOutput, video: nativeVideo, details: { ...details, warning }, warning };
  }
}
