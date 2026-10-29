# ReFrame

## Purpose

Turn a master still into a collection of candidate camera views, then select and polish the useful shots. This node is designed for scene blocking and coverage selection, not exact photogrammetry or camera-calibrated reconstruction.

The existing Camera node remains a prompt/control source. Utility Coverage remains independent image-model coverage. ReFrame is a separate, manual node next to Camera.

Previously called Camera Coverage. Existing default node titles update to ReFrame, including numbered/copy titles; custom names stay unchanged. Saved node types, connections, API routes, media and pending generation receipts remain compatible. Technical module names retain `cameraCoverage` for compatibility.

## Workflow

1. Connect a master image or upload a still. Connected images take precedence over uploaded media; one connection replaces the previous master input without erasing earlier passes or shots.
2. Choose **Orbit** or **Straight Travel**. Orbit keeps Coverage, Close Coverage, Height Study, Profile Study and Custom, with up to eight positions. Straight Travel offers Slide Coverage, Boom Coverage, Dolly Coverage and Custom Travel, with up to four positions. Edit the diagram or numeric controls. The first position always matches the input camera; changing mode/preset replaces only the requested path, never saved media.
3. Generate a pass with the enabled Fal key. Defaults are 10 seconds and 768p. 480p and 1080p are also available. This is one paid video request, not a batch of independently generated stills.
4. Scrub the saved video. Space plays/pauses and Left/Right step frames while the monitor has focus. The camera button saves a full-resolution PNG locally with the pass, timestamp and approximate requested camera position attached. Auto Refine is on by default: after saving, it runs one paid refinement and selects the polished version. Turn the visible switch off to capture originals only.
5. Rename, reorder or remove shots. Removal affects this node only, never the local source files. The persistent shot-strip slider and arrows remain available even on systems with hidden native scrollbars. Favorite and Duplicate buttons are omitted.
6. Optionally Upscale or Refine the selected version, or Change Lens from the shot's original refinement. Each is a paid request. The version menu and hold-to-compare button retain access to the original. Failed image edits keep the saved frame; reopening never retries them.
7. Drag a shot thumbnail or the monitor image onto the canvas to create an image node using the displayed full-resolution version. The newest refinement/upscale is automatically selected unless you switched that shot to another version while it was running. An original can still be explicitly selected and dragged.
8. Connect the selected-shot output to another image input, Director, Storyboard or Output. Preview receives every version of every saved shot. Choosing a version in Preview also selects that shot/version in ReFrame.

### Working During Generation

Keep browsing existing passes, scrubbing, capturing, naming/reordering shots and changing camera settings while a new pass generates. Each submitted request retains its original settings; changes apply to the next request. Completed passes append without replacing the clip/shot currently displayed. The monitor's view-new-pass icon opens the latest completed pass when you choose.

Refine, Change Lens and Upscale run independently for different shots, alongside a camera pass. Capture saves the original and releases its local lock before starting Auto Refine, allowing another capture while refinement continues. Only a shot with an active/unresolved operation has its enhancement and removal controls locked. One camera pass at a time prevents accidental duplicate paid submissions. Each background operation has its own status, thumbnail spinner and error; failures do not block unrelated work.

Reopening resumes read-only checks for saved pass/upscale receipts. Submissions interrupted before acknowledgement remain uncertain and can be checked manually. Interrupted refinements cannot be resumed automatically: check History/provider results and release that shot's job explicitly before another paid request. Releasing does not cancel a provider request or its charge. Copies/imports keep media but clear all pending jobs.

## Camera Consistency

H3 Max Camera Controls returns video, not a navigable Gaussian-splat scene. The full-width Three.js view is a requested-position diagram, not a live novel-view preview. It shows a textured master, recognizable camera/lens, ground orbit and elevation guide. Drag to change orbit/elevation or use arrow keys (Shift for larger steps). Numeric controls remain available and the first master pose stays fixed. The diagram preserves the master image's displayed aspect ratio, but it cannot show missing geometry.

### Straight Travel

- **Slide:** left/right translation parallel to the original image plane; negative is left, positive is right.
- **Boom:** move the camera down/up physically; negative is down, positive is up. This is not just a tilt.
- **Dolly:** change camera depth; below 1 moves closer, above 1 moves farther. This is not digital zoom.
- Values are normalized to the master camera's subject distance, not measured meters. Drag the diagram or use arrows for slide/boom; use Dolly for depth. Colored rails and the planned path replace the orbit guides.

