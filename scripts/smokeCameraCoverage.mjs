import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, symlink, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";

// Boot the real backend with disposable storage and no credentials. Never touch the running app's data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(tmpdir(), "coverage-smoke-"));
const port = Number(process.env.COVERAGE_SMOKE_PORT || 3396);
let child, logs = "";
try {
  await cp(path.join(root, "server"), path.join(temporary, "server"), { recursive: true, filter: source => !source.startsWith(path.join(root, "server", "data")) });
  await cp(path.join(root, "src"), path.join(temporary, "src"), { recursive: true });
  await cp(path.join(root, "dist"), path.join(temporary, "dist"), { recursive: true });
  await cp(path.join(root, "package.json"), path.join(temporary, "package.json"));
  await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
  const env = { ...process.env, PORT: String(port), NEWT_REMOTE_PORT: String(port + 1), FAL_KEY: "", GOOGLE_API_KEY: "", KREA_API_KEY: "", ATLAS_API_KEY: "", OPENAI_API_KEY: "", ELEVENLABS_API_KEY: "", DOTENV_CONFIG_PATH: path.join(temporary, ".nonexistent-env") };
  child = spawn(process.execPath, ["server/index.js"], { cwd: temporary, env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", value => { logs = (logs + value).slice(-20000); });
  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Isolated backend exited: ${logs}`);
    try { health = await (await fetch(`${base}/api/health`)).json(); if (health.ok) break; } catch { /* Startup may still be loading. */ }
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(health?.routes?.cameraCoverage, true, logs);
  assert.equal(health?.routes?.cameraCoverageTravel, true, logs);
  assert.equal(health?.routes?.cameraCoverageFraming, true, logs);
  const smoke = await promisify(execFile)(process.execPath, [path.join(root, "scripts/smokeApp.mjs"), process.env.NEWT_SMOKE_CLIENT_URL || "http://127.0.0.1:5176/", `${base}/api/health`], { cwd: temporary, env });
  console.log(smoke.stdout.trim());
  const post = async (route, body) => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const noKey = await post("/api/node/camera-coverage", { requestId: randomUUID(), kind: "pass", sourceUrl: "/uploads/master.png", duration: 10, resolution: "768P",
    poses: [{ azimuth: 0, elevation: 0, distance: 1 }, { azimuth: 30, elevation: 0, distance: 1 }] });
  assert.equal(noKey.status, 400); assert.match(noKey.data.error, /Enable your Fal/);
  await mkdir(path.join(temporary, "outputs"), { recursive: true });
  await promisify(execFile)(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc2=size=960x540:rate=24", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(temporary, "outputs/pass.mp4")]);
  const captured = await post("/api/node/camera-coverage-capture", { sourceVideoUrl: "/outputs/pass.mp4", frameTime: 1, nodeId: "test", projectId: "test" });
  assert.equal(captured.status, 200, JSON.stringify(captured.data));
  const metadata = await sharp(path.join(temporary, captured.data.image.localUrl)).metadata();
  assert.equal(metadata.width, 960); assert.equal(metadata.height, 540); assert.equal(metadata.format, "png");
  assert.equal(captured.data.cost.amountUsd, 0);
  const history = JSON.parse(await readFile(path.join(temporary, "server/data/history.json"), "utf8"));
  assert.ok(JSON.stringify(history).includes(captured.data.image.localUrl));
  assert.equal((await post("/api/node/camera-coverage-capture", { sourceVideoUrl: "https://example.com/video.mp4", frameTime: 0 })).status, 400);
  assert.equal((await post("/api/node/camera-coverage-capture", { sourceVideoUrl: "/outputs/pass.mp4", frameTime: 99 })).status, 400);
  assert.equal((await fetch(`${base}/api/node/camera-coverage/${randomUUID()}`)).status, 404);
  console.log("ReFrame real-backend smoke OK: routes, no-key guard, native PNG capture, History, source validation and frame bounds. No paid calls.");
} finally {
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  await rm(temporary, { recursive: true, force: true });
}
