import { buildSmartTextPrompt, smartTextInstructions } from "../src/smartTextPrompt.js";

export async function processSmartText(request, { runTextLlm, runMediaDescriptionLlm, falTextModel, falVisionTextModel, openAiTextModel }) {
  const prompt = buildSmartTextPrompt(request);
  const options = {
    prompt,
    systemPrompt: smartTextInstructions(request.generationContext),
    falModel: request.imageInputs?.length ? falVisionTextModel : falTextModel,
    openAiModel: openAiTextModel,
    route: "smart-text"
  };
  // Read the images and edit the brief together; no lossy intermediate description or second paid pass.
  const result = request.imageInputs?.length
    ? await runMediaDescriptionLlm({ ...options, inputs: request.imageInputs, mediaType: "image" })
    : await runTextLlm(options);
  if (!String(result.text || "").trim()) throw new Error("Smart Text returned no prompt. Your previous output has been kept.");
  return {
    text: result.text.trim(), model: result.model, provider: result.provider, endpoint: result.endpoint,
    submittedPrompt: prompt, usage: result.usage || result.usages?.[0] || null,
    helperUsages: result.usages?.slice(1) || []
  };
}
