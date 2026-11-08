import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { createServer } from "vite";
const exec = promisify(execFile);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = await mkdtemp(path.join(tmpdir(), "editor-shuttle-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const media = new Map();
  for (const color of ["red", "blue"]) {
    const file = path.join(dir, `${color}.mp4`);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=c=${color}:s=640x360:r=24:d=4`, "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-shortest", file]);
    media.set(`/uploads/editor-qa/${color}.mp4`, await readFile(file));
  }
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], unexpected = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    window.qaMedia = [];
    const create = document.createElement.bind(document);
    document.createElement = (...args) => { const el = create(...args); if (["video", "audio"].includes(args[0])) window.qaMedia.push(el); return el; };
  });
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { unexpected.push(route.request().url()); return route.abort(); });
  await page.route("**/uploads/editor-qa/**", async route => {
    const body = media.get(new URL(route.request().url()).pathname); if (!body) return route.abort();
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: "video/mp4", body: body.subarray(start, end + 1),
      headers: { "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}) } });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editor.html?transitions=1`);
  await page.evaluate(async () => { const { editorPlayback } = await import("/src/editorPlayback.js"); window.qaPlayer = editorPlayback("editor-qa-node"); });
  const snapshot = () => page.evaluate(() => window.qaPlayer.getSnapshot());
  const seek = async frame => { await page.evaluate(f => window.qaPlayer.seek(f), frame); await page.waitForFunction(() => !window.qaPlayer.getSnapshot().buffering); };
  const keyRate = async (key, rate) => { await page.keyboard.press(key); assert.equal((await snapshot()).rate, rate); };
  const pause = async () => { await keyRate("k", 1); const s = await snapshot(); assert.equal(s.playing, false); await page.waitForTimeout(100); assert.equal((await snapshot()).frame, s.frame); };
  const original = await page.getByLabel("QA timeline state").textContent();

  // Selecting the Editor focuses the canvas; its shared routing must work there.
  await page.locator(".node-card.editor .node-title").click();
  await seek(12);
  await keyRate("l", 1); await keyRate("l", 2); await keyRate("l", 3); await keyRate("l", 3);
  await page.waitForFunction(() => window.qaPlayer.getSnapshot().frame >= 30);
  assert.ok(await page.evaluate(() => window.qaMedia.some(e => !e.paused && e.playbackRate >= 2.7 && e.preservesPitch)));
  await pause();

  // Focused timeline and its connected monitor use the same transport.
  await page.locator(".editor-node-body").focus();
  await seek(84); await keyRate("j", -1); await keyRate("j", -2); await keyRate("j", -3); await keyRate("j", -3);
  await page.keyboard.down("j"); await page.keyboard.down("j"); await page.keyboard.up("j");
  assert.equal((await snapshot()).rate, -3);
  await page.waitForFunction(() => { const s = window.qaPlayer.getSnapshot(); return s.frame <= 30 && !s.buffering; });
  assert.ok(await page.evaluate(() => window.qaMedia.every(e => e.paused && e.playbackRate > 0)));
  const pixel = await page.locator(".node-card.preview .editor-monitor canvas").evaluate(c => [...c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data]);
  assert.ok(pixel[0] > 200 && pixel[2] < 20, "Reverse really paints the previous red clip");
  await keyRate("l", 1); await pause();
  await seek(72); await page.locator(".node-card.preview .editor-monitor").focus();
  await keyRate("j", -1); await keyRate("l", 1); await pause();

  // Text entry, dialogs, autorepeat and deselected canvas must not start playback.
  const frameInput = page.getByLabel("Timeline frame", { exact: true });
  await frameInput.focus(); await page.keyboard.press("l"); assert.equal((await snapshot()).playing, false);
  await page.locator(".editor-node-body").focus();
  await page.keyboard.down("l"); await page.keyboard.down("l"); await page.keyboard.down("l"); await page.keyboard.up("l");
  assert.equal((await snapshot()).rate, 1); await pause();
  await page.evaluate(() => { const d = document.createElement("div"); d.setAttribute("aria-modal", "true"); d.id = "qa-modal"; document.body.append(d); });
  await page.keyboard.press("l"); assert.equal((await snapshot()).playing, false);
  await page.evaluate(() => document.getElementById("qa-modal").remove());
  await page.getByRole("button", { name: "Deselect Editor", exact: true }).click();
  await page.keyboard.press("l"); assert.equal((await snapshot()).playing, false);

  // Reverse across a real dissolve and finish cleanly, in narrow and desktop UI.
  await page.evaluate(async () => {
    const { transitionTimeline } = await import("/test/fixtures/editorTransitions.js");
    const { editorSetTransition } = await import("/src/editorTransitions.js");
    window.qaPlayer.setTimeline(editorSetTransition(transitionTimeline(), "v1-red", "v1-blue", "crossDissolve"));
  });
  await seek(72); await page.locator(".editor-node-body").focus(); await keyRate("j", -1);
  await page.waitForFunction(() => { const s = window.qaPlayer.getSnapshot(); return s.frame >= 44 && s.frame <= 50 && !s.buffering; });
  const blend = await page.locator(".node-card.preview .editor-monitor canvas").evaluate(c => [...c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data]);
  assert.ok(blend[0] > 50 && blend[2] > 50, "Reverse paints both sides of the dissolve");
  await page.waitForFunction(() => { const s = window.qaPlayer.getSnapshot(); return s.frame === 0 && !s.playing; });
  await page.keyboard.press("j"); assert.equal((await snapshot()).playing, false);
  for (const narrow of [false, true]) {
    if (narrow) { await page.setViewportSize({ width: 390, height: 900 }); await page.getByRole("button", { name: "Toggle narrow layout" }).click(); }
    await seek(72); await page.locator(".editor-node-body").focus(); await keyRate("j", -1); await keyRate("j", -2);
    const bounds = await page.locator(".editor-timecode").evaluate(el => { const label = el.querySelector(".editor-timecode-label"), rate = el.querySelector(".editor-playback-rate"); const a = label.getBoundingClientRect(), b = rate.getBoundingClientRect(); return { left: a.left, right: a.right, rateLeft: b.left, rateRight: b.right }; });
    assert.ok(bounds.rateLeft >= bounds.left && bounds.rateRight <= bounds.right + 1);
    await page.screenshot({ path: path.join(dir, narrow ? "shuttle-narrow.png" : "shuttle-desktop.png"), fullPage: true });
    await pause();
  }
  assert.equal(await page.getByLabel("QA timeline state").textContent(), original);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: true, checks: "J/K/L speeds, real media/audio, reverse cuts/dissolve, focus isolation, repeat, pause, no edits, desktop/narrow readouts", screenshots: dir }, null, 2));
} finally { await browser?.close(); await server.close(); if (!process.env.KEEP_EDITOR_QA) await rm(dir, { recursive: true, force: true }); }
