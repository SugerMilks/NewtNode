import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { File } from "node:buffer";
import { MY_NEWT_VOICE_MAX_BYTES, MY_NEWT_VOICE_MAX_SECONDS, MY_NEWT_VOICE_MODEL, myNewtVoiceCost } from "../src/myNewt/voiceConfig.js";

export const voiceMimeTypes = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg"]);

export function createMyNewtVoiceTranscriber({ runFfmpeg, probeVideo, request = fetch }) {
  return async ({ audio, key, signal }) => {
    if (!key) throw new Error("Enable an OpenAI API key in Settings to use voice commands.");
    if (!audio?.buffer?.length || audio.buffer.length > MY_NEWT_VOICE_MAX_BYTES || !voiceMimeTypes.has(audio.mimetype?.split(";")[0])) {
      throw new Error("Please provide a microphone recording under 8 MB.");
    }
    signal?.throwIfAborted();
    const directory = await mkdtemp(path.join(tmpdir(), "newt-voice-"));
    try {
      const source = path.join(directory, "recording");
      const output = path.join(directory, "speech.mp3");
      await writeFile(source, audio.buffer, { mode: 0o600 });
      try {
        // Browser WebM often has no duration; measure the bounded, decoded audio instead.
        await runFfmpeg(["-y", "-protocol_whitelist", "file,pipe", "-i", source, "-t", String(MY_NEWT_VOICE_MAX_SECONDS + 1), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", output], "Voice recording", 30000);
      } catch { throw new Error("Could not read this microphone recording. Please record it again."); }
      signal?.throwIfAborted();
      const { duration } = await probeVideo(output);
      if (!Number.isFinite(duration) || duration < 0.3) throw new Error("No audio was recorded. Hold the microphone while speaking.");
      if (duration > MY_NEWT_VOICE_MAX_SECONDS + 0.5) throw new Error("Voice notes must be two minutes or less.");
      const form = new FormData();
      form.append("model", MY_NEWT_VOICE_MODEL);
      form.append("file", new File([await readFile(output)], "speech.mp3", { type: "audio/mpeg" }));
      const response = await request("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(120000)])
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = typeof data?.error?.message === "string" && !data.error.message.includes("<") ? data.error.message.slice(0, 500) : `HTTP ${response.status}`;
        throw new Error(`OpenAI voice transcription failed: ${detail}`);
      }
      if (typeof data?.text !== "string") throw new Error("OpenAI did not return a transcript. Please try again.");
      return { text: data.text.trim(), durationSeconds: duration, amountUsd: myNewtVoiceCost(duration) };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}
