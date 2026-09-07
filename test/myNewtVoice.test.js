import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceCapture, createVoiceLevelMeter, voiceCaptureError } from "../src/myNewt/voiceCapture.js";
import { appendDictation, myNewtVoiceCost } from "../src/myNewt/voiceConfig.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function harness(options = {}) {
  let elapsed = 0, stopped = 0, requests = 0, level = 0.1, metersClosed = 0;
  const states = [], text = [], timers = new Map(), recordings = [];
  const stream = { getTracks: () => [{ stop: () => { stopped += 1; } }] };
  class Recorder {
    static isTypeSupported(type) { return type === "audio/mp4"; }
    constructor(_stream, settings) { this.state = "inactive"; this.mimeType = settings.mimeType; recordings.push(this); }
    start() { this.state = "recording"; }
    stop() {
      if (this.state === "inactive") throw new Error("Already stopped");
      this.state = "inactive";
      queueMicrotask(() => { this.ondataavailable({ data: new Blob(["recorded audio"]) }); this.onstop(); });
    }
  }
  const capture = createVoiceCapture({
    getUserMedia: async () => stream, Recorder, now: () => elapsed,
    createLevelMeter: () => { let closed = false; return { attach: async () => {}, read: () => level, close: () => { if (!closed) metersClosed++; closed = true; } }; },
    schedule: (fn, ms) => { timers.set(fn, ms); return fn; }, unschedule: (fn) => timers.delete(fn),
    transcribe: async (audio, signal) => { requests += 1; assert.equal(audio.type, "audio/mp4"); assert.equal(signal.aborted, false); return { text: "Create a storyboard." }; },
    onTranscript: (value) => text.push(value), onState: (state) => states.push(state), ...options
  });
  const sample = () => { const fn = [...timers].find(([, ms]) => ms === 100)?.[0]; if (fn) { timers.delete(fn); fn(); } };
  return { capture, states, text, stream, timers, recordings, advance: (ms = 1000) => { elapsed += ms; sample(); },
    setLevel: (value) => { level = value; }, get requests() { return requests; }, get stopped() { return stopped; }, get metersClosed() { return metersClosed; } };
}

test("click-to-listen and manual stop transcribe once and release the microphone", async () => {
  const h = harness();
  await h.capture.start();
  await h.capture.start();
  assert.equal(h.recordings.length, 1);
  assert.equal(h.states.at(-1).phase, "recording");
  h.advance(); h.capture.release(); h.capture.release();
  assert.ok(h.stopped > 0);
  await tick();
  assert.equal(h.requests, 1);
  assert.deepEqual(h.text, ["Create a storyboard."]);
  assert.equal(h.states.at(-1).phase, "idle");
  assert.equal(h.timers.size, 0);
  assert.equal(h.metersClosed, 1);
});

test("releasing before permission arrives never starts a delayed recording", async () => {
  const permission = deferred();
  const h = harness({ getUserMedia: () => permission.promise });
  const pending = h.capture.start();
  h.capture.release();
  permission.resolve(h.stream); await pending;
  assert.equal(h.stopped, 1);
  assert.equal(h.recordings.length, 0);
  assert.equal(h.requests, 0);
});

test("a cancelled old permission request cannot replace a newer recording", async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const h = harness({ getUserMedia: () => (++count === 1 ? first : second).promise });
  const old = h.capture.start(); h.capture.cancel();
  const current = h.capture.start();
  first.resolve(h.stream); await old;
  assert.equal(h.recordings.length, 0);
  second.resolve(h.stream); await current;
  assert.equal(h.recordings.length, 1);
  h.capture.dispose();
});

test("an immediate second click or cancelled recording never uploads audio", async () => {
  for (const action of ["release", "cancel", "dispose"]) {
    const h = harness(); await h.capture.start();
    h.capture[action](); await tick();
    assert.equal(h.requests, 0);
    assert.ok(h.stopped > 0);
  }
});

test("silence stops listening, transcribes once and requires a fresh click", async () => {
  const h = harness(); await h.capture.start(); h.advance(300);
  h.setLevel(0); h.advance(2900);
  assert.equal(h.states.at(-1).phase, "recording");
  h.advance(100); await tick();
  assert.equal(h.requests, 1);
  assert.equal(h.states.at(-1).phase, "idle");
  assert.equal(h.metersClosed, 1);
  assert.equal(h.timers.size, 0);
  h.advance(10000); assert.equal(h.recordings.length, 1);
  h.setLevel(0.1); await h.capture.start(); assert.equal(h.recordings.length, 2);
  h.capture.dispose();
});

test("initial silence and a brief noise never upload audio or trigger commands", async () => {
  for (const noise of [false, true]) {
    const h = harness(); h.setLevel(noise ? 0.1 : 0);
    await h.capture.start(); h.setLevel(0); h.advance(100); h.advance(7900); await tick();
    assert.equal(h.requests, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.metersClosed, 1);
    assert.match(h.states.at(-1).error, /No speech/);
  }
});

