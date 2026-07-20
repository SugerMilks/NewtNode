import { capitalizeMediaType, fileNameFromLocalUrl, isLocalOutputUrl, mimeForOutputItem, outputMediaTypeForUrl } from "./mediaAssets.js";
import { normalizedResultItems } from "./mediaResults.js";

const defaultMaxProjectOutputItems = 25;

export function buildProjectOutputItems({
  nodes = [],
  history = [],
  projectId,
  projectName,
  getNodeResultMediaType,
  titleFallback,
  maxItems = defaultMaxProjectOutputItems
}) {
  const outputMap = new Map();

  nodes.forEach((node) => {
    const type = getNodeResultMediaType?.(node) || "";
    if (!type) return;
    normalizedResultItems(node.data.resultItems, node.data.resultUrl, type)
      .filter((item) => isLocalOutputUrl(item.url))
      .forEach((item, index) => {
        addProjectOutput(outputMap, {
          id: `node:${node.id}:${index}:${item.url}`,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl || "",
          type: item.type || type,
          label: item.label || `${node.data.title || titleFallback?.(node.type) || node.type || "Node"} ${index + 1}`,
          fileName: item.fileName || fileNameFromLocalUrl(item.url),
          mimeType: item.mimeType || mimeForOutputItem(item),
          createdAt: item.createdAt || ""
        });
      });
  });

  history
    .filter((item) => historyProjectMatches(item, projectId, projectName))
    .forEach((item, historyIndex) => {
      historyOutputUrls(item).forEach((url, urlIndex) => {
        const type = outputMediaTypeForUrl(url, item.mediaType);
        if (!type) return;
        addProjectOutput(outputMap, {
          id: `history:${item.id || historyIndex}:${urlIndex}`,
          url,
          thumbnailUrl: historyThumbnailUrl(item, urlIndex),
          type,
          label: item.node?.title || item.modelName || `${capitalizeMediaType(type)} output`,
          fileName: urlIndex === 0 ? item.outputFileName || fileNameFromLocalUrl(url) : fileNameFromLocalUrl(url),
          mimeType: mimeForOutputItem({ url, type }),
          createdAt: item.createdAt || ""
        });
      });
    });

  return [...outputMap.values()]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, maxItems);
}

function addProjectOutput(outputMap, item) {
  if (!item?.url || !isLocalOutputUrl(item.url)) return;
  if (outputMap.has(item.url)) {
    const existing = outputMap.get(item.url);
    outputMap.set(item.url, {
      ...item,
      ...existing,
      createdAt: existing.createdAt || item.createdAt,
      fileName: existing.fileName || item.fileName,
      mimeType: existing.mimeType || item.mimeType
    });
    return;
  }
  outputMap.set(item.url, item);
}

function historyProjectMatches(item, projectId, projectName) {
  const project = item?.project || {};
  const cleanProjectId = String(projectId || "").trim();
  const cleanProjectName = String(projectName || "").trim();
  const genericNames = new Set(["", "Untitled", "Untitled node project", "Node workspace"]);

  if (cleanProjectId) return project.id === cleanProjectId;
  if (!genericNames.has(cleanProjectName)) return project.name === cleanProjectName && project.id !== "node-workspace";
  return false;
}

function historyOutputUrls(item) {
  const urls = [];
  if (Array.isArray(item.localModels)) urls.push(...item.localModels);
  if (item.localModel) urls.push(item.localModel);
  if (Array.isArray(item.localVideos)) urls.push(...item.localVideos);
  if (item.localVideo) urls.push(item.localVideo);
  if (Array.isArray(item.localAudios)) urls.push(...item.localAudios);
  if (item.localAudio) urls.push(item.localAudio);
  if (!item.localModel) {
    if (Array.isArray(item.localImages)) urls.push(...item.localImages);
    if (item.localImage) urls.push(item.localImage);
  }
  return [...new Set(urls.filter(isLocalOutputUrl))];
}

function historyThumbnailUrl(item, index) {
  if (Array.isArray(item.localThumbnails) && item.localThumbnails[index]) return item.localThumbnails[index];
  return index === 0 ? item.localThumbnail || "" : "";
}
