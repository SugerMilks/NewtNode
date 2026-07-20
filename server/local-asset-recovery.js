function normalizedPublicPath(value) {
  try {
    return decodeURIComponent(String(value || "").trim()).replace(/\\/g, "/").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\\/g, "/").toLowerCase();
  }
}

function remoteUrl(value) {
  const url = typeof value === "string" ? value : value?.url;
  return /^https?:\/\//i.test(String(url || "").trim()) ? String(url).trim() : "";
}

function pairedHistoryAssets(item) {
  const pairs = [
    [item?.localImage, item?.remoteImage],
    [item?.localVideo, item?.remoteVideo],
    [item?.localAudio, item?.remoteAudio],
    [item?.localModel, item?.remoteModel]
  ];

  const groups = [
    [item?.localImages, item?.remoteImages],
    [item?.localVideos, item?.remoteVideos],
    [item?.localAudios, item?.remoteAudios],
    [item?.localModels, item?.remoteModels]
  ];

  groups.forEach(([localValues, remoteValues]) => {
    const locals = Array.isArray(localValues) ? localValues : [];
    const remotes = Array.isArray(remoteValues) ? remoteValues : [];
    locals.forEach((localValue, index) => pairs.push([localValue, remotes[index]]));
  });

  return pairs;
}

export function findRemoteHistoryAssetUrl(history, publicPath) {
  const target = normalizedPublicPath(publicPath);
  if (!target || !Array.isArray(history)) return "";

  for (let index = history.length - 1; index >= 0; index -= 1) {
    for (const [localValue, remoteValue] of pairedHistoryAssets(history[index])) {
      if (normalizedPublicPath(localValue) !== target) continue;
      const url = remoteUrl(remoteValue);
      if (url) return url;
    }
  }

  return "";
}
