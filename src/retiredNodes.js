import { normalizeCameraCoverageData, reframeToolName } from "./cameraCoverage.js";

// Retired tools stay loadable in saved projects and presets without deleting media.
export function migrateRetiredNode(node) {
  const data = node.data || {};
  if (node.type === "cameraCoverage") return {
    ...node, type: "utility",
    data: { ...normalizeCameraCoverageData(data), utilityMode: "video", utilityVideoModel: reframeToolName, resultType: "image" }
  };
  if (node.type === "coverage") return {
    ...node, type: "utility",
    data: { ...data, title: /^Coverage(?: \d+)?$/.test(data.title || "") ? "Utility" : data.title || "Utility", utilityMode: "image", utilityImageModel: "Coverage", resultType: "image" }
  };
  if (node.type === "composer") {
    const resultUrl = data.resultUrl || data.resultItems?.[0]?.url || data.url || data.localUrl || "";
    return { ...node, type: "image", data: { ...data, title: /^Composer(?: \d+)?$/.test(data.title || "") ? "Image" : data.title || "Image", resultUrl, url: resultUrl, mediaType: "image", resultType: "image" } };
  }
  return node;
}

export function migrateRetiredGraph(graph) {
  const originals = new Map((graph.nodes || []).map(node => [node.id, node]));
  return { ...graph, nodes: (graph.nodes || []).map(migrateRetiredNode), edges: (graph.edges || []).flatMap(edge => {
    const source = originals.get(edge.from?.nodeId), target = originals.get(edge.to?.nodeId);
    if (target?.type === "composer" || (source?.type === "composer" && edge.from.port !== "imageOut")) return [];
    return [{ ...edge, ...(["coverage", "cameraCoverage"].includes(source?.type) ? { from: { ...edge.from, port: "utilityOut" } } : {}) }];
  }) };
}
