import { randomUUID } from "node:crypto";
import { buildAudioRequest, estimateAudioCost } from "../../src/audioModel.js";
import { createElevenLabsClient, elevenLabsRates } from "../elevenlabs.js";

export function registerAudioModelRoutes(app, { getKey, readAudio, saveAudio, recordHistory, client = createElevenLabsClient(), getRates = elevenLabsRates }) {
  let active = 0;
  let voiceCache = null;
  const voicesForKey = async (key, refresh = false) => {
    if (!key) throw Object.assign(new Error("Add and enable an ElevenLabs API key in Settings first."), { status: 400 });
    if (!refresh && voiceCache?.key === key && Date.now() - voiceCache.time < 60000) return voiceCache.voices;
    const voices = await client.listVoices(key);
    voiceCache = { key, voices, time: Date.now() };
    return voices;
  };
  app.get("/api/elevenlabs/voices", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json({ voices: await voicesForKey(getKey(), req.query.refresh === "1"), pricing: getRates() }); }
    catch (error) { res.status(error.status || 502).json({ error: error.message }); }
  });
  app.post("/api/node/generate-audio", async (req, res) => {
    const key = getKey();
    if (!key) return res.status(400).json({ error: "Add and enable an ElevenLabs API key in Settings first." });
    if (active >= 2) return res.status(429).json({ error: "Two audio generations are already running. Wait for one to finish." });
    active += 1;
    let generated;
    try {
      const data = req.body || {};
      buildAudioRequest(data);
      let sourceAudio, durationSeconds;
      if (data.audioMode === "sts") {
        sourceAudio = await readAudio(data.sourceAudioUrl);
        durationSeconds = sourceAudio.durationSeconds;
      }
      let voice;
      if (["tts", "sts"].includes(data.audioMode)) {
        const voices = await voicesForKey(key);
        voice = voices.find((item) => item.id === data.voiceId);
        if (!voice) throw new Error("This voice is not available on the enabled ElevenLabs key. Refresh the voice list and choose a voice from that account.");
        const state = voice.fineTuning?.[buildAudioRequest(data).modelId];
        if (state && state !== "fine_tuned") throw new Error("This voice is not ready for the selected model. Choose another voice or finish its setup in ElevenLabs.");
      }
      const rates = getRates();
      generated = await client.generate({ data: { ...data, customVoiceRate: voice?.customRate === true }, key, sourceAudio, durationSeconds, rates });
      const output = await saveAudio(req, generated.buffer);
      const cost = estimateAudioCost(data, { rates, durationSeconds: data.audioMode === "sts" ? durationSeconds : output.durationSeconds, customVoiceRate: voice?.customRate === true });
      const history = {
        id: randomUUID(), createdAt: new Date().toISOString(), mediaType: "audio", provider: "ElevenLabs",
        modelName: generated.modelId, endpoint: generated.endpoint, requestId: generated.requestId,
        mode: data.audioMode, prompt: data.audioMode === "sts" ? "" : data.prompt,
        settings: { ...buildAudioRequest(data).body, outputFormat: data.outputFormat, voiceId: voice?.id, voiceName: voice?.name,
          sourceAudioUrl: data.audioMode === "sts" ? data.sourceAudioUrl : undefined, durationSeconds: output.durationSeconds,
          billedCharacters: generated.billedCharacters },
        project: { id: data.projectId || "node-workspace", name: data.projectName || data.workflowName || "Node workspace" },
        node: { id: data.nodeId, title: data.nodeTitle || "Audio Model" },
        localAudio: output.url, outputFileName: output.fileName, cost
      };
      let warning = "";
      try { await recordHistory(history); } catch { warning = "Audio saved, but this run could not be added to History."; }
      res.json({ audio: output.url, fileName: output.fileName, durationSeconds: output.durationSeconds, cost, model: generated.modelId,
        requestId: generated.requestId, createdAt: history.createdAt, warning });
    } catch (error) {
      res.status(error.status && error.status >= 400 && error.status < 600 ? error.status : 400).json({
        error: generated ? `ElevenLabs completed this generation, but NewtNode could not save it. Check ElevenLabs history before rerunning. ${error.message}` : error.message
      });
    } finally { active -= 1; }
  });
}