Important limitation: H3 exposes spherical camera positions, not independent yaw/pitch/roll or fixed-heading XYZ controls. We convert straight Cartesian paths into sampled spherical positions, keeping the camera aimed toward the same scene center. This approximates subject-tracking slides and booms; it does not promise a camera that keeps its optical axis parallel while the subject moves across the frame. Generated motion can still deviate. No separate model or billing account is used.

Fal accepts at most 12 camera keyframes. Orbit budgets holds around every requested position; longer 7-8-position paths have fewer holds. Travel reserves holds and uses the remaining budget to reduce curved interpolation between straight-line positions. The maximum is enforced before upload or billing. Newly selected travel and longer orbit paths require the updated backend capability, preventing an old server from silently running different motion.

The hidden prompt freezes poses, expressions, wardrobe, props, lighting and world positions; only camera motion should produce movement. Prompt expansion is disabled. Camera paths include short holds to make frame selection easier. All passes begin from the master still rather than repeatedly regenerating from previous passes, reducing compounded drift.

This is guidance, not a guarantee. Unseen surfaces must be inferred, subjects may drift, and profile or over-the-shoulder coverage depends on the input blocking and what H3 can reconstruct. Moderate moves are the starting point. A large orbit from one still is exploratory. Review each pass before approving a shot. Requested camera metadata is explicitly approximate, not measured from the output.

### Protect Framing

Enable **Settings > Protect Framing** when the subject gets cropped during camera moves. It is off by default so existing workflows and deliberate close-up paths do not change. **Extra Room** starts at 20% and ranges from 0-40%. At 20%, subsequent requested positions use at least 1.20x the master's camera distance (Orbit) or depth (Straight Travel); larger distances remain untouched. This is extra camera distance, not a predicted 20% image border. At 0%, inward moves are still limited to the master's distance/depth.

The first pose always matches the source. The initial move transitions to the wider requested positions, so protection does not repair a tightly cropped source frame. Travel retains slide and boom coordinates while adding depth. The diagram and numeric controls show the adjusted path; disabling protection restores the stored path, except for positions you explicitly edited. Disable protection for intentional close cropping.

The generation prompt also requests headroom, look room and retention of the source's visible subjects, including a whole group, without moving/shrinking people or inventing off-frame body parts. It remains model guidance, not subject tracking or a guarantee against cropping during extreme moves or occlusion. Refine preserves the captured composition and cannot reliably restore a missing subject. Use this for the next pass; existing clips are unchanged. There is no additional analysis call or automatic regeneration. A backend restart is required before the first protected request; the app refuses to submit it to an older backend.

## Enhancement

- **Upscale:** Fal Topaz High Fidelity V2, 2x or 4x, PNG, crop disabled, face enhancement disabled. This prioritizes retention of the selected composition over generative face reconstruction. It is not claimed to be mathematically lossless.
- **Refine:** the selected enabled image model receives only the selected shot plus a fidelity prompt that preserves viewpoint, crop, perspective, identity, staging, lighting and grade. The master image is deliberately not added because it can pull the result toward the original camera. Refinement can still change details; compare versions. Provider-supported aspect ratios apply.
- New nodes default to Nano Banana 2.1, 2K, with Auto Refine on. Explicitly saved model choices remain unchanged. Other currently enabled supported choices include Nano Banana Pro, OpenAI Image 2.5 Sunburst/Flare and Seedream 5.0 Pro. Existing provider routing is retained for refinement. Camera generation and Topaz require Fal; no new billing account is introduced.

### Lens Changes

The selected shot has a Lens menu with Original, **8mm Fisheye**, and 18, 24, 35, 50 and 85mm rectilinear options. These are **full-frame-equivalent AI interpretations**, not calibrated optical conversions; the source focal length is unknown. Original is the default and submits nothing. It does not replace the displayed version: use **Shot version > Original** to return to the saved capture.

8mm Fisheye requests deliberate curvilinear distortion and an expansive view, with stronger curvature toward the edges. It fills the existing rectangular frame without a black circular border. Both framing modes below apply. Fisheye versions are labeled explicitly, and normal Refine preserves that intentional distortion.

- **Keep Camera Position:** changes field of view at the same camera position and orientation. Wider framing makes subjects smaller and reveals more surroundings; narrower framing makes them larger. Perspective relationships should remain consistent.
- **Keep Subject Size:** permits camera travel along the viewing axis to keep the principal subject/group similarly framed, with the corresponding perspective/background-scale change.
- **Change Lens:** makes one paid image edit using the selected refinement model and size. Every lens variation starts from that shot's first original refinement, never a previous lens result or its refined/upscaled descendants. If no clean refinement exists, it uses the original capture without an extra paid refinement. Changing the displayed version does not change this base. The original and all earlier versions remain available. Results get lens/framing labels and requested-lens metadata; later fidelity refinement/upscaling retains that metadata. All versions feed Preview and can be dragged onto the canvas.

