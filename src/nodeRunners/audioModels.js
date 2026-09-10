import { audioModelApi } from "../api/newtApi.js";
import { audioModelDefaults, buildAudioRequest, normalizeAudioModelData } from "../audioModel.js";

export async function runAudioModelGeneration({ node, prompt, sourceAudioUrl, workflowContext, index }) {
  const normalized = normalizeAudioModelData(node.data);
  const data = { ...Object.fromEntries(Object.keys(audioModelDefaults).map((key) => [key, normalized[key]])), prompt, sourceAudioUrl };
  buildAudioRequest(data);
  const result = await audioModelApi.generate({
    ...data, ...workflowContext, nodeId: node.id, nodeTitle: node.data.title, runIndex: index
  });
  if (!result.audio) throw new Error("ElevenLabs returned no audio.");
  return { url: result.audio, type: "audio", label: `${node.data.title || "Audio"} ${index + 1}`,
    fileName: result.fileName, mimeType: "audio/mpeg", durationSeconds: result.durationSeconds,
    cost: result.cost, createdAt: result.createdAt, warning: result.warning || "" };
}
