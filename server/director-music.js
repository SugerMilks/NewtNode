import { execFile as execFileCallback } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export function directorMusicLevelContext(samples, sampleRate = 8000) {
  const duration = samples.length / sampleRate;
  const windowSize = Math.max(1, Math.round(sampleRate / 10));
  const levels = [];
  for (let start = 0; start < samples.length; start += windowSize) {
    let sum = 0;
    const end = Math.min(samples.length, start + windowSize);
    for (let i = start; i < end; i += 1) sum += samples[i] ** 2;
    levels.push(Math.sqrt(sum / (end - start)));
  }
  const peak = Math.max(0, ...levels);
  if (peak < 0.00001) throw new Error("The connected music segment is silent. Connect an audible music clip.");
  const sections = [];
  const count = Math.min(8, levels.length);
  for (let index = 0; index < count; index += 1) {
    const from = Math.floor(index * levels.length / count);
    const to = Math.floor((index + 1) * levels.length / count);
    const mean = levels.slice(from, to).reduce((sum, level) => sum + level, 0) / (to - from);
    sections.push(`${(index * duration / count).toFixed(2)}-${((index + 1) * duration / count).toFixed(2)}s: ${Math.round(mean / peak * 100)}%`);
  }
  // These are level rises, not beat detection or an inferred tempo.
  const rises = levels.map((level, index) => ({ time: index * windowSize / sampleRate, rise: level - (levels[index - 1] ?? level) }))
    .filter((item) => item.rise > peak * 0.15).sort((a, b) => b.rise - a.rise);
  const accents = [];
  for (const candidate of rises) {
    if (accents.length >= 8) break;
    if (accents.every((time) => Math.abs(time - candidate.time) >= 0.4)) accents.push(candidate.time);
  }
  return [
    `Analyzed opening audio segment: ${duration.toFixed(2)} seconds, starting at 0:00.`,
    `Measured relative audio levels (not perceived loudness): ${sections.join("; ")}.`,
    accents.length ? `Candidate audible energy rises: ${accents.sort((a, b) => a - b).map((time) => `${time.toFixed(2)}s`).join(", ")}.` : "No strong isolated level rises detected; prefer phrase-length holds over invented beat cuts.",
    "This is local waveform analysis, not a listening description, verified beat grid, genre classification or vocal transcript. Do not invent BPM, lyrics, instruments or vocal events. Use the supplied track itself for exact musical phrasing and vocal lip sync in the video generation. Treat level changes only as optional pacing cues; preserve requested shot counts."
  ].join("\n");
}

export function createDirectorMusicAnalyzer({ resolveAsset, ffmpegPath, ffprobePath }) {
  const cache = new Map();
  return async function analyzeMusic(input, durationSeconds = 30) {
    const source = await resolveAsset(input.url);
    const info = await stat(source.filePath);
    const duration = Math.max(1, Math.min(30, Number(durationSeconds) || 30));
    const key = JSON.stringify([source.filePath, info.size, info.mtimeMs, duration]);
    if (cache.has(key)) return cache.get(key);
    const pending = (async () => {
      const { stdout: probe } = await execFile(ffprobePath, ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", source.filePath], { timeout: 15000, windowsHide: true });
      const metadata = JSON.parse(probe);
      if (!metadata.streams?.some((stream) => stream.codec_type === "audio")) throw new Error("The Director Music input does not contain an audio track. Connect an audio file.");
      const { stdout: pcm } = await execFile(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", source.filePath, "-t", String(duration), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 2 * 1024 * 1024, timeout: 30000, windowsHide: true });
      const samples = new Float32Array(Math.floor(pcm.length / 4));
      for (let i = 0; i < samples.length; i += 1) samples[i] = pcm.readFloatLE(i * 4);
      const trackDuration = Number(metadata.format?.duration);
      return [
        Number.isFinite(trackDuration) ? `Connected music file duration: ${trackDuration.toFixed(2)} seconds.` : "",
        trackDuration < duration ? "The track ends before the requested video duration. Do not invent or loop missing music; preserve the track ending and use a silent visual hold if needed." : "Use the opening segment of this track for the requested video duration.",
        directorMusicLevelContext(samples)
      ].filter(Boolean).join("\n");
    })().catch((error) => { cache.delete(key); throw error; });
    if (cache.size >= 12) cache.delete(cache.keys().next().value);
    cache.set(key, pending);
    return pending;
  };
}
