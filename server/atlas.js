const apiBase = "https://api.atlascloud.ai/api/v1/model";
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const transient = (status) => [408, 425, 429].includes(status) || status >= 500;

function detail(value, depth = 0) {
  if (depth > 4) return "";
  if (typeof value === "string") return /<(?:!doctype|html|head|body)\b/i.test(value) ? "" : value.slice(0, 800);
  if (Array.isArray(value)) return value.map((item) => detail(item, depth + 1)).filter(Boolean).join("; ");
  return value && typeof value === "object" ? detail(value.message || value.msg || value.detail || value.error, depth + 1) : "";
}

export function atlasError(data, status) {
  if ([401, 403].includes(status)) return "Atlas Cloud rejected the API key or its permissions. Check the enabled Atlas Cloud key in Settings.";
  return `Atlas Cloud: ${detail(data) || `HTTP ${status || 502} from the provider`}`;
}

async function readJson(response) {
  let length = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 2 * 1024 * 1024) throw fail(502, "Atlas Cloud returned an unexpectedly large response.", { retryable: true });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw fail(response.ok ? 502 : response.status, atlasError(null, response.status), { retryable: response.ok || transient(response.status) }); }
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function createAtlasClient({ fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onProgress = () => {} } = {}) {
  async function request(path, key, options = {}) {
    if (!String(key || "").trim()) throw fail(400, "Add and enable an Atlas Cloud API key in Settings first.");
    try {
      const response = await fetchImpl(`${apiBase}/${path}`, { ...options,
        headers: { ...options.headers, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(options.method === "POST" ? 120000 : 60000), redirect: "error" });
      const data = await readJson(response);
      const code = Number(data?.code);
      const errorStatus = !response.ok ? response.status : Number.isFinite(code) && code >= 400 ? code : null;
      if (errorStatus) throw fail(errorStatus, atlasError(data, errorStatus), { retryable: transient(errorStatus) });
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw fail(502, "The Atlas Cloud connection was interrupted.", { retryable: true });
    }
  }

  async function upload(asset, key) {
    if (!asset?.buffer?.length || !/^(image|video|audio)\//.test(asset.mimeType || "")) throw fail(400, "Atlas Cloud needs a valid image, video, or audio reference.");
    const body = new FormData();
    body.append("file", new Blob([asset.buffer], { type: asset.mimeType }), asset.fileName || "reference");
    const data = await request("uploadMedia", key, { method: "POST", body });
    const url = httpsUrl(data?.data?.url || data?.url || data?.data?.download_url);
    if (!url) throw fail(502, "Atlas Cloud did not return a usable reference upload URL. No generation was submitted.");
    return url;
  }

  async function generate({ mediaType, input, key }) {
    if (!["image", "video"].includes(mediaType) || !input?.model) throw fail(400, "Unsupported Atlas Cloud generation request.");
    let initial;
    try {
      initial = await request(mediaType === "video" ? "generateVideo" : "generateImage", key, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
      });
    } catch (error) {
      if (error.retryable) error.message += " The submission may have been accepted. Check Atlas Cloud history before retrying; NewtNode did not resubmit it.";
      throw error;
    }
    let job = initial?.data || initial;
    const requestId = typeof job?.id === "string" ? job.id : "";
    if (!requestId) throw fail(502, "Atlas Cloud returned no job ID. Check provider history before retrying; NewtNode did not resubmit it.");
    let errors = 0;
    let notFound = 0;
    let previousStatus = "";
    // Poll the same paid prediction with its original key. Video has no job deadline.
    for (let attempt = 0; mediaType === "video" || attempt < 600; attempt += 1) {
      const status = String(job?.status || "").toLowerCase();
      if (status !== previousStatus) { onProgress({ requestId, model: input.model, status }); previousStatus = status; }
      if (["completed", "succeeded"].includes(status)) {
        const url = Array.isArray(job.outputs) ? job.outputs.map(httpsUrl).find(Boolean) : "";
        if (!url) throw fail(502, `Atlas Cloud job ${requestId} completed without a usable output. Check provider history before rerunning.`);
        return { requestId, url, job };
      }
      if (["failed", "canceled", "cancelled", "timeout"].includes(status)) throw fail(502, `Atlas Cloud job ${requestId} ${status}: ${detail(job.error) || detail(job.message) || detail(job.msg) || "The provider ended this generation."}`);
      if (!["", "created", "pending", "queued", "starting", "processing", "running", "in_queue", "in_progress"].includes(status)) throw fail(502, `Atlas Cloud job ${requestId} has an unrecognized status. Check provider history; no cancellation or resubmission was sent.`);
      await sleep(Math.min(30000, (mediaType === "video" ? 5000 : 2000) * 2 ** Math.min(errors, 4)));
      try {
        const response = await request(`prediction/${encodeURIComponent(requestId)}`, key);
        const nextJob = response?.data || response;
        if (!nextJob?.status || (nextJob.id && nextJob.id !== requestId)) throw fail(502, "Atlas Cloud returned an invalid job status.", { retryable: true });
        job = nextJob;
        errors = 0;
        notFound = 0;
      } catch (error) {
        errors += 1;
        if (error.status === 404 && ++notFound <= 15) continue;
        if (error.retryable) continue;
        throw fail(error.status || 502, `${error.message} Check Atlas Cloud history for job ${requestId}; NewtNode did not cancel or resubmit it.`);
      }
    }
    throw fail(504, `Atlas Cloud image job ${requestId} is still pending. Check provider history before rerunning; no cancellation was sent.`);
  }
  return { upload, generate };
}
