import { scopedMyNewtRequest } from "../myNewt/requestScope.js";
import { isVideoGenerationRequest } from "../videoJobPolicy.js";
import { isNanoBanana21Model } from "../nanoBanana21.js";
const localApiPort = import.meta.env?.VITE_API_PORT || "3336";
const localApiBaseUrl = `http://127.0.0.1:${localApiPort}`;

function ensureOk(response, data, fallbackMessage) {
  if (!response.ok) {
    const error = new Error(data?.error || fallbackMessage || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function fetchJsonApi(path, options = {}, label = "Request") {
  if (["/api/output/validate", "/api/output/export"].includes(path) && ["svg", "alpha"].includes(JSON.parse(options.body || "{}").destinations?.image?.format)) {
    const health = await getJson("/api/health", "Could not verify Vector export support.");
    if (health.routes?.vectorArtworkEditor !== true) throw Object.assign(new Error("Restart NewtNode to activate SVG and alpha export. No files were exported."), { status: 409 });
  }
  if (path.startsWith("/api/vector-looks")) {
    const health = await getJson("/api/health", "Could not verify saved looks support.");
    if (health.routes?.vectorArtworkEditor !== true) throw new Error("Restart NewtNode to activate saved Vector looks.");
    const response = await fetch(localApiFetchUrl(path), options);
    return { response, data: await readJsonResponse(response, label) };
  }
  if (path.startsWith("/api/node/vector-layers/")) {
    const health = await getJson("/api/health", "Could not verify Vector layer support.");
    if (health.routes?.vectorLayers !== true) throw new Error("Restart NewtNode to activate Vector layers. Your artwork is unchanged.");
    const layerBody = JSON.parse(options.body || "{}");
    if (layerBody.editorVersion >= 2 && health.routes?.vectorLayerEditor !== true) throw new Error("Restart NewtNode to activate the expanded Vector Layers editor. Your artwork is unchanged.");
    if (layerBody.editorVersion >= 3 && health.routes?.vectorLayerTransforms !== true) throw new Error("Restart NewtNode to activate moving and resizing Vector layers. Your artwork is unchanged.");
    if (layerBody.editorVersion >= 4 && health.routes?.vectorLayerOrganization !== true) throw new Error("Restart NewtNode to activate Vector grouping and automatic backgrounds. Your artwork is unchanged.");
    if (layerBody.editorVersion >= 5 && health.routes?.vectorLayerAutoGroups !== true) throw new Error("Restart NewtNode to activate automatic Text and Background groups. Your artwork is unchanged.");
    if (layerBody.editorVersion >= 6 && health.routes?.vectorArtworkEditor !== true) throw new Error("Restart NewtNode to activate Edit Artwork, colors and editable text. Your original artwork is unchanged.");
    const edits = (layerBody.operations || []).flatMap(operation => operation?.type === "batch" ? operation.operations || [] : [operation]);
    if (edits.some(operation => operation?.type === "group" && operation.mode === "selection") && health.routes?.vectorSelectionGrouping !== true) throw new Error("Restart NewtNode to activate grouping across selected layers. Your original artwork is unchanged.");
    options.signal?.throwIfAborted();
    const response = await fetch(localApiFetchUrl(path), options);
    return { response, data: await readJsonResponse(response, label) };
  }
  if (path === "/api/node/ideogram-vector" && options.method === "POST") {
    const health = await getJson("/api/health", "Could not verify Ideogram Vector support.");
    if (health.routes?.ideogramVector !== true) throw Object.assign(new Error("Restart NewtNode to activate Ideogram Vector. No generation was submitted."), { status: 409, noSubmission: true });
    options.signal?.throwIfAborted();
  }
  if (path === "/api/node/camera-coverage" || path === "/api/node/camera-coverage-capture") {
    const health = await getJson("/api/health", "Could not verify ReFrame support.");
    if (health.routes?.cameraCoverage !== true) throw Object.assign(new Error("Restart NewtNode to activate ReFrame. No generation was submitted."), { status: 409 });
    const body = JSON.parse(options.body || "{}");
    if (path === "/api/node/camera-coverage" && body.kind === "pass" && body.protectFraming === true && health.routes?.cameraCoverageFraming !== true) {
      throw Object.assign(new Error("Restart NewtNode to activate Protect Framing. No generation was submitted."), { status: 409 });
    }
    if (path === "/api/node/camera-coverage" && body.kind === "pass" && (body.pathMode === "travel" || body.poses?.length > 6) && health.routes?.cameraCoverageTravel !== true) {
      throw Object.assign(new Error("Restart NewtNode to activate straight camera travel and updated path limits. No generation was submitted."), { status: 409 });
    }
  }
  if (["/api/node/storyboard-plan-v2", "/api/node/storyboard-revise", "/api/node/storyboard-review", "/api/node/storyboard-script-build"].includes(path) && JSON.parse(options.body || "{}").storyboardCameraPersonality) {
    const health = await getJson("/api/health", "Could not verify Storyboard Camera Personality support.");
    if (health.routes?.storyboardCinematography !== true) throw new Error("Restart NewtNode to activate Storyboard Camera Personality. No AI planning was submitted.");
  }
  if (path === "/api/node/generate-image") {
    const body = JSON.parse(options.body || "{}");
    if (isNanoBanana21Model(body.model)) {
      const health = await getJson("/api/health", "Could not verify Nano Banana 2.1 support.");
      if (health.routes?.nanoBanana21 !== true) throw new Error("Restart the NewtNode backend to activate Nano Banana 2.1. No generation was submitted.");
    }
  }
  const scoped = scopedMyNewtRequest(path, options);
  if (scoped) return scoped;
  const requestUrl = localApiFetchUrl(path);
  if (path === "/api/output/export") {
    try {
      const response = await fetch(requestUrl, options);
      return { response, data: await readJsonResponse(response, label) };
    } catch {
      throw new Error("Output export response was interrupted. Check the export status or destination before retrying; the files may already have been saved.");
    }
  }
  const videoRequest = isVideoGenerationRequest(path, options);
  if (videoRequest || isImageModelRequest(path, options) || path.startsWith("/api/node/camera-coverage") || path === "/api/node/ideogram-vector" || path === "/api/node/explore-plan" || /^\/api\/node\/storyboard-(?:plan|plan-v2|revise|review|qc|script-(?:inspect|page|analyze|build))$/.test(path)) {
    // Never replay a paid media POST after an uncertain response, including via Newt.
    try {
      const response = await fetch(requestUrl, options);
      return { response, data: await readJsonResponse(response, label) };
    } catch {
      throw new Error(`${label}: the connection or response was interrupted. The task may still be running. Check History and the provider before running again; NewtNode did not resubmit or cancel the job.`);
    }
  }
  let response;
  try {
    response = await fetch(requestUrl, options);
  } catch (error) {
    if (requestUrl !== path) {
      try {
        response = await fetch(path, options);
      } catch {
        throw new Error(`${label} failed. Could not reach the local app server. Restart npm run dev and try again. ${error.message || ""}`.trim());
      }
    } else {
      throw new Error(`${label} failed. Could not reach the local app server. Restart npm run dev and try again. ${error.message || ""}`.trim());
    }
  }

  try {
    return {
      response,
      data: await readJsonResponse(response, label)
    };
  } catch (error) {
    if (!error.htmlApiResponse || !canRetryLocalApi(path) || requestUrl !== path) throw error;

    try {
      const healthResponse = await fetch(`${localApiBaseUrl}/api/health`);
      const healthData = await readJsonResponse(healthResponse, "Server health");
      const routeKey = localApiRouteKey(path);
      if (!healthResponse.ok || (routeKey && !healthData?.routes?.[routeKey])) {
        throw new Error("The backend is running, but it does not have the updated API routes.");
      }

      const retryResponse = await fetch(`${localApiBaseUrl}${path}`, options);
      return {
        response: retryResponse,
        data: await readJsonResponse(retryResponse, label)
      };
    } catch (retryError) {
      throw new Error(
        `${label} failed. ${retryError.message || "Could not reach the updated backend route."} Restart npm run dev so the updated server is active.`
      );
    }
  }
}

function isImageModelRequest(path, options) {
  if (path === "/api/node/generate-image") return true;
  if (!/^\/api\/my-newt\/jobs\/[^/]+\/request$/.test(path)) return false;
  try { return JSON.parse(options.body).route === "/api/node/generate-image"; }
  catch { return false; }
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const looksLikeHtml = text.trim().startsWith("<");
    const statusText = response?.status ? `HTTP ${response.status}` : "unknown status";
    const responseUrl = response?.url || "unknown URL";
    const contentType = response?.headers?.get?.("content-type") || "unknown content type";
    const error = new Error(
      `${label} failed. ${
        looksLikeHtml
          ? `The server returned an HTML page instead of API data from ${responseUrl} (${statusText}, ${contentType}). Restart npm run dev so the updated backend route is active.`
          : "The server returned a response that was not valid JSON."
      }`
    );
    error.htmlApiResponse = looksLikeHtml;
    throw error;
  }
}

function localApiFetchUrl(path) {
  if (!canRetryLocalApi(path)) return path;
  return `${localApiBaseUrl}${path}`;
}

function canRetryLocalApi(path) {
  if (!String(path || "").startsWith("/api/")) return false;
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0";
  return isLocalhost && window.location.port !== localApiPort;
}

function localApiRouteKey(path) {
  if (path.includes("video-outpaint")) return "videoOutpaint";
  if (path.startsWith("/api/output/")) return "outputExport";
  if (path.startsWith("/api/editor/")) return "editorTimeline";
  if (path.includes("generate-audio")) return "generateAudio";
  if (path.includes("utility-image")) return "utilityImage";
  if (path.includes("utility-video")) return "utilityVideo";
  if (path.includes("extract-video-frame")) return "extractVideoFrame";
  if (path.includes("color-id-matte")) return "colorIdMatte";
  if (path.includes("composer-frame")) return "composerFrame";
  if (path.includes("composer-poses")) return "composerPoses";
  if (path.includes("run-skill-director")) return "skillDirector";
  if (path.includes("storyboard-qc")) return "storyboardQc";
  if (path.includes("generate-3d")) return "generate3d";
  if (path.includes("settings")) return "settings";
  return "";
}

async function requestData(path, options, fallbackMessage) {
  const { response, data } = await fetchJsonApi(path, options, fallbackMessage || "Request");
  return ensureOk(response, data, fallbackMessage);
}

export async function getJson(path, fallbackMessage) {
  return requestData(path, { method: "GET" }, fallbackMessage);
}

export async function postJson(path, body, fallbackMessage) {
  return requestData(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, fallbackMessage);
}

export const editorApi = {
  media: body => postJson("/api/editor/media", body, "Editor media inspection"),
  render: body => postJson("/api/editor/render", body, "Editor export"),
  job: id => getJson(`/api/editor/jobs/${encodeURIComponent(id)}`, "Editor export status"),
  cancel: id => requestData(`/api/editor/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }, "Cancel Editor export")
};

export const cameraCoverageApi = {
  start: body => postJson("/api/node/camera-coverage", body, "ReFrame"),
  job: id => getJson(`/api/node/camera-coverage/${encodeURIComponent(id)}`, "ReFrame status"),
  capture: body => postJson("/api/node/camera-coverage-capture", body, "Capture coverage shot")
};

export const ideogramVectorApi = {
  looks: () => getJson("/api/vector-looks", "Saved Vector looks"),
  saveLook: body => postJson("/api/vector-looks", body, "Save Vector look"),
  removeLook: id => deleteJson(`/api/vector-looks/${encodeURIComponent(id)}`, "Remove Vector look"),
  nameLayers: (body, { signal } = {}) => requestData("/api/node/vector-layers/name", { ...jsonBody({ ...body, editorVersion: body.editorVersion || 2 }), signal }, "Name vector layers"),
  inspectLayers: (body, { signal } = {}) => requestData("/api/node/vector-layers/inspect", { ...jsonBody(body), signal }, "Vector layers"),
  saveLayers: (body, { signal } = {}) => requestData("/api/node/vector-layers/save", { ...jsonBody(body), signal }, "Save vector layers"),
  pricing: () => getJson("/api/node/ideogram-vector-pricing", "Vector pricing"),
  generate: (body, { signal } = {}) => requestData("/api/node/ideogram-vector", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal
  }, "Ideogram Vector"),
  job: requestId => getJson(`/api/node/ideogram-vector/${encodeURIComponent(requestId)}`, "Vector request status")
};

export const outputApi = {
  export: body => postJson("/api/output/export", body, "Output export"),
  validate: body => postJson("/api/output/validate", body, "Output destination"),
  job: id => getJson(`/api/output/jobs/${encodeURIComponent(id)}`, "Output export status"),
  cancel: id => requestData(`/api/output/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }, "Cancel Output export"),
  reveal: filePath => postJson("/api/output/reveal", { filePath }, "Show exported file"),
  async selectFolder(body) {
    const { response, data } = await fetchJsonApi("/api/system/select-folder", jsonBody(body), "Output folder");
    return data?.canceled ? { canceled: true, path: "" } : ensureOk(response, data, "Folder selection failed.");
  }
};

export async function postForm(path, form, fallbackMessage) {
  return requestData(path, {
    method: "POST",
    body: form
  }, fallbackMessage);
}

export const newtPresetsApi = {
  list: async () => {
    await requireSystemPresetBackend();
    return getJson("/api/newt-presets", "Could not load Newt Presets.");
  },
  get: (id) => getJson(`/api/newt-presets/${encodeURIComponent(id)}`, "Could not load this Newt Preset."),
  save: (body) => postJson("/api/newt-presets", body, "Could not save Newt Preset."),
  remove: async (id) => {
    await requireSystemPresetBackend();
    return deleteJson(`/api/newt-presets/${encodeURIComponent(id)}`, "Could not remove Newt Preset.");
  }
};

export const newtSkillsApi = {
  list: async () => {
    const health = await getJson("/api/health", "Could not check Newt skills.");
    if (!health?.routes?.myNewtCreativeSkills) throw new Error("Restart the NewtNode backend to enable Creative Skills.");
    return getJson("/api/my-newt/skills", "Could not load Newt skills.");
  },
  save: (id, body) => postJson(`/api/my-newt/skills/${encodeURIComponent(id)}`, body, "Could not save this skill."),
  reset: (id, expectedRevision) => postJson(`/api/my-newt/skills/${encodeURIComponent(id)}/reset`, { expectedRevision }, "Could not reset this skill.")
};

// Explicit single-attempt requests: a lost analysis response must never trigger another paid call.
export async function newtLearningApi(action, body = {}, id = "") {
  const health = await getJson("/api/health", "Could not check Watch Me support.");
  if (!health?.routes?.myNewtLearning) throw new Error("Restart NewtNode to activate Watch Me and the learning library.");
  if (action === "analyze" && !health.routes.myNewtLearningAnalysis) throw new Error("Restart NewtNode to activate the Watch Me analysis fix. No analysis was submitted.");
  const base = "/api/my-newt/learning";
  const read = action === "list" || action === "get";
  const route = action === "list" ? base : action === "create" ? `${base}/sessions`
    : action === "update" ? `${base}/lessons/${encodeURIComponent(id)}`
      : `${base}/sessions/${encodeURIComponent(id)}${action === "get" ? "" : `/${action}`}`;
  const url = localApiFetchUrl(`${route}${read ? `?projectId=${encodeURIComponent(body.projectId)}` : ""}`);
  try {
    const response = await fetch(url, { method: read ? "GET" : "POST", headers: { "Content-Type": "application/json", "X-Newt-Local": "1" },
      ...(read ? {} : { body: JSON.stringify(body) }) });
    return ensureOk(response, await readJsonResponse(response, "Newt learning"), "Could not update Newt learning.");
  } catch (error) {
    if (action === "analyze" && !error.status) throw new Error("The analysis response was interrupted and may have been billed. Reload the session to check its status. No automatic retry was submitted.");
    throw error;
  }
}

async function requireSystemPresetBackend() {
  const health = await getJson("/api/health", "Could not check the preset library.");
  if (!health?.routes?.systemNewtPresets) throw new Error("Restart the NewtNode backend to activate protected System presets. No presets were changed.");
}

let myNewtBackendCheckedAt = 0;
let myNewtAutoReviewAvailable = false;
let myNewtFavoriteModelsAvailable = false;
let myNewtUnpricedGenerationsAvailable = false;
async function requireMyNewtBackend(force = false, autoReview = false, favoriteModels = false, unpricedGenerations = false) {
  if (!force && (!autoReview || myNewtAutoReviewAvailable) && (!favoriteModels || myNewtFavoriteModelsAvailable) && (!unpricedGenerations || myNewtUnpricedGenerationsAvailable) && Date.now() - myNewtBackendCheckedAt < 30000) return;
  const health = await getJson("/api/health", "Could not check Newt backend.");
  if (!health?.routes?.myNewtPlanning || !health?.routes?.myNewtLocalActions || !health?.routes?.myNewtBackgroundActions || !health?.routes?.myNewtApprovedWork) throw new Error("Restart the NewtNode backend to activate Newt approved-work protection and run reuse. No new task was started.");
  if (!health.routes.myNewtCreativeSkills) throw new Error("Restart the NewtNode backend to activate Creative Skills and preset-first planning. No task or settings were submitted.");
  if (!health.routes.myNewtCanvasOrganization) throw new Error("Restart the NewtNode backend to activate Newt canvas organization. No task or settings were submitted.");
  myNewtAutoReviewAvailable = health.routes.myNewtAutoReview === true;
  if (autoReview && !myNewtAutoReviewAvailable) throw new Error("Restart the NewtNode backend to activate Auto Review. No task or settings were submitted.");
  myNewtFavoriteModelsAvailable = health.routes.myNewtFavoriteModels === true;
  if (favoriteModels && !myNewtFavoriteModelsAvailable) throw new Error("Restart the NewtNode backend to activate favorite model preferences. No task or settings were submitted.");
  myNewtUnpricedGenerationsAvailable = health.routes.myNewtUnpricedGenerations === true;
  if (unpricedGenerations && !myNewtUnpricedGenerationsAvailable) throw new Error("Restart the NewtNode backend to activate Allow Unpriced Generations. No task or settings were submitted.");
  myNewtBackendCheckedAt = Date.now();
}
async function postMyNewt(path, body, message) {
  await requireMyNewtBackend(path === "/api/my-newt/jobs" || path.endsWith("/control"), body.settings?.autoReview === true, Boolean(body.settings?.favoriteImageModel || body.settings?.favoriteVideoModel), body.settings?.allowUnpricedGenerations === true);
  return postJson(path, body, message);
}

async function postRemoteMyNewtOnce(path, body) {
  await requireMyNewtBackend(true, body.settings?.autoReview === true, Boolean(body.settings?.favoriteImageModel || body.settings?.favoriteVideoModel), body.settings?.allowUnpricedGenerations === true);
  const response = await fetch(localApiFetchUrl(path), { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return ensureOk(response, await readJsonResponse(response, "Remote Newt command"), "The remote command was not accepted.");
}

export const myNewtApi = {
  startRemote: (body) => postRemoteMyNewtOnce("/api/my-newt/jobs", body),
  controlRemote: (id, body) => postRemoteMyNewtOnce(`/api/my-newt/jobs/${encodeURIComponent(id)}/control`, body),
  async remote(action, body) {
    // Home credentials stay in memory; never replay remote-control requests on another API port.
    const response = await fetch(localApiFetchUrl(`/api/my-newt/remote/${action}`), {
      method: "POST", headers: { "Content-Type": "application/json", "X-Newt-Local": "1" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    const data = await readJsonResponse(response, "Newt Remote");
    if (!response.ok) throw Object.assign(new Error(data?.error || "Could not update remote access."), { status: response.status });
    return data;
  },
  async transcribe(audio, context, signal) {
    const form = new FormData();
    form.append("audio", audio, "voice-recording");
    for (const key of ["projectId", "projectName", "nodeId"]) if (context[key]) form.append(key, context[key]);
    // Never replay a possibly billed transcription through the generic API fallback.
    const response = await fetch(localApiFetchUrl("/api/my-newt/transcribe"), {
      method: "POST", body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(180000)])
    });
    return ensureOk(response, await readJsonResponse(response, "Voice transcription"), "Voice transcription failed.");
  },
  start: (body) => postMyNewt("/api/my-newt/jobs", body, "Could not start Newt."),
  history: (body) => postJson("/api/my-newt/history", body, "Could not load Newt history."),
  prepare: (id, body) => postJson(`/api/my-newt/jobs/${encodeURIComponent(id)}/prepare`, body, "Could not prepare run approval."),
  recover: (id, body) => postJson(`/api/my-newt/jobs/${encodeURIComponent(id)}/recover`, body, "Could not restore Newt checkpoint."),
  sync: (id, body) => postMyNewt(`/api/my-newt/jobs/${encodeURIComponent(id)}/sync`, body, "Could not sync Newt."),
  control: (id, body) => (["pause", "stop"].includes(body.action) ? postJson : postMyNewt)(`/api/my-newt/jobs/${encodeURIComponent(id)}/control`, body, "Could not update Newt."),
  claim: (id, body) => postMyNewt(`/api/my-newt/jobs/${encodeURIComponent(id)}/claim`, body, "Could not claim Newt action."),
  complete: (id, body) => postJson(`/api/my-newt/jobs/${encodeURIComponent(id)}/complete`, body, "Could not finish Newt action."),
  request: (id, body) => postJson(`/api/my-newt/jobs/${encodeURIComponent(id)}/request`, body, "Newt request failed.")
};

export async function deleteJson(path, fallbackMessage) {
  return requestData(path, {
    method: "DELETE"
  }, fallbackMessage);
}

export const historyApi = {
  listSummary({ limit = 200, cursor = "" } = {}) {
    const params = new URLSearchParams({
      summary: "1",
      limit: String(limit)
    });
    if (cursor) params.set("cursor", cursor);
    return getJson(`/api/history?${params.toString()}`, "Could not load generation history.");
  },

  remove(id) {
    return deleteJson(`/api/history/${encodeURIComponent(id)}`, "Could not remove this generation.");
  }
};

export const statsApi = {
  load() {
    return getJson("/api/stats", "Could not load stats.");
  },

  loadHistoryFallback() {
    return getJson("/api/history", "Could not load generation history.");
  }
};

export const generationApi = {
  generateVideo(form) {
    return postForm("/api/generate", form, "Generation failed.");
  },

  uploadAsset(file) {
    const form = new FormData();
    form.append("asset", file);
    return postForm("/api/node/upload-asset", form, "Could not upload an asset.");
  },

  generateImage(body) {
    return postJson("/api/node/generate-image", body, "Image generation failed.");
  },

  async generateNodeVideo(body) {
    const { response, data } = await nodeApi.generateVideo(body);
    return ensureOk(response, data, "Video generation failed.");
  }
};

export const nodeApi = {
  async planExplore(body) {
    if (body.version >= 2) {
      const health = await getJson("/api/health", "Could not verify Explore look controls.");
      if (health.routes?.exploreLookVariation !== true) throw new Error("Restart the NewtNode backend to activate Explore's new look controls. No planning or generation was submitted.");
      if (body.version >= 3 && health.routes?.exploreArtDirection !== true) throw new Error("Restart the NewtNode backend to activate Explore's broader art directions. No planning or generation was submitted.");
    }
    return postJson("/api/node/explore-plan", body, "Explore planning");
  },
  async editImage(form) {
    if (isNanoBanana21Model(form.get("model"))) {
      const health = await getJson("/api/health", "Could not verify Nano Banana 2.1 editing support.");
      if (health.routes?.imageEditingNanoBanana21 !== true) throw new Error("Restart NewtNode to activate Nano Banana 2.1 in Draw and Edit. No generation was submitted.");
    }
    // Never replay a potentially billed edit through the localhost fallback.
    let response;
    try {
      response = await fetch(localApiFetchUrl("/api/node/edit-image"), { method: "POST", body: form, signal: AbortSignal.timeout(960000) });
    } catch {
      throw new Error("The edit connection was interrupted. Check History and Fal before generating again; the request was not retried.");
    }
    return ensureOk(response, await readJsonResponse(response, "Image edit"), "Image edit failed.");
  },
  uploadAsset(form, label = "Asset upload") {
    return fetchJsonApi("/api/node/upload-asset", { method: "POST", body: form }, label);
  },

  uploadTransferCollage(form, label = "Mood Board compile") {
    return fetchJsonApi("/api/node/upload-transfer-collage", { method: "POST", body: form }, label);
  },

  composerFrame(body, label = "Composer capture") {
    return fetchJsonApi("/api/node/composer-frame", jsonBody(body), label);
  },

  processText(body, label = "Text processing") {
    return fetchJsonApi("/api/node/process-text", jsonBody(body), label);
  },

  runSkillDirector(body, label = "Director") {
    return fetchJsonApi("/api/node/run-skill-director", jsonBody(body), label);
  },

  qwenCameraEdit(body, label = "Camera edit") {
    return fetchJsonApi("/api/node/qwen-camera-edit", jsonBody(body), label);
  },

  utilityImage(body, label = "Utility image generation") {
    return fetchJsonApi("/api/node/utility-image", jsonBody(body), label);
  },

  colorIdMatte(body, label = "Color ID matte") {
    return fetchJsonApi("/api/node/color-id-matte", jsonBody(body), label);
  },

  colorIdMatteForm(form, label = "Color ID matte") {
    return fetchJsonApi("/api/node/color-id-matte", { method: "POST", body: form }, label);
  },

  generateImage(body, label = "Image generation") {
    return fetchJsonApi("/api/node/generate-image", jsonBody(body), label);
  },

  async planStoryboard(body, label = "Storyboard planning") {
    if (body.storyboardApproach === "Shot List") {
      const health = await getJson("/api/health", "Could not verify Storyboard Shot List support.");
      if (health.routes?.storyboardShotList !== true) throw new Error("Restart the NewtNode backend to activate Storyboard Shot List. No planning or generation was submitted.");
    }
    return fetchJsonApi("/api/node/storyboard-plan-v2", jsonBody(body), label);
  },

  async storyboardScript(mode, body) {
    if (!["inspect", "analyze", "build", "page"].includes(mode)) throw new Error("Unknown script import action.");
    const health = await getJson("/api/health", "Could not verify PDF script import support.");
    if (health.routes?.storyboardScriptImport !== true) throw new Error("Restart NewtNode to activate PDF script import. No AI analysis was submitted.");
    const { response, data } = await fetchJsonApi(`/api/node/storyboard-script-${mode}`, jsonBody(body), "PDF script import");
    return ensureOk(response, data, "PDF script import failed.");
  },

  reviseStoryboard(body) { return fetchJsonApi("/api/node/storyboard-revise", jsonBody(body), "Storyboard revision"); },
  reviewStoryboardSequence(body) { return fetchJsonApi("/api/node/storyboard-review", jsonBody(body), "Storyboard sequence review"); },

  reviewStoryboardFrame(body, label = "Storyboard frame QC") {
    return fetchJsonApi("/api/node/storyboard-qc", jsonBody(body), label);
  },

  exportStoryboardFrame(body, label = "Storyboard frame export") {
    return fetchJsonApi("/api/node/storyboard-export-frame", jsonBody(body), label);
  },

  exportStoryboardBoard(body, label = "Storyboard board export") {
    return fetchJsonApi("/api/node/storyboard-export-board", jsonBody(body), label);
  },

  generate3d(body, label = "3D generation") {
    return fetchJsonApi("/api/node/generate-3d", jsonBody(body), label);
  },

  async generateVideo(body, label = "Video generation") {
    if (body.seedanceDraft === true) {
      const health = await getJson("/api/health", "Could not verify Draft mode support.");
      if (health.routes?.seedanceDrafts !== true || health.routes?.seedanceMultiProviderDrafts !== true) throw new Error("Restart the NewtNode backend to activate multi-provider Draft mode. No generation was submitted.");
    }
    if (body.seedanceTask === "edit") {
      const health = await getJson("/api/health", "Could not verify video-editing support.");
      if (health.routes?.seedanceVideoEditing !== true) throw new Error("Restart the NewtNode backend to activate Edit Existing Video. No generation was submitted.");
    }
    return fetchJsonApi("/api/node/generate-video", jsonBody(body), label);
  },

  async completeSeedanceDraft(body) {
    const health = await getJson("/api/health", "Could not verify draft finishing support.");
    if (health.routes?.seedanceDrafts !== true || health.routes?.seedanceMultiProviderDrafts !== true) throw new Error("Restart the NewtNode backend to activate multi-provider draft finishing. No generation was submitted.");
    let response;
    try { response = await fetch(localApiFetchUrl("/api/node/seedance-draft/complete"), jsonBody(body)); }
    catch { throw new Error("The finishing connection was interrupted. The job may still be running. Use Finish again to recover the same request; it will not submit a duplicate."); }
    return ensureOk(response, await readJsonResponse(response, "Draft completion"), "Could not finish the draft.");
  },

  async prepareVideoOutpaint(body) {
    const health = await getJson("/api/health", "Could not verify Video Outpaint support.");
    if (health.routes?.videoOutpaint !== true) throw new Error("Restart NewtNode to activate Video Outpaint. No generation was submitted.");
    return requestData("/api/node/video-outpaint-prepare", jsonBody(body), "Could not prepare the outpainting canvas.");
  },

  async analyzeVideoOutpaint(body) {
    let response;
    try { response = await fetch(localApiFetchUrl("/api/node/video-outpaint-prompt"), jsonBody(body)); }
    catch { throw new Error("Prompt analysis was interrupted. Check History before trying again; the request was not resubmitted."); }
    return ensureOk(response, await readJsonResponse(response, "Outpainting prompt"), "Could not draft the outpainting prompt.");
  },

  async utilityVideo(body, label = "Utility video generation") {
    if (body.model === "Video Outpaint") {
      const health = await getJson("/api/health", "Could not verify Video Outpaint support.");
      if (health.routes?.videoOutpaint !== true) throw new Error("Restart NewtNode to activate Video Outpaint. No generation was submitted.");
    }
    return fetchJsonApi("/api/node/utility-video", jsonBody(body), label);
  }
};

export const audioModelApi = {
  voices: (refresh = false) => getJson(`/api/elevenlabs/voices${refresh ? "?refresh=1" : ""}`, "Could not load ElevenLabs voices."),
  async generate(body) {
    if (body.audioMode === "tts" && body.ttsModel === "eleven_v4") {
      const health = await getJson("/api/health", "Could not verify Eleven v4 support.");
      if (health.routes?.elevenLabsV4 !== true) throw new Error("Restart the NewtNode backend to activate Eleven v4. No generation was submitted.");
    }
    // A paid audio POST must never be replayed by the generic localhost fallback.
    let response;
    try {
      response = await fetch(localApiFetchUrl("/api/node/generate-audio"), {
        ...jsonBody(body), signal: AbortSignal.timeout(960000)
      });
    } catch {
      throw new Error("The audio generation connection was interrupted. Check ElevenLabs history before rerunning; the request was not retried.");
    }
    return ensureOk(response, await readJsonResponse(response, "Audio generation"), "Audio generation failed.");
  }
};

export const systemApi = {
  selectFolder(body) {
    return fetchJsonApi("/api/system/select-folder", jsonBody(body), "Folder picker");
  },

  selectSavePath(body) {
    return fetchJsonApi("/api/system/select-save-path", jsonBody(body), "Save picker");
  },

  openWorkflowFile(body, label = "Open workflow") {
    return fetchJsonApi("/api/system/open-workflow-file", jsonBody(body), label);
  }
};

export const settingsApi = {
  load() {
    return getJson("/api/settings?includeSecrets=1", "Could not load settings.");
  },

  save(body) {
    return postJson("/api/settings", body, "Could not save settings.");
  },

  update(body) {
    return postJson("/api/settings/update", body, "Could not update NewtNode.");
  },

  restart() {
    return postJson("/api/settings/restart", {}, "Could not restart NewtNode.");
  }
};

export const pricingApi = {
  load() { return getJson("/api/pricing", "Could not load pricing status."); },
  async quote(settings) {
    const { response, data } = await fetchJsonApi("/api/pricing/quote", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Newt-Local": "1" },
      body: JSON.stringify(settings), signal: AbortSignal.timeout(12000)
    }, "Price estimate");
    return ensureOk(response, data, "Price estimate unavailable.");
  },
  async refresh() {
    const { response, data } = await fetchJsonApi("/api/pricing/refresh", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Newt-Local": "1" }, body: "{}"
    }, "Pricing refresh");
    return ensureOk(response, data, "Could not refresh pricing.");
  },
  async setEnabled(enabled) {
    const { response, data } = await fetchJsonApi("/api/pricing/settings", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Newt-Local": "1" }, body: JSON.stringify({ enabled })
    }, "Pricing settings");
    return ensureOk(response, data, "Could not save pricing settings.");
  }
};

export const composerApi = {
  listPoses() {
    return fetchJsonApi("/api/composer-poses", { method: "GET" }, "Pose library");
  },

  savePose(pose) {
    return fetchJsonApi("/api/composer-poses", jsonBody({ pose }), "Pose save");
  },

  deletePose(poseId) {
    return fetchJsonApi(`/api/composer-poses/${encodeURIComponent(poseId)}`, { method: "DELETE" }, "Pose delete");
  }
};

export const workflowApi = {
  listSummary() {
    return getJson("/api/saved-workflows?summary=1", "Could not load saved workflows.");
  },

  open(fileName) {
    return getJson(`/api/saved-workflows/${encodeURIComponent(fileName)}`, "Could not load workflow.");
  },

  async save(workflow) {
    if (workflow.canvases) {
      const health = await getJson("/api/health", "Could not verify multi-canvas saving.");
      if (!health.routes?.projectCanvases) throw new Error("Restart NewtNode to enable multi-canvas projects. Your current project has not been overwritten.");
    }
    return postJson("/api/saved-workflows", workflow, "Could not save workflow.");
  },

  async registerPackage(workflow) {
    if ((workflow.workflow || workflow).graph?.canvases) {
      const health = await getJson("/api/health", "Could not verify multi-canvas packages.");
      if (!health.routes?.projectCanvases) throw new Error("Restart NewtNode to open multi-canvas packages safely.");
    }
    return postJson("/api/saved-workflows/register-package", workflow, "Could not register workflow package.");
  },

  remove(fileName) {
    return deleteJson(`/api/saved-workflows/${encodeURIComponent(fileName)}`, "Could not remove workflow from the dropdown.");
  }
};

export const storageApi = {
  diagnostics() {
    return getJson("/api/storage/diagnostics", "Could not load storage diagnostics.");
  }
};

function jsonBody(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
