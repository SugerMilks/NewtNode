import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error"
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [], calls = [];
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  await page.route(/^https?:\/\/[^/]+\/api\//, route => { calls.push(route.request().url()); return route.abort(); });
  const wav = Buffer.alloc(2044);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2000, 40);
  await page.route("**/voice-qa/sample.wav", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/characterVoice.html`);
  const voiceSection = page.locator("details.voice");
  await voiceSection.waitFor();
  if (!(await voiceSection.evaluate(element => element.open))) await voiceSection.locator("summary").click();
  const toggle = page.getByRole("switch", { name: "Voice Reference Only", exact: true });
  const state = () => page.getByLabel("Voice QA state").textContent().then(JSON.parse);
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  assert.equal(await toggle.isEnabled(), true, "voice role remains editable on locked sheets");
  assert.match((await state()).prompt, /Use the provided dialogue audio file/);
  assert.match(await page.locator(".character-voice-mode").getAttribute("title"), /written|supplies the words/);
  const voices = (await state()).data.characterVoices;
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  assert.match((await state()).prompt, /VOICE REFERENCE ONLY.*@Audio1/);
  assert.doesNotMatch((await state()).prompt, /Use the provided dialogue audio file/);
  assert.equal(await page.getByText("Voice samples", { exact: true }).count(), 1);
  for (const action of ["Save / Reopen", "Copy Node"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    assert.equal(await toggle.getAttribute("aria-checked"), "true");
    assert.deepEqual((await state()).data.characterVoices, voices);
  }
  await toggle.focus(); await page.keyboard.press("Space");
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  assert.match((await state()).prompt, /Use the provided dialogue audio file/);
  await page.keyboard.press("Space");
  const fits = () => toggle.evaluate(button => {
    const rect = button.getBoundingClientRect(), row = button.parentElement.getBoundingClientRect();
    const label = button.previousElementSibling.getBoundingClientRect();
    return rect.width > 0 && label.right <= rect.left && rect.right <= row.right + 1 && label.left >= row.left - 1;
  });
  assert.equal(await fits(), true);
  const screenshots = await mkdtemp(path.join(tmpdir(), "newtnode-character-voice-"));
  await page.locator("details.voice").screenshot({ path: path.join(screenshots, "voice-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".character-qa-stage").evaluate(element => Object.assign(element.style, { width: "820px", maxWidth: "none", transform: "scale(0.44)", transformOrigin: "top left" }));
  assert.equal(await fits(), true);
  await page.locator("details.voice").screenshot({ path: path.join(screenshots, "voice-scaled.png") });
  await page.getByRole("button", { name: "Load Legacy", exact: true }).click();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  assert.deepEqual(calls, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, paidCalls: 0, screenshots, checks: ["off default", "locked character toggle", "live prompt role", "save/reopen/copy", "legacy compatibility", "keyboard switch", "desktop/scaled canvas"] }, null, 2));
} finally { await browser?.close(); await server.close(); }