Lens and framing choices are saved per shot. Changing controls does not generate; edits in progress retain their submitted settings. Ordinary Refine and Auto Refine still preserve the current lens and composition. H3 camera passes and the Three.js position diagram are unchanged. The edit asks for identity, staging, props, lighting and grade continuity, but faces, geometry and inferred surroundings may drift. Compare versions before approving a shot. No paid visual-quality validation is implied by the automated tests.

## Billing and Recovery

Generation, upscaling, refinement and lens editing are separate billed operations. Frame extraction, organization and preview are local, but capturing with Auto Refine on also starts a billed image request. API Cost visibility is respected. H3 estimates are based on requested seconds and published non-promotional rates (480p $0.05/s, 768p $0.08/s, 1080p $0.16/s); actual settled charges can differ. Topaz remains variable/unknown until a request-specific settled charge is available.

Every pass/upscale has a random local receipt ID and provider request ID. The backend records submission intent before a single guarded POST and does not replay an ambiguous result. Reloads only poll a saved receipt. The original enabled Fal key is required for unfinished recovery; keys are never stored in receipts. A completed provider URL is saved before local download so saving can be retried without another generation. Completed History records are idempotent.

Receipts stay on the originating NewtNode installation. Copies and imported nodes keep media but clear active operations. Refinement and lens editing follow the existing no-replay image request behavior; interrupted image edits require checking History before another paid action. Lens edits are not polled against H3 receipts. Releasing a failed/interrupted job from the node does not cancel it or prevent provider charges. Auto Refine runs only in response to an explicit frame capture with the switch enabled, never on reopening or restoring a project. There is no automatic retry or automatic Newt-agent execution.

## Verification

- `node --test test/cameraCoverage.test.js test/cameraCoverageApi.test.js test/cameraCoverageLens.test.js test/cameraCoverageIntegration.test.js`
- `npm test`, `npm run build`, `npm run smoke:app` after the updated backend is active.
- `node scripts/smokeCameraCoverage.mjs` boots the actual backend in a temporary copy with disposable storage and no credentials. It checks startup, capability flags, rejection without a Fal key, full-resolution PNG frame extraction, History, source validation and frame bounds without restarting the user's app. Build first; the existing frontend defaults to port 5176. Override `COVERAGE_SMOKE_PORT` or `NEWT_SMOKE_CLIENT_URL` if needed.
- Run the Vite client, then `node scripts/verifyCameraCoverage.mjs`. Set `PLAYWRIGHT_MODULE` to an installed Playwright module if it is not locally installed; `COVERAGE_QA_URL` defaults to `http://127.0.0.1:5185`. Uses installed Chrome unless `COVERAGE_BROWSER_CHANNEL` is set.
- The browser script generates a local test video and mocks every generation/capture/refinement. It blocks actual API requests and checks saved versions, recovery, scrolling, responsive layout, screenshots, and nonblank/moving Three.js pixels. Framing checks cover opt-in controls, adjusted diagram/numeric positions, fixed master, saved raw poses, snapshot/reopen and protected travel. Its concurrency checks cover simultaneous pass/upscale/refinements, capture during Auto Refine, double-click protection, out-of-order completion, preserved navigation/version choices/edits, isolated failures, snapshotted settings, and reopen/copy without paid replay. It does not establish real provider quality. Paid visual validation requires separate user approval.
- Lens checks additionally verify both framing prompts, independent per-shot choices, unchanged fidelity prompts, single-reference routing from the first clean refinement, capture fallback, legacy ancestry and base aspect ratio, progress, output/dragging, inherited lens metadata, snapshot/model retention, failures, reopen/copy without replay or incorrect polling, and narrow layouts with cost labels. Refine/Upscale retain selected-version inputs; lens completion respects intervening version choices separately from its reference source.

## Provider References

Camera schema rechecked October 26, 2026; other references checked October 25, 2026:

- [Fal H3 Max Camera Controls API](https://fal.ai/models/minimax/h3-max/camera-controls/api)
- [Fal H3 Max Camera Controls OpenAPI schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax%2Fh3-max%2Fcamera-controls)
- [Fal H3 Max Camera Controls guide](https://fal.ai/learn/tools/what-is-h3-max-camera-controls)
- [Fal Topaz Image Upscale API](https://fal.ai/models/fal-ai/topaz/upscale/image/api)

Future improvements should be based on paid visual trials: better preset ranges, pass-to-master comparison, shot-quality annotations and selective batch finishing. True reconstructed-scene navigation would require a separate verified provider output contract, not a cosmetic viewer change.
