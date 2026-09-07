import { useLayoutEffect, useRef, useState } from "react";
import { myNewtApi } from "../api/newtApi.js";
import { createVoiceCapture } from "./voiceCapture.js";

export function useMyNewtVoice({ scope, context, onTranscript, disabled = false }) {
  const [state, setState] = useState({ phase: "idle", error: "" });
  const capture = useRef(null);
  const latest = useRef({ onTranscript, context });
  latest.current = { onTranscript, context };
  useLayoutEffect(() => {
    const recorder = createVoiceCapture({
      transcribe: (audio, signal) => myNewtApi.transcribe(audio, latest.current.context, signal),
      onTranscript: (text) => latest.current.onTranscript(text),
      onState: setState
    });
    capture.current = recorder;
    setState({ phase: "idle", error: "" });
    const cancel = () => recorder.cancel();
    const hidden = () => { if (document.hidden) cancel(); };
    const escape = (event) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      recorder.dispose();
      capture.current = null;
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [scope]);
  useLayoutEffect(() => { if (disabled) capture.current?.cancel(); }, [disabled]);
  return { ...state, active: state.phase !== "idle", start: () => capture.current?.start(), release: () => capture.current?.release(), cancel: () => capture.current?.cancel() };
}
