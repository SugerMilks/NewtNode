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
import "./styles.css";

const NodeEditor = React.lazy(() => import("./NodeEditor.jsx"));
const StatsDashboard = React.lazy(() => import("./StatsDashboard.jsx"));

const videoAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "auto"];
const videoResolutions = ["720p", "480p", "1080p"];
const speeds = ["standard", "fast"];
const imageModels = ["Nano Banana Pro", "OpenAI Image 2"];
const nanoImageAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
const openAiImageAspectRatios = ["21:9", "16:9", "1:1", "9:16"];
const imageResolutions = ["2K", "1K", "4K"];
const batchOptions = ["1", "2", "3", "4"];

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
  const [speed, setSpeed] = React.useState("standard");
  const [seed, setSeed] = React.useState("");
  const [status, setStatus] = React.useState("idle");
  const [message, setMessage] = React.useState("");
  const [result, setResult] = React.useState([]);
  const [videoBatchCount, setVideoBatchCount] = React.useState("1");
  const [videoHistory, setVideoHistory] = React.useState([]);
  const [imagePrompt, setImagePrompt] = React.useState("");
  const [imageModel, setImageModel] = React.useState("Nano Banana Pro");
  const [imageReferences, setImageReferences] = React.useState([]);
  const [imageResolution, setImageResolution] = React.useState("2K");
  const [imageAspectRatio, setImageAspectRatio] = React.useState("21:9");
  const [imageStatus, setImageStatus] = React.useState("idle");
  const [imageMessage, setImageMessage] = React.useState("");
  const [imageResult, setImageResult] = React.useState([]);
  const [imageBatchCount, setImageBatchCount] = React.useState("1");
  const [imageHistory, setImageHistory] = React.useState([]);
  const [workspaceMode, setWorkspaceMode] = React.useState("image");
  const [nodeStatus, setNodeStatus] = React.useState("");
  const [nodeWorkspaceLoaded, setNodeWorkspaceLoaded] = React.useState(false);

  React.useEffect(() => {
    refreshHistory();
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
    () => (imageModel === "OpenAI Image 2" ? openAiImageAspectRatios : nanoImageAspectRatios),
    [imageModel]
  );

  React.useEffect(() => {
    if (!activeImageAspectRatios.includes(imageAspectRatio)) {
      setImageAspectRatio(activeImageAspectRatios[0]);
    }
  }, [activeImageAspectRatios, imageAspectRatio]);

  async function refreshHistory() {
    try {
      const response = await fetch("/api/history?summary=1&limit=200");
      const data = await response.json();
      setVideoHistory(data.filter(isVideoWorkspaceHistory));
      setImageHistory(data.filter(isImageWorkspaceHistory));
    } catch {
      setVideoHistory([]);
      setImageHistory([]);
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
      await refreshHistory();
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function runVideoGeneration(index) {
    const form = new FormData();
    form.append("prompt", prompt.trim());
    form.append("resolution", resolution);
    form.append("duration", duration);
    form.append("aspectRatio", aspectRatio);
    form.append("generateAudio", String(generateAudio));
    form.append("speed", speed);
    if (seed.trim()) form.append("seed", seed.trim());
    if (startFrame) form.append("startFrame", startFrame);
    if (endFrame) form.append("endFrame", endFrame);
    form.append("referenceNames", JSON.stringify(references.map((reference) => reference.name)));
    for (const reference of references) {
      form.append("references", reference.file);
    }

    const response = await fetch("/api/generate", {
      method: "POST",
      body: form
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Run ${index + 1}: ${data.error || "Generation failed."}`);
    }

    return data;
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
        const uploadForm = new FormData();
        uploadForm.append("asset", reference.file);
        const uploadResponse = await fetch("/api/node/upload-asset", {
          method: "POST",
          body: uploadForm
        });
        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || "Could not upload a reference image.");
        }

        uploadedReferences.push(uploadData.asset);
      }

      const imagePromptUrls = uploadedReferences.map((reference) => reference.localUrl);
      const runs = Array.from({ length: count }, (_, index) => runImageGeneration(index, imagePromptUrls));
      const settled = await Promise.allSettled(runs);
      const successes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
      const failures = settled.filter((item) => item.status === "rejected");

      setImageResult(successes);
      setImageStatus(successes.length ? "complete" : "error");
      setImageMessage(batchStatusMessage("image", count, successes.length, failures));
      await refreshHistory();
    } catch (error) {
      setImageStatus("error");
      setImageMessage(error.message);
    }
  }

  async function runImageGeneration(index, imagePromptUrls) {
    const response = await fetch("/api/node/generate-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: imagePrompt.trim(),
        model: imageModel,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        imagePromptUrls,
        projectId: "image",
        projectName: "Image",
        nodeId: "image-tab",
        nodeTitle: "Image"
      })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Run ${index + 1}: ${data.error || "Image generation failed."}`);
    }

    return data;
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
      const response = await fetch(`/api/history/${encodeURIComponent(item.id)}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not remove this generation.");
      }

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
      <div className="topbar">
        <div className="brand-lockup" aria-label="NewtNode">
          <img src="/newtnode-logo.png" alt="NewtNode" />
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
        </div>
        {workspaceMode === "nodes" && nodeStatus && (
          <div className="topbar-status" role="status" title={nodeStatus}>
            {nodeStatus}
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
                <SelectChip icon={<Wand2 size={17} />} value={imageModel} options={imageModels} onChange={setImageModel} />

                <SelectChip icon={<Sparkles size={16} />} value={imageBatchCount} options={batchOptions} onChange={setImageBatchCount} formatter={formatBatchCount} />

                <ReferenceChip count={imageReferences.length} onSelect={addImageReferences} />

                <SelectChip icon={<Maximize2 size={16} />} value={imageResolution} options={imageResolutions} onChange={setImageResolution} />

                <SelectChip value={imageAspectRatio} options={activeImageAspectRatios} onChange={setImageAspectRatio} />

                <button className="generate-button" onClick={generateImage} disabled={imageStatus === "generating"} title="Generate image">
                  {imageStatus === "generating" ? <Loader2 className="spin" size={22} /> : <ArrowUp size={22} />}
                </button>
              </div>
            </div>

            <div className="route-strip">
              <span>{imageModel}</span>
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
                      <img src={item.image.localUrl} alt={`Generated image ${index + 1}`} />
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
                <SelectChip icon={<Wand2 size={17} />} value={speed} options={speeds} onChange={setSpeed} formatter={(value) => (value === "fast" ? "Seedance 2.0 Fast" : "Seedance 2.0")} />

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

                <FileChip
                  active={Boolean(endFrame)}
                  disabled={!startFrame}
                  icon={<ImagePlus size={17} />}
                  label={endFrame ? "End set" : "End frame"}
                  onSelect={setEndFrame}
                  onClear={() => setEndFrame(null)}
                />

                <SelectChip icon={<Maximize2 size={16} />} value={resolution} options={videoResolutions} onChange={setResolution} />

                <DurationChip duration={duration} onChange={setDuration} />

                <SelectChip value={aspectRatio} options={videoAspectRatios} onChange={setAspectRatio} />

                <button className={`chip icon-chip ${generateAudio ? "active" : ""}`} onClick={() => setGenerateAudio((value) => !value)} title="Audio">
                  {generateAudio ? <Music2 size={17} /> : <Pause size={17} />}
                </button>

                <input
                  className="seed-input"
                  inputMode="numeric"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Seed"
                  title="Seed"
                />

                <button className="generate-button" onClick={generateVideo} disabled={status === "generating"} title="Generate">
                  {status === "generating" ? <Loader2 className="spin" size={22} /> : <ArrowUp size={22} />}
                </button>
              </div>
            </div>

            <div className="route-strip">
              <span>{activeRoute}</span>
              <span>{formatBatchCount(Number(videoBatchCount))}</span>
              <span>{resolution}</span>
              <span>{duration === "auto" ? "Auto" : `${duration}s`}</span>
              <span>{aspectRatio}</span>
              <span>{generateAudio ? "Audio" : "Silent"}</span>
            </div>

            <div className="result-zone">
              <StatusPanel status={status} message={message} />
              {result.length > 0 && (
                <div className="result-stack">
                  {result.map((item, index) => (
                    <div className="video-stage" key={item.video?.localUrl || index}>
                      <video controls src={item.video.localUrl} />
                      <div className="video-meta">
                        <span>{result.length > 1 ? `Video ${index + 1}` : item.mode}</span>
                        <span>{item.seed ? `Seed ${item.seed}` : "Seed auto"}</span>
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
      ) : null}

      {nodeWorkspaceLoaded && (
        <div className={`nodes-tab-keepalive ${workspaceMode === "nodes" ? "active" : ""}`} aria-hidden={workspaceMode !== "nodes"}>
          <React.Suspense fallback={<WorkspaceFallback label="Loading nodes" />}>
            <NodeEditor active={workspaceMode === "nodes"} onStatusChange={setNodeStatus} />
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

function DurationChip({ duration, onChange }) {
  const numberDuration = duration === "auto" ? 15 : Number(duration);

  return (
    <span className="chip duration-chip">
      <button title="Shorter" onClick={() => onChange(String(Math.max(4, numberDuration - 1)))}>
        -
      </button>
      <label className="duration-select-shell" title="Duration">
        <Clock3 size={15} />
        <span>{duration === "auto" ? "Auto" : `${duration}s`}</span>
        <ChevronDown size={14} />
        <select value={duration} onChange={(event) => onChange(event.target.value)} title="Duration">
          <option value="auto">Auto</option>
          {Array.from({ length: 12 }, (_, index) => String(index + 4)).map((option) => (
            <option key={option} value={option}>
              {option}s
            </option>
          ))}
        </select>
      </label>
      <button title="Longer" onClick={() => onChange(String(Math.min(15, numberDuration + 1)))}>
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
              <img src={item.localImage} alt={item.prompt || "Generated image"} />
            ) : (
              <video controls src={item.localVideo} />
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

createRoot(document.getElementById("root")).render(<App />);
