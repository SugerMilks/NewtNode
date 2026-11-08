import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { createServer } from "vite";
const exec = promisify(execFile), baseline = process.argv.includes("--baseline");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = await mkdtemp(path.join(tmpdir(), "editor-playback-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const media = new Map();
  for (const color of ["red", "blue"]) {
    const file = path.join(dir, `${color}.mp4`);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-shortest", file]);
    media.set(`/uploads/editor-qa/${color}.mp4`, await readFile(file));
  }
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], unexpected = [], results = [];
  for (const scenario of (process.env.PLAYBACK_CASE ? [process.env.PLAYBACK_CASE] : ["cuts", "crossDissolve", "dipToBlack", "razor"])) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      window.qaSeeks = []; window.qaElements = [];
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
      Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { ...descriptor, set(value) {
        window.qaSeeks.push({ time: performance.now(), value, from: this.currentTime, paused: this.paused, frame: window.qaPlayer?.getSnapshot().frame, type: this.tagName, src: this.src });
        descriptor.set.call(this, value);
      } });
      const create = document.createElement.bind(document);
      document.createElement = (...args) => { const el = create(...args); if (["video", "audio"].includes(args[0])) window.qaElements.push(el); return el; };
    });
    await page.route(/^https?:\/\/[^/]+\/api\//, route => { unexpected.push(route.request().url()); return route.abort(); });
    await page.route("**/uploads/editor-qa/**", async route => {
      const body = media.get(new URL(route.request().url()).pathname); if (!body) return route.abort();
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      await new Promise(r => setTimeout(r, 120));
      return route.fulfill({ status: range ? 206 : 200, contentType: "video/mp4", body: body.subarray(start, end + 1),
        headers: { "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}) } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editor.html?transitions=1`);
    await page.evaluate(async scenario => {
      const { editorPlayback } = await import("/src/editorPlayback.js");
      const { transitionTimeline } = await import("/test/fixtures/editorTransitions.js");
      const { editorSetTransition } = await import("/src/editorTransitions.js");
      const { editorSplit } = await import("/src/editorTimeline.js");
      const player = editorPlayback("editor-qa-node"); let timeline = transitionTimeline();
      timeline.width = 1280; timeline.height = 720;
      if (scenario === "razor") {
        timeline.clips = timeline.clips.filter(c => c.assetId === "red").map(c => ({ ...c, sourceIn: 0, duration: 96 }));
        for (const frame of [24, 48, 72]) timeline = editorSplit(timeline, frame);
      } else if (["crossDissolve", "dipToBlack"].includes(scenario)) {
        timeline = editorSetTransition(timeline, "v1-red", "v1-blue", scenario);
        timeline = editorSetTransition(timeline, "a1-red", "a1-blue", "crossFade");
      }
      player.setTimeline(timeline); player.seek(0); window.qaPlayer = player;
    }, scenario);
    await page.waitForFunction(() => !window.qaPlayer.getSnapshot().buffering);
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const player = window.qaPlayer; window.qaStart = performance.now(); window.qaStates = [];
      window.qaUnsubscribe = player.subscribe(() => window.qaStates.push({ ...player.getSnapshot(), time: performance.now() }));
      player.play();
    });
    await page.waitForFunction(() => { const s = window.qaPlayer.getSnapshot(); return (!s.playing && s.frame === 96) || s.error; }, null, { timeout: 20000 });
    const metrics = await page.evaluate(() => {
      window.qaUnsubscribe(); const states = window.qaStates;
      let bufferingMs = 0, start = null, pauses = 0;
      for (const state of states) {
        if (state.playing && state.buffering && start == null) { start = state.time; pauses++; }
        if (!state.buffering && start != null) { bufferingMs += state.time - start; start = null; }
      }
      const c = document.querySelector(".editor-monitor canvas"), pixels = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return { frame: window.qaPlayer.getSnapshot().frame, error: window.qaPlayer.getSnapshot().error, pauses, bufferingMs: Math.round(bufferingMs),
        elapsedMs: Math.round(states.at(-1).time - window.qaStart), seeks: window.qaSeeks.filter(s => s.time >= window.qaStart).length,
        runningSeeks: window.qaSeeks.filter(s => s.time >= window.qaStart && !s.paused).length,
        elements: window.qaElements.length, frames: states.filter(s => s.playing && !s.buffering).length, finalBlack: pixels.every((v, i) => i % 4 === 3 || v < 8),
        seekLog: window.qaSeeks.filter(s => s.time >= window.qaStart).map(({ time, src, ...s }) => ({ ...s, ms: Math.round(time - window.qaStart) })) };
    });
    assert.equal(metrics.error, ""); assert.equal(metrics.frame, 96); assert.equal(metrics.finalBlack, true);
    assert.ok(metrics.frames > 40, "Playback advances rather than jumping to the end");
    if (!baseline) {
      if (metrics.runningSeeks) console.log(JSON.stringify({ scenario, ...metrics }, null, 2));
      assert.equal(metrics.runningSeeks, 0, `${scenario}: playback should not repeatedly seek running decoders`);
    }
    results.push({ scenario, ...metrics }); await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ baseline, passed: true, results }, null, 2));
} finally { await browser?.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
