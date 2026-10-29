import React from "react";
import { Camera, Play, CirclePlay, Pause, SkipBack, SkipForward, Upload, Trash2, ChevronLeft, ChevronRight, ChevronDown, Plus, Download, ScanEye, Sparkles, ArrowUpRight, RefreshCw, LoaderCircle, Aperture, X } from "lucide-react";
import { NodeRow, OutputPortRow } from "./NodePorts.jsx";
import { CameraCoverageViewport } from "./CameraCoverageViewport.jsx";
import { useCameraCoverage } from "./useCameraCoverage.js";
import { cameraCoverageModels, cameraCoveragePresets, newCoveragePoses, coverageShotItem, coverageOutputPatch, coverageCost, coverageRefineRatio, coveragePresetPathMode, coverageTravelPosition, coverageTravelPose, coverageTravelLimits, coverageFramingPoses,
  coverageLensOptions, coverageLensFramings, coverageLensSettings, coverageLensSource, coverageLensLabel, isCoverageImageJob } from "../cameraCoverage.js";
import { estimateImageRunCost, formatPricedRunLabel } from "../generationPricing.js";
import { setOutputItemDragData, finishOutputItemDragData } from "../mediaAssets.js";
import "../cameraCoverage.css";

const IconButton = ({ title, children, ...props }) => <button type="button" className="coverage-icon" title={title} aria-label={title} {...props}>{children}</button>;
const timeLabel = time => `${Math.floor(time / 60).toString().padStart(2, "0")}:${(time % 60).toFixed(2).padStart(5, "0")}`;

