export const outputMediaTypes = ["image", "video", "audio"];
export const outputNameModes = [
  { value: "original", label: "Original Name" }, { value: "project", label: "Project Name" },
  { value: "source", label: "Source Node Name" }, { value: "custom", label: "Custom Name" }
];
export const outputFormatOptions = {
  image: [{ value: "original", label: "Original" }, { value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }, { value: "webp", label: "WebP" }],
  video: [{ value: "original", label: "Original" }, { value: "mp4", label: "MP4 (H.264)" }, { value: "mov", label: "MOV (H.264)" }],
  audio: [{ value: "original", label: "Original" }, { value: "wav", label: "WAV (PCM)" }, { value: "mp3", label: "MP3" }]
};
export const outputDestinations = {
  image: { path: "", subfolder: "", format: "original", quality: 90 },
  video: { path: "", subfolder: "", format: "original", quality: "high" },
  audio: { path: "", subfolder: "", format: "original", quality: "high" }
};
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;

export function normalizeOutputSettings(settings = {}) {
  return {
    nameMode: outputNameModes.some(mode => mode.value === settings?.nameMode) ? settings.nameMode : "original",
    customName: String(settings?.customName || "").slice(0, 180), scope: settings?.scope === "all" ? "all" : "selected",
    numbering: settings?.numbering === true, startNumber: number(settings?.startNumber ?? 1, 1, 1, 999999), padding: number(settings?.padding ?? 3, 3, 1, 6),
    collision: settings?.collision === "skip" ? "skip" : "number", autoExport: settings?.autoExport === true,
    destinations: Object.fromEntries(outputMediaTypes.map(type => {
      const saved = settings?.destinations?.[type] || {}, defaults = outputDestinations[type];
      return [type, { path: String(saved.path || "").slice(0, 4096), subfolder: String(saved.subfolder || "").slice(0, 1024),
        format: outputFormatOptions[type].some(option => option.value === saved.format) ? saved.format : "original",
        quality: type === "image" ? number(saved.quality ?? defaults.quality, 90, 1, 100) : saved.quality === "standard" ? "standard" : "high" }];
    }))
  };
}

export function outputFileStem(value, fallback = "Output") {
  let name = String(value || "").split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").replace(/[. ]+$/g, "").trim();
  name = name.replace(/\.(?:png|jpe?g|webp|gif|tiff?|avif|heic|mp4|mov|webm|mkv|m4v|wav|mp3|m4a|aac|ogg|flac)$/i, "").replace(/[. ]+$/g, "");
  if (!name || /^\.+$/.test(name)) name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  // Leave room for numbering and extensions on byte-limited filesystems, without splitting Unicode characters.
  let result = "", bytes = 0;
  const encoder = new TextEncoder();
  for (const character of name) {
    const size = encoder.encode(character).length;
    if (bytes + size > 140) break;
    result += character; bytes += size;
  }
  return result.replace(/[. ]+$/g, "") || fallback;
}

export function outputCandidates(sources = [], inputSettings = {}, projectName = "Untitled project") {
  const settings = normalizeOutputSettings(inputSettings), seen = new Set();
  return sources.filter(item => {
    if (!item?.url || !outputMediaTypes.includes(item.type) || item.ready === false) return false;
    if (settings.scope === "all" ? item.all === false : item.selected === false) return false;
    const identity = `${item.type}:${item.url}:${item.version || ""}`;
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  }).map((item, index) => {
    let original;
    try { original = decodeURIComponent(item.url.split(/[?#]/)[0].split("/").at(-1)); } catch { original = item.label; }
    const value = settings.nameMode === "project" ? projectName : settings.nameMode === "source" ? item.sourceName
      : settings.nameMode === "custom" ? settings.customName : item.fileName || original || item.label;
    const name = `${outputFileStem(value)}${settings.numbering ? `_${String(settings.startNumber + index).padStart(settings.padding, "0")}` : ""}`;
    const destination = settings.destinations[item.type];
    const key = JSON.stringify([item.url, item.type, item.version || "", name, destination.path, destination.subfolder, destination.format,
      destination.format === "original" || destination.format === "png" || destination.format === "wav" ? null : destination.quality]);
    return { ...item, name, key };
  });
}

export function pendingOutputCandidates(items, receipts = []) {
  const attempted = new Set((Array.isArray(receipts) ? receipts : []).map(receipt => receipt.key));
  return items.filter(item => !attempted.has(item.key));
}

export function mergeOutputReceipts(existing = [], next = []) {
  const receipts = new Map((Array.isArray(existing) ? existing : []).filter(item => typeof item?.key === "string").map(item => [item.key, item]));
  for (const item of next) if (typeof item?.key === "string") receipts.set(item.key, item);
  return [...receipts.values()].slice(-2000);
}

export function normalizeOutputData(data = {}) {
  return { ...data, outputSettings: normalizeOutputSettings(data.outputSettings), outputReceipts: mergeOutputReceipts(data.outputReceipts),
    outputJob: data.outputJob && typeof data.outputJob.id === "string" && Array.isArray(data.outputJob.items) ? data.outputJob : null };
}

// Resolve port-specific output first so inactive Character bases and stale Editor exports never leak into a batch.
export function connectedOutputSources(connections = [], { selectedItem, resultItems, mediaType, sourceLabel, storyboardBoardPort = "boardOut" }) {
  return connections.flatMap(({ source, edge }) => {
    if (!source) return [];
    const chosen = selectedItem(source, edge), type = chosen?.type || mediaType(source, edge);
    if (!outputMediaTypes.includes(type)) return [];
    const ready = !["running", "planning", "revising", "queued", "uploading", "compiling", "compiling-characters", "compiling-board", "paused"].includes(source.data?.status);
    const name = sourceLabel(source);
    const decorate = (item, selected = item.url === chosen?.url) => ({ ...item,
      fileName: item.fileName || (["image", "video", "audio"].includes(source.type) ? source.data?.fileName : ""),
      type: item.type || type, sourceName: name, sourceNodeId: source.id,
      selected, ready: ready && item.ready !== false, version: item.version || item.createdAt || "" });
    if (source.type === "storyboard" && edge.from.port === storyboardBoardPort) {
      const frames = (source.data.storyboardFrames || []).filter(frame => frame.exportUrl || frame.resultUrl).map((frame, index) => decorate({
        url: frame.exportUrl || frame.resultUrl, type: "image", label: `${name} ${String(frame.number || index + 1).padStart(2, "0")}`,
        fileName: `${name}_${String(frame.number || index + 1).padStart(2, "0")}`, ready: !["running", "queued"].includes(frame.status), version: frame.resultVersion || ""
      }, false));
      return [...(chosen?.url ? [{ ...decorate(chosen, true), all: !frames.length }] : []), ...frames];
    }
    if (["character", "editor", "transfer"].includes(source.type)) return chosen?.url ? [decorate(chosen, true)] : [];
    const results = resultItems(source, edge, type) || [];
    if (results.length) {
      const hasChosen = results.some(item => item.url === chosen?.url);
      const selectedIndex = Number.isInteger(source.data?.selectedResultIndex) ? source.data.selectedResultIndex : results.length - 1;
      return results.map((item, index) => decorate(item, hasChosen ? item.url === chosen.url : index === selectedIndex));
    }
    return chosen?.url ? [decorate(chosen, true)] : [];
  });
}
