import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "./json-store.js";
import { learningLimits, learningText, learningAsset, learningRecap, lessonKinds, lessonMatches, learningTopic, learningAnalysisRetryToken } from "../src/myNewt/learning.js";
import { learningAnalysisEvidence, validateLearningSummary, learningAnalysisFailure } from "./newt-learning-summary.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const eventKinds = ["context", "created", "edited", "connected", "disconnected", "removed", "results", "selected", "note"];
async function readLearningFile(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw fail("A learning record could not be read. It has not been overwritten.", 503); }
}
function identity(id) { if (typeof id !== "string" || !idPattern.test(id)) throw fail("Invalid learning record."); return id; }
function eventValue(event) {
  if (!event || !eventKinds.includes(event.kind)) throw fail("Invalid observation.");
  return { id: identity(event.id), at: Number.isFinite(event.at) ? event.at : Date.now(), kind: event.kind,
    nodeType: learningText(event.nodeType, 60), title: learningText(event.title, 100), canvas: learningText(event.canvas, 100),
    detail: learningText(event.detail), asset: learningAsset(event.asset) };
}
function lessonValue(body) {
  const title = learningText(body.title, 100), guidance = learningText(body.guidance, 1800);
  if (!title || !guidance) throw fail("Give the lesson a title and guidance before approving it.");
  if (!lessonKinds.includes(body.kind) || !["project", "personal"].includes(body.scope)) throw fail("Choose a lesson kind and scope.");
  const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).map(tag => learningText(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 12);
  if (!tags.length) throw fail("Add at least one topic so Newt knows when this lesson is relevant.");
  return { title, guidance, kind: body.kind, scope: body.scope, tags, enabled: body.enabled !== false };
}

