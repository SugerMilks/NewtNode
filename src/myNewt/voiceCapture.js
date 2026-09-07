import { MY_NEWT_VOICE_MAX_BYTES, MY_NEWT_VOICE_MAX_SECONDS, MY_NEWT_VOICE_SILENCE_MS, MY_NEWT_VOICE_INITIAL_SILENCE_MS } from "./voiceConfig.js";

export function voiceCaptureError(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "Microphone access was denied. Allow it in your browser's site settings, then click the microphone again.";
  if (error?.name === "NotFoundError") return "No microphone was found. Connect a microphone and try again.";
  if (error?.name === "NotReadableError") return "The microphone is unavailable. Check whether another app is using it.";
  return error?.message || "Could not record your voice. You can still type your direction.";
}

export function createVoiceLevelMeter(AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext) {
  if (!AudioContext) throw new Error("Automatic microphone shutoff requires Web Audio support. Please use a current browser.");
  const context = new AudioContext();
  // Resume during the click gesture; never connect the microphone to speakers.
  const ready = context.resume().then(() => true, () => false);
  let source, analyser, samples, closed = false;
  return {
    async attach(stream) {
      if (!await ready || closed) throw new Error("Microphone monitoring was interrupted. Click the microphone to try again.");
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      samples = new Float32Array(analyser.fftSize);
      source.connect(analyser);
    },
    read() {
      if (context.state !== "running") throw new Error("Microphone monitoring was interrupted. Click the microphone to try again.");
      analyser.getFloatTimeDomainData(samples);
      let sum = 0, squares = 0;
      for (const value of samples) { sum += value; squares += value * value; }
      return Math.sqrt(Math.max(0, squares / samples.length - (sum / samples.length) ** 2));
    },
    close() {
      if (closed) return;
      closed = true;
      source?.disconnect(); analyser?.disconnect();
      void context.close().catch(() => {});
    }
  };
}

export function createVoiceCapture({
  getUserMedia = (options) => {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) throw new Error("Microphone access requires localhost or HTTPS and a microphone-capable browser.");
    return navigator.mediaDevices.getUserMedia(options);
  },
  Recorder = globalThis.MediaRecorder,
  createLevelMeter = createVoiceLevelMeter,
  transcribe, onTranscript, onState,
  now = () => performance.now(), schedule = setTimeout, unschedule = clearTimeout
}) {
  let active = null;
  let disposed = false;
  const update = (phase, error = "") => { if (!disposed) onState({ phase, error }); };
  const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop());
  const stopMonitoring = (session) => {
    unschedule(session.levelTimer);
    session.meter?.close();
  };
  const cleanup = (session) => {
    unschedule(session.timer);
    unschedule(session.stopTimer);
    session.abort.abort();
    stopMonitoring(session);
    if (session.recorder?.state !== "inactive") {
      try { session.recorder?.stop(); } catch { /* Tracks are still released below. */ }
    }
    stopTracks(session.stream);
  };
  function cancel() {
    const session = active;
    active = null;
    if (session) cleanup(session);
    update("idle");
  }
  function fail(session, error) {
    if (active !== session || disposed) return;
    cancel();
    update("idle", voiceCaptureError(error));
  }
  async function finish(session) {
    unschedule(session.stopTimer);
    unschedule(session.timer);
    stopMonitoring(session);
    stopTracks(session.stream);
    if (active !== session || disposed) return;
    if (!session.released) return fail(session, new Error("Recording was interrupted. Please click the microphone and try again."));
    const audio = new Blob(session.chunks, { type: session.recorder.mimeType || "audio/webm" });
    session.chunks = [];
    if (!audio.size) return fail(session, new Error("No audio was recorded. Please try again."));
    if (audio.size > MY_NEWT_VOICE_MAX_BYTES) return fail(session, new Error("The recording is too large. Try a shorter voice note."));
    try {
      const result = await transcribe(audio, session.abort.signal);
      if (active !== session || disposed) return;
      if (!result.text?.trim()) throw new Error("No speech was detected. Please try again.");
      active = null;
      update("idle", result.warning || "");
      onTranscript(result.text.trim());
    } catch (error) { fail(session, error); }
  }
  function release() {
    const session = active;
    if (!session || session.released) return;
    if (!session.recorder || now() - session.started < 400) return cancel();
    if (!session.heardSpeech) return fail(session, new Error("No speech detected. Click the microphone to try again."));
    session.released = true;
    unschedule(session.timer);
    stopMonitoring(session);
    update("transcribing");
    session.stopTimer = schedule(() => fail(session, new Error("The microphone did not finish recording. Please try again.")), 5000);
    try { session.recorder.stop(); } catch (error) { fail(session, error); }
    stopTracks(session.stream);
  }
  function sampleLevel(session) {
    if (active !== session || session.released || disposed) return;
    try {
      const time = now();
      if (session.meter.read() >= 0.015) {
        session.soundStarted ??= time;
        if (time - session.soundStarted >= 200) session.heardSpeech = true;
        session.lastSound = time;
      } else session.soundStarted = null;
      if (session.heardSpeech && time - session.lastSound >= MY_NEWT_VOICE_SILENCE_MS) return release();
      if (!session.heardSpeech && time - session.started >= MY_NEWT_VOICE_INITIAL_SILENCE_MS) return fail(session, new Error("No speech detected. Click the microphone to try again."));
      session.levelTimer = schedule(() => sampleLevel(session), 100);
    } catch (error) { fail(session, error); }
  }
  async function start() {
    if (active || disposed) return;
    const session = { abort: new AbortController(), chunks: [], bytes: 0, released: false };
    active = session;
    update("requesting");
    try {
      if (!Recorder) throw new Error("Voice recording requires a microphone-capable browser on localhost or HTTPS.");
      session.meter = createLevelMeter();
      session.timer = schedule(() => fail(session, new Error("Microphone setup timed out. Click the microphone to try again.")), 30000);
      const stream = await getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      // Permission may resolve after release, navigation, or cancellation.
      if (active !== session || disposed) { stopTracks(stream); return; }
      session.stream = stream;
      await session.meter.attach(stream);
      if (active !== session || disposed) { stopTracks(stream); return; }
      unschedule(session.timer);
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => Recorder.isTypeSupported?.(type));
      const recorder = new Recorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      session.recorder = recorder;
      recorder.ondataavailable = ({ data }) => {
        if (active !== session || !data?.size) return;
        session.bytes += data.size;
        if (session.bytes > MY_NEWT_VOICE_MAX_BYTES) return fail(session, new Error("The recording is too large. Try a shorter voice note."));
        session.chunks.push(data);
      };
      recorder.onerror = (event) => fail(session, event.error);
      recorder.onstop = () => { void finish(session); };
      session.started = now();
      recorder.start(250);
      session.timer = schedule(release, MY_NEWT_VOICE_MAX_SECONDS * 1000);
      update("recording");
      sampleLevel(session);
    } catch (error) { fail(session, error); }
  }
  return { start, release, cancel, dispose() { disposed = true; cancel(); } };
}
