import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedanceDraftCompletionEndpoint as endpoint, seedanceDraftLifetimeMs, seedanceDraftCost } from "../src/seedanceDraft.js";

const failure = (status, message) => Object.assign(new Error(message), { status });
const fingerprint = key => createHash("sha256").update(key).digest("hex");

// Receipts are server-owned and survive reloads/copies. Persist intent BEFORE a
// paid submit; an ambiguous submission is never retried as a new generation.
export function createSeedanceDraftStore({ directory, getKey, createClient, download, history, now = Date.now }) {
  const active = new Map();
  const file = id => {
    if (!/^[a-f0-9-]{36}$/.test(String(id))) throw failure(400, "Invalid draft receipt.");
    return path.join(directory, `${id}.json`);
  };
  async function save(record) {
    await mkdir(directory, { recursive: true });
    const target = file(record.id), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, target);
  }
  async function read(id) {
    try { return JSON.parse(await readFile(file(id), "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") throw failure(404, "This draft's receipt is on the NewtNode installation that created it. Finish it there using the original Fal key.");
      throw error;
    }
  }
  async function recordDraft({ draftId, key, startedAt, original }) {
    if (typeof draftId !== "string" || !draftId.trim()) return null;
    const record = { id: randomUUID(), draftId, keyFingerprint: fingerprint(key),
      createdAt: new Date(startedAt).toISOString(), expiresAt: new Date(startedAt + seedanceDraftLifetimeMs).toISOString(),
      original, state: "ready" };
    await save(record);
    return { receiptId: record.id, draftId, provider: "fal", createdAt: record.createdAt, expiresAt: record.expiresAt, resolution: "480p" };
  }
  async function execute(id, req) {
    const record = await read(id);
    if (record.result) return record.result;
    const key = String(getKey() || "").trim();
    if (!key || fingerprint(key) !== record.keyFingerprint) throw failure(400, "Enable the original Fal API key used for this draft before finishing it. Drafts cannot be transferred to another account or provider.");
    const client = createClient(key, endpoint);
    if (!record.remote) {
      if (record.state === "ready") {
        if (now() >= Date.parse(record.expiresAt)) throw failure(410, "This draft's seven-day finishing window has expired. Its preview is still available.");
        record.state = "submitting";
        await save(record);
        const submitted = await client.queue.submit(endpoint, { input: { draft_id: record.draftId, resolution: "1080p", codec: "auto" } });
        if (!submitted.request_id) throw failure(502, "Fal did not confirm the finishing request. Check Fal history; NewtNode will not submit it again.");
        record.requestId = submitted.request_id;
        record.state = "queued";
        await save(record);
      }
      if (!record.requestId) throw failure(409, "The finishing submission could not be confirmed. Check Fal history before taking further action; NewtNode will not submit it again.");
      // Recovery only polls the original request; there is no local job deadline.
      await client.queue.subscribeToStatus(endpoint, { requestId: record.requestId, logs: true, mode: "polling" });
      const result = await client.queue.result(endpoint, { requestId: record.requestId });
      if (!result.data?.video?.url) throw failure(502, "Fal returned no finished video. The preview has been preserved.");
      record.remote = result.data;
      record.state = "rendered";
      await save(record);
    }
    if (!record.output) {
      record.output = await download(req, record.remote.video.url, { removeAudio: record.original.settings.generateAudio === false });
      await save(record);
    }
    const cost = seedanceDraftCost("completion"), output = record.output;
    await history({ ...record.original, id: record.requestId, createdAt: new Date(now()).toISOString(), mediaType: "video",
      provider: "fal.ai", modelName: "Seedance 2.5", endpoint, mode: "Draft completion",
      settings: { ...record.original.settings, resolution: "1080p", seedanceDraft: false, seedanceDraftSource: id, seed: record.remote.seed },
      cost, remoteVideo: record.remote.video, localVideo: output.publicPath, outputFileName: output.fileName, outputBytes: output.bytes });
    record.result = { requestId: record.requestId, provider: "fal.ai", modelName: "Seedance 2.5", endpoint, seed: record.remote.seed, cost,
      seedanceDraftSource: id, video: { ...record.remote.video, localUrl: output.publicPath, fileName: output.fileName } };
    record.state = "complete";
    await save(record);
    return record.result;
  }
  function complete(id, req) {
    if (active.has(id)) return active.get(id);
    const pending = execute(id, req).finally(() => active.delete(id));
    active.set(id, pending);
    return pending;
  }
  return { recordDraft, complete, activeCount: () => active.size };
}

export function registerSeedanceDraftRoutes(app, { store, sendApiError }) {
  app.post("/api/node/seedance-draft/complete", async (req, res) => {
    try { res.json(await store.complete(req.body.receiptId, req)); }
    catch (error) { sendApiError(res, error, "Could not finish this draft. Its preview has been preserved."); }
  });
}
