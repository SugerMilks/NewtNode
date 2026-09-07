import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { File } from "node:buffer";

export function createMyNewtMediaInspector({ resolveAsset, probeVideo, runFfmpeg }) {
  return async (url, key) => {
    if (!/^\/(uploads|outputs|workflow-assets)\//.test(url)) throw new Error("Only managed project assets can be inspected.");
    const { filePath, fileName } = await resolveAsset(url);
    const extension = path.extname(fileName).toLowerCase();
    const audio = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"].includes(extension);
    const video = [".mp4", ".mov", ".webm", ".mkv", ".m4v"].includes(extension);
    const image = [".png", ".jpg", ".jpeg", ".webp", ".avif"].includes(extension);
    if (!audio && !video && !image) throw new Error("This media format cannot be inspected yet.");
    const directory = await mkdtemp(path.join(tmpdir(), "newt-inspect-"));
    try {
      if (audio) {
        const metadata = await probeVideo(filePath);
        const duration = Math.min(120, Number(metadata.duration) || 120);
        const output = path.join(directory, "audio.mp3");
        await runFfmpeg(["-y", "-i", filePath, "-t", String(duration), "-vn", "-ac", "1", "-ar", "16000", output], "My Newt audio inspection");
        const form = new FormData(); form.append("model", "gpt-4o-transcribe");
        form.append("file", new File([await readFile(output)], "audio.mp3", { type: "audio/mpeg" }));
        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(120000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Audio transcription failed.");
        return { cost: duration / 60 * 0.006, content: [{ type: "input_text", text: `Transcript of the first ${duration} seconds of ${url}. This is not an assessment of music or sound quality:\n${data.text || "[No speech detected]"}` }] };
      }
      const duration = video ? Number((await probeVideo(filePath)).duration) || 0 : 0;
      const count = video ? 6 : 1;
      const content = [{ type: "input_text", text: video ? `Six sampled frames of ${url}, duration ${duration}s. Motion between these frames and audio have NOT been observed.` : `Image reference: ${url}` }];
      for (let index = 0; index < count; index++) {
        const seconds = video ? Math.max(0, duration - 0.15) * index / (count - 1) : 0;
        const output = path.join(directory, `${index}.jpg`);
        await runFfmpeg(["-y", ...(video ? ["-ss", String(seconds)] : []), "-i", filePath, "-frames:v", "1", "-vf", "scale=1024:1024:force_original_aspect_ratio=decrease", "-q:v", "3", output], "My Newt visual inspection");
        if (video) content.push({ type: "input_text", text: `${seconds.toFixed(2)} seconds` });
        content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${(await readFile(output)).toString("base64")}`, detail: "high" });
      }
      return { content, cost: 0 };
    } finally { await rm(directory, { recursive: true, force: true }); }
  };
}
