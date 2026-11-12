import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDialogCancellation } from "../server/dialog-errors.js";
import { registerCoreRoutes } from "../server/routes/core.js";
import { outputApi } from "../src/api/newtApi.js";

const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
function runner(name, execFile) {
  const start = source.indexOf(`async function ${name}(`), end = source.indexOf("\nfunction safeComposerPoseFileName(", start);
  assert.ok(start > 0 && end > start);
  return new Function("execFile", "isDialogCancellation", `${source.slice(start, end)}\nreturn ${name};`)(execFile, isDialogCancellation);
}
const macCancel = () => Object.assign(new Error('Command failed: osascript -e POSIX path of (choose folder with prompt "Choose Looks catalog folder")\n15:154: execution error: User canceled. (-128)'), {
  code: 1, stderr: "15:154: execution error: User canceled. (-128)\n"
});

test("macOS folder and file cancellation normalize to the existing quiet cancellation result", async () => {
  for (const name of ["runFolderDialogCommand", "runFileDialogCommand"]) {
    let calls = 0;
    const run = runner(name, async () => { calls++; throw macCancel(); });
    await assert.rejects(run("osascript", ["-e", "choose folder"]), { code: "DIALOG_CANCELED" });
    assert.equal(calls, 1);
  }
  assert.equal(isDialogCancellation(macCancel(), "/usr/bin/osascript"), true);
  assert.equal(isDialogCancellation({ code: 1, stderr: "15:154: execution error: Annule. (-128)\n" }, "osascript"), true);
});

test("real picker failures and cancellation text in the command are not silently hidden", async () => {
  for (const error of [
    Object.assign(new Error("Permission denied"), { code: 1, stderr: "execution error: Not authorized. (-1743)\n" }),
    Object.assign(new Error('Command failed: osascript -e choose folder with prompt "User canceled. (-128)"'), { code: 1, stderr: "execution error: File does not exist. (-43)\n" }),
    Object.assign(new Error("Dialog timed out"), { killed: true, signal: "SIGTERM" }),
    Object.assign(new Error("Application unavailable"), { code: "ENOENT" })
  ]) {
    assert.equal(isDialogCancellation(error, "osascript"), false);
    await assert.rejects(runner("runFolderDialogCommand", async () => { throw error; })("osascript", []), value => value === error);
  }
  assert.equal(isDialogCancellation(macCancel(), "some-other-command"), false);
  assert.equal(isDialogCancellation({ code: 1 }, "osascript"), false);
  assert.equal(isDialogCancellation({ code: 2 }, "powershell.exe"), true);
});

test("canceling the folder route returns canceled to the client without selecting a replacement", async t => {
  const routes = new Map(), run = runner("runFolderDialogCommand", async () => { throw macCancel(); });
  registerCoreRoutes({ get() {}, post(url, handler) { routes.set(url, handler); } }, {
    selectFolderWithDialog: () => run("osascript", [])
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push(url);
    assert.equal(url, "/api/system/select-folder");
    let response;
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { response = Response.json(data, { status: this.code }); } };
    await routes.get(url)({ body: JSON.parse(options.body) }, res);
    return response;
  });
  assert.deepEqual(await outputApi.selectFolder({ title: "Choose Looks catalog folder", defaultPath: "/existing/Looks" }), { canceled: true, path: "" });
  assert.equal(requests.length, 1);
});

test("successful folder selection still returns the chosen path", async () => {
  assert.equal(await runner("runFolderDialogCommand", async () => ({ stdout: "/new/Looks\n" }))("osascript", []), "/new/Looks");
});
