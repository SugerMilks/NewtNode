import { buildSmartTextPrompt, smartTextInstructions, normalizeSmartTextRequest } from "../src/smartTextPrompt.js";
import { creativeFinalOutputText } from "./creative-llm.js";

export async function processSmartText(request, { runTextLlm, runMediaDescriptionLlm, falTextModel, openAiTextModel, sampleVideos }) {
  request = normalizeSmartTextRequest(request);
  const review = request.videoInputs.length ? await sampleVideos(request.videoInputs) : { frames: [], videos: [] };
  if (request.videoInputs.length && (!review.frames?.length || review.videos?.length !== request.videoInputs.length)) throw new Error("Video review did not complete. Your previous prompt has been kept.");
  const prompt = buildSmartTextPrompt(request, review.frames);
  const options = {
    prompt,
    systemPrompt: smartTextInstructions(),
    falModel: falTextModel,
    openAiModel: openAiTextModel,
    reasoningEffort: "low",
    route: "smart-text"
  };
  // Local video frames and images share one paid review/rewrite; never submit a raw video to an image-only model.
  const inputs = [...request.imageInputs, ...review.frames];
  const result = inputs.length
    ? await runMediaDescriptionLlm({ ...options, inputs, mediaType: "image" })
    : await runTextLlm(options);
  const text = creativeFinalOutputText(result.text);
  if (!text) throw new Error("Smart Text returned no prompt. Your previous output has been kept.");
  return {
    text, model: result.model, provider: result.provider, endpoint: result.endpoint,
    submittedPrompt: prompt, usage: result.usage || result.usages?.[0] || null,
    videoReview: review.videos,
    helperUsages: result.usages?.slice(1) || []
  };
}
