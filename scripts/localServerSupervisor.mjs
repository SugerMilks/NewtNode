import { spawn } from "node:child_process";
import { existsSync, watchFile, unwatchFile } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const markerPath = path.join(rootDir, "server", "restart-marker.js");
const restartDelayMs = 250;

let child = null;
let restartTimer = null;
let shuttingDown = false;

function log(message) {
  console.log(`[server-supervisor] ${new Date().toISOString()} ${message}`);
}

function startServer() {
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });

  log(`started server pid ${child.pid}`);

  child.on("exit", (code, signal) => {
    const previous = child;
    child = null;
    log(`server pid ${previous.pid} exited code=${code ?? ""} signal=${signal ?? ""}`);
    if (!shuttingDown) {
      scheduleRestart();
    }
  });
}

function stopServer() {
  if (!child) return;
  child.kill("SIGTERM");
}

function scheduleRestart() {
  if (restartTimer || shuttingDown) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (child) {
      stopServer();
    } else {
      startServer();
    }
  }, restartDelayMs);
}

function shutdown(signal) {
  shuttingDown = true;
  unwatchFile(markerPath);
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (child) {
    child.kill(signal);
  }
  process.exit(0);
}

if (!existsSync(markerPath)) {
  log("restart marker missing; server will still start");
}

watchFile(markerPath, { interval: 500 }, (current, previous) => {
  if (current.mtimeMs !== previous.mtimeMs) {
    log("restart marker changed");
    scheduleRestart();
  }
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
