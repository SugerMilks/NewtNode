export function normalizedResultItems(resultItems, resultUrl, type) {
  const items = Array.isArray(resultItems) ? resultItems.filter((item) => item?.url) : [];
  const fallbackLabel = mediaResultLabel(type);
  if (items.length) return items.map((item, index) => ({ type, label: `${fallbackLabel} ${index + 1}`, ...item }));
  return resultUrl ? [{ url: resultUrl, type, label: `${fallbackLabel} 1` }] : [];
}

export function existingResultItemsForNode(node, type) {
  return normalizedResultItems(node?.data?.resultItems, node?.data?.resultUrl, type);
}

export function appendResultItems(previousItems = [], newItems = [], type) {
  const combined = [...previousItems, ...normalizedResultItems(newItems, "", type)].filter((item) => item?.url);
  const fallbackLabel = mediaResultLabel(type);
  return combined.map((item, index) => ({
    ...item,
    type: item.type || type,
    label: item.label && !new RegExp(`^${fallbackLabel} \\d+$`).test(item.label) ? item.label : `${fallbackLabel} ${index + 1}`
  }));
}

export function mediaResultLabel(type) {
  if (type === "image") return "Image";
  if (type === "video") return "Video";
  if (type === "model3d") return "3D";
  return "Result";
}

export function resultDownloadFileName(item) {
  const urlName = String(item?.url || "").split("/").pop() || "";
  const cleanUrlName = urlName.split("?")[0].split("#")[0];
  if (cleanUrlName) return cleanUrlName;
  if (item?.type === "model3d") return "newt-node-model.glb";
  if (item?.type === "video") return "newt-node-video.mp4";
  return "newt-node-image.png";
}
