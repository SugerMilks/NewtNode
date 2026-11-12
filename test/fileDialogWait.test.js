import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerCoreRoutes } from "../server/routes/core.js";
import { chooseEditorExportPath } from "../src/editorExport.js";
import { isDialogCancellation } from "../server/dialog-errors.js";

const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const start = source.indexOf("async function runFileDialogCommand(");
const end = source.indexOf("\nfunction safeComposerPoseFileName(", start);
assert.ok(start > 0 && end > start);
const runner = execFile => new Function("execFile", "isDialogCancellation", `${source.slice(start, end)}\nreturn runFileDialogCommand;`)(execFile, isDialogCancellation);

test("file dialogs stay open past the old two-minute limit and complete on the user's decision", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const run = runner((command, args, options) => {
    calls.push({ command, args, options });
    assert.deepEqual(options, { windowsHide: false, timeout: 0 });
    return new Promise(resolve => setTimeout(() => resolve({ stdout: "/tmp/My edited sequence.mp4\n" }), 600000));
  });
  let settled = false;
  const pending = run("test-dialog", ["--save"]).then(path => { settled = true; return path; });
  t.mock.timers.tick(120001); await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(479999);
  assert.equal(await pending, "/tmp/My edited sequence.mp4");
  assert.equal(calls.length, 1);
});

test("cancel and genuine dialog errors retain their existing behavior without retries", async () => {
  for (const stdout of ["", " \n"]) {
    await assert.rejects(runner(async () => ({ stdout }))("test-dialog", []), { code: "DIALOG_CANCELED" });
  }
  for (const code of [2, "DIALOG_CANCELED"]) {
    await assert.rejects(runner(async () => { throw Object.assign(new Error("Canceled"), { code }); })("test-dialog", []), { code: "DIALOG_CANCELED" });
  }
  const failure = Object.assign(new Error("Dialog application unavailable"), { code: "ENOENT" });
  await assert.rejects(runner(async () => { throw failure; })("test-dialog", []), error => error === failure);
});

test("Editor export waits for the save route and still returns null when a delayed dialog is canceled", async () => {
  for (const cancel of [false, true]) {
    let finish;
    const run = runner(async (_command, _args, options) => {
      assert.equal(options.timeout, 0);
      return new Promise(resolve => { finish = () => resolve({ stdout: cancel ? "" : "/tmp/My Cut.mp4\n" }); });
    });
    const routes = new Map();
    registerCoreRoutes({ get() {}, post(path, handler) { routes.set(path, handler); } }, {
      selectSavePathWithDialog: () => run("test-dialog", [])
    });
    let responseSent = false;
    const pending = chooseEditorExportPath({}, body => new Promise((resolve, reject) => {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(data) { responseSent = true; resolve({ response: { ok: this.statusCode === 200 }, data }); } };
      routes.get("/api/system/select-save-path")({ body }, res).catch(reject);
    }));
    await Promise.resolve();
    assert.equal(responseSent, false);
    finish();
    assert.equal(await pending, cancel ? null : "/tmp/My Cut.mp4");
    assert.equal(responseSent, true);
  }
});

test("Windows, macOS and both Linux save backends use the untimed file-dialog runner", () => {
  for (const name of ["Windows", "Mac", "Linux"]) {
    const start = source.indexOf(`async function selectSavePathWith${name}Dialog(`);
    const remaining = source.slice(start);
    const body = remaining.slice(0, remaining.search(/\n(?:async )?function /));
    assert.match(body, /runFileDialogCommand\(/);
    assert.doesNotMatch(body, /timeout|setTimeout|AbortSignal/);
  }
});