test("short pauses resume listening and reset the silence timeout", async () => {
  const h = harness(); await h.capture.start(); h.advance(300);
  h.setLevel(0); h.advance(2000);
  h.setLevel(0.1); h.advance(200);
  h.setLevel(0); h.advance(2900);
  assert.equal(h.states.at(-1).phase, "recording");
  h.advance(100); await tick(); assert.equal(h.requests, 1);
});

test("cancellation during audio-monitor setup cannot start a late recorder", async () => {
  const setup = deferred(); let closed = 0;
  const h = harness({ createLevelMeter: () => ({ attach: () => setup.promise, close: () => { closed++; } }) });
  const pending = h.capture.start(); await tick(); h.capture.cancel(); setup.resolve(); await pending;
  assert.equal(h.recordings.length, 0); assert.equal(h.requests, 0); assert.equal(closed, 1);
  assert.equal(h.timers.size, 0);
});

test("broken silence monitoring cancels safely without uploading", async () => {
  let closed = 0;
  const h = harness({ createLevelMeter: () => ({ attach: async () => {}, read: () => { throw new Error("Monitor failed"); }, close: () => { closed++; } }) });
  await h.capture.start(); await tick();
  assert.equal(h.requests, 0); assert.ok(closed); assert.match(h.states.at(-1).error, /Monitor failed/);
  assert.equal(h.timers.size, 0);
});

test("audio meter measures waveform amplitude without speaker playback and closes once", async () => {
  let context, destinationConnections = 0, closes = 0, disconnects = 0;
  class AudioContext {
    constructor() { context = this; this.state = "running"; this.destination = {}; }
    async resume() {}
    async close() { closes++; }
    createMediaStreamSource() { return { connect: (target) => { if (target === this.destination) destinationConnections++; }, disconnect: () => { disconnects++; } }; }
    createAnalyser() { return { getFloatTimeDomainData: (data) => { for (let i = 0; i < data.length; i++) data[i] = i % 2 ? 0.1 : -0.1; }, disconnect: () => { disconnects++; } }; }
  }
  const meter = createVoiceLevelMeter(AudioContext); await meter.attach({});
  assert.ok(Math.abs(meter.read() - 0.1) < 0.0001);
  context.state = "suspended"; assert.throws(() => meter.read(), /interrupted/);
  meter.close(); meter.close(); assert.equal(closes, 1); assert.equal(disconnects, 2); assert.equal(destinationConnections, 0);
});

test("cancellation aborts transcription and ignores a late result", async () => {
  const response = deferred(); let signal;
  const h = harness({ transcribe: (_audio, abort) => { signal = abort; return response.promise; } });
  await h.capture.start(); h.advance(); h.capture.release(); await tick();
  h.capture.dispose();
  assert.equal(signal.aborted, true);
  response.resolve({ text: "Must not replace a different project's text" }); await tick();
  assert.deepEqual(h.text, []);
});

test("maximum duration releases once; permission and recorder failures clean up", async () => {
  const h = harness(); await h.capture.start(); h.advance(120000);
  const timeout = [...h.timers].find(([, ms]) => ms === 120000)[0];
  timeout(); h.capture.release(); await tick();
  assert.equal(h.requests, 1);
  const denied = harness({ getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  await denied.capture.start();
  assert.match(denied.states.at(-1).error, /site settings/);
  const broken = harness(); await broken.capture.start();
  broken.recordings[0].onerror({ error: new Error("Device disconnected") }); await tick();
  assert.equal(broken.requests, 0);
  assert.match(broken.states.at(-1).error, /Device disconnected/);
  assert.ok(broken.stopped > 0);
});

test("failed or empty transcriptions leave typed text alone and never retry", async () => {
  for (const result of [new Error("Provider unavailable"), { text: "  " }]) {
    let requests = 0;
    const h = harness({ transcribe: async () => { requests += 1; if (result instanceof Error) throw result; return result; } });
    await h.capture.start(); h.advance(); h.capture.release(); await tick();
    assert.equal(requests, 1);
    assert.equal(h.text.length, 0);
    assert.equal(h.states.at(-1).phase, "idle");
    assert.ok(h.states.at(-1).error);
  }
});

test("dictation preserves typed content and costs remain fractional cents", () => {
  assert.equal(appendDictation("Keep this.", "  Add this. "), "Keep this. Add this.");
  assert.equal(appendDictation("Keep this.\n", "Add this."), "Keep this.\nAdd this.");
  assert.equal(appendDictation("Keep this.", " "), "Keep this.");
  assert.equal(appendDictation("", "A brief."), "A brief.");
  assert.equal(myNewtVoiceCost(60), 0.0045);
  assert.equal(myNewtVoiceCost(120), 0.009);
  assert.match(voiceCaptureError({ name: "NotFoundError" }), /No microphone/);
});
