import path from "node:path";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { cameraCoverageEndpoint, cameraCoverageUpscaleEndpoint, validateCoverageRequest, coverageProviderInput, coverageCost } from "../src/cameraCoverage.js";

const error = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = value => createHash("sha256").update(value).digest("hex");
const validId = id => typeof id === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
const publicJob = job => ({ id: job.id, kind: job.request.kind, status: job.status, requestId: job.requestId || "",
  sourceUrl: job.request.sourceUrl, createdAt: job.createdAt, error: job.error || "", result: job.result || null,
  label: job.request.label, duration: job.request.duration, resolution: job.request.resolution, trajectory: job.request.trajectory, pathMode: job.request.pathMode || "orbit",
  protectFraming: job.request.protectFraming === true, framingRoom: job.request.framingRoom,
  cost: job.cost || null });

export function createCameraCoverageService({ directory, getKey, clientFor, prepareImage, saveResult, recordHistory, charge = async () => null, log = () => {} }) {
  const locks = new Map();
  const file = id => {
    if (!validId(id)) throw error("Invalid ReFrame request ID.");
    return path.join(directory, `${id}.json`);
  };
  async function read(id) {
    try { return JSON.parse(await readFile(file(id), "utf8")); }
    catch (e) { if (e.code === "ENOENT") return null; throw e; }
  }
  async function write(job) {
    await mkdir(directory, { recursive: true });
    const target = file(job.id), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(job));
    await rename(temporary, target);
  }
  async function locked(id, action) {
    while (locks.has(id)) await locks.get(id).catch(() => {});
    const task = action(); locks.set(id, task);
    try { return await task; } finally { if (locks.get(id) === task) locks.delete(id); }
  }
  return {
    async start(body) {
      file(body?.requestId);
      let request;
      try { request = validateCoverageRequest(body); }
      catch (e) { throw error(e.message); }
      const context = Object.fromEntries(["projectId", "projectName", "workflowName", "workflowPackageId", "workflowPackagePath", "nodeId", "nodeTitle"].map(key => [key, String(body[key] || "").slice(0, key.endsWith("Path") ? 4096 : 200)]));
      const fingerprint = digest(JSON.stringify({ request, context }));
      return locked(body.requestId, async () => {
        const existing = await read(body.requestId);
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw error("This request ID already belongs to different settings. No request was resubmitted.", 409);
          return publicJob(existing);
        }
        const key = String(getKey() || "").trim();
        if (!key) throw error("Enable your Fal API key in Settings for ReFrame and Topaz Upscale. Other providers are not used for these operations.");
        const endpoint = request.kind === "pass" ? cameraCoverageEndpoint : cameraCoverageUpscaleEndpoint;
        const client = clientFor(key, endpoint);
        // Local validation and upload precede the durable paid-submission intent.
        const imageUrl = await prepareImage(request.sourceUrl, client, request);
        const job = { id: body.requestId, fingerprint, credential: digest(key), request, context, endpoint,
          createdAt: new Date().toISOString(), status: "submitting", cost: request.kind === "pass" ? coverageCost(request.duration, request.resolution) : { amountUsd: null, currency: "USD", mediaType: "image", pricingBasis: "Topaz High Fidelity V2; settled charge when available" } };
        await write(job);
        try {
          log({ event: "submit", endpoint, context: { route: "camera-coverage", node: context.nodeId } });
          const submitted = await client.queue.submit(endpoint, { input: coverageProviderInput(request, imageUrl) });
          if (!submitted?.request_id) throw error("Fal did not return a request ID. Check Fal History before generating again.", 502);
          job.requestId = submitted.request_id; job.status = "queued";
          await write(job);
          log({ event: "enqueued", endpoint, requestId: job.requestId });
        } catch (e) {
          job.status = "uncertain";
          job.error = `Submission could not be confirmed. Check Fal History before starting another pass. No automatic retry was made. ${e.message}`;
          await write(job);
        }
        return publicJob(job);
      });
    },
    async inspect(id) {
      return locked(id, async () => {
        const job = await read(id);
        if (!job) throw error("This ReFrame job is unavailable on this installation. Check Fal History; it will not be resubmitted.", 404);
        if (["complete", "failed"].includes(job.status)) return publicJob(job);
        if (!job.requestId) return { ...publicJob(job), status: "uncertain", error: job.error || "Submission was interrupted. Check Fal History; this request will not be replayed." };
        const key = String(getKey() || "").trim();
        if (!key || digest(key) !== job.credential) throw error("Restore the original enabled Fal key to check this job. No new generation has been submitted.", 409);
        const client = clientFor(key, job.endpoint);
        if (!job.remote && !job.result) {
          const state = await client.queue.status(job.endpoint, { requestId: job.requestId, logs: false });
          if (["FAILED", "CANCELLED", "CANCELED"].includes(state.status)) {
            job.status = "failed"; job.error = "Fal reported that the request failed or was cancelled."; await write(job); return publicJob(job);
          }
          if (state.status !== "COMPLETED") return { ...publicJob(job), status: state.status === "IN_PROGRESS" ? "running" : "queued" };
          let result;
          try { result = await client.queue.result(job.endpoint, { requestId: job.requestId }); }
          catch (e) {
            if ([400, 422].includes(Number(e.status || e.statusCode))) {
              job.status = "failed"; job.error = `Fal could not complete this request: ${e.message}`; await write(job); return publicJob(job);
            }
            throw e;
          }
          job.remote = job.request.kind === "pass" ? result?.data?.video : result?.data?.image;
          if (!job.remote?.url) {
            job.status = "failed"; job.error = "Fal completed without a usable file. Check Fal History before generating again."; await write(job); return publicJob(job);
          }
          // Preserve the returned URL before local download so saving can be retried without billing again.
          job.status = "saving"; await write(job);
        }
        if (!job.result) {
          job.result = await saveResult(job);
          await write(job);
        }
        const settled = await charge(job.requestId, job.endpoint, key).catch(() => null);
        if (settled) job.cost = { ...job.cost, ...settled };
        await recordHistory(job);
        job.status = "complete"; job.error = ""; await write(job);
        log({ event: "completed", endpoint: job.endpoint, requestId: job.requestId });
        return publicJob(job);
      });
    }
  };
}

export function registerCameraCoverageRoutes(app, { service, capture, sendError }) {
  app.post("/api/node/camera-coverage", async (req, res) => {
    try { res.status(202).json(await service.start(req.body)); }
    catch (e) { sendError(res, e, "ReFrame could not start."); }
  });
  app.get("/api/node/camera-coverage/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await service.inspect(req.params.id)); }
    catch (e) { sendError(res, e, "Could not check ReFrame. This request has not been resubmitted."); }
  });
  app.post("/api/node/camera-coverage-capture", async (req, res) => {
    try {
      if (!Number.isFinite(req.body.frameTime) || req.body.frameTime < 0) throw error("Choose a valid frame time.");
      res.json(await capture(req.body));
    } catch (e) { sendError(res, e, "Could not capture this frame."); }
  });
}
