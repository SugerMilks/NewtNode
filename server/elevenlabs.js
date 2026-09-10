import { buildAudioRequest, estimateAudioCost, elevenLabsPricing } from "../src/audioModel.js";

const apiBase = "https://api.elevenlabs.io";
const maxAudioBytes = 64 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });

export function elevenLabsRates(env = process.env) {
  const rates = { ...elevenLabsPricing };
  for (const [field, name] of Object.entries({ ttsPerThousand: "TTS_PER_1000_CHARACTERS", flashPerThousand: "FLASH_PER_1000_CHARACTERS", stsPerMinute: "STS_PER_MINUTE", sfxPerMinute: "SFX_PER_MINUTE", musicPerMinute: "MUSIC_PER_MINUTE" })) {
    const value = env[`ELEVENLABS_${name}_USD`];
    if (value != null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) rates[field] = Number(value);
  }
  return rates;
}

export function elevenLabsError(data, status) {
  if ([401, 403].includes(status)) return "ElevenLabs rejected this key or its permissions. Enable the correct ElevenLabs key in Settings and allow Voices Read plus the requested generation feature.";
  if (status === 429) return "ElevenLabs is busy or this account has reached a usage/concurrency limit. Check your ElevenLabs account before trying again.";
  const detail = data?.detail;
  const messages = Array.isArray(detail) ? detail.map((item) => item.msg || item.message).filter(Boolean)
    : [typeof detail === "string" ? detail : detail?.message || data?.message || data?.error?.message];
  const message = messages.filter((value) => typeof value === "string" && !/<(?:!doctype|html|head|body)\b/i.test(value)).join("; ").slice(0, 900);
  return message ? `ElevenLabs: ${message}` : `ElevenLabs returned HTTP ${status}. No automatic retry was made; check the provider history before rerunning.`;
}

async function responseBytes(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw fail(502, "ElevenLabs returned an unexpectedly large response. Check its history before rerunning.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createElevenLabsClient({ fetchImpl = fetch } = {}) {
  async function request(path, key, options = {}, timeoutMs = 30000) {
    if (!key) throw fail(400, "Add and enable an ElevenLabs API key in Settings first.");
    try {
      const response = await fetchImpl(`${apiBase}${path}`, {
        ...options, headers: { ...options.headers, "xi-api-key": key }, signal: AbortSignal.timeout(timeoutMs), redirect: "error"
      });
      if (!response.ok) {
        const text = (await responseBytes(response, 1024 * 1024)).toString("utf8");
        let body;
        try { body = JSON.parse(text); } catch { body = {}; }
        throw fail(response.status, elevenLabsError(body, response.status));
      }
      return response;
    } catch (error) {
      if (error.status) throw error;
      throw fail(502, options.method === "POST"
        ? "The ElevenLabs generation connection timed out or was interrupted. It may still be billed. Check ElevenLabs history before rerunning; NewtNode did not retry it."
        : "Could not reach ElevenLabs. Check your connection and try refreshing the voice list.");
    }
  }

  async function json(path, key) {
    const response = await request(path, key);
    try { return JSON.parse((await responseBytes(response, 8 * 1024 * 1024)).toString("utf8")); }
    catch (error) { throw fail(502, error.status ? error.message : "ElevenLabs returned an invalid voice list."); }
  }

  async function listVoices(key) {
    const voices = [];
    const ids = new Set();
    for (const [type, group] of [["default", "Default"], ["non-default", "Mine"]]) {
      let token = "";
      const tokens = new Set();
      for (let page = 0; page < 30; page += 1) {
        const params = new URLSearchParams({ voice_type: type, page_size: "100", include_total_count: "false" });
        if (token) params.set("next_page_token", token);
        const data = await json(`/v2/voices?${params}`, key);
        if (!Array.isArray(data.voices)) throw fail(502, "ElevenLabs returned an invalid voice list.");
        for (const voice of data.voices) {
          if (!voice.voice_id || ids.has(voice.voice_id)) continue;
          ids.add(voice.voice_id);
          voices.push({ id: voice.voice_id, name: voice.name || voice.voice_id, group,
            previewUrl: /^https:\/\//.test(voice.preview_url || "") ? voice.preview_url : "",
            customRate: Number(voice.sharing?.rate) > 0,
            fineTuning: voice.fine_tuning?.state || {},
            category: voice.category || "" });
        }
        if (!data.has_more) break;
        token = data.next_page_token;
        if (!token || tokens.has(token) || page === 29) throw fail(502, "The ElevenLabs voice list could not be fully loaded. Please refresh it.");
        tokens.add(token);
      }
    }
    return voices.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  async function generate({ data, key, sourceAudio, durationSeconds, rates = elevenLabsPricing }) {
    const spec = buildAudioRequest(data);
    let body, headers;
    if (spec.mode === "sts") {
      if (!sourceAudio?.buffer?.length) throw fail(400, "The source speech recording could not be read.");
      if (sourceAudio.buffer.length > 50 * 1024 * 1024) throw fail(400, "Speech-to-speech accepts an audio file up to 50 MB.");
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 300) throw fail(400, "Speech-to-speech requires a valid recording no longer than 5 minutes.");
      body = new FormData();
      body.append("audio", new Blob([sourceAudio.buffer], { type: sourceAudio.mimeType || "audio/mpeg" }), sourceAudio.fileName || "speech.mp3");
      for (const [name, value] of Object.entries(spec.body)) body.append(name, typeof value === "object" ? JSON.stringify(value) : String(value));
    } else {
      body = JSON.stringify(spec.body);
      headers = { "Content-Type": "application/json" };
    }
    const response = await request(`${spec.endpoint}?output_format=${encodeURIComponent(spec.outputFormat)}`, key, { method: "POST", body, headers }, 900000);
    const contentType = response.headers.get("content-type") || "";
    if (!/^(audio\/|application\/octet-stream)/i.test(contentType)) throw fail(502, "ElevenLabs did not return an audio file. Check its history before rerunning.");
    let buffer;
    try { buffer = await responseBytes(response, maxAudioBytes); }
    catch (error) { throw fail(502, error.status ? error.message : "The ElevenLabs audio download was interrupted. Check its history before rerunning."); }
    if (!buffer.length) throw fail(502, "ElevenLabs returned an empty audio file. Check its history before rerunning.");
    const usage = response.headers.get("character-cost");
    return { buffer, endpoint: spec.endpoint, modelId: spec.modelId,
      requestId: response.headers.get("request-id") || response.headers.get("x-request-id") || "",
      billedCharacters: usage != null && Number.isFinite(Number(usage)) ? Number(usage) : null,
      cost: estimateAudioCost(data, { rates, durationSeconds, customVoiceRate: data.customVoiceRate === true }) };
  }

  return { listVoices, generate };
}