export function CameraCoverageNodeBody({ node, config, sources = [], connected = false, onUpdate, workflowContext, onPreviewOpen,
  onConnectStart, onDisconnectInput, connectedPortKeys, imageModels = cameraCoverageModels, ratios = ["16:9", "1:1"], resolutions = ["2K"], qualities = [],
  modelPatch = model => ({ model }), provider = "fal", showApiCosts = false, api, refine }) {
  const enabledModels = imageModels.filter(model => cameraCoverageModels.includes(model));
  const { data, update, working, start, check, capture, upload, refineShot, changeLens, release } = useCameraCoverage({ node, onUpdate, workflowContext, api, refine,
    refineOptions: { models: enabledModels, ratios, resolutions } });
  const videoRef = React.useRef(null), uploadRef = React.useRef(null), galleryRef = React.useRef(null);
  const [time, setTime] = React.useState(0), [duration, setDuration] = React.useState(0), [playing, setPlaying] = React.useState(false);
  const [poseIndex, setPoseIndex] = React.useState(1), [scroll, setScroll] = React.useState({ left: 0, max: 0 });
  const [compare, setCompare] = React.useState(false);
  const master = connected ? sources[0] : data.masterImage;
  const pass = data.coveragePasses.find(p => p.id === data.coveragePassId) || data.coveragePasses.at(-1);
  const shot = data.coverageShots.find(s => s.id === data.coverageShotId), item = coverageShotItem(shot);
  const lensSettings = coverageLensSettings(shot), lensSource = coverageLensSource(shot);
  const effectivePoses = coverageFramingPoses(data.coveragePoses, data.coveragePathMode, data.coverageProtectFraming, data.coverageFramingRoom);
  const view = data.coverageView, position = effectivePoses[Math.min(poseIndex, effectivePoses.length - 1)];
  const activePose = Math.min(poseIndex, data.coveragePoses.length - 1);
  const travelMode = data.coveragePathMode === "travel", customPreset = travelMode ? "Custom Travel" : "Custom";
  const travelPosition = coverageTravelPosition(position);
  const minimumDistance = data.coverageProtectFraming && activePose ? 1 + data.coverageFramingRoom / 100 : null;
  const poseControls = travelMode ? [["slide", "Slide", ...coverageTravelLimits.slide, 0.05], ["boom", "Boom", ...coverageTravelLimits.boom, 0.05], ["dolly", "Dolly", minimumDistance ?? coverageTravelLimits.dolly[0], coverageTravelLimits.dolly[1], 0.05]]
    : [["azimuth", "Orbit", -180, 180, 1], ["elevation", "Elevation", -30, 60, 1], ["distance", "Distance", minimumDistance ?? 0.4, 2, 0.05]];
  const shotBusy = data.coverageShotJobs.some(job => job.shotId === shot?.id);
  const activeShotJobs = new Map(data.coverageShotJobs.filter(job => ["submitting", "queued", "running", "saving"].includes(job.status)).map(job => [job.shotId, job]));
  const jobs = [data.coverageJob, ...data.coverageShotJobs].filter(Boolean);
  const validRefine = enabledModels.includes(data.model) && resolutions.includes(data.resolution);
  const ports = { node, onConnectStart, onDisconnectInput, connectedPortKeys };
  const price = (label, amount) => showApiCosts ? amount == null ? `${label} (Variable cost)` : formatPricedRunLabel(label, amount) : label;
  const editShots = (shots, selected = data.coverageShotId) => update(coverageOutputPatch(shots, selected));
  const patchShot = patch => editShots(data.coverageShots.map(s => s.id === shot.id ? { ...s, ...patch } : s));
  const seek = value => { if (!videoRef.current) return; videoRef.current.currentTime = Math.max(0, Math.min(Math.max(0, duration - 1 / (pass?.fps || 24)), value)); setTime(videoRef.current.currentTime); };
  const togglePlay = () => { const video = videoRef.current; if (video) video.paused ? video.play().catch(e => update({ error: e.message })) : video.pause(); };
  const selectShot = id => { setCompare(false); update({ ...coverageOutputPatch(data.coverageShots, id), coverageView: "shot" }); };
  const updatePose = patch => update({ coveragePreset: customPreset, coveragePoses: data.coveragePoses.map((p, i) => i === activePose && i > 0 ? { ...p, ...patch } : p) });
  const setPreset = preset => { update({ coveragePreset: preset, coveragePathMode: coveragePresetPathMode(preset), coveragePoses: newCoveragePoses(preset) }); setPoseIndex(1); };
  const setPoseControl = (key, value) => updatePose(travelMode ? coverageTravelPose({ ...travelPosition, [key]: value }) : { [key]: value });
  const syncScroll = () => { const el = galleryRef.current; if (el) setScroll({ left: el.scrollLeft, max: Math.max(0, el.scrollWidth - el.clientWidth) }); };
  React.useEffect(() => { setTime(0); setPlaying(false); setDuration(pass?.duration || 0); }, [pass?.id]);
  React.useEffect(() => {
    const el = galleryRef.current; if (!el) return;
    const observer = new ResizeObserver(syncScroll); observer.observe(el); syncScroll();
    return () => observer.disconnect();
  }, [data.coverageShots.length]);
  const closestRatio = () => coverageRefineRatio(shot, ratios);
  const dragProps = media => ({ draggable: Boolean(media?.url),
    onDragStart: event => { event.stopPropagation(); setOutputItemDragData(event.dataTransfer, media); },
    onDragEnd: event => finishOutputItemDragData(media, event) });
  const displayedItem = view === "shot" ? compare ? { ...item, url: shot?.originalUrl } : item : { ...master, type: "image" };
  return <div className="node-body camera-coverage-body" tabIndex={0} onKeyDown={event => {
    if (/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (view === "pass" && pass && [" ", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === " ") togglePlay(); else seek(time + (event.key === "ArrowRight" ? 1 : -1) / (pass.fps || 24));
    }
  }}>
    <div className="coverage-source-row">
      <NodeRow label="Master image" inputPort={config.input[0]} {...ports}>
        <span className="coverage-source-name" title={master?.label}>{master?.label || (connected ? "Waiting for connected image" : "No image")}</span>
      </NodeRow>
      <input ref={uploadRef} hidden type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); }} />
      <IconButton title={connected ? "Disconnect the master input to upload a different image" : "Upload master image"} disabled={connected || Boolean(working.upload)} onClick={() => uploadRef.current?.click()}><Upload size={17} /></IconButton>
    </div>
    <div className="coverage-monitor-toolbar">
      <div className="coverage-tabs" role="tablist" aria-label="Coverage monitor">
        {[["master", "Master"], ["pass", "Pass"], ["shot", "Shot"]].map(([key, label]) => <button key={key} role="tab" aria-selected={view === key} disabled={key === "shot" && !shot}
          onClick={() => { videoRef.current?.pause(); update({ coverageView: key }); }}>{label}</button>)}
      </div>
      {view === "pass" && pass && <select aria-label="Camera pass" value={pass.id} onChange={e => update({ coveragePassId: e.target.value, ...(e.target.value === data.coverageReadyPassId ? { coverageReadyPassId: "" } : {}) })}>{data.coveragePasses.map(p => <option key={p.id} value={p.id}>{p.label}{p.id === data.coverageReadyPassId ? " (new)" : ""}</option>)}</select>}
      {data.coverageReadyPassId && <IconButton title="View newly completed camera pass" onClick={() => update({ coveragePassId: data.coverageReadyPassId, coverageView: "pass", coverageReadyPassId: "" })}><CirclePlay size={17} /></IconButton>}
      {view === "shot" && item && <IconButton title="Compare original (hold)" aria-pressed={compare} onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setCompare(true); }} onPointerUp={() => setCompare(false)} onPointerCancel={() => setCompare(false)} onKeyDown={e => { if (e.key === " ") setCompare(true); }} onKeyUp={() => setCompare(false)}><ScanEye size={17} /></IconButton>}
      <span className="coverage-spacer" />
      {(view === "pass" ? pass?.url : view === "master" ? master?.url : item?.url) && <a className="coverage-icon" title="Download displayed media" aria-label="Download displayed media" href={view === "pass" ? pass.url : view === "master" ? master.url : item.url} download><Download size={17} /></a>}
    </div>
    <div className="coverage-monitor" tabIndex={0} aria-label="Camera monitor" onPointerDown={e => { e.stopPropagation(); e.currentTarget.focus({ preventScroll: true }); }}>
      {view === "pass" && pass ? <video key={pass.id} ref={videoRef} src={pass.url} playsInline preload="metadata" muted
        onLoadedMetadata={e => setDuration(e.target.duration)} onTimeUpdate={e => setTime(e.target.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onClick={togglePlay} onError={() => update({ error: "This pass could not be played. Check that its saved video is available." })} />
        : (view === "shot" ? item?.url : master?.url) ? <img src={displayedItem.url} alt={view === "shot" ? shot.label : "Master image"} {...dragProps(displayedItem)}
          onDoubleClick={() => onPreviewOpen?.(view === "shot" ? { ...item, url: compare ? shot.originalUrl : item.url } : master)} />
          : <Camera size={42} aria-label="No camera pass yet" />}
    </div>
    {view === "pass" && pass && <div className="coverage-transport" onPointerDown={e => e.stopPropagation()}>
      <IconButton title={playing ? "Pause (Space)" : "Play (Space)"} onClick={togglePlay}>{playing ? <Pause size={18} /> : <Play size={18} />}</IconButton>
      <IconButton title="Previous frame (Left arrow)" onClick={() => seek(time - 1 / (pass.fps || 24))}><SkipBack size={16} /></IconButton>
      <input aria-label="Camera pass playhead" type="range" min="0" max={Math.max(0, duration - 1 / (pass.fps || 24))} step={1 / (pass.fps || 24)} value={Math.min(time, Math.max(0, duration - 1 / (pass.fps || 24)))} onChange={e => { videoRef.current?.pause(); seek(Number(e.target.value)); }} />
      <IconButton title="Next frame (Right arrow)" onClick={() => seek(time + 1 / (pass.fps || 24))}><SkipForward size={16} /></IconButton>
      <output>{timeLabel(time)}</output>
      <IconButton title="Capture full-resolution PNG at playhead" disabled={Boolean(working.capture) || !duration} onClick={() => { videoRef.current?.pause(); capture(pass, Math.min(time, duration - 1 / (pass.fps || 24))); }}><Camera size={19} /></IconButton>
    </div>}
    <div className="coverage-auto-refine"><label title="After each capture, run one billed refinement with the selected model. The original is always saved first. Existing shots are not rerun.">
      <button type="button" role="switch" aria-label="Auto Refine" aria-checked={data.coverageAutoRefine} onClick={() => update({ coverageAutoRefine: !data.coverageAutoRefine })}><span /></button>
      <span>Auto Refine</span></label><span className="coverage-muted">{data.model}</span>
      {showApiCosts && data.coverageAutoRefine && <span className="coverage-muted">{price("Per capture", estimateImageRunCost({ ...data, aspectRatio: closestRatio(), provider, referenceCount: 1, batchCount: 1 }))}</span>}
    </div>
    <div className="coverage-shot-heading"><span>Shots <span className="coverage-muted">{data.coverageShots.length}</span></span><OutputPortRow port={config.output[0]} label="Selected shot" {...ports} /></div>
    {data.coverageShots.length > 0 && <>
      <div className="coverage-gallery" ref={galleryRef} onScroll={syncScroll} onPointerDown={e => e.stopPropagation()}>
        {data.coverageShots.map(s => {
          const job = activeShotJobs.get(s.id), progress = job ? `${job.kind === "upscale" ? "Upscaling" : job.kind === "lens" ? "Changing lens for" : "Refining"} ${s.label}` : "";
          return <button key={s.id} className={s.id === shot?.id ? "selected" : ""} aria-label={`Select ${s.label}`} aria-pressed={s.id === shot?.id} aria-busy={Boolean(job)} title={progress || s.label} onClick={() => selectShot(s.id)} {...dragProps(coverageShotItem(s))}>
            <span className="coverage-thumbnail">
              <img src={coverageShotItem(s)?.thumbnailUrl || coverageShotItem(s)?.url} alt={s.label} draggable={false} loading="lazy" />
              {job && <span className="coverage-shot-progress" role="img" aria-label={progress}><LoaderCircle size={16} className="coverage-shot-spinner" aria-hidden="true" /></span>}
            </span>
            <span className="coverage-shot-label">{s.label}</span>
          </button>;
        })}
      </div>
      <div className="coverage-gallery-scroll" onPointerDown={e => e.stopPropagation()}>
        <IconButton title="Scroll shots left" disabled={scroll.left <= 0} onClick={() => { galleryRef.current.scrollLeft -= 250; }}><ChevronLeft size={16} /></IconButton>
        <input type="range" aria-label="Scroll saved shots" min="0" max={scroll.max} value={Math.min(scroll.left, scroll.max)} disabled={!scroll.max} onChange={e => { galleryRef.current.scrollLeft = Number(e.target.value); }} />
        <IconButton title="Scroll shots right" disabled={scroll.left >= scroll.max - 1} onClick={() => { galleryRef.current.scrollLeft += 250; }}><ChevronRight size={16} /></IconButton>
      </div>
    </>}
    {shot && <div className="coverage-shot-controls">
      <div className="coverage-shot-tools">
        <input aria-label="Shot name" value={shot.label} maxLength={120} onChange={e => patchShot({ label: e.target.value })} onBlur={() => { if (!shot.label.trim()) patchShot({ label: "Shot" }); }} />
        <select aria-label="Shot version" value={shot.versionId} onChange={e => patchShot({ versionId: e.target.value })}>{shot.versions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
        {[-1, 1].map(direction => <IconButton key={direction} title={direction < 0 ? "Move shot earlier" : "Move shot later"} disabled={data.coverageShots.indexOf(shot) + direction < 0 || data.coverageShots.indexOf(shot) + direction >= data.coverageShots.length} onClick={() => {
          const shots = [...data.coverageShots], index = shots.indexOf(shot); [shots[index], shots[index + direction]] = [shots[index + direction], shots[index]]; editShots(shots);
        }}>{direction < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</IconButton>)}
        <IconButton title="Remove shot from node only; saved files are kept" disabled={shotBusy} onClick={() => editShots(data.coverageShots.filter(s => s.id !== shot.id))}><Trash2 size={16} /></IconButton>
      </div>
      <div className="coverage-enhance">
        <select aria-label="Upscale factor" value={data.upscaleFactor} onChange={e => update({ upscaleFactor: Number(e.target.value) })}><option value="2">2x</option><option value="4">4x</option></select>
        <button title="Fal Topaz High Fidelity V2. No face reconstruction. Keeps the original as a separate version." disabled={shotBusy} onClick={() => start("upscale", item.url, shot.id)}><ArrowUpRight size={16} />{price("Upscale", null)}</button>
        <button title="Improve realism and detail with the selected image model. AI may alter details; compare with the preserved original." disabled={shotBusy || !validRefine} onClick={() => refineShot(shot, closestRatio())}><Sparkles size={16} />{price("Refine", estimateImageRunCost({ ...data, aspectRatio: closestRatio(), provider, referenceCount: 1, batchCount: 1 }))}</button>
      </div>
      <div className="coverage-lens-controls" onPointerDown={e => e.stopPropagation()}>
        <label title="AI lens interpretation in full-frame equivalents, not calibrated optics. 8mm Fisheye adds intentional curved-edge distortion; other lenses are rectilinear. Original leaves the selected version unchanged; use Shot version to return to an earlier image.">Lens
          <select aria-label="Shot lens" value={lensSettings.lensTarget} onChange={e => patchShot({ lensTarget: e.target.value })}>
            <option value="original">Original</option>{coverageLensOptions.map(mm => <option key={mm} value={mm}>{coverageLensLabel(mm)}</option>)}
          </select>
        </label>
        <label title="Keep Camera Position changes the field of view without camera travel. Keep Subject Size also moves the virtual camera to retain subject framing, changing perspective. Newly exposed areas are inferred by AI.">Framing
          <select aria-label="Lens framing" value={lensSettings.lensFraming} disabled={lensSettings.lensTarget === "original"} onChange={e => patchShot({ lensFraming: e.target.value })}>
            {Object.entries(coverageLensFramings).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button title={`Create a new lens interpretation from this shot's first original refinement, or its original capture if unrefined, using ${data.model}. Never builds on a previous lens edit. One billed image edit; originals are kept. AI can alter details. This does not change the H3 camera pass.`}
          disabled={shotBusy || !validRefine || !lensSource || lensSettings.lensTarget === "original"} onClick={() => changeLens(shot)}>
          <Aperture size={16} />{price("Change Lens", estimateImageRunCost({ ...data, aspectRatio: coverageRefineRatio(shot, ratios, lensSource), provider, referenceCount: 1, batchCount: 1 }))}
        </button>
      </div>
    </div>}
    <button className="coverage-settings-toggle" aria-expanded={data.settingsOpen} onClick={() => update({ settingsOpen: !data.settingsOpen })}><ChevronDown size={16} />Settings</button>
    {data.settingsOpen && <div className="coverage-settings">
      <div className="coverage-framing">
        <label className="coverage-framing-switch" title="Limit inward camera moves and ask H3 to preserve subjects already visible in the source. The first frame stays unchanged. Turn off for intentional close crops. This is guidance, not subject tracking or a framing guarantee.">
          <button type="button" role="switch" aria-label="Protect Framing" aria-checked={data.coverageProtectFraming} onClick={() => update({ coverageProtectFraming: !data.coverageProtectFraming })}><span /></button>
          <span>Protect Framing</span>
        </label>
        {data.coverageProtectFraming && <label className="coverage-framing-room" title="Minimum distance (Orbit) or depth (Straight Travel) beyond the master camera, after the first pose. 20% sets a minimum of 1.20x; it is not a measured image margin. The diagram and position controls show the adjusted path.">
          <span>Extra Room</span><input type="range" aria-label="Extra Room" min="0" max="40" step="5" value={data.coverageFramingRoom} onChange={e => update({ coverageFramingRoom: Number(e.target.value) })} /><output>{data.coverageFramingRoom}%</output>
        </label>}
      </div>
      <div className="coverage-setting-grid coverage-pass-settings">
        <label title="Straight Travel samples slide, boom and dolly positions while aiming at the same scene center. H3 does not expose a fixed-heading camera; generated travel is approximate.">Movement<select aria-label="Camera movement" value={data.coveragePathMode} onChange={e => setPreset(e.target.value === "travel" ? "Slide Coverage" : "Coverage")}><option value="orbit">Orbit</option><option value="travel">Straight Travel</option></select></label>
        <label>Camera pass<select aria-label="Camera pass preset" value={data.coveragePreset} onChange={e => setPreset(e.target.value)}>{Object.keys(cameraCoveragePresets).filter(p => coveragePresetPathMode(p) === data.coveragePathMode).map(p => <option key={p}>{p}</option>)}</select></label>
        <label>Duration<select value={data.coverageDuration} onChange={e => update({ coverageDuration: Number(e.target.value) })}>{[5, 8, 10, 12, 15].map(n => <option value={n} key={n}>{n} seconds</option>)}</select></label>
        <label>Pass resolution<select value={data.coverageResolution} onChange={e => update({ coverageResolution: e.target.value })}>{["480P", "768P", "1080P"].map(r => <option key={r}>{r}</option>)}</select></label>
      </div>
      <div className="coverage-camera-layout">
        <div className="coverage-diagram" title="Requested camera position only, not a reconstructed 3D scene. Generated views can differ, especially in unseen areas.">
          <CameraCoverageViewport imageUrl={master?.url || ""} position={position} positions={effectivePoses} pathMode={data.coveragePathMode} index={activePose} onChange={updatePose} />
        </div>
        <div className="coverage-positions">
          <div className="coverage-position-tabs" aria-label="Camera positions">{data.coveragePoses.map((p, i) => <button key={i} aria-pressed={i === activePose} onClick={() => setPoseIndex(i)}>{i === 0 ? "Master" : i + 1}</button>)}
            <IconButton title="Add camera position" disabled={data.coveragePoses.length >= (travelMode ? 4 : 8)} onClick={() => { update({ coveragePreset: customPreset, coveragePoses: [...data.coveragePoses, { ...position }] }); setPoseIndex(data.coveragePoses.length); }}><Plus size={15} /></IconButton>
          </div>
          {poseControls.map(([key, label, min, max, step]) => { const value = travelMode ? Number(travelPosition[key].toFixed(3)) : position[key]; return <label key={key} className="coverage-pose-control" title={travelMode ? ({ slide: "Left (-) / right (+) parallel to the master image plane.", boom: "Down (-) / up (+), not tilt.", dolly: "Closer (below 1) / farther (above 1), not zoom." })[key] + " Relative scene units, not meters. Camera continues aiming at the scene center." : undefined}>{label}<input type="range" aria-label={`${label} slider`} min={min} max={max} step={step} value={value} disabled={!activePose} onChange={e => setPoseControl(key, Number(e.target.value))} /><input type="number" aria-label={label} min={min} max={max} step={step} value={value} disabled={!activePose} onChange={e => setPoseControl(key, Math.max(min, Math.min(max, Number(e.target.value))))} /></label>; })}
          <div className="coverage-position-footer"><IconButton title="Remove camera position" disabled={!activePose || data.coveragePoses.length <= 2} onClick={() => { update({ coveragePreset: customPreset, coveragePoses: data.coveragePoses.filter((p, i) => i !== activePose) }); setPoseIndex(Math.max(1, activePose - 1)); }}><Trash2 size={15} /></IconButton></div>
        </div>
      </div>
      <div className="coverage-setting-grid coverage-refine-settings">
        <label>Refinement model<select aria-label="Refinement model" value={data.model} onChange={e => update(modelPatch(e.target.value))}>{!enabledModels.includes(data.model) && <option value={data.model}>{data.model} (disabled)</option>}{enabledModels.map(m => <option key={m}>{m}</option>)}</select></label>
        <label>Refinement size<select aria-label="Refinement size" value={data.resolution} onChange={e => update({ resolution: e.target.value })}>{resolutions.map(r => <option key={r}>{r}</option>)}</select></label>
        {qualities.length > 0 && <label>Quality<select value={data.quality} onChange={e => update({ quality: e.target.value })}>{qualities.map(q => <option key={q}>{q}</option>)}</select></label>}
      </div>
    </div>}
    {jobs.map(job => <div key={job.id} className="coverage-job-entry" data-job-id={job.id}>
      <div className="coverage-job"><span role="status">{job.kind === "pass" ? "Camera pass" : `${data.coverageShots.find(s => s.id === job.shotId)?.label || "Shot"} - ${job.kind === "refine" ? "Refine" : job.kind === "lens" ? "Change Lens" : "Upscale"}`}: {job.status}</span>
        {!isCoverageImageJob(job) && <IconButton title="Check existing request; never submits again" disabled={job.status === "submitting"} onClick={() => check(job.id)}><RefreshCw size={16} /></IconButton>}
        {(!isCoverageImageJob(job) || ["failed", "interrupted"].includes(job.status)) && <IconButton title="Release this job from the node. Does not cancel the provider request." onClick={() => { if (window.confirm("This does not cancel the provider request or its charge. Check History and the provider before starting another. Release the job from this node?")) release(job.id); }}><X size={16} /></IconButton>}
      </div>
      {job.error && <div className="node-error" role="alert">{job.error}</div>}
    </div>)}
    {working.capture && <div className="coverage-muted" role="status">Saving full-resolution frame...</div>}
    {working.upload && <div className="coverage-muted" role="status">Uploading master image...</div>}
    {data.error && <div className="node-error" role="alert">{data.error}</div>}
    <button className="coverage-generate" disabled={Boolean(data.coverageJob || working.upload) || !master?.url || sources.length > 1} title="Generate one billed H3 Max camera pass through Fal. A frozen-scene instruction preserves blocking, but unseen areas and exact identity are not guaranteed." onClick={() => start("pass", master.url)}><Play size={17} />{price("Generate Camera Pass", coverageCost(data.coverageDuration, data.coverageResolution).amountUsd)}</button>
  </div>;
}
