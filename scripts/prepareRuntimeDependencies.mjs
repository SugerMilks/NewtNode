import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const runCommand = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function prepareRuntimeDependencies({ root = appRoot, run = runCommand, platform = process.platform, nodeVersion = process.version } = {}) {
  const packagePath = path.join(root, "package.json");
  const lockPath = path.join(root, "package-lock.json");
  const stampPath = path.join(root, "node_modules", ".newtnode-dependencies.json");
  const packageText = await readFile(packagePath, "utf8");
  const manifest = JSON.parse(packageText);
  const lockText = await readFile(lockPath, "utf8");
  const fingerprint = createHash("sha256").update(JSON.stringify([packageText, lockText, platform, nodeVersion])).digest("hex");
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  // Check direct packages as well as the stamp so incomplete installs can recover.
  const installed = async () => {
    for (const name of dependencies) {
      try { await access(path.join(root, "node_modules", name, "package.json")); }
      catch { return false; }
    }
    return true;
  };
  let previous = {};
  try { previous = JSON.parse(await readFile(stampPath, "utf8")); } catch {}
  if (previous?.fingerprint === fingerprint && await installed()) return { installed: false };

  const command = platform === "win32" ? "cmd.exe" : "npm";
  const args = platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd install --no-audit --no-fund"]
    : ["install", "--no-audit", "--no-fund"];
  await run(command, args, { cwd: root, timeout: 600000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  if (!await installed()) throw new Error("Dependency installation did not provide all required packages.");
  await mkdir(path.dirname(stampPath), { recursive: true });
  await writeFile(stampPath, JSON.stringify({ fingerprint }), "utf8");
  return { installed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log("Checking NewtNode dependencies...");
    const result = await prepareRuntimeDependencies();
    if (result.installed) console.log("NewtNode dependencies are ready.");
  } catch (error) {
    console.error(`NewtNode dependency setup failed. Check your internet connection and relaunch.\n${error.stderr || error.message}`);
    process.exitCode = 1;
  }
}
