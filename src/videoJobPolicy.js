export function isVideoGenerationRoute(route) {
  return ["/api/generate", "/api/node/generate-video", "/api/node/utility-video"].includes(route);
}

export function isVideoGenerationRequest(path, options = {}) {
  if (isVideoGenerationRoute(path)) return true;
  if (!/^\/api\/my-newt\/jobs\/[^/]+\/request$/.test(path)) return false;
  try {
    return isVideoGenerationRoute(JSON.parse(options.body).route);
  } catch {
    return false;
  }
}
