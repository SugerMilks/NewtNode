import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import { NewtSkillStore, newtSkillContext, newtSkillLimit } from "../server/newt-skills.js";
import { registerNewtSkillRoutes } from "../server/routes/newtSkills.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "newt-skills-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "custom"), systemDirectory = path.join(root, "system");
  await mkdir(systemDirectory);
  const entry = { id: "test-skill", title: "Test Skill", scope: "Creative tests", version: "1.0.0" };
  const bundle = async (version = "1.0.0", instructions = "Prefer established workflows.") => {
    await writeFile(path.join(systemDirectory, "manifest.json"), JSON.stringify({ schemaVersion: 1, skills: [{ ...entry, version }] }));
    await writeFile(path.join(systemDirectory, "test-skill.md"), instructions);
  };
  await bundle();
  const store = new NewtSkillStore({ directory, systemDirectory });
  return { root, directory, systemDirectory, store, bundle };
}

test("bundled skills are bounded, versioned, scoped preferences with no authorization tools", async () => {
  const store = new NewtSkillStore();
  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.skills.map(item => item.id), ["workflow-planning", "cinematic-narrative", "asset-selection", "canvas-organization",
    "image-direction", "visual-exploration", "character-preparation", "storyboard-direction", "editorial-handoff"]);
  for (const item of snapshot.skills) {
    assert.equal(item.source, "System"); assert.match(item.version, /^\d+\.\d+\.\d+$/);
    assert.ok(item.instructions.length <= newtSkillLimit); assert.ok(item.scope);
  }
  assert.match(snapshot.skills[0].instructions, /preserve|Preserve/);
  assert.match(snapshot.skills[1].instructions, /not every image/);
  assert.match(snapshot.skills[2].instructions, /not visual approval/);
  assert.match(newtSkillContext(snapshot).guidance, /cannot authorize access/);
  assert.equal((await store.publicList())[0].history, undefined);
});

test("every bundled Markdown skill is registered and leaves room for local preferences", async () => {
  const directory = new URL("../server/newt-skills/", import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith(".md")).sort();
  const snapshot = await new NewtSkillStore().snapshot();
  assert.deepEqual(snapshot.skills.map(item => `${item.id}.md`).sort(), files);
  assert.ok(snapshot.skills.reduce((total, item) => total + item.instructions.length, 0) <= 21000,
    "Keep at least 3,000 characters of the 24,000-character allowance free for local customization.");
});

