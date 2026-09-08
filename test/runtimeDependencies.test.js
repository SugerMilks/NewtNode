import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareRuntimeDependencies } from "../scripts/prepareRuntimeDependencies.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "newtnode-dependencies-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = { name: "fixture", version: "1.0.0", dependencies: { "fixture-package": "1.0.0" } };
  await writeFile(path.join(root, "package.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
  await writeFile(path.join(root, ".env"), "FAL_KEY=fixture-only");
  await mkdir(path.join(root, "saved_workflows"));
  await writeFile(path.join(root, "saved_workflows", "keep.json"), "{}");
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    await mkdir(path.join(root, "node_modules", "fixture-package"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "fixture-package", "package.json"), "{}");
  };
  return { root, run, calls, nodeVersion: "v22.0.0", platform: "darwin" };
}

test("launcher prepares dependencies once and leaves keys and projects untouched", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await prepareRuntimeDependencies(f), { installed: true });
  assert.deepEqual(await prepareRuntimeDependencies(f), { installed: false });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].command, "npm");
  assert.deepEqual(f.calls[0].args, ["install", "--no-audit", "--no-fund"]);
  assert.equal(f.calls[0].options.cwd, f.root);
  assert.equal(await readFile(path.join(f.root, ".env"), "utf8"), "FAL_KEY=fixture-only");
  assert.equal(await readFile(path.join(f.root, "saved_workflows", "keep.json"), "utf8"), "{}");
});

test("lockfile, Node version and missing direct packages invalidate preparation", async (t) => {
  const f = await fixture(t);
  await prepareRuntimeDependencies(f);
  await writeFile(path.join(f.root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, name: "changed" }));
  assert.equal((await prepareRuntimeDependencies(f)).installed, true);
  f.nodeVersion = "v24.0.0";
  assert.equal((await prepareRuntimeDependencies(f)).installed, true);
  await rm(path.join(f.root, "node_modules", "fixture-package"), { recursive: true });
  assert.equal((await prepareRuntimeDependencies(f)).installed, true);
});

test("failed or incomplete dependency installation never marks startup ready", async (t) => {
  const f = await fixture(t);
  const stamp = path.join(f.root, "node_modules", ".newtnode-dependencies.json");
  await assert.rejects(prepareRuntimeDependencies({ ...f, run: async () => { throw new Error("offline"); } }), /offline/);
  await assert.rejects(readFile(stamp), { code: "ENOENT" });
  await assert.rejects(prepareRuntimeDependencies({ ...f, run: async () => {} }), /all required packages/);
  await assert.rejects(readFile(stamp), { code: "ENOENT" });
  assert.equal((await prepareRuntimeDependencies(f)).installed, true);
});

test("Windows invokes the fixed npm command through cmd.exe", async (t) => {
  const f = await fixture(t);
  await prepareRuntimeDependencies({ ...f, platform: "win32" });
  assert.equal(f.calls[0].command, "cmd.exe");
  assert.deepEqual(f.calls[0].args, ["/d", "/s", "/c", "npm.cmd install --no-audit --no-fund"]);
  assert.equal(f.calls[0].options.windowsHide, true);
});

test("both launchers prepare dependencies before build and track both entrypoints", async () => {
  const mac = await readFile(new URL("../NewtNode.command", import.meta.url), "utf8");
  const windows = await readFile(new URL("../Launch_NewtNode.ps1", import.meta.url), "utf8");
  for (const source of [mac, windows]) {
    assert.ok(source.indexOf("prepareRuntimeDependencies.mjs") < source.indexOf("run build"));
    assert.match(source, /remote\.html/);
    assert.match(source, /package-lock\.json/);
    assert.match(source, /\.newtnode-dependencies\.json/);
  }
});
