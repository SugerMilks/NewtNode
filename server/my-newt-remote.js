import express from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./json-store.js";

const secret = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, limit = 3000) => typeof value === "string" ? value.slice(0, limit) : "";
const onlineMs = 15000;
const sessionMs = 30 * 24 * 60 * 60 * 1000;
const mediaPattern = /^\/(?:uploads|outputs|workflow-assets)\/[^?#]+\.(?:png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|m4a|ogg)$/i;
const actions = new Set(["start", "continue", "note", "approve-plan", "approve", "resume", "pause", "stop"]);

export function remoteControlVersion(job) {
  if (job.controlVersion) return job.controlVersion;
  return hash(JSON.stringify([job.id, job.status, job.noteVersion || 0, job.settings, job.plan,
    job.pending?.id, job.pending?.preview, job.pending?.approved, job.pending?.claimed]));
}

export function validateRemoteAction(action, note, job) {
  if (!actions.has(action)) throw fail("This remote action is not available.");
  const terminal = !job || ["complete", "stopped"].includes(job.status);
  if (["start", "continue"].includes(action) && !terminal) throw fail("Finish or stop the current task first.", 409);
  if (!["start", "continue"].includes(action) && terminal) throw fail("This task has ended. Start a new task.", 409);
  if (action === "continue" && !job) throw fail("There is no task to continue.", 409);
  if (["start", "continue", "note"].includes(action) && !note.trim()) throw fail("Enter direction for Newt.");
  if (action === "approve-plan" && job?.status !== "plan-approval") throw fail("There is no plan awaiting approval.", 409);
  if (action === "approve" && (job?.status !== "approval" || !job.pending?.preview)) throw fail("Review the prepared run before approving it.", 409);
  if (action === "resume" && !["paused", "waiting"].includes(job?.status)) throw fail("Use the specific approval for this task.", 409);
  if (!["start", "continue", "note"].includes(action) && note) throw fail("Send new direction separately from an approval.");
}

// Deliberately omit graph snapshots, checkpoints, credentials, receipts and local paths.
function remoteJob(job, room) {
  if (!job) { room.media.clear(); return null; }
  const preview = job.pending?.preview;
  const outputs = (job.outputs || []).slice(-80).map((output) => {
    const url = text(output.url, 4000);
    let mediaUrl = "";
    if (mediaPattern.test(url) && !url.split("/").includes("..")) {
      let id = [...room.media].find(([, value]) => value === url)?.[0];
      if (!id) { id = randomUUID(); room.media.set(id, url); }
      mediaUrl = `/remote-api/media/${id}`;
    }
    return { label: text(output.label, 200), kind: text(output.type || output.kind, 30), text: text(output.text, 16000), mediaUrl,
      mediaType: /\.(mp4|webm|mov)$/i.test(url) ? "video" : /\.(mp3|wav|m4a|ogg)$/i.test(url) ? "audio" : "image" };
  });
  const activeUrls = new Set((job.outputs || []).map((item) => item.url));
  for (const [id, url] of room.media) if (!activeUrls.has(url)) room.media.delete(id);
  return { id: job.id, controlVersion: remoteControlVersion(job), status: job.status, brief: text(job.brief, 16000),
    message: text(job.message), spent: job.spent, reserved: job.reserved, remaining: job.remaining,
    budget: job.settings?.budget, steps: job.steps, execution: job.execution === "local" ? "local" : "ai", outputs,
    plan: job.plan ? { summary: text(job.plan.summary, 8000), estimatedGenerationCost: job.plan.estimatedGenerationCost,
      steps: (job.plan.steps || []).slice(0, 100).map((step) => ({ id: step.id, title: text(step.title, 500), status: step.status })) } : null,
    pending: job.pending ? { id: job.pending.id, preview: preview ? {
      ...Object.fromEntries(["title", "model", "provider", "stage", "count", "resolution", "aspectRatio", "duration", "quality", "audio", "estimatedCost", "upperBound", "additionalUsage", "prompt"].map((key) => [key, typeof preview[key] === "string" ? text(preview[key], 16000) : typeof preview[key] === "number" || typeof preview[key] === "boolean" ? preview[key] : null])),
      references: (preview.references || []).map((item) => text(item.label, 200)).filter(Boolean)
    } : null } : null,
    activity: (job.activity || []).slice(-40).map((item) => ({ id: item.id, at: item.at, text: text(item.text) })) };
}

export class MyNewtRemote {
  constructor({ getJob, resolveAsset, distDirectory, trustPath, port = 3337, now = Date.now }) {
    Object.assign(this, { getJob, resolveAsset, distDirectory, trustPath, port, now });
    this.room = null; this.server = null; this.starting = null;
    this.trust = { enabled: false, origin: "", devices: [] };
    this.sessions = new Map(); this.writes = Promise.resolve();
    this.app = this.createGateway();
    this.ready = this.loadTrust();
  }
  validOrigin(value) {
    const localOrigin = `http://127.0.0.1:${this.port}`;
    try {
      const url = new URL(value || localOrigin), origin = url.origin;
      if (url.href !== `${origin}/` || (origin !== localOrigin && !(url.protocol === "https:" && url.hostname.endsWith(".ts.net") && !url.port && !url.username && !url.password))) throw new Error();
      return origin;
    } catch { throw fail("Use the exact HTTPS .ts.net address from Tailscale Serve, or leave it empty for local testing."); }
  }
  async loadTrust() {
    if (!this.trustPath) return;
    const saved = await readJsonFile(this.trustPath, null);
    if (!saved || saved.version !== 1) return;
    try {
      this.trust = { enabled: saved.enabled === true, origin: this.validOrigin(saved.origin),
        devices: (Array.isArray(saved.devices) ? saved.devices : []).filter((device) =>
          /^[a-f0-9]{64}$/.test(device.tokenHash) && typeof device.id === "string" && typeof device.name === "string" &&
          Number.isFinite(device.expiresAt) && device.expiresAt > this.now()).slice(0, 5) };
    } catch { return; }
    // A busy remote port must not prevent the main editor/API from starting.
    if (this.trust.enabled) await this.startServer().catch((error) => console.warn("Newt Remote could not start:", error.message));
  }
  updateTrust(change) {
    const operation = this.writes.then(async () => {
      const next = structuredClone(this.trust);
      next.devices = next.devices.filter((device) => device.expiresAt > this.now());
      change(next);
      if (this.trustPath) await writeJsonAtomic(this.trustPath, { version: 1, ...next }, { mode: 0o600 });
      this.trust = next;
    });
    this.writes = operation.catch(() => {});
    return operation;
  }
  detach() {
    this.room = null;
    for (const session of this.sessions.values()) session.roomId = null;
  }
  active() {
    if (this.room && this.now() - this.room.seenAt > 90000) this.detach();
    return this.room;
  }
  host(body) {
    const room = this.active();
    if (!room || hash(body.hostToken) !== room.hostHash || body.clientId !== room.clientId) throw fail("The home connection has ended. Reconnecting to remote access...", 401);
    return room;
  }
  async startServer() {
    if (this.server) return;
    if (!this.starting) this.starting = new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, "127.0.0.1");
      server.once("error", reject);
      server.once("listening", () => { this.server = server; resolve(); });
    }).finally(() => { this.starting = null; });
    await this.starting;
  }
  async enable(body, resume = false) {
    await this.ready;
    if (resume && !this.trust.enabled) return this.hostStatus();
    const previous = this.active();
    if (previous && previous.clientId !== body.clientId && this.now() - previous.seenAt < onlineMs) throw fail("Another editor has remote access enabled. Close it or disable remote access there first.", 409);
    if (!text(body.projectId, 200) || !text(body.nodeId, 200) || !text(body.clientId, 200)) throw fail("Open a saved project with a Newt node first.");
    const origin = resume ? this.trust.origin : this.validOrigin(body.origin || this.trust.origin);
    await this.startServer();
    if (!resume) await this.updateTrust((next) => {
      if (this.active() !== previous) throw fail("Another editor enabled remote access first.", 409);
      if (next.origin !== origin) next.devices = [];
      next.enabled = true; next.origin = origin;
    });
    if (!this.trust.enabled) return this.hostStatus();
    if (this.active() !== previous) throw fail("Another editor enabled remote access first.", 409);
    this.detach();
    const hostToken = secret();
    this.room = { id: randomUUID(), projectId: body.projectId, nodeId: body.nodeId, clientId: body.clientId,
      projectName: text(body.projectName, 200), hostHash: hash(hostToken), origin, jobId: "", budget: 0,
      seenAt: this.now(), commands: new Map(), media: new Map(), attempts: [], pairing: null };
    return { ...this.hostStatus(this.room), hostToken };
  }
  hostStatus(room) {
    return { enabled: this.trust.enabled, origin: this.trust.origin, projectName: room?.projectName || "",
      devices: this.trust.devices.filter((device) => device.expiresAt > this.now()).map(({ id, name, expiresAt }) => ({ id, name, expiresAt })) };
  }
  async hostAction(action, body) {
    await this.ready;
    if (action === "status") return this.hostStatus(this.active());
    if (action === "enable") return this.enable(body);
    if (action === "resume") return this.enable(body, true);
    const room = this.host(body);
    if (action === "detach") { this.detach(); return this.hostStatus(); }
    if (action === "disable") {
      await this.updateTrust((next) => { next.enabled = false; next.devices = []; });
      this.sessions.clear(); await this.close(); return this.hostStatus();
    }
    if (action === "pair") {
      const code = randomBytes(12).toString("base64url");
      room.pairing = { hash: hash(code), expiresAt: this.now() + 5 * 60000 };
      return { code, expiresAt: room.pairing.expiresAt };
    }
    if (action === "revoke") {
      await this.updateTrust((next) => { next.devices = next.devices.filter((device) => body.deviceId && device.id !== body.deviceId); });
      for (const [key, session] of this.sessions) if (!body.deviceId || session.id === body.deviceId) this.sessions.delete(key);
      for (const command of room.commands.values()) if ((!body.deviceId || command.deviceId === body.deviceId) && command.status === "queued") { command.status = "cancelled"; command.message = "Device access was revoked."; }
      return this.hostStatus(room);
    }
    if (action !== "heartbeat") throw fail("Unknown home editor action.");
    if (body.projectId !== room.projectId || body.nodeId !== room.nodeId) { this.detach(); throw fail("The home project changed. Reconnect to the current project.", 409); }
    room.seenAt = this.now(); room.projectName = text(body.projectName, 200);
    room.jobId = text(body.jobId, 200); room.budget = Number(body.budget) || 0;
    const receipt = body.receipt;
    if (receipt) {
      const command = room.commands.get(receipt.id);
      if (command?.status === "delivered") { command.status = receipt.ok ? "accepted" : "failed"; command.message = text(receipt.message) || (receipt.ok ? "Accepted by the home editor." : "Command was not accepted. Review the home task before retrying."); }
    }
    const job = this.currentJob(room);
    let deliver = null;
    for (const command of room.commands.values()) {
      if (command.status === "delivered" && this.now() - command.deliveredAt > 30000) { command.status = "uncertain"; command.message = "Home acknowledgement was lost. Check task progress before sending another command; this command will not be replayed."; }
      if (command.status !== "queued") continue;
      if (command.connectionId !== room.id || this.now() - command.at > onlineMs || command.budget !== room.budget || command.jobId !== (job?.id || "") || command.version !== (job ? remoteControlVersion(job) : "")) {
        command.status = "cancelled"; command.message = "The task changed or this command expired. Review the latest state."; continue;
      }
      if (body.busy) continue;
      try { validateRemoteAction(command.action, command.note, job); }
      catch (error) { command.status = "cancelled"; command.message = error.message; continue; }
      command.status = "delivered"; command.deliveredAt = this.now(); deliver = command; break;
    }
    return { ...this.hostStatus(room), command: deliver };
  }
  currentJob(room) { return room.jobId ? this.getJob(room.jobId, room.projectId, room.nodeId) : null; }
  session(req, requireProject = false) {
    const room = this.active();
    const token = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("newt_remote="))?.slice(12);
    const tokenHash = hash(token);
    const device = this.trust.devices.find((item) => item.tokenHash === tokenHash && item.expiresAt > this.now());
    if (!device) throw fail("Pair this device with the home editor.", 401);
    let session = this.sessions.get(tokenHash);
    if (!session) { session = { ...device, csrf: secret(), roomId: null }; this.sessions.set(tokenHash, session); }
    if (requireProject && (!room || session.roomId !== room.id)) throw fail("Confirm the current project before continuing.", 409);
    return { room, session };
  }
  createGateway() {
    const app = express();
    app.disable("x-powered-by");
    app.use((req, res, next) => {
      res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
      const { enabled, origin } = this.trust;
      if (!enabled || req.headers.host !== new URL(origin).host) return res.status(403).json({ error: "Remote access is disabled or this address is not paired with the home editor." });
      if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({ error: "This origin is not allowed." });
      if (req.method !== "GET" && (req.headers.origin !== origin || !req.is("application/json") || req.headers["x-newt-remote"] !== "1")) return res.status(403).json({ error: "Use the paired remote page." });
      next();
    });
    app.use(express.json({ limit: "32kb", strict: true }));
    const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } };
    app.post("/remote-api/pair", wrap(async (req, res) => {
      const room = this.active();
      if (!room) throw fail("Open a project with Newt on the home computer first.", 409);
      room.attempts = room.attempts.filter((at) => this.now() - at < 60000);
      if (room.attempts.length >= 8) throw fail("Too many pairing attempts. Wait a minute.", 429);
      room.attempts.push(this.now());
      if (!room.pairing || room.pairing.expiresAt <= this.now() || room.pairing.hash !== hash(text(req.body.code, 100).trim())) throw fail("The pairing code is invalid or expired.", 401);
      if (this.now() - room.seenAt > onlineMs) throw fail("The home editor is offline.", 409);
      const pairing = room.pairing; room.pairing = null;
      const token = secret(), device = { id: randomUUID(), name: text(req.body.name, 80).trim() || "Remote device", tokenHash: hash(token), expiresAt: this.now() + sessionMs };
      try {
        await this.updateTrust((next) => {
          if (this.active() !== room || !next.enabled) throw fail("The home project changed. Create a new pairing code.", 409);
          if (next.devices.length >= 5) throw fail("Revoke an old device in Newt Settings first.");
          next.devices.push(device);
        });
      } catch (error) { if (this.active() === room && !room.pairing) room.pairing = pairing; throw error; }
      this.sessions.set(device.tokenHash, { ...device, csrf: secret(), roomId: null });
      res.cookie("newt_remote", token, { httpOnly: true, secure: room.origin.startsWith("https:"), sameSite: "strict", path: "/", maxAge: sessionMs });
      res.json({ paired: true });
    }));
    app.get("/remote-api/status", wrap((req, res) => {
      const { room, session } = this.session(req);
      const confirmed = !!room && session.roomId === room.id;
      const job = confirmed ? this.currentJob(room) : null;
      res.json({ connectionId: room?.id || "", requiresConfirmation: !!room && !confirmed,
        projectName: room?.projectName || "", online: !!room && this.now() - room.seenAt < onlineMs, budget: room?.budget || 0,
        csrf: session.csrf, deviceName: session.name, job: confirmed ? remoteJob(job, room) : null,
        commands: confirmed ? [...room.commands.values()].filter((item) => item.deviceId === session.id).slice(-10).map(({ id, action, status, message }) => ({ id, action, status, message })) : [] });
    }));
    app.post("/remote-api/connect", wrap((req, res) => {
      const { room, session } = this.session(req);
      if (req.headers["x-newt-csrf"] !== session.csrf) throw fail("Refresh before connecting to this project.", 403);
      if (!room || req.body.connectionId !== room.id || this.now() - room.seenAt >= onlineMs) throw fail("The home project changed or is offline. Refresh and confirm it again.", 409);
      session.roomId = room.id;
      res.json({ connected: true });
    }));
    app.post("/remote-api/command", wrap((req, res) => {
      const { room, session } = this.session(req, true);
      if (req.headers["x-newt-csrf"] !== session.csrf) throw fail("Refresh the paired page before sending a command.", 403);
      const body = req.body;
      if (body.connectionId !== room.id) throw fail("The home project changed. Confirm the current project before sending a command.", 409);
      if (!/^[a-f0-9-]{36}$/.test(body.id || "")) throw fail("A unique command ID is required.");
      const previous = room.commands.get(body.id);
      if (previous) {
        if (previous.deviceId !== session.id || previous.action !== body.action || previous.note !== body.note) throw fail("This command ID was already used.", 409);
        return res.json({ id: previous.id, status: previous.status });
      }
      if (this.now() - room.seenAt >= onlineMs) throw fail("The home editor is offline. Nothing was queued.", 409);
      if (body.budget !== room.budget) throw fail("The task budget changed. Review it before sending this command.", 409);
      if ([...room.commands.values()].some((item) => ["queued", "delivered"].includes(item.status))) throw fail("Wait for the home editor to acknowledge the previous command.", 409);
      if (room.commands.size >= 500) throw fail("This remote session reached its command limit. Disable and pair again at home.");
      const job = this.currentJob(room);
      if (body.jobId !== (job?.id || "") || body.version !== (job ? remoteControlVersion(job) : "")) throw fail("The task changed. Review the latest state before sending this command.", 409);
      if (typeof body.note !== "string" || body.note.length > 16000) throw fail("Direction must be 16,000 characters or fewer.");
      validateRemoteAction(body.action, body.note, job);
      const command = { id: body.id, connectionId: room.id, deviceId: session.id, action: body.action, note: body.note, jobId: body.jobId, version: body.version, budget: room.budget, at: this.now(), status: "queued", message: "Waiting for the home editor." };
      room.commands.set(command.id, command);
      res.json({ id: command.id, status: command.status });
    }));
    app.post("/remote-api/logout", wrap(async (req, res) => {
      const { room, session } = this.session(req);
      if (req.headers["x-newt-csrf"] !== session.csrf) throw fail("Refresh before disconnecting.", 403);
      await this.updateTrust((next) => { next.devices = next.devices.filter((device) => device.id !== session.id); });
      this.sessions.delete(session.tokenHash);
      for (const command of room?.commands.values() || []) if (command.deviceId === session.id && command.status === "queued") command.status = "cancelled";
      res.clearCookie("newt_remote", { path: "/" }); res.json({ ok: true });
    }));
    app.get("/remote-api/media/:id", wrap(async (req, res) => {
      const { room } = this.session(req, true);
      remoteJob(this.currentJob(room), room);
      const url = room.media.get(req.params.id);
      if (!url || !mediaPattern.test(url)) throw fail("This result is no longer available in the current task.", 404);
      const asset = await this.resolveAsset(url);
      if (this.session(req, true).room !== room) throw fail("The home project changed.", 409);
      res.sendFile(asset.filePath);
    }));
    // Serve only the remote entry's dependency graph, never the editor or API settings.
    app.get(["/", "/assets/:asset", "/newt-mark.png"], wrap(async (req, res) => {
      if (req.path === "/newt-mark.png") return res.sendFile(path.join(this.distDirectory, "newt-mark.png"));
      const manifest = JSON.parse(await readFile(path.join(this.distDirectory, ".vite/manifest.json"), "utf8"));
      const allowed = new Set(), seen = new Set();
      const collect = (key) => { if (seen.has(key)) return; seen.add(key); const item = manifest[key]; if (!item) return;
        allowed.add(`/${item.file}`); for (const css of item.css || []) allowed.add(`/${css}`); for (const dependency of [...(item.imports || []), ...(item.dynamicImports || [])]) collect(dependency); };
      collect("remote.html");
      if (req.path !== "/" && !allowed.has(req.path)) throw fail("Not found.", 404);
      res.sendFile(path.join(this.distDirectory, req.path === "/" ? "remote.html" : req.path));
    }));
    app.use((req, res) => res.status(404).json({ error: "This route is not available remotely." }));
    app.use((error, req, res, next) => { if (res.headersSent) return next(error); res.status(error.status || 400).json({ error: "The remote request could not be read." }); });
    return app;
  }
  async close() {
    this.detach();
    const server = this.server; this.server = null;
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  }
}

export function registerMyNewtRemoteRoutes(app, options) {
  const remote = new MyNewtRemote(options);
  app.post("/api/my-newt/remote/:action", async (req, res) => {
    const origin = req.headers.origin;
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    let host;
    try { host = new URL(`http://${req.headers.host}`).hostname; } catch { host = ""; }
    if (!loopback || !["127.0.0.1", "localhost", "[::1]"].includes(host) || !options.localOrigins.includes(origin) || req.headers["x-newt-local"] !== "1") return res.status(403).json({ error: "Remote access settings are only available in the local editor." });
    try { res.json(await remote.hostAction(req.params.action, req.body || {})); }
    catch (error) { res.status(error.status || 400).json({ error: error.message }); }
  });
  return remote;
}
