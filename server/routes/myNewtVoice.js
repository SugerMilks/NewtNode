import multer from "multer";
import { MY_NEWT_VOICE_MAX_BYTES } from "../../src/myNewt/voiceConfig.js";
import { voiceMimeTypes } from "../my-newt-voice.js";

export function registerMyNewtVoiceRoutes(app, { getKey, transcribe, recordUsage }) {
  const upload = multer({
    storage: multer.memoryStorage(), limits: { fileSize: MY_NEWT_VOICE_MAX_BYTES, files: 1, fields: 3, fieldSize: 1024 },
    fileFilter: (_req, file, callback) => callback(voiceMimeTypes.has(file.mimetype.split(";")[0]) ? null : new Error("Unsupported microphone recording format."), true)
  }).single("audio");
  let pending = 0;
  app.post("/api/my-newt/transcribe", (req, res) => {
    const key = getKey();
    if (!key) return res.status(400).json({ error: "Enable an OpenAI API key in Settings to use voice commands." });
    if (pending >= 2) return res.status(429).json({ error: "Voice transcription is busy. Please try again shortly." });
    pending += 1;
    const abort = new AbortController();
    const disconnected = () => { if (!res.writableEnded) abort.abort(); };
    res.on("close", disconnected);
    upload(req, res, async (uploadError) => {
      try {
        if (uploadError) throw new Error(uploadError.code === "LIMIT_FILE_SIZE" ? "The recording exceeds 8 MB. Try a shorter voice note." : uploadError.message);
        const result = await transcribe({ audio: req.file, key, signal: abort.signal });
        let warning;
        try {
          await recordUsage({ ...result, projectId: req.body.projectId, projectName: req.body.projectName, nodeId: req.body.nodeId });
        } catch {
          warning = "The transcript is ready, but its estimated cost could not be saved to History.";
        }
        if (!abort.signal.aborted) res.json({ text: result.text, ...(warning ? { warning } : {}) });
      } catch (error) {
        if (!abort.signal.aborted) res.status(400).json({ error: error.name === "TimeoutError" ? "OpenAI voice transcription timed out. Please try again when ready." : error.message || "Voice transcription failed." });
      } finally {
        pending -= 1;
        res.off("close", disconnected);
      }
    });
  });
}
