function ensureOk(response, data, fallbackMessage) {
  if (!response.ok) {
    throw new Error(data?.error || fallbackMessage || "Request failed.");
  }

  return data;
}

export async function fetchJsonApi(path, options = {}, label = "Request") {
  const requestUrl = localApiFetchUrl(path);
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
      const healthResponse = await fetch("http://127.0.0.1:3333/api/health");
      const healthData = await readJsonResponse(healthResponse, "Server health");
      const routeKey = localApiRouteKey(path);
      if (!healthResponse.ok || (routeKey && !healthData?.routes?.[routeKey])) {
        throw new Error("The backend is running, but it does not have the updated API routes.");
      }

      const retryResponse = await fetch(`http://127.0.0.1:3333${path}`, options);
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
  return `http://127.0.0.1:3333${path}`;
}

function canRetryLocalApi(path) {
  if (!String(path || "").startsWith("/api/")) return false;
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0";
  return isLocalhost && window.location.port !== "3333";
}

function localApiRouteKey(path) {
  if (path.includes("utility-image")) return "utilityImage";
  if (path.includes("utility-video")) return "utilityVideo";
  if (path.includes("extract-video-frame")) return "extractVideoFrame";
  if (path.includes("color-id-matte")) return "colorIdMatte";
  if (path.includes("composer-frame")) return "composerFrame";
  if (path.includes("composer-poses")) return "composerPoses";
  if (path.includes("generate-3d")) return "generate3d";
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

export async function postForm(path, form, fallbackMessage) {
  return requestData(path, {
    method: "POST",
    body: form
  }, fallbackMessage);
}

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

  generateNodeVideo(body) {
    return postJson("/api/node/generate-video", body, "Video generation failed.");
  }
};

export const nodeApi = {
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

  generate3d(body, label = "3D generation") {
    return fetchJsonApi("/api/node/generate-3d", jsonBody(body), label);
  },

  generateVideo(body, label = "Video generation") {
    return fetchJsonApi("/api/node/generate-video", jsonBody(body), label);
  },

  utilityVideo(body, label = "Utility video generation") {
    return fetchJsonApi("/api/node/utility-video", jsonBody(body), label);
  }
};

export const systemApi = {
  selectFolder(body) {
    return fetchJsonApi("/api/system/select-folder", jsonBody(body), "Folder picker");
  },

  openWorkflowFile(body, label = "Open workflow") {
    return fetchJsonApi("/api/system/open-workflow-file", jsonBody(body), label);
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

  save(workflow) {
    return postJson("/api/saved-workflows", workflow, "Could not save workflow.");
  },

  registerPackage(workflow) {
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
