export const audioModes = Object.freeze([
  { value: "tts", label: "Text to Speech" },
  { value: "sts", label: "Speech to Speech" },
  { value: "sfx", label: "Sound Effects" },
  { value: "music", label: "Music" }
]);

export const audioModels = Object.freeze({
  tts: [
    { id: "eleven_multilingual_v2", name: "Multilingual v2", maxCharacters: 10000 },
    { id: "eleven_v3", name: "Eleven v3", maxCharacters: 5000 },
    { id: "eleven_flash_v2_5", name: "Flash v2.5", maxCharacters: 40000 },
    { id: "eleven_turbo_v2_5", name: "Turbo v2.5", maxCharacters: 40000 }
  ],
  sts: [{ id: "eleven_multilingual_sts_v2", name: "Multilingual Voice Changer v2" }, { id: "eleven_english_sts_v2", name: "English Voice Changer v2" }],
  sfx: [{ id: "eleven_text_to_sound_v2", name: "Sound Effects v2" }],
  music: [{ id: "music_v1", name: "Eleven Music v1" }, { id: "music_v2", name: "Eleven Music v2" }]
});

export const audioOutputFormats = Object.freeze([
  { value: "mp3_44100_128", label: "MP3 128 kbps" },
  { value: "mp3_44100_192", label: "MP3 192 kbps" }
]);

export const audioModelDefaults = Object.freeze({
  audioMode: "tts", ttsModel: "eleven_multilingual_v2", stsModel: "eleven_multilingual_sts_v2",
  musicModel: "music_v1", prompt: "", voiceId: "", voiceName: "", voiceGroup: "Default",
  sourceAudioUrl: "", sourceAudioName: "", durationSeconds: 5, musicDurationSeconds: 30,
  autoDuration: false, loop: false, forceInstrumental: true, promptInfluence: 0.3,
  stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1, speakerBoost: true,
  removeBackgroundNoise: false, seed: "", batchCount: "1", outputFormat: "mp3_44100_128",
  settingsOpen: true, resultType: "audio"
});

const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) && value !== "" && value != null
  ? Math.min(max, Math.max(min, Number(value))) : fallback;
const choice = (value, options, fallback) => options.includes(value) ? value : fallback;

export function normalizeAudioModelData(value = {}) {
  const data = { ...audioModelDefaults, ...value };
  return {
    ...data,
    audioMode: choice(data.audioMode, audioModes.map((mode) => mode.value), "tts"),
    ttsModel: choice(data.ttsModel, audioModels.tts.map((model) => model.id), audioModelDefaults.ttsModel),
    stsModel: choice(data.stsModel, audioModels.sts.map((model) => model.id), audioModelDefaults.stsModel),
    musicModel: choice(data.musicModel, audioModels.music.map((model) => model.id), audioModelDefaults.musicModel),
    outputFormat: choice(data.outputFormat, audioOutputFormats.map((format) => format.value), audioModelDefaults.outputFormat),
    durationSeconds: bounded(data.durationSeconds, 0.5, 30, 5),
    musicDurationSeconds: Math.round(bounded(data.musicDurationSeconds, 3, 600, 30)),
    stability: bounded(data.stability, 0, 1, 0.5), similarityBoost: bounded(data.similarityBoost, 0, 1, 0.75),
    style: bounded(data.style, 0, 1, 0), speed: bounded(data.speed, 0.7, 1.2, 1),
    promptInfluence: bounded(data.promptInfluence, 0, 1, 0.3),
    ...Object.fromEntries(["autoDuration", "loop", "forceInstrumental", "speakerBoost", "removeBackgroundNoise"].map((field) => [field, data[field] === true])),
    batchCount: String(Math.round(bounded(data.batchCount, 1, 4, 1))),
    voiceId: String(data.voiceId || ""), voiceName: String(data.voiceName || ""),
    prompt: String(data.prompt || ""), sourceAudioUrl: String(data.sourceAudioUrl || ""),
    resultType: "audio"
  };
}

export function audioModelId(data) {
  return data.audioMode === "sts" ? data.stsModel : data.audioMode === "sfx" ? "eleven_text_to_sound_v2" : data.audioMode === "music" ? data.musicModel : data.ttsModel;
}

export function audioInputEnabled(mode, port) {
  return port === "audioIn" ? mode === "sts" : mode !== "sts";
}

