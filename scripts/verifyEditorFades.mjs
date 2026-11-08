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
const dir = await mkdtemp(path.join(tmpdir(), "editor-fades-browser-"));
const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: fileURLToPath(new URL("../test/browser/storyboard.config.js", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false }, logLevel: "error" });
let browser;
try {
  const media = new Map();
  for (const color of ["red", "blue"]) {
    const file = path.join(dir, `${color}.mp4`);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=30:d=4`, "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-shortest", file]);
    media.set(`/uploads/editor-qa/${color}.mp4`, await readFile(file));
  }
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "chrome" });
  const errors = [], unexpected = [];
  for (const width of [1440, 390]) for (const scale of [1, .5]) {
    const page = await browser.newPage({ viewport: { width, height: 1200 } });
    await page.addInitScript(() => {
      window.qaMedia = []; const create = document.createElement.bind(document);
      document.createElement = (...args) => { const el = create(...args); if (["audio", "video"].includes(args[0])) window.qaMedia.push(el); return el; };
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/^https?:\/\/[^/]+\/api\//, route => { unexpected.push(route.request().url()); return route.abort(); });
    await page.route("**/uploads/editor-qa/**", route => {
      const body = media.get(new URL(route.request().url()).pathname); if (!body) return route.abort();
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || ""), start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: "video/mp4", body: body.subarray(start, end + 1),
        headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}) } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/browser/editor.html?fades=1`);
    const state = async () => JSON.parse(await page.getByLabel("QA timeline state", { exact: true }).textContent());
    const initial = await state(); assert.equal(initial.clips.length, 3);
    if (scale !== 1) await page.getByRole("button", { name: "Toggle canvas zoom", exact: true }).click();
    const frame = page.getByRole("spinbutton", { name: "Timeline frame", exact: true });
    const seek = async f => {
      await frame.fill(String(f));
      await page.waitForFunction(() => !document.querySelector(".editor-monitor-state"));
    };
    const pixel = () => page.getByLabel("Editor sequence preview", { exact: true }).evaluate(c => [...c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data]);
    const edgeMenu = async (id, edge) => {
      const clip = page.locator(`[data-editor-clip="${id}"]`); await clip.scrollIntoViewIfNeeded();
      const r = await clip.boundingBox();
      await page.mouse.click(edge === "left" ? r.x + scale : r.x + r.width - scale, r.y + 25 * scale, { button: "right" });
      await page.getByRole("menu", { name: "Clip fades", exact: true }).waitFor();
    };
    await seek(24); await edgeMenu("foreground", "left");
    assert.equal(await frame.inputValue(), "24", "Context menus never seek");
    await page.getByRole("menuitem", { name: "Fade In", exact: true }).click();
    await edgeMenu("foreground", "right"); await page.getByRole("menuitem", { name: "Fade Out", exact: true }).click();
    await edgeMenu("sound", "left"); await page.getByRole("menuitem", { name: "Fade In", exact: true }).click();
    await edgeMenu("sound", "right"); await page.getByRole("menuitem", { name: "Fade Out", exact: true }).click();
    for (const f of [12, 24, 36, 60, 72, 83]) {
      await seek(f); const p = await pixel();
      const gain = f < 36 ? (f - 12) / 23 : f >= 60 ? (83 - f) / 23 : 1;
      assert.ok(Math.abs(p[0] - 255 * gain) < 8 && Math.abs(p[2] - 255 * (1 - gain)) < 8, `${width}/${scale} frame ${f}: ${p}`);
      const volumes = await page.evaluate(() => window.qaMedia.filter(m => m.tagName === "AUDIO" && m.getAttribute("src")).map(m => m.volume));
      assert.ok(volumes.some(v => Math.abs(v - gain) < .001), `Audio gain ${volumes} expected ${gain}`);
    }
    await page.getByRole("button", { name: "Disable V1", exact: true }).click(); await seek(12);
    assert.ok((await pixel()).slice(0, 3).every(v => v < 5));
    await page.getByRole("button", { name: "Enable V1", exact: true }).click();
    await seek(10); await page.getByRole("button", { name: "Play (Space)", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Timeline frame"]').value) >= 85);
    await page.getByRole("button", { name: "Pause (Space)", exact: true }).click();
    const resize = async (delta, cancel = false) => {
      const handle = page.locator('[data-editor-fade="foreground:left"] .editor-fade-handle'); await handle.scrollIntoViewIfNeeded();
      const r = await handle.boundingBox(), before = await state();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 + delta * 2 * scale, r.y + r.height / 2, { steps: 6 });
      assert.deepEqual(await state(), before, "Fade resizing stays local until release");
      if (cancel) await page.keyboard.press("Escape"); await page.mouse.up();
      if (cancel) assert.deepEqual(await state(), before);
    };
    await resize(-6); assert.equal((await state()).clips[0].fadeIn, 18);
    await page.keyboard.press("Control+z"); assert.equal((await state()).clips[0].fadeIn, 24);
    await page.keyboard.press("Control+Shift+z"); assert.equal((await state()).clips[0].fadeIn, 18);
    await resize(5, true); assert.equal((await state()).clips[0].fadeIn, 18);
    await page.locator(".node-card.editor").screenshot({ path: path.join(dir, `fades-${width}-${scale}.png`) });
    await page.getByRole("button", { name: "Save and reopen", exact: true }).click(); assert.equal((await state()).clips[0].fadeIn, 18);
    const selected = () => page.locator(".editor-clip.selected").evaluateAll(els => els.map(el => el.dataset.editorClip).sort());
    const marquee = async cancel => {
      const top = page.locator('[data-editor-track="v2"]'), bottom = page.locator('[data-editor-track="a1"]');
      await page.locator(".editor-scroll").scrollIntoViewIfNeeded();
      await page.locator(".editor-scroll").evaluate(el => { el.scrollLeft = 0; });
      const a = await top.boundingBox(), b = await bottom.boundingBox();
      const before = await state(), selection = await selected();
      await page.keyboard.down("Shift"); await page.mouse.move(a.x + 2 * scale, a.y + 2 * scale); await page.mouse.down();
      await page.mouse.move(a.x + 100 * scale, b.y + b.height - 2 * scale, { steps: 8 });
      assert.equal(await page.locator(".editor-marquee").count(), 1);
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up(); await page.keyboard.up("Shift");
      assert.deepEqual(await state(), before, "Marquee only selects; it never edits clips");
      if (cancel) assert.deepEqual(await selected(), selection);
    };
    await marquee(true); await marquee(false);
    assert.deepEqual(await selected(), ["background", "foreground", "sound"]);
    const beforeMove = await state(), clip = page.locator('[data-editor-clip="foreground"]'); await clip.scrollIntoViewIfNeeded();
    const r = await clip.boundingBox();
    await page.keyboard.down("Alt"); await page.mouse.move(r.x + r.width / 2, r.y + 28 * scale); await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 48 * scale, r.y + 28 * scale, { steps: 8 }); await page.mouse.up(); await page.keyboard.up("Alt");
    const moved = await state();
    for (const c of moved.clips) assert.equal(c.start, beforeMove.clips.find(old => old.id === c.id).start + 24);
    await page.keyboard.press("Control+z"); assert.deepEqual((await state()).clips, beforeMove.clips);
    await page.keyboard.press("Control+Shift+z"); assert.deepEqual((await state()).clips, moved.clips);
    await page.keyboard.press("Control+z");
    await marquee(false);
    await page.getByRole("button", { name: "Video", exact: true }).click();
    const topClip = await page.locator('[data-editor-clip="foreground"]').boundingBox();
    await page.mouse.move(topClip.x + topClip.width / 2, topClip.y + 28 * scale); await page.mouse.down();
    await page.mouse.move(topClip.x + topClip.width / 2, topClip.y + 28 * scale - 68 * scale, { steps: 8 }); await page.mouse.up();
    const shifted = await state();
    assert.notEqual(shifted.clips[0].trackId, "v2"); assert.equal(shifted.clips[1].trackId, "v2"); assert.equal(shifted.clips[2].trackId, "a1");
    await page.keyboard.press("Control+z"); await page.keyboard.press("Control+z");
    // Starting over a clip also box-selects instead of moving it; a click still toggles.
    await page.locator(".editor-scroll").evaluate(el => { el.scrollLeft = 0; });
    const startClip = await page.locator('[data-editor-clip="foreground"]').boundingBox();
    const lowerClip = await page.locator('[data-editor-clip="sound"]').boundingBox();
    const beforeBox = await state();
    await page.keyboard.down("Shift"); await page.mouse.move(startClip.x + startClip.width / 2, startClip.y + 25 * scale); await page.mouse.down();
    await page.mouse.move(startClip.x + startClip.width / 2 + 15 * scale, lowerClip.y + 30 * scale, { steps: 6 });
    await page.mouse.up(); await page.keyboard.up("Shift");
    assert.deepEqual(await selected(), ["background", "foreground", "sound"]); assert.deepEqual(await state(), beforeBox);
    await page.keyboard.press("Escape");
    await page.keyboard.down("Shift"); await page.mouse.click(startClip.x + startClip.width / 2, startClip.y + 25 * scale); await page.keyboard.up("Shift");
    assert.deepEqual(await selected(), ["foreground", "sound"]);
    await page.keyboard.down("Shift"); await page.mouse.click(startClip.x + startClip.width / 2, startClip.y + 25 * scale); await page.keyboard.up("Shift");
    assert.deepEqual(await selected(), []);
    await page.getByRole("button", { name: "Lock A1", exact: true }).click(); await marquee(false);
    assert.deepEqual(await selected(), ["background"], "Locked linked groups stay out of marquee selection");
    await edgeMenu("sound", "left"); assert.equal(await page.getByRole("menuitem", { name: "Fade In", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Unlock A1", exact: true }).click();
    await edgeMenu("foreground", "left"); await page.getByRole("menuitem", { name: "Remove Fade In", exact: true }).click();
    assert.ok(!(await state()).clips[0].fadeIn);
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.deepEqual(JSON.parse(await page.getByLabel("QA node position", { exact: true }).textContent()).x, 0);
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed: true, viewports: 4, screenshots: dir, checks: "edge menus, alpha pixels, audio gain, fade resize/undo/cancel/save, marquee selection/cancel, linked group movement, locks, no node drag or API calls" }, null, 2));
} catch (error) {
  for (const page of browser?.contexts().flatMap(c => c.pages()) || []) await page.screenshot({ path: path.join(dir, "failure.png") });
  console.error(`Browser artifacts: ${dir}`); throw error;
} finally {
  await browser?.close(); await server.close();
  for (const name of ["red.mp4", "blue.mp4"]) await rm(path.join(dir, name), { force: true });
}
