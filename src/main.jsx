import React from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  ChevronDown,
  Clock3,
  ImagePlus,
  Loader2,
  Maximize2,
  Music2,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X
} from "lucide-react";
import { generationApi, historyApi, settingsApi } from "./api/newtApi.js";
import { installClientDiagnostics, reportClientDiagnostic } from "./clientDiagnostics.js";
import { installGenerationChimeUnlock, notifyGenerationTaskComplete } from "./generationChime.js";
import { FullResolutionImageContextMenu } from "./components/FullResolutionImageContextMenu.jsx";
import { fullResolutionImageProps, previewImageUrl } from "./mediaAssets.js";
import {
  batchOptions,
  defaultModelPreferences,
  enabledImageModelOptions,
  enabledVideoModelOptions,
  firstEnabledImageModel,
  firstEnabledVideoModel,
  imageModelNames,
  imageResolutionOptions,
  krea2AspectRatios,
  krea2CreativityOptions,
  klingO34kAspectRatioOptions,
  klingO34kDurationOptions,
  klingO34kResolutionOptions,
  klingO3ProAspectRatioOptions,
  klingO3ProDurationOptions,
  klingO3ProResolutionOptions,
  nanoImageAspectRatios,
  openAiImageAspectRatios,
  reve21AspectRatios,
  reve21ResolutionOptions,
  seedance25AspectRatioOptions,
  seedance25DurationOptions,
  seedance25ResolutionOptions,
  seedanceVideoAspectRatioOptions,
  seedanceVideoDurationOptions,
  seedanceVideoResolutionOptions,
  normalizeModelPreferences,
  videoModelNames
} from "./modelOptions.js";
import { isNanoBanana2Model, nanoBanana2ResolutionOptions } from "./nanoBanana2.js";
import { isReve21Model } from "./reve21.js";
import { isSeedance25Model } from "./seedance25.js";
import {
  isMiniMaxH3Model,
  minimaxH3AspectRatioOptions,
  minimaxH3DurationOptions,
  minimaxH3ResolutionOptions
} from "./minimaxH3.js";
import "./styles.css";

installClientDiagnostics();
installGenerationChimeUnlock();

const NodeEditor = React.lazy(() => import("./NodeEditor.jsx"));
const StatsDashboard = React.lazy(() => import("./StatsDashboard.jsx"));
const SettingsPage = React.lazy(() => import("./SettingsPage.jsx"));

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportClientDiagnostic("react-error-boundary", {
      message: error?.message,
      stack: [error?.stack, info?.componentStack].filter(Boolean).join("\n")
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-recovery-screen">
        <strong>NewtNode hit a display error.</strong>
        <span>Your local project files and completed generations are still available.</span>
        <button type="button" onClick={() => window.location.reload()}>Reload NewtNode</button>
      </main>
    );
  }
}


function normalizeNodeStatus(status) {
  if (!status) return { title: "", message: "", workflowPath: "", workflowState: "" };
  if (typeof status === "string") return { title: status, message: status, workflowPath: "", workflowState: "" };

  const message = String(status.message || "").trim();
  const workflowPath = String(status.workflowPath || "").trim();
  const workflowState = status.workflowState === "unsaved" ? "unsaved" : status.workflowState === "saved" ? "saved" : "";
  const title = workflowPath ? `${workflowState === "unsaved" ? "Unsaved" : "Saved"} ${workflowPath}${message ? ` - ${message}` : ""}` : message;

  return {
    title,
    message,
    workflowPath,
    workflowState
  };
}