export function buildAudioRequest(data, { prompt = data.prompt, sourceAudioUrl = data.sourceAudioUrl } = {}) {
  if (!audioModes.some((mode) => mode.value === data.audioMode)) throw new Error("Choose an audio generation mode.");
  const d = normalizeAudioModelData(data);
  const modelId = audioModelId(d);
  const text = String(prompt || "").trim();
  const voiceMode = ["tts", "sts"].includes(d.audioMode);
  if (voiceMode && !/^[a-zA-Z0-9_-]{1,128}$/.test(d.voiceId)) throw new Error("Choose an ElevenLabs voice first.");
  if (d.audioMode !== "sts" && !text) throw new Error("Add a text prompt before running the Audio Model.");
  const maxCharacters = d.audioMode === "tts" ? audioModels.tts.find((model) => model.id === modelId).maxCharacters : d.audioMode === "music" ? 4100 : 2500;
  if (d.audioMode !== "sts" && [...text].length > maxCharacters) throw new Error(`This audio model accepts up to ${maxCharacters.toLocaleString()} characters per run.`);
  if (d.audioMode === "sts" && !sourceAudioUrl) throw new Error("Connect or upload a speech recording first.");
  const hasSeed = voiceMode && data.seed !== "" && data.seed != null;
  if (hasSeed && (!Number.isInteger(Number(data.seed)) || Number(data.seed) < 0 || Number(data.seed) > 4294967295)) throw new Error("Seed must be a whole number from 0 to 4294967295, or blank for random.");
  const seed = hasSeed ? { seed: Number(data.seed) } : {};
  if (d.audioMode === "music") return {
    mode: d.audioMode, modelId, endpoint: "/v1/music", outputFormat: d.outputFormat,
    body: { prompt: text, model_id: modelId, force_instrumental: d.forceInstrumental === true, ...(!d.autoDuration ? { music_length_ms: d.musicDurationSeconds * 1000 } : {}) }
  };
  if (d.audioMode === "sfx") return {
    mode: d.audioMode, modelId, endpoint: "/v1/sound-generation", outputFormat: d.outputFormat,
    body: { text, model_id: modelId, loop: d.loop === true, prompt_influence: d.promptInfluence, ...(!d.autoDuration ? { duration_seconds: d.durationSeconds } : {}) }
  };
  const voiceSettings = modelId === "eleven_v3"
    ? { stability: d.stability < 0.25 ? 0 : d.stability > 0.75 ? 1 : 0.5 }
    : { stability: d.stability, similarity_boost: d.similarityBoost, style: d.style, use_speaker_boost: d.speakerBoost === true, ...(d.audioMode === "tts" ? { speed: d.speed } : {}) };
  return {
    mode: d.audioMode, modelId, outputFormat: d.outputFormat,
    endpoint: `/v1/${d.audioMode === "tts" ? "text-to-speech" : "speech-to-speech"}/${encodeURIComponent(d.voiceId)}`,
    ...(d.audioMode === "sts" ? { sourceAudioUrl } : {}),
    body: { model_id: modelId, voice_settings: voiceSettings, ...seed,
      ...(d.audioMode === "tts" ? { text } : { remove_background_noise: d.removeBackgroundNoise === true }) }
  };
}

// Published standard API rates, not a conversion from subscription credits.
export const elevenLabsPricing = Object.freeze({
  ttsPerThousand: 0.1, flashPerThousand: 0.05, stsPerMinute: 0.12, sfxPerMinute: 0.12, musicPerMinute: 0.15,
  pricingSource: "https://elevenlabs.io/pricing/api", checkedAt: "2026-09-08"
});

export function estimateAudioCost(data, { prompt = data.prompt, durationSeconds, rates = elevenLabsPricing, customVoiceRate = false, batchCount = 1 } = {}) {
  const d = normalizeAudioModelData(data);
  let units, rate, basis;
  if (d.audioMode === "tts") {
    units = [...String(prompt || "").trim()].length / 1000;
    rate = /flash|turbo/.test(d.ttsModel) ? rates.flashPerThousand : rates.ttsPerThousand;
    basis = "text characters / 1,000";
  } else {
    const seconds = durationSeconds ?? (d.autoDuration || d.audioMode === "sts" ? null : d.audioMode === "music" ? d.musicDurationSeconds : d.durationSeconds);
    units = seconds == null || !Number.isFinite(Number(seconds)) ? null : Math.max(0, Number(seconds)) / 60;
    rate = rates[`${d.audioMode}PerMinute`];
    basis = d.audioMode === "sts" ? "source audio minutes" : "generated audio minutes";
  }
  const count = Math.min(4, Math.max(1, Math.round(Number(batchCount) || 1)));
  const amountUsd = customVoiceRate || units == null || !Number.isFinite(rate) ? null : Number((units * rate * count).toFixed(6));
  return { amountUsd, currency: "USD", estimated: true, pricingSource: rates.pricingSource,
    pricingBasis: customVoiceRate ? "Custom voice pricing; check ElevenLabs" : `${basis}; published standard API estimate, account pricing may differ`,
    source: "ElevenLabs API estimate", ...(durationSeconds != null ? { durationSeconds } : {}) };
}

export function audioRunLabel(cost) {
  if (cost?.amountUsd == null) return "Run Audio (cost varies)";
  if (cost.amountUsd > 0 && cost.amountUsd < 0.01) return "Run Audio (<$0.01)";
  return `Run Audio (~$${cost.amountUsd.toFixed(2)})`;
}