test("a new bundled skill is discovered live without replacing custom or disabled skills", async t => {
  const f = await fixture(t), original = (await f.store.publicList())[0];
  await f.store.update(original.id, { expectedRevision: original.revision, instructions: "Keep my own workflow", enabled: false });
  const before = await f.store.snapshot();
  const manifestPath = path.join(f.systemDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.skills[0].version = "1.1.0";
  manifest.skills.push({ id: "new-tutorial", title: "New Tutorial", scope: "Relevant creative work", version: "1.0.0" });
  await writeFile(path.join(f.systemDirectory, "new-tutorial.md"), "Preserve approved source media.");
  await writeFile(manifestPath, JSON.stringify(manifest));
  const [custom, added] = await f.store.publicList();
  assert.equal(custom.source, "Custom"); assert.equal(custom.instructions, "Keep my own workflow");
  assert.equal(custom.enabled, false); assert.equal(custom.baseVersion, "1.0.0"); assert.equal(custom.version, "1.1.0");
  assert.equal(added.source, "System"); assert.equal(added.enabled, true);
  assert.deepEqual((await f.store.snapshot()).skills.map(item => item.id), ["new-tutorial"]);
  assert.deepEqual(before.skills, []);
});

test("customizations persist, reject stale saves, and are immutable in earlier snapshots", async t => {
  const f = await fixture(t), original = (await f.store.publicList())[0], snapshot = await f.store.snapshot();
  const edited = await f.store.update(original.id, { expectedRevision: original.revision, instructions: "  Start with approved casting.  ", enabled: true });
  assert.equal(edited.instructions, "Start with approved casting."); assert.equal(edited.source, "Custom");
  assert.equal(edited.savedRevisions, 1); assert.notEqual(edited.revision, original.revision);
  assert.equal(snapshot.skills[0].instructions, original.instructions);
  const recovered = new NewtSkillStore(f);
  assert.deepEqual(await recovered.publicList(), await f.store.publicList());
  await assert.rejects(f.store.update(original.id, { expectedRevision: original.revision, instructions: "Overwrite", enabled: true }), { status: 409 });
  assert.equal((await recovered.publicList())[0].instructions, edited.instructions);
  const disabled = await f.store.update(original.id, { expectedRevision: edited.revision, instructions: edited.instructions, enabled: false });
  assert.deepEqual((await f.store.snapshot()).skills, []);
  await f.store.update(original.id, { expectedRevision: disabled.revision }, true);
  assert.equal((await f.store.publicList())[0].source, "System");
  assert.equal((await f.store.snapshot()).skills[0].instructions, original.instructions);
});

test("system upgrades preserve custom text and expose the latest version for reset", async t => {
  const f = await fixture(t), original = (await f.store.publicList())[0];
  const custom = await f.store.update(original.id, { expectedRevision: original.revision, instructions: "My preferred process", enabled: false });
  await f.bundle("2.0.0", "Updated system guidance");
  const upgraded = (await f.store.publicList())[0];
  assert.equal(upgraded.instructions, custom.instructions); assert.equal(upgraded.enabled, false);
  assert.equal(upgraded.baseVersion, "1.0.0"); assert.equal(upgraded.version, "2.0.0");
  assert.notEqual(upgraded.revision, custom.revision);
  const reset = await f.store.update(upgraded.id, { expectedRevision: upgraded.revision }, true);
  assert.equal(reset.instructions, "Updated system guidance"); assert.equal(reset.baseVersion, "2.0.0");
  await f.bundle("3.0.0", "Latest system guidance");
  assert.equal((await f.store.publicList())[0].instructions, "Latest system guidance");
});

test("invalid edits cannot change disk; concurrent edits conflict and history stays bounded", async t => {
  const f = await fixture(t); let item = (await f.store.publicList())[0];
  for (const instructions of [null, 2, {}, "", " ", "x\0y", "x".repeat(newtSkillLimit + 1)]) {
    await assert.rejects(f.store.update(item.id, { expectedRevision: item.revision, instructions, enabled: true }), { status: 400 });
  }
  await assert.rejects(f.store.update(item.id, null), { status: 400 });
  await assert.rejects(f.store.update("../../test", { expectedRevision: item.revision }), { status: 404 });
  await assert.rejects(f.store.update(item.id, { expectedRevision: item.revision, instructions: "okay", enabled: "yes" }), { status: 400 });
  const edits = await Promise.allSettled(["First", "Second"].map(instructions => f.store.update(item.id, { expectedRevision: item.revision, instructions, enabled: true })));
  assert.equal(edits.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(edits.find(result => result.status === "rejected").reason.status, 409);
  item = (await f.store.publicList())[0];
  for (let i = 0; i < 12; i++) item = await f.store.update(item.id, { expectedRevision: item.revision, instructions: `Revision ${i}`, enabled: true });
  assert.equal(item.savedRevisions, 10);
  await writeFile(path.join(f.directory, `${item.id}.json`), "broken JSON");
  await assert.rejects(f.store.publicList(), { status: 503 });
  await assert.rejects(f.store.update(item.id, { expectedRevision: item.revision }, true), { status: 503 });
  assert.equal(await readFile(path.join(f.directory, `${item.id}.json`), "utf8"), "broken JSON");
});

test("skill routes save, conflict and reset without any provider call", async t => {
  const f = await fixture(t), app = express(); app.use(express.json());
  registerNewtSkillRoutes(app, f);
  const server = await new Promise((resolve, reject) => { const handle = app.listen(0, "127.0.0.1", error => error ? reject(error) : resolve(handle)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/my-newt/skills`;
  const [item] = await (await fetch(url)).json();
  const post = (suffix, body) => fetch(`${url}/${item.id}${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const saved = await (await post("", { expectedRevision: item.revision, instructions: "Local preference", enabled: true })).json();
  assert.equal(saved.source, "Custom");
  assert.equal((await post("", { expectedRevision: item.revision, instructions: "Stale", enabled: true })).status, 409);
  assert.equal((await (await post("/reset", { expectedRevision: saved.revision })).json()).source, "System");
});