function App() {
  const promptRef = React.useRef(null);
  const [prompt, setPrompt] = React.useState("");
  const [startFrame, setStartFrame] = React.useState(null);
  const [endFrame, setEndFrame] = React.useState(null);
  const [references, setReferences] = React.useState([]);
  const [mentionState, setMentionState] = React.useState({ open: false, query: "", start: 0 });
  const [resolution, setResolution] = React.useState("720p");
  const [duration, setDuration] = React.useState("15");
  const [aspectRatio, setAspectRatio] = React.useState("21:9");
  const [generateAudio, setGenerateAudio] = React.useState(true);
  const [videoModel, setVideoModel] = React.useState(videoModelNames.seedance);
  const [modelPreferences, setModelPreferences] = React.useState(defaultModelPreferences);
  const [modelPreferencesLoaded, setModelPreferencesLoaded] = React.useState(false);
  const [seed, setSeed] = React.useState("");
  const [status, setStatus] = React.useState("idle");
  const [message, setMessage] = React.useState("");
  const [result, setResult] = React.useState([]);
  const [videoBatchCount, setVideoBatchCount] = React.useState("1");
  const [videoHistory, setVideoHistory] = React.useState([]);
  const [imagePrompt, setImagePrompt] = React.useState("");
  const [imageModel, setImageModel] = React.useState(imageModelNames.openAiImage2);
  const [imageReferences, setImageReferences] = React.useState([]);
  const [imageResolution, setImageResolution] = React.useState("2K");
  const [imageAspectRatio, setImageAspectRatio] = React.useState("16:9");
  const [imageKreaCreativity, setImageKreaCreativity] = React.useState("raw");
  const [imageStatus, setImageStatus] = React.useState("idle");
  const [imageMessage, setImageMessage] = React.useState("");
  const [imageResult, setImageResult] = React.useState([]);
  const [imageBatchCount, setImageBatchCount] = React.useState("1");
  const [imageHistory, setImageHistory] = React.useState([]);
  const [workspaceMode, setWorkspaceMode] = React.useState("image");
  const [nodeStatus, setNodeStatus] = React.useState("");
  const [nodeWorkspaceLoaded, setNodeWorkspaceLoaded] = React.useState(false);
  const nodeStatusInfo = normalizeNodeStatus(nodeStatus);
  const enabledImageOptions = React.useMemo(() => enabledImageModelOptions(modelPreferences), [modelPreferences]);
  const enabledVideoWorkspaceOptions = React.useMemo(() => enabledVideoModelOptions(modelPreferences, { workspaceOnly: true }), [modelPreferences]);

  React.useEffect(() => {
    refreshHistory();
    refreshModelPreferences();
  }, []);

  React.useEffect(() => {
    function handleModelSettingsUpdated(event) {
      const nextPreferences = normalizeModelPreferences(event.detail);
      setModelPreferences(nextPreferences);
      setModelPreferencesLoaded(true);
    }

    window.addEventListener("newtnode:model-settings-updated", handleModelSettingsUpdated);
    return () => window.removeEventListener("newtnode:model-settings-updated", handleModelSettingsUpdated);
  }, []);

  React.useEffect(() => {
    if (workspaceMode === "nodes") {
      setNodeWorkspaceLoaded(true);
    }
  }, [workspaceMode]);

  const activeRoute = React.useMemo(() => {
    if (startFrame) return "Start frame";
    if (references.length) return "Reference";
    return "Text";
  }, [references.length, startFrame]);

  const activeImageAspectRatios = React.useMemo(
    () => imageAspectRatiosForModel(imageModel),
    [imageModel]
  );
  const activeVideoSettings = React.useMemo(() => videoSettingsForModel(videoModel), [videoModel]);
  const supportsVideoAudio = isSeedanceVideoModel(videoModel) || isKlingO3VideoModel(videoModel);
  const supportsVideoEndFrame = true;
  const supportsVideoSeed = isSeedanceVideoModel(videoModel) || isMiniMaxH3Model(videoModel);

  React.useEffect(() => {
    if (!modelPreferencesLoaded) return;
    if (!enabledImageOptions.includes(imageModel)) {
      setImageModel(firstEnabledImageModel(modelPreferences));
    }
  }, [enabledImageOptions, imageModel, modelPreferences, modelPreferencesLoaded]);

  React.useEffect(() => {
    if (!modelPreferencesLoaded) return;
    if (!enabledVideoWorkspaceOptions.includes(videoModel)) {
      setVideoModel(firstEnabledVideoModel(modelPreferences, { workspaceOnly: true }));
    }
  }, [enabledVideoWorkspaceOptions, modelPreferences, modelPreferencesLoaded, videoModel]);

  React.useEffect(() => {
    if (!activeImageAspectRatios.includes(imageAspectRatio)) {
      setImageAspectRatio(activeImageAspectRatios[0]);
    }
  }, [activeImageAspectRatios, imageAspectRatio]);

  React.useEffect(() => {
    const options = imageResolutionOptionsForModel(imageModel);
    if (!options.includes(imageResolution)) setImageResolution(options[0]);
  }, [imageModel, imageResolution]);

  React.useEffect(() => {
    if (!activeVideoSettings.resolutions.includes(resolution)) {
      setResolution(activeVideoSettings.resolutions[0]);
    }
    if (!activeVideoSettings.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(activeVideoSettings.aspectRatios[0]);
    }
    if (!activeVideoSettings.durationValues.includes(duration)) {
      setDuration(activeVideoSettings.defaultDuration || activeVideoSettings.durationValues[0]);
    }
  }, [activeVideoSettings, aspectRatio, duration, resolution]);

  async function refreshHistory() {
    try {
      const data = await historyApi.listSummary({ limit: 200 });
      setVideoHistory(data.filter(isVideoWorkspaceHistory));
      setImageHistory(data.filter(isImageWorkspaceHistory));
    } catch {
      setVideoHistory([]);
      setImageHistory([]);
    }
  }

  async function refreshModelPreferences() {
    try {
      const data = await settingsApi.load();
      setModelPreferences(normalizeModelPreferences(data.modelPreferences));
    } catch {
      setModelPreferences(defaultModelPreferences);
    } finally {
      setModelPreferencesLoaded(true);
    }
  }

  async function generateVideo() {
    if (!prompt.trim()) {
      setMessage("Add a prompt first.");
      return;
    }

    const count = Number(videoBatchCount);
    setStatus("generating");
    setMessage(`Starting ${formatBatchCount(count)}...`);
    setResult([]);

    try {
      const runs = Array.from({ length: count }, (_, index) => runVideoGeneration(index));
      const settled = await Promise.allSettled(runs);
      const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
      const failures = settled.filter((item) => item.status === "rejected");

      setResult(successes);
      setStatus(successes.length ? "complete" : "error");
      setMessage(batchStatusMessage("video", count, successes.length, failures));
      if (successes.length) notifyGenerationTaskComplete();
      await refreshHistory();
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function runVideoGeneration(index) {
    try {
      const [uploadedStartFrame, uploadedEndFrame, uploadedReferences] = await Promise.all([
        startFrame ? generationApi.uploadAsset(startFrame) : Promise.resolve(null),
        supportsVideoEndFrame && endFrame ? generationApi.uploadAsset(endFrame) : Promise.resolve(null),
        Promise.all(references.map((reference) => generationApi.uploadAsset(reference.file)))
      ]);
      const response = await generationApi.generateNodeVideo({
        prompt: prompt.trim(),
        model: videoModel,
        resolution,
        duration: durationToLabel(duration),
        aspectRatio,
        generateAudio: supportsVideoAudio ? generateAudio : false,
        seed: seed.trim(),
        startFrameUrls: uploadedStartFrame ? [uploadedStartFrame.asset.localUrl] : [],
        endFrameUrls: supportsVideoEndFrame && uploadedEndFrame ? [uploadedEndFrame.asset.localUrl] : [],
        referenceImageUrls: uploadedReferences.map((item) => item.asset.localUrl),
        referenceImageLabels: references.map((reference) => reference.name),
        projectId: "video",
        projectName: "Video",
        nodeId: "video-tab",
        nodeTitle: "Video"
      });
      return response;
    } catch (error) {
      throw new Error(`Run ${index + 1}: ${error.message || "Generation failed."}`);
    }
  }

  async function generateImage() {
    if (!imagePrompt.trim()) {
      setImageMessage("Add a prompt first.");
      return;
    }

    const count = Number(imageBatchCount);
    setImageStatus("generating");
    setImageMessage(`Uploading references and starting ${formatBatchCount(count)}...`);
    setImageResult([]);

    try {
      const uploadedReferences = [];
      for (const reference of imageReferences) {
        const uploadData = await generationApi.uploadAsset(reference.file);
        uploadedReferences.push(uploadData.asset);
      }

      const imagePromptUrls = uploadedReferences.map((reference) => reference.localUrl);
      const runs = Array.from({ length: count }, (_, index) => runImageGeneration(index, imagePromptUrls));
      const settled = await Promise.allSettled(runs);
      const successes = settled
        .filter((item) => item.status === "fulfilled")
        .flatMap((item) => {
          const data = item.value;
          const images = Array.isArray(data.images) && data.images.length ? data.images : [data.image].filter(Boolean);
          return images.map((image, index) => ({ ...data, image, cost: index === 0 ? data.cost : null }));
        });
      const failures = settled.filter((item) => item.status === "rejected");

      setImageResult(successes);
      setImageStatus(successes.length ? "complete" : "error");
      setImageMessage(batchStatusMessage("image", count, successes.length, failures));
      if (successes.length) notifyGenerationTaskComplete();
      await refreshHistory();
    } catch (error) {
      setImageStatus("error");
      setImageMessage(error.message);
    }
  }

  async function runImageGeneration(index, imagePromptUrls) {
    try {
      return await generationApi.generateImage({
        prompt: imagePrompt.trim(),
        model: imageModel,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        kreaCreativity: imageKreaCreativity,
        imagePromptUrls,
        projectId: "image",
        projectName: "Image",
        nodeId: "image-tab",
        nodeTitle: "Image"
      });
    } catch (error) {
      throw new Error(`Run ${index + 1}: ${error.message || "Image generation failed."}`);
    }
  }

  function addReferences(files) {
    setReferences((current) => {
      const usedNames = new Set(current.map((reference) => reference.name.toLowerCase()));
      const incoming = Array.from(files).map((file, index) => {
        const name = uniqueReferenceName(suggestReferenceName(file, current.length + index + 1), usedNames);
        return {
          id: crypto.randomUUID(),
          file,
          name
        };
      });

      return [...current, ...incoming].slice(0, 9);
    });
  }

  function addImageReferences(files) {
    setImageReferences((current) => {
      const incoming = Array.from(files).map((file) => ({
        id: crypto.randomUUID(),
        file
      }));

      return [...current, ...incoming].slice(0, 9);
    });
  }

  function removeReference(index) {
    setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function removeImageReference(index) {
    setImageReferences((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function updateReferenceName(id, value) {
    setReferences((current) =>
      current.map((reference) =>
        reference.id === id
          ? {
              ...reference,
              name: cleanReferenceName(value)
            }
          : reference
      )
    );
  }

  function normalizeReferenceName(id) {
    setReferences((current) => {
      const usedNames = new Set();
      return current.map((reference, index) => {
        const fallback = `Image${index + 1}`;
        const baseName = reference.id === id && !reference.name ? fallback : reference.name || fallback;
        const name = uniqueReferenceName(baseName, usedNames);
        return { ...reference, name };
      });
    });
  }

  function handlePromptChange(event) {
    const nextPrompt = event.target.value;
    setPrompt(nextPrompt);
    updateMentionState(nextPrompt, event.target.selectionStart);
  }

  function handleImagePromptChange(event) {
    setImagePrompt(event.target.value);
  }

  function handlePromptCursor(event) {
    updateMentionState(event.target.value, event.target.selectionStart);
  }

  function updateMentionState(text, cursor) {
    const beforeCursor = text.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@([A-Za-z0-9_-]*)$/);

    if (!match || !references.length) {
      setMentionState({ open: false, query: "", start: cursor });
      return;
    }

    setMentionState({
      open: true,
      query: match[2],
      start: cursor - match[2].length - 1
    });
  }

  function insertReferenceMention(name) {
    const textarea = promptRef.current;
    const cursor = textarea?.selectionStart ?? prompt.length;
    const start = mentionState.open ? mentionState.start : cursor;
    const nextPrompt = `${prompt.slice(0, start)}@${name} ${prompt.slice(cursor)}`;
    const nextCursor = start + name.length + 2;

    setPrompt(nextPrompt);
    setMentionState({ open: false, query: "", start: nextCursor });

    requestAnimationFrame(() => {
      promptRef.current?.focus();
      promptRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function removeHistoryItem(item) {
    const mediaLabel = item.mediaType === "image" ? "image" : "video";
    const shouldRemove = window.confirm(`Remove this item from Recent generations? The saved ${mediaLabel} file will stay in outputs.`);
    if (!shouldRemove) return;

    try {
      const data = await historyApi.remove(item.id);
      setVideoHistory(data.filter(isVideoWorkspaceHistory));
      setImageHistory(data.filter(isImageWorkspaceHistory));
      setMessage("Removed from Recent generations.");
      setImageMessage("Removed from Recent generations.");
    } catch (error) {
      setMessage(error.message);
      setImageMessage(error.message);
    }
  }

  return (
    <main className={`app-shell ${workspaceMode === "nodes" ? "node-app-shell" : ""}`}>
      <FullResolutionImageContextMenu />
      <div className="topbar">
        <div className="brand-lockup" aria-label="Versus NewtNode">
          <img src="/newtnode-logo.png" alt="Versus NewtNode" />
        </div>
        <div className="mode-switch" aria-label="Workspace mode">
          <button className={workspaceMode === "image" ? "active" : ""} onClick={() => setWorkspaceMode("image")}>
            Image
          </button>
          <button className={workspaceMode === "video" ? "active" : ""} onClick={() => setWorkspaceMode("video")}>
            Video
          </button>
          <button className={workspaceMode === "nodes" ? "active" : ""} onClick={() => setWorkspaceMode("nodes")}>
            Nodes
          </button>
          <button className={workspaceMode === "stats" ? "active" : ""} onClick={() => setWorkspaceMode("stats")}>
            Stats
          </button>
          <button className={workspaceMode === "settings" ? "active" : ""} onClick={() => setWorkspaceMode("settings")}>
            Settings
          </button>
        </div>
        {workspaceMode === "nodes" && nodeStatusInfo.title && (
          <div className={`topbar-status ${nodeStatusInfo.workflowState ? `workflow-${nodeStatusInfo.workflowState}` : ""}`} role="status" title={nodeStatusInfo.title}>
            {nodeStatusInfo.workflowPath ? (
              <span className="topbar-status-state">{nodeStatusInfo.workflowState === "unsaved" ? "Unsaved" : "Saved"}</span>
            ) : (
              nodeStatusInfo.title
            )}
          </div>
        )}
      </div>

      {workspaceMode === "image" ? (
        <>
          <section className="studio">
            <div className="composer">
              {imageReferences.length > 0 && (
                <div className="drop-row">
                  {imageReferences.map((reference, index) => (
                    <Thumb
                      key={reference.id}
                      file={reference.file}
                      label={`Reference image ${index + 1}`}
                      onRemove={() => removeImageReference(index)}
                    />
                  ))}
                  <label className="mini-upload" title="Add reference images">
                    <Upload size={16} />
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => addImageReferences(event.target.files || [])} />
                  </label>
                </div>
              )}

              <textarea
                value={imagePrompt}
                onChange={handleImagePromptChange}
                placeholder="Describe your image or guide the visual style"
                spellCheck="true"
              />

              <div className="control-row">
                <SelectChip icon={<Wand2 size={17} />} value={imageModel} options={enabledImageOptions} onChange={setImageModel} />

                {isKrea2LargeImageModel(imageModel) && (
                  <SelectChip value={imageKreaCreativity} options={krea2CreativityOptions} onChange={setImageKreaCreativity} formatter={formatKrea2Creativity} />
                )}

                <SelectChip icon={<Sparkles size={16} />} value={imageBatchCount} options={batchOptions} onChange={setImageBatchCount} formatter={formatBatchCount} />

                <ReferenceChip count={imageReferences.length} onSelect={addImageReferences} />

                <SelectChip icon={<Maximize2 size={16} />} value={imageResolution} options={imageResolutionOptionsForModel(imageModel)} onChange={setImageResolution} />

                <SelectChip value={imageAspectRatio} options={activeImageAspectRatios} onChange={setImageAspectRatio} />

                <button className="generate-button" onClick={generateImage} disabled={imageStatus === "generating"} title="Generate image">
                  {imageStatus === "generating" ? <Loader2 className="spin" size={22} /> : <ArrowUp size={22} />}
                </button>
              </div>
            </div>

            <div className="route-strip">
              <span>{imageModel}</span>
              {isKrea2LargeImageModel(imageModel) && <span>{`Creativity ${formatKrea2Creativity(imageKreaCreativity)}`}</span>}
              <span>{formatBatchCount(Number(imageBatchCount))}</span>
              <span>{imageResolution}</span>
              <span>{imageAspectRatio}</span>
              <span>{imageReferences.length ? `${imageReferences.length} ref${imageReferences.length === 1 ? "" : "s"}` : "Text"}</span>
            </div>

            <div className="result-zone">
              <StatusPanel status={imageStatus} message={imageMessage} />
              {imageResult.length > 0 && (
                <div className="result-stack">
                  {imageResult.map((item, index) => (
                    <div className="image-stage" key={item.image?.localUrl || index}>
                      <img {...fullResolutionImageProps(item.image)} src={previewImageUrl(item.image)} alt={`Generated image ${index + 1}`} loading="lazy" decoding="async" />
                      <div className="video-meta">
                        <span>{imageResult.length > 1 ? `Image ${index + 1}` : imageModel}</span>
                        <span>{formatCost(item.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <Gallery history={imageHistory} onRemove={removeHistoryItem} />
        </>
      ) : workspaceMode === "video" ? (
        <>
          <section className="studio">
            <div className="composer">
              {(references.length > 0 || startFrame || endFrame) && (
                <div className="drop-row">
                  {startFrame && (
                    <FrameThumb
                      file={startFrame}
                      label="Start frame"
                      onRemove={() => {
                        setStartFrame(null);
                        setEndFrame(null);
                      }}
                    />
                  )}
                  {endFrame && <FrameThumb file={endFrame} label="End frame" onRemove={() => setEndFrame(null)} />}
                  {references.map((file, index) => (
                    <ReferenceThumb
                      key={file.id}
                      reference={file}
                      index={index}
                      onInsert={insertReferenceMention}
                      onRename={updateReferenceName}
                      onRenameComplete={normalizeReferenceName}
                      onRemove={() => removeReference(index)}
                    />
                  ))}
                  <label className="mini-upload" title="Add reference images">
                    <Upload size={16} />
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => addReferences(event.target.files || [])} />
                  </label>
                </div>
              )}

              <textarea
                ref={promptRef}
                value={prompt}
                onChange={handlePromptChange}
                onKeyUp={handlePromptCursor}
                onClick={handlePromptCursor}
                onFocus={handlePromptCursor}
                placeholder="Describe your video, use @ to reference named images, or direct the camera"
                spellCheck="true"
              />

              {mentionState.open && (
                <MentionMenu
                  query={mentionState.query}
                  references={references}
                  onSelect={insertReferenceMention}
                />
              )}

              <div className="control-row">
                <SelectChip icon={<Wand2 size={17} />} value={videoModel} options={enabledVideoWorkspaceOptions} onChange={setVideoModel} />

                <SelectChip icon={<Sparkles size={16} />} value={videoBatchCount} options={batchOptions} onChange={setVideoBatchCount} formatter={formatBatchCount} />

                <ReferenceChip count={references.length} onSelect={addReferences} />

                <FileChip
                  active={Boolean(startFrame)}
                  icon={<ImagePlus size={17} />}
                  label={startFrame ? "Start set" : "Start frame"}
                  onSelect={setStartFrame}
                  onClear={() => {
                    setStartFrame(null);
                    setEndFrame(null);
                  }}
                />

                {supportsVideoEndFrame && (
                  <FileChip
                    active={Boolean(endFrame)}
                    disabled={!startFrame}
                    icon={<ImagePlus size={17} />}
                    label={endFrame ? "End set" : "End frame"}
                    onSelect={setEndFrame}
                    onClear={() => setEndFrame(null)}
                  />
                )}

                <SelectChip icon={<Maximize2 size={16} />} value={resolution} options={activeVideoSettings.resolutions} onChange={setResolution} />

                <DurationChip duration={duration} options={activeVideoSettings.durations} onChange={setDuration} />

                <SelectChip value={aspectRatio} options={activeVideoSettings.aspectRatios} onChange={setAspectRatio} />

                {supportsVideoAudio && (
                  <button className={`chip icon-chip ${generateAudio ? "active" : ""}`} onClick={() => setGenerateAudio((value) => !value)} title="Audio">
                    {generateAudio ? <Music2 size={17} /> : <Pause size={17} />}
                  </button>
                )}

                {supportsVideoSeed && (
                  <input
                    className="seed-input"
                    inputMode="numeric"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Seed"
                    title="Seed"
                  />
                )}

                <button className="generate-button" onClick={generateVideo} disabled={status === "generating"} title="Generate">
                  {status === "generating" ? <Loader2 className="spin" size={22} /> : <ArrowUp size={22} />}
                </button>
              </div>
            </div>

            <div className="route-strip">
              <span>{videoModel}</span>
              <span>{activeRoute}</span>
              <span>{formatBatchCount(Number(videoBatchCount))}</span>
              <span>{resolution}</span>
              <span>{formatDurationValue(duration)}</span>
              <span>{aspectRatio}</span>
              {supportsVideoAudio && <span>{generateAudio ? "Audio" : "Silent"}</span>}
            </div>

            <div className="result-zone">
              <StatusPanel status={status} message={message} />
              {result.length > 0 && (
                <div className="result-stack">
                  {result.map((item, index) => (
                    <div className="video-stage" key={item.video?.localUrl || index}>
                      <video controls src={item.video.localUrl} />
                      <div className="video-meta">
                        <span>{result.length > 1 ? `Video ${index + 1}` : item.modelName || item.mode || videoModel}</span>
                        {supportsVideoSeed && <span>{item.seed ? `Seed ${item.seed}` : "Seed auto"}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <Gallery history={videoHistory} onRemove={removeHistoryItem} />
        </>
      ) : workspaceMode === "stats" ? (
        <React.Suspense fallback={<WorkspaceFallback label="Loading stats" />}>
          <StatsDashboard />
        </React.Suspense>
      ) : workspaceMode === "settings" ? (
        <React.Suspense fallback={<WorkspaceFallback label="Loading settings" />}>
          <SettingsPage />
        </React.Suspense>
      ) : null}

      {nodeWorkspaceLoaded && (
        <div className={`nodes-tab-keepalive ${workspaceMode === "nodes" ? "active" : ""}`} aria-hidden={workspaceMode !== "nodes"}>
          <React.Suspense fallback={<WorkspaceFallback label="Loading nodes" />}>
            <NodeEditor active={workspaceMode === "nodes"} onStatusChange={setNodeStatus} modelPreferences={modelPreferences} modelPreferencesReady={modelPreferencesLoaded} />
          </React.Suspense>
        </div>
      )}
    </main>
  );
}

function WorkspaceFallback({ label }) {
  return (
    <div className="status-panel generating">
      <span className="status-icon"><Loader2 className="spin" size={18} /></span>
      <span>{label}</span>
    </div>
  );
}

function Thumb({ file, label, onRemove }) {
  const url = React.useMemo(() => URL.createObjectURL(file), [file]);

  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className="thumb" title={label}>
      <img src={url} alt={label} />
      {onRemove && (
        <button onClick={onRemove} title="Remove">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function ReferenceThumb({ reference, index, onInsert, onRename, onRenameComplete, onRemove }) {
  return (
    <div className="reference-card">
      <Thumb file={reference.file} label={reference.name || `Image ${index + 1}`} onRemove={onRemove} />
      <div className="reference-controls">
        <button type="button" className="mention-button" onClick={() => onInsert(reference.name || `Image${index + 1}`)} title="Insert reference in prompt">
          @{reference.name || `Image${index + 1}`}
        </button>
        <input
          value={reference.name}
          onChange={(event) => onRename(reference.id, event.target.value)}
          onBlur={() => onRenameComplete(reference.id)}
          placeholder={`Image${index + 1}`}
          aria-label={`Reference ${index + 1} name`}
        />
      </div>
    </div>
  );
}

function FrameThumb({ file, label, onRemove }) {
  return (
    <div className="frame-card">
      <Thumb file={file} label={label} onRemove={onRemove} />
      <span>{label}</span>
    </div>
  );
}

function MentionMenu({ query, references, onSelect }) {
  const queryLower = query.toLowerCase();
  const matches = references
    .map((reference, index) => ({ reference, index }))
    .filter(({ reference }) => reference.name.toLowerCase().includes(queryLower))
    .slice(0, 6);

  if (!matches.length) return null;

  return (
    <div className="mention-menu">
      {matches.map(({ reference, index }) => (
        <button key={reference.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(reference.name)}>
          <span>@{reference.name}</span>
          <small>{`Image${index + 1}`}</small>
        </button>
      ))}
    </div>
  );
}

function ReferenceChip({ count, onSelect }) {
  return (
    <label className={`chip reference-chip ${count ? "active" : ""}`} title="Reference images">
      <Upload size={17} />
      <span>{count ? `${count} ref${count === 1 ? "" : "s"}` : "References"}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => onSelect(event.target.files || [])} />
    </label>
  );
}

function suggestReferenceName(file, index) {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return cleanReferenceName(baseName) || `Image${index}`;
}

function cleanReferenceName(value) {
  return String(value || "")
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 28);
}

function uniqueReferenceName(value, usedNames) {
  const fallback = cleanReferenceName(value) || "Image";
  let name = fallback;
  let suffix = 2;

  while (usedNames.has(name.toLowerCase())) {
    name = `${fallback}${suffix}`;
    suffix += 1;
  }

  usedNames.add(name.toLowerCase());
  return name;
}

function FileChip({ active, disabled, icon, label, onSelect, onClear }) {
  return (
    <span className={`chip file-chip ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}>
      <label title={label}>
        {icon}
        <span>{label}</span>
        <input disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && onSelect(event.target.files[0])} />
      </label>
      {active && (
        <button onClick={onClear} title="Clear">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function SelectChip({ icon, value, options, onChange, formatter = (item) => item }) {
  return (
    <label className="chip select-chip">
      {icon}
      <span className="select-value">{formatter(value)}</span>
      <ChevronDown className="select-chevron" size={14} />
      <select className="select-native" value={value} onChange={(event) => onChange(event.target.value)} title={String(value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatter(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DurationChip({ duration, options, onChange }) {
  const durationOptions = options?.length ? options : ["auto", ...Array.from({ length: 12 }, (_value, index) => String(index + 4))];
  const numericOptions = durationOptions.map(durationValueToNumber).filter((value) => Number.isFinite(value));
  const minDuration = Math.min(...numericOptions);
  const maxDuration = Math.max(...numericOptions);
  const numberDuration = durationValueToNumber(duration);
  const canStep = Number.isFinite(numberDuration) && Number.isFinite(minDuration) && Number.isFinite(maxDuration) && minDuration < maxDuration;

  return (
    <span className="chip duration-chip">
      <button title="Shorter" disabled={!canStep} onClick={() => onChange(nearestDurationOption(durationOptions, numberDuration - 1))}>
        -
      </button>
      <label className="duration-select-shell" title="Duration">
        <Clock3 size={15} />
        <span>{formatDurationValue(duration)}</span>
        <ChevronDown size={14} />
        <select value={duration} onChange={(event) => onChange(event.target.value)} title="Duration">
          {durationOptions.map((option) => (
            <option key={option} value={option}>
              {formatDurationValue(option)}
            </option>
          ))}
        </select>
      </label>
      <button title="Longer" disabled={!canStep} onClick={() => onChange(nearestDurationOption(durationOptions, numberDuration + 1))}>
        +
      </button>
    </span>
  );
}

function StatusPanel({ status, message }) {
  return (
    <div className={`status-panel ${status}`}>
      <span className="status-icon">{status === "generating" ? <Loader2 className="spin" size={18} /> : status === "complete" ? <Play size={18} /> : <Sparkles size={18} />}</span>
      <span>{message || "Ready"}</span>
    </div>
  );
}

function Gallery({ history, onRemove }) {
  if (!history.length) return null;

  return (
    <section className="gallery">
      <div className="section-head">
        <h2>Recent generations</h2>
        <span>{history.length}</span>
      </div>
      <div className="gallery-grid">
        {history.map((item) => (
          <article className="history-card" key={item.id}>
            <button className="history-remove" onClick={() => onRemove(item)} title="Remove from recent generations">
              <Trash2 size={15} />
            </button>
            {item.mediaType === "image" ? (
              <img {...fullResolutionImageProps(item.localImage)} src={item.localThumbnail || item.localImage} alt={item.prompt || "Generated image"} loading="lazy" decoding="async" />
            ) : (
              <video controls playsInline preload="metadata" src={item.localVideo} />
            )}
            <div>
              <p>{item.prompt}</p>
              <span>{[item.modelName || item.mode, formatCost(item.cost)].filter(Boolean).join(" · ")}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function isVideoWorkspaceHistory(item) {
  return item?.mediaType === "video" && ["composer", "video"].includes(item?.project?.id) && Boolean(item?.localVideo);
}

function isImageWorkspaceHistory(item) {
  return item?.mediaType === "image" && item?.project?.id === "image" && Boolean(item?.localImage);
}

function imageAspectRatiosForModel(model) {
  if (isReve21Model(model)) return reve21AspectRatios;
  if (isKrea2LargeImageModel(model)) return krea2AspectRatios;
  return model === imageModelNames.openAiImage2 ? openAiImageAspectRatios : nanoImageAspectRatios;
}

function isKrea2LargeImageModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("krea") && normalized.includes("large");
}

function imageResolutionOptionsForModel(model) {
  if (isReve21Model(model)) return reve21ResolutionOptions;
  if (isNanoBanana2Model(model)) return nanoBanana2ResolutionOptions;
  return imageResolutionOptions;
}

function formatKrea2Creativity(value) {
  const text = krea2CreativityOptions.includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "raw";
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function videoSettingsForModel(model) {
  if (isSeedance25Model(model)) {
    return {
      durations: seedance25DurationOptions.map(durationLabelToValue),
      durationValues: seedance25DurationOptions.map(durationLabelToValue),
      defaultDuration: "15",
      resolutions: seedance25ResolutionOptions,
      aspectRatios: seedance25AspectRatioOptions.map((option) => option.match(/\d+:\d+/)?.[0] || option.toLowerCase())
    };
  }

  if (isMiniMaxH3Model(model)) {
    return {
      durations: minimaxH3DurationOptions.map(durationLabelToValue),
      durationValues: minimaxH3DurationOptions.map(durationLabelToValue),
      defaultDuration: "10",
      resolutions: minimaxH3ResolutionOptions,
      aspectRatios: minimaxH3AspectRatioOptions
    };
  }

  if (isKlingO3VideoModel(model)) {
    const is4k = isKlingO34kVideoModel(model);
    return {
      durations: (is4k ? klingO34kDurationOptions : klingO3ProDurationOptions).map(durationLabelToValue),
      durationValues: (is4k ? klingO34kDurationOptions : klingO3ProDurationOptions).map(durationLabelToValue),
      defaultDuration: "15",
      resolutions: is4k ? klingO34kResolutionOptions : klingO3ProResolutionOptions,
      aspectRatios: is4k ? klingO34kAspectRatioOptions : klingO3ProAspectRatioOptions
    };
  }

  return {
    durations: seedanceVideoDurationOptions.map(durationLabelToValue),
    durationValues: seedanceVideoDurationOptions.map(durationLabelToValue),
    defaultDuration: "15",
    resolutions: seedanceVideoResolutionOptions,
    aspectRatios: seedanceVideoAspectRatioOptions.map((option) => option.match(/\d+:\d+/)?.[0] || option)
  };
}

function isSeedanceVideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("seedance");
}

function isKlingO3VideoModel(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("kling") && (normalized.includes("o3") || normalized.includes("03"));
}

function isKlingO34kVideoModel(model) {
  return isKlingO3VideoModel(model) && String(model || "").toLowerCase().includes("4k");
}

function durationLabelToValue(value) {
  if (String(value || "").trim().toLowerCase() === "auto") return "auto";
  return String(value || "").match(/\d+/)?.[0] || "5";
}

function durationToLabel(value) {
  const seconds = durationLabelToValue(value);
  return seconds === "auto" ? "auto" : `${seconds} seconds`;
}

function durationValueToNumber(value) {
  if (value === "auto") return 15;
  return Number(durationLabelToValue(value));
}

function nearestDurationOption(options, target) {
  if (!options?.length) return String(target);
  const targetNumber = Number(target);
  return options.reduce((nearest, option) => {
    const optionNumber = durationValueToNumber(option);
    const nearestNumber = durationValueToNumber(nearest);
    return Math.abs(optionNumber - targetNumber) < Math.abs(nearestNumber - targetNumber) ? option : nearest;
  }, options[0]);
}

function formatDurationValue(value) {
  if (value === "auto") return "Auto";
  const seconds = durationLabelToValue(value);
  return `${seconds}s`;
}

function formatCost(cost) {
  const amount = Number(cost?.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `$${amount.toFixed(amount >= 1 ? 2 : 4)}`;
}

function formatBatchCount(value) {
  const count = Number(value) || 1;
  return `${count} gen${count === 1 ? "" : "s"}`;
}

function batchStatusMessage(mediaType, total, completed, failures) {
  const label = mediaType === "image" ? "image" : "video";
  if (completed === total) return `${total} ${label} generation${total === 1 ? "" : "s"} complete.`;

  const firstError = failures[0]?.reason?.message || "";
  if (completed > 0) {
    return `${completed} of ${total} ${label} generations complete.${firstError ? ` ${firstError}` : ""}`;
  }

  return firstError || `${label[0].toUpperCase()}${label.slice(1)} generation failed.`;
}

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