export class NewtLearningStore {
  constructor({ directory, summarize }) {
    this.directory = directory; this.summarize = summarize; this.queue = Promise.resolve(); this.analyses = new Map();
    this.ready = mkdir(path.join(directory, "sessions"), { recursive: true, mode: 0o700 });
  }
  serial(fn) {
    const next = this.queue.catch(() => {}).then(() => this.ready).then(fn);
    this.queue = next; return next;
  }
  file(id) { return path.join(this.directory, "sessions", `${identity(id)}.json`); }
  async saveSession(session) { await writeJsonAtomic(this.file(session.id), session, { mode: 0o600 }); }
  async session(id, projectId) {
    await this.ready;
    const session = await readLearningFile(this.file(id), null);
    if (!session || session.projectId !== identity(projectId)) throw fail("Session is not in this project.", 404);
    if (!Array.isArray(session.events) || !Array.isArray(session.suggestions)) throw fail("A learning session is damaged. It has not been overwritten.", 503);
    if (session.analysis?.status === "running" && !this.analyses.has(id)) session.analysis.status = "interrupted";
    return session;
  }
  async library() {
    await this.ready;
    const value = await readLearningFile(path.join(this.directory, "lessons.json"), { revision: 0, items: [] });
    if (!value || !Number.isInteger(value.revision) || !Array.isArray(value.items)) throw fail("The learning library is damaged. It has not been overwritten.", 503);
    return value;
  }
  async saveLibrary(value) { await writeJsonAtomic(path.join(this.directory, "lessons.json"), value, { mode: 0o600 }); }
  async list(projectId) {
    identity(projectId); await this.ready;
    const sessions = [];
    for (const file of await readdir(path.join(this.directory, "sessions"))) {
      if (!/^[a-zA-Z0-9_-]+\.json$/.test(file)) continue;
      const session = await readLearningFile(path.join(this.directory, "sessions", file), null);
      if (session?.projectId === projectId) sessions.push({ id: session.id, title: session.title, createdAt: session.createdAt, finished: session.finished,
        recap: learningRecap(session.events), analysis: session.analysis?.status || "" });
    }
    const library = await this.library();
    return { sessions: sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), revision: library.revision,
      lessons: library.items.filter(item => item.scope === "personal" || item.projectId === projectId).map(item => (item.sourceProjectId || item.projectId) === projectId ? item : { ...item, evidence: [] }) };
  }
  create(body) {
    return this.serial(async () => {
      const projectId = identity(body.projectId), id = identity(body.id), existing = await readLearningFile(this.file(id), null);
      if (existing) { if (existing.projectId !== projectId) throw fail("Session belongs to another project.", 409); return existing; }
      const files = (await readdir(path.join(this.directory, "sessions"))).filter(file => /^[a-zA-Z0-9_-]+\.json$/.test(file));
      if (files.length >= 100) throw fail("The local learning library has 100 sessions. Remove older sessions before recording again.");
      const session = { id, projectId, projectName: learningText(body.projectName, 100), title: learningText(body.title, 100) || "Creative session", createdAt: new Date().toISOString(), events: [], finished: false, suggestions: [], analysis: null };
      await this.saveSession(session); return session;
    });
  }
  append(id, body) {
    return this.serial(async () => {
      const session = await this.session(id, body.projectId);
      if (session.finished) throw fail("This session has finished. Start a new recording.", 409);
      if (!Array.isArray(body.events) || body.events.length > 100) throw fail("Send at most 100 observations at once.");
      const ids = new Set(session.events.map(event => event.id));
      const fresh = body.events.map(eventValue).filter(event => { if (ids.has(event.id)) return false; ids.add(event.id); return true; });
      if (session.events.length + fresh.length > learningLimits.events) throw fail("This session has reached 600 observations. Finish and review it before starting another.");
      session.events.push(...fresh); await this.saveSession(session);
      return { count: session.events.length };
    });
  }
  finish(id, body) {
    return this.serial(async () => {
      const session = await this.session(id, body.projectId);
      if (!session.finished) {
        session.finished = true; session.finishedAt = new Date().toISOString();
        session.suggestions = session.events.filter(event => event.kind === "note").map(event => ({
          id: event.id, title: event.title || "Session note", guidance: event.detail, kind: "example", tags: [learningTopic(event.nodeType)], evidenceIds: [event.id], source: "Your note"
        }));
        await this.saveSession(session);
      }
      return session;
    });
  }
  async analyze(id, body) {
    if (body.localOnly === true) throw fail("AI suggestions are disabled in Local actions only mode.");
    if (body.consent !== true) throw fail("Confirm the paid text analysis first.");
    const session = await this.serial(async () => {
      const item = await this.session(id, body.projectId);
      if (!item.finished) throw fail("Finish recording before analysis.");
      const retryToken = learningAnalysisRetryToken(item.analysis);
      if (item.analysis && (!retryToken || body.retryToken !== retryToken)) throw fail("Analysis was already requested. Reload this session to see its status; no new request was submitted.", 409);
      if (!item.events.length) throw fail("There are no observations to analyze.");
      if (this.analyses.size) throw fail("Another session analysis is running. Review its result first.", 409);
      const { previousAttempts = [], ...previous } = item.analysis || {};
      item.analysis = { status: "running", attemptId: randomUUID(), startedAt: new Date().toISOString(),
        ...(item.analysis ? { previousAttempts: [...previousAttempts, previous] } : {}) };
      await this.saveSession(item); this.analyses.set(id, true); return item;
    });
    try {
      const result = validateLearningSummary(await this.summarize(session), learningAnalysisEvidence(session));
      return await this.serial(async () => {
        const latest = await this.session(id, body.projectId);
        latest.summary = learningText(result.summary, 1800);
        latest.suggestions.push(...result.lessons.map(lesson => ({ ...lesson, id: randomUUID(), source: "AI suggestion" })));
        latest.analysis = { ...latest.analysis, status: "complete", finishedAt: new Date().toISOString() }; await this.saveSession(latest); return latest;
      });
    } catch (error) {
      await this.serial(async () => {
        const latest = await this.session(id, body.projectId);
        latest.analysis = { ...latest.analysis, status: "failed", finishedAt: new Date().toISOString(), ...learningAnalysisFailure(error) };
        await this.saveSession(latest);
      });
      throw error;
    } finally { this.analyses.delete(id); }
  }
  approve(id, body) {
    return this.serial(async () => {
      const session = await this.session(id, body.projectId);
      if (!session.finished) throw fail("Finish the session first.");
      const candidate = session.suggestions.find(item => item.id === body.suggestionId);
      if (!candidate || candidate.dismissed) throw fail("Choose a suggestion from this session.");
      const library = await this.library();
      const existing = library.items.find(item => item.sessionId === id && item.suggestionId === candidate.id);
      if (existing) return existing;
      if (library.items.length >= learningLimits.lessons) throw fail("The library has 200 lessons. Remove or consolidate older guidance first.");
      const value = lessonValue(body);
      const evidence = session.events.filter(event => candidate.evidenceIds.includes(event.id)).slice(0, 6);
      const lesson = { ...value, id: randomUUID(), projectId: session.projectId, sourceProjectId: session.projectId, sessionId: id, suggestionId: candidate.id, revision: 1,
        approvedAt: new Date().toISOString(), evidence, history: [] };
      library.items.push(lesson); library.revision++; await this.saveLibrary(library); return lesson;
    });
  }
  note(id, body) {
    return this.serial(async () => {
      const session = await this.session(id, body.projectId);
      if (!session.finished || this.analyses.has(id)) throw fail("Finish recording and any analysis before adding a review note.");
      const event = eventValue({ id: body.id, at: Date.now(), kind: "note", title: "My takeaway", nodeType: "creative", detail: body.detail });
      if (!event.detail) throw fail("Add your takeaway first.");
      if (session.events.some(item => item.id === event.id)) return session;
      if (session.events.length >= learningLimits.events || session.suggestions.length >= 24) throw fail("This session is full. Start a new session for additional notes.");
      session.events.push(event);
      session.suggestions.push({ id: event.id, title: event.title, guidance: event.detail, kind: "procedure", tags: ["creative"], evidenceIds: [event.id], source: "Your note" });
      await this.saveSession(session); return session;
    });
  }
  dismiss(id, body) {
    return this.serial(async () => {
      const session = await this.session(id, body.projectId), item = session.suggestions.find(item => item.id === body.suggestionId);
      if (!item) throw fail("Suggestion is unavailable.");
      item.dismissed = true; await this.saveSession(session); return { dismissed: true };
    });
  }
  update(id, body) {
    return this.serial(async () => {
      const library = await this.library(), lesson = library.items.find(item => item.id === identity(id));
      if (!lesson || (lesson.scope !== "personal" && lesson.projectId !== identity(body.projectId))) throw fail("Lesson is not available in this project.", 404);
      if (lesson.revision !== body.expectedRevision) throw fail("This lesson changed elsewhere. Reload before editing.", 409);
      if (body.action === "delete") library.items = library.items.filter(item => item.id !== id);
      else {
        const previous = Object.fromEntries(["title", "guidance", "kind", "scope", "tags", "enabled"].map(key => [key, lesson[key]]));
        const value = body.action === "restore" ? lesson.history.find(item => item.revision === body.restoreRevision) : lessonValue(body);
        if (!value) throw fail("That saved revision is unavailable.");
        const normalized = lessonValue(value);
        // Moving a personal lesson to project scope uses the current project, never its old source project.
        if (normalized.scope === "project") lesson.projectId = identity(body.projectId);
        lesson.history = [...lesson.history, { ...previous, revision: lesson.revision }].slice(-10);
        Object.assign(lesson, normalized, { revision: lesson.revision + 1 });
      }
      library.revision++; await this.saveLibrary(library); return { revision: library.revision };
    });
  }
  removeSession(id, body) {
    return this.serial(async () => {
      await this.session(id, body.projectId);
      if (this.analyses.has(id)) throw fail("Wait for analysis to finish before deleting this session.", 409);
      const library = await this.library();
      // Deleting a recording also removes its approved lessons and retained evidence.
      library.items = library.items.filter(item => item.sessionId !== id); library.revision++;
      await this.saveLibrary(library); await rm(this.file(id)); return { removed: true };
    });
  }
  async retrieve(projectId, brief) {
    const library = await this.library();
    const lessons = library.items.filter(item => item.enabled && (item.scope === "personal" || item.projectId === projectId))
      .map(item => ({ item, score: lessonMatches(item, brief) })).filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.item.scope === "project") - Number(a.item.scope === "project") || a.item.id.localeCompare(b.item.id)).slice(0, 5)
      .map(({ item }) => ({ id: item.id, title: item.title, revision: item.revision, scope: item.scope, kind: item.kind, tags: item.tags, guidance: item.guidance }));
    return { revision: library.revision, lessons };
  }
}
