# Newt Node Development Standards

This is a living standard for Newt_Node. It describes the current conventions for nodes, UI, media flow, backend routes, cost tracking, and verification. Amend it when the app deliberately changes direction. Do not bypass it casually.

Before starting any new feature, read this document first. If the feature changes a core workflow, update this document in the same change so the next feature starts from the current truth.

## Goals

- Keep every node predictable to build, use, save, load, preview, run, and debug.
- Preserve a clean canvas by default, with advanced controls hidden behind Settings.
- Make media types explicit so connector lines, ports, previews, stats, and backend routes stay in agreement.
- Track generation cost honestly whenever the app can estimate or record it.
- Prefer small, compatible changes over one-off node behavior.
- Keep saved workflows portable enough that another user can open and run a packaged graph from a shared drive when the needed assets are included.

## New Feature Checklist

Use this quick pass before implementing a feature, and again before committing it.

- Read the relevant standards in this document first.
- Identify which surfaces the feature touches: node catalog, node data, ports, run order, backend routes, asset persistence, stats, saved workflows, and UI states.
- Use the code ownership map below before editing `NodeEditor.jsx`; prefer the focused helper modules for pure logic, persistence, media handling, and API calls.
- Prefer existing helpers and patterns before adding a new storage, request, preview, or result shape.
- Preserve existing saved workflows with normalization or migration when fields, ports, node types, or asset URLs change.
- Keep generated files and copied dependencies inside the current workflow package when a package is attached.
- When a frontend/server change affects startup, routing, or lazy assets, run `npm run smoke:app` with the dev server running in addition to tests/build.
- Update this document when the feature intentionally changes one of these standards.

## Refactored Code Ownership

`NodeEditor.jsx` remains the canvas/UI orchestrator, but new work should not default to adding more pure logic there. Keep reusable logic in the smallest existing module that owns the concern.

| Area | Primary files | Standard |
| --- | --- | --- |
| API clients | `src/api/newtApi.js` | Add browser-side route wrappers here instead of scattering raw `fetch` calls. |
| Node registry | `src/nodeRegistry.js`, `src/NodeEditor.jsx` icon map | Add catalog definitions in `nodeRegistry.js`; add only the display icon mapping in `NodeEditor.jsx`. |
| Node config/defaults/normalization | `src/NodeEditor.jsx` | `getNodeConfig`, `createDefaultNodeData`, and `normalizeCurrentNode` still live here. Keep backward-compatible migrations close to these functions until they are deliberately extracted. |
| Run scheduling and result state | `src/nodeRunner.js`, `src/nodeRunners/*` | Batch counts, batch result aggregation, selected-node dependency scheduling, and run status text belong in `nodeRunner.js`. Node-specific API runners and reusable request/result builders belong in focused files under `src/nodeRunners/`. |
| Media drag/drop and imported asset shape | `src/mediaAssets.js` | Output-rail drag payloads, external file type detection, file-to-node mapping, and media accept rules live here. |
| Result items | `src/mediaResults.js` | Normalize, append, label, and download result items here. Do not hand-roll result array merging in node run branches. |
| Model and utility options | `src/modelOptions.js` | Model names, preset names/prompts, aspect ratios, duration/resolution lists, utility descriptions, and model-control option lists live here. Keep labels stable because saved workflows and UI normalization rely on them. |
| Canvas chrome | `src/components/CanvasChrome.jsx` | Memoized edge paths, selection marquee/action bar, and workflow prompt live here. Keep hot SVG/UI chrome out of `NodeEditor.jsx`. |
| Preview/result UI | `src/components/MediaViews.jsx`, `src/components/Model3DViewer.jsx` | Shared previews, result panes, project output drawer, output lightbox, lazy output-rail media loading, and the lazy 3D viewer wrapper live in `MediaViews.jsx`. The actual GLB renderer lives in `Model3DViewer.jsx`. |
| Small node bodies | `src/components/NodeBodies.jsx` | Plain Text, Text Model, upload media, and Composer summary bodies live here. Preserve their prop-driven behavior and class names when extending them. |
| Composer/camera 3D UI | `src/components/ComposerViewport.jsx`, `src/components/CameraControlViewport.jsx`, `src/composerState.js`, `src/composerRender.js` | Interactive Three.js viewport shells for Composer and Camera live in the component files. Composer defaults, normalization, saved pose fields, and image plane helpers live in `composerState.js`; Composer Three.js rendering and mannequin asset loading live in `composerRender.js`. Composer pose preset API wrappers live in `src/api/newtApi.js`; backend pose-library persistence lives in `server/routes/composerPoses.js`. |
| Node port rows and transfer collage | `src/components/NodePorts.jsx`, `src/components/StyleCollage.jsx` | Reusable port handles/rows and the transfer mood-board collage live here. Keep class names and drag/drop behavior stable because many node bodies depend on them. |
| Project output rail data | `src/projectOutputs.js` | Build and filter project output rail items here; keep filesystem/history filtering out of render code. |
| Canvas geometry | `src/nodeGeometry.js` | Node bounds, graph bounds, rectangle math, menu clamping, and viewport modulo helpers live here. |
| Canvas media utilities | `src/canvasMedia.js` | Canvas-to-blob, browser image loading, cover drawing, and mood-board collage layout live here. |
| Color ID matte UI/helpers | `src/components/ColorIdMatteControls.jsx`, `src/colorIdMatte.js` | Picker UI state lives in the component file; color normalization, matte preview rendering, sample radius/tolerance bounds, and matte run item normalization live in the helper file. |
| Three.js runtime | `src/threeRuntime.js` | Lazy Three/GLTF loading and shared 3D math helpers live here. Do not import Three.js directly into common preview modules. |
| Workflow persistence | `src/useWorkflowPersistence.js` | Save, Save As, Open, Import, unsaved-change prompts, Recent workflows updates, and workflow status messages live here. |
| Draft persistence | `src/useNodeEditorDraft.js` | Browser draft loading, snapshotting, and debounced local draft writes live here. |
| Workflow files/session/state | `src/workflowFiles.js`, `src/workflowSession.js`, `src/workflowPreferences.js`, `src/workflowContext.js`, `src/workflowState.js` | File document shape, display paths, package/request context, picker preferences, graph cloning/remapping/fingerprints, deduping, and stale runtime cleanup live here. |
| Backend route registration | `server/index.js`, `server/routes/*` | `server/index.js` owns shared app setup and existing route implementations. New low-coupling route groups should register through `server/routes/*` and receive explicit dependencies from `index.js`. |

When adding a new feature, put pure helpers in one of these modules or create a similarly focused module. `NodeEditor.jsx` should coordinate React state, node rendering, event handlers, and node-specific orchestration, not become the home for reusable algorithms.

## Migrating Pre-Refactor Features Into The Current App

Some future features may arrive as patches or branches built before this refactor. Treat those as source material, not as code to paste wholesale. The goal is to preserve the feature behavior while landing it in the current ownership map above.

Start every pre-refactor feature merge with this audit:

- Identify every touched surface in the incoming implementation: node catalog, icon, config, defaults, normalization, ports, connection rules, UI body, model options, API client call, backend route, run scheduling, result items, preview behavior, workflow persistence, stats, CSS, and tests.
- Compare those surfaces to the current ownership map before editing. Move incoming pure helpers, option lists, request builders, route wrappers, and preview utilities into their current focused modules.
- Keep `NodeEditor.jsx` as the coordinator. It may select node bodies, wire callbacks, own current node config/default/normalization functions, and call runner helpers. It should not regain large copied algorithms, static model catalogs, request payload builders, or reusable media utilities.
- Preserve saved-workflow compatibility first. If the incoming feature added or renamed fields, ports, node types, result shapes, or asset URLs, add normalization/migration for previous and current saved workflows in the current normalization path.
- Preserve UI class names and visible behavior unless the feature intentionally changes UI. When moving incoming JSX into a component, pass data and callbacks through props instead of reaching into editor state from the new component.
- Keep result arrays, selected result indexes, previews, and downloads using `mediaResults.js` and shared preview helpers. Do not introduce a new result shape for one feature unless all shared preview/download/stat surfaces are updated together.
- Keep model/provider names and dropdown option labels stable. Put new static model names, durations, aspect ratios, presets, and descriptions in `modelOptions.js`; saved workflows may depend on exact strings.
- GPT Image 2.5 Sunburst and Flare are distinct Image Model choices; resolve them before legacy Image 2 aliases. Shared request validation lives in `openAiImage25.js`. Preserve high/xhigh/max quality and background through persistence, requests, and reuse fingerprints. Fal supports the standard Image Model sizes and up to 16 references. Krea currently exposes only 1K at 1:1/3:2/2:3, ten references, no masks, and background controls for Flare only. Adapt visible controls on provider changes; reject unsupported explicit API requests before submission instead of truncating references or silently falling back to Image 2. Auto aspect may choose a supported Krea ratio. Preserve saved model choices and Utility defaults.
- New Character nodes default to Nano Banana Pro at 4K through `characterSheetDefaultModel`; Coverage and Storyboard retain Sunburst at High quality. Do not offer Flare in these three nodes. Keep legacy missing-model fallbacks on restoration (Character: Nano Banana 2; Coverage/Storyboard: Image 2). Preserve explicit saved model choices. Character Sunburst supports Fal or Atlas to preserve 4K/16:9 and wardrobe masks; Krea remains unsupported for that contract. Both regular and CU edits must use their corresponding saved bases. Storyboard's Advanced model selector controls frame generation, bounded QC retries and internal character preparation through `storyboardImageModels.js`; reuse already prepared sheets. Keep 1K frames and provider-supported aspect ratios through restoration, exports and frame prompts, including Atlas routes. Switching models alone must not delete generated media or regenerate text plans. Coverage still supplies all nine full-resolution results to Preview.
- Add browser API wrappers in `src/api/newtApi.js` before using a new route in UI code. Avoid scattered raw `fetch` calls.
- Prefer focused runner helpers under `src/nodeRunners/` for backend payloads and result normalization. The editor should assemble connected inputs and pass them to a runner/builder, not own the full request body when the shape is reusable.
- Register new backend route groups through `server/routes/*` when possible, with explicit dependencies from `server/index.js`. If extending an existing route in `server/index.js`, keep the change tightly scoped and document why it stayed there.
- Keep workflow package behavior intact. Imported or generated files should continue to use workflow context helpers so Windows and macOS users can move packaged workflows without broken asset references.
- Check cross-platform assumptions. Do not hard-code Windows path separators, drive letters, shell commands, hidden-folder behavior, or `.exe` names in browser code or shared helpers. Use Node `path` APIs server-side and document platform-specific commands separately when needed.
- Update this standards document in the same change when the incoming feature introduces a new durable pattern or changes a current one.

Use this placement guide while migrating pre-refactor code:

| Incoming code shape | Current landing place |
| --- | --- |
| Node catalog entry | `src/nodeRegistry.js`; icon only in `NodeEditor.jsx` |
| Static model names/options/descriptions | `src/modelOptions.js` |
| Upload, drag/drop, media accept/type detection | `src/mediaAssets.js` |
| Result item normalization or append logic | `src/mediaResults.js` |
| Preview/result/lightbox/output rail UI | `src/components/MediaViews.jsx` or a focused component imported there |
| Small reusable node body JSX | `src/components/NodeBodies.jsx` or a new focused component |
| Port row/collage UI | `src/components/NodePorts.jsx`, `src/components/StyleCollage.jsx` |
| Color matte picker/state/math | `src/components/ColorIdMatteControls.jsx`, `src/colorIdMatte.js` |
| Composer scene defaults, pose fields, pose presets, image planes | `src/composerState.js`, `src/api/newtApi.js`, `server/routes/composerPoses.js` |
| Composer Three.js rendering | `src/composerRender.js` |
| Camera/Composer viewport shell controls | `src/components/CameraControlViewport.jsx`, `src/components/ComposerViewport.jsx` |
| Backend request wrappers | `src/api/newtApi.js` |
| Node-specific payload/result builders | `src/nodeRunners/*` |
| Graph geometry, bounds, placement, import offsets | `src/nodeGeometry.js`, `src/workflowState.js` |
| Save/open/import/recent workflows | `src/useWorkflowPersistence.js`, `src/workflowFiles.js`, `src/workflowSession.js` |
| Draft autosave | `src/useNodeEditorDraft.js` |
| Backend routes | `server/routes/*` plus explicit registration in `server/index.js` |

Before committing a migrated pre-refactor feature, run the normal verification checklist. For frontend/server changes, include `npm run smoke:app` with the dev server running. For features that touch save/load/import, also manually test opening a workflow saved before the feature and one saved after the feature.

## Current Media Types

Use these internal media type names consistently in node config, result items, preview handling, history, stats, and connection rules.

| Media | Internal type | Color | Typical output |
| --- | --- | --- | --- |
| Prompt/Text | `prompt` or `text` history media | `#f0c83b` yellow | prompt strings |
| Image | `image` | `#3d85ff` blue | png, jpg, webp |
| Video | `video` | `#58ce63` green | mp4, mov, webm |
| Audio | `audio` | `#ff8b35` orange | mp3, wav, m4a |
| Camera | `camera` | `#ef4444` red | camera instruction |
| Style | `style` | `#9b5cff` purple | style instruction |
| Transfer | `transfer` | `#ff4fb3` pink | TRANSFER.png |
| 3D | `model3d` | `#14d8c8` teal | glb, gltf |
| Preview | `preview` | `#8d8d8d` gray | preview input only |

If a new media type is added, update this table, `portColors`, preview logic, stats media mix, connection compatibility, and result rendering together.

## Text Node Roles

- `Text` is the simple prompt node. It should stay lightweight: one plain textarea, one prompt output, no run button, no backend call.
- `Smart Text` (legacy `Text Model`) is a prompt editor with only Text and Image inputs. Remove old video/style edges during normal graph normalization without deleting source nodes, original text, or prior outputs. When an image is first connected and local text is blank, populate `Describe this image in simple prompting language.`; never replace existing user text or launch a paid run automatically.
- `src/smartTextPrompt.js` owns default text, concise prompt-editing instructions, and automatic downstream image/video intent. Follow prompt connections through Smart Text chains, stopping at the first generating consumer, not a video's later use of a generated image. Mixed destinations produce shared visual direction; no destination lets the LLM infer explicit user intent with a still-image fallback. Include this context and the prompt version in Newt reuse fingerprints.
- Smart Text uses its existing OpenAI model/provider selection. `server/smart-text.js` edits text and inspects full-resolution images in one multimodal request, not separate paid description and rewriting passes. Keep labeled references and @tags distinct, preserve user constraints, avoid invented motion/audio or compulsory cinematic styling, and return only the usable prompt. The local route validates inputs, records destination and single-request cost in history, and rejects empty outputs while preserving prior results. Do not send obsolete video/style inputs.
- Existing saved `text` nodes represent `Text Model`; keep that compatibility unless a migration explicitly changes it.

## Node Definition Checklist

Every new node type should touch the same core surfaces unless there is a clear reason not to.

- Add it to `nodeTypeDefinitions` in `src/nodeRegistry.js` with a concise label, and add the lucide icon mapping in `NodeEditor.jsx`.
- Add `getNodeConfig(type)` with all input and output ports.
- Add defaults in `createDefaultNodeData`.
- Add normalization in `normalizeCurrentNode` so saved workflows remain stable.
- Add connection rules in `getConnectionError`.
- Add auto-connect behavior in `preferredAutoInputPorts` and `autoConnectionOutputKind`.
- Add edge migration/color handling in `normalizeEdgeForCurrentGraph` when needed.
- Add run behavior in `runNode`, using `nodeRunner.js` helpers for batch/result state and a focused `runXGeneration` helper for API calls.
- Add result item typing through `normalizedResultItems`, `appendResultItems`, and `appendedNodeResultState`.
- Add preview media support through `previewMediaType` and `connectedPreviewSources`.
- Add backend route support and a health route flag when the node calls the local server.
- Add history and stats tracking if the node spends money or produces media.
- Add CSS only for the node-specific differences.
- Run the verification checklist before commit.

## Node UI Standards

Nodes should feel like they belong to the same editor.

- Header: icon, editable title, close button.
- Body: result pane first for generation nodes, then output, run button, Settings drawer.
- Default state: keep the node clean. Hide detailed controls inside Settings.
- Collapsed Settings: show port dots only when a compact representation is useful.
- Expanded Settings: show each input on its own `NodeRow` when the meaning matters.
- Use `OutputPortRow`, `NodeRow`, and `PortHandle` rather than custom port markup.
- Put short model descriptions at the bottom of model or utility nodes.
- Do not add visible explanatory UI text when a familiar control or clear label is enough.
- Keep card widths consistent. Model-like nodes currently use about `370px`.
- Avoid nested cards and large marketing-style blocks inside node UI.
- Use the app yellow for primary run actions.
- Use icon buttons for small actions such as download, step, delete, and navigation.

## Port And Connection Standards

- Ports should be typed by media and colored from `portColors`.
- Port ids should describe purpose, not only type, when ambiguity matters.
- Generic ids like `imageIn` are acceptable for simple nodes.
- Specific ids like `frontImageIn`, `maskVideoIn`, or `referenceAudioIn` are preferred when the backend treats them differently.
- Input labels should be short and concrete: `Front`, `Mask Video`, `Prompt`.
- Collapsed input stacks should show colored dots without extra labels.
- Expanded settings should expose named inputs in rows.
- Connector lines inherit the source output color.
- Incompatible connections should fail with a plain, helpful message.
- Auto-created nodes from a dragged connector should link only when compatible.
- Backward compatibility matters: if a port is renamed, migrate previous edge shapes in `normalizeEdgeForCurrentGraph`.

## Result And Preview Standards

- Generation nodes should keep previous results instead of clearing the result pane.
- Result panes should support image, video, and 3D model display.
- Videos should loop when played in Video and Preview nodes.
- Preview nodes should preserve existing preview history and update to the latest connected generation result.
- Preview nodes should support stepping through multiple connected or generated results.
- Generated outputs should have a node-level download affordance when possible.
- 3D outputs should be displayed with the shared lazy Three.js GLTF viewer.
- If a node returns multiple outputs, store them in `resultItems` with explicit `type`, `url`, `label`, and optional `cost`.
- Result item normalization and append behavior belongs in `src/mediaResults.js` and `src/nodeRunner.js`; do not duplicate result merging logic inside individual node branches.
- The project output rail should show recent local outputs from the current graph and matching history only. Include `/outputs/<workflow-name>/...` and packaged `/workflow-assets/<workflow-id>/outputs/...` URLs; do not add absolute machine-local paths or browser object URLs.
- Project output rail data belongs in `src/projectOutputs.js`; shared preview/result UI belongs in `src/components/MediaViews.jsx`.
- Fetch output history lazily when the output rail first opens. Manual refresh and generation completion may still refresh it immediately.
- Output rail thumbnails should keep layout stable and lazy-load image/video media as they near the visible rail; the full-size lightbox owns eager preview loading after double-click.
- Dragging from the output rail into a compatible node should reuse the existing local output URL instead of re-uploading or copying the asset. Keep the imported asset shape aligned with normal uploaded assets so saved workflows remain portable.
- Dragging from the output rail onto the canvas should create a matching media node in place. Dragging external files onto the canvas should import supported media into the current workflow package/app storage and create matching Image, Video, Audio, 3D, or Text nodes; text files store file contents in the Text node.
- Double-clicking an output rail thumbnail should open a lightweight full-size preview modal instead of expanding the rail.
- Image-editor previews, curve graphs, and full-resolution saves share tone/curve math in `src/imageAdjustments.js`. Neutral brightness/contrast/saturation and the default straight curve must preserve every RGB value. Keep alpha intact, use PNG previews, and save from the original full-resolution source, never the reduced preview. Test preview/save parity when changing adjustment behavior.
- The lightbox's pencil opens the lazy `ImageEditStudio`, separate from local crop/color/text adjustments. Drawing guides and painted edit selections are distinct layers with normalized coordinates, undo/redo, and full-native-size PNG export. Sunburst via Fal or Atlas is the only AI editor model; do not silently substitute Krea or Flare or retry across providers. Annotation edits send the clean original first and its marked guide second; blank sketches send only the sketch on white. Guides are instructions, not final artwork. `server/image-edit.js` validates dimensions and masks and composites selected edits locally, preserving unselected RGBA pixels exactly. Output PNGs retain the source's dimensions/aspect; AI synthesis uses supported dimensions up to 3840px and is resized back when necessary. Keep variable pricing unknown, not zero. `/api/node/edit-image` is a bounded multipart, deduplicated paid route with no automatic retry, project-local output persistence and History. Results require explicit Add Image to Canvas or Apply to Source; preserve originals/undo and reject changed or generating sources. Model and Character previews support adding an edited copy without replacing their managed outputs. The mock-only browser harness is `test/browser/image-edit.html`; it never calls a provider.

## Run And Dependency Standards

- Character sheet tabs are `Base`, then `Sheet 1`, `Sheet 2`, etc.; regular/CU previews share the same tab selection. Bases remain available for inspection and internal wardrobe editing only, never downstream model references. `characterSheetLibrary.js` resolves output separately from the viewed tab, skipping base variants/URLs to the next completed wardrobe or custom sheet (wrapping if needed). Video uses that same sheet's CU variant when available, otherwise its regular sheet, never either base. If only bases remain, clear the outgoing result and require a non-base sheet before generation; keep bases, locks, saved connections, and media intact. Reopening or switching tabs must not regenerate any images.

- Both regular and CU Character base prompts share the same minimal matte charcoal swimwear foundation: men's tight swim trunks without a top for male characters, a one-piece swimsuit for female characters, and no branding or accessories. Keep the garment consistent without changing anatomy or reframing face panels to reveal clothing. Wardrobe edits replace the foundation clothing without assuming every saved base wears a one-piece; preserve compatibility with earlier base garments. The swim-trunks wording applies to new base generations without invalidating completed bases or triggering paid regeneration.

- Regular and CU Character bases are independent generations from the original full-resolution portrait. CU base requests must contain only that portrait, never the regular sheet, a wardrobe, or another generated likeness. Use the dedicated CU cinematic prompt, shared swimwear foundation, and any defining physical details. Its signature tracks portrait, image model, physical details and CU prompt version, not the regular base's output or Cinematic toggle. Reuse valid bases and wardrobe variants independently; a CU prompt update must preserve regular sheets on the next user-triggered build, while explicit Regenerate Base rebuilds both masters and their generated wardrobe variants. CU wardrobe edits must use exactly two full-resolution references: the saved CU base first and selected wardrobe second. Keep them clothing-only and preserve the CU master's face, framing, pose, expression, and head crops. Wardrobe-only retries reuse saved masters, including existing project sheets, and must not relabel a legacy master as the current prompt version. Keep custom sheets and ordinary-sheet video fallback intact; never start paid migrations on project load.

- `Run All` must respect dependencies.
- Selected-node dependency scheduling belongs in `src/nodeRunner.js`; `NodeEditor.jsx` should pass callbacks for UI status and skipped-node updates.
- Prompt/Text processing runs before media generation.
- Image-producing nodes run before nodes that depend on images.
- 3D nodes should run after their image dependencies are available.
- Video-producing nodes run after prompt, image, 3D, or utility dependencies they consume.
- Independent nodes of the same stage may run concurrently.
- Nodes should set `status`, `error`, `resultUrl`, `resultItems`, `selectedResultIndex`, and `resultType` consistently.
- Batch failures should report partial success without discarding successful outputs.

## Composer Node Standard

- Composer is an image-guide node. It exposes one `Image Plane` input and one `Frame` output.
- Composer should not expose prompt input or prompt output ports. Written prompts should connect directly to the downstream model that generates the final media.
- Each Composer maquette exposes a dynamic Character input below the Open Composer action, with the maquette name shown beside the port. The port id must stay tied to the maquette id so renaming the maquette does not break the binding.
- Composer maquette Character inputs accept locked Character nodes only. Treat each input as a single binding; replacing the connection should replace the prior Character for that maquette rather than stack ambiguous identities.
- When a Composer frame is connected to an Image Model image input, the image prompt builder automatically wraps the effective written prompt with the locked spatial blueprint instruction. This instruction treats the Composer frame as composition, pose, camera, crop, scale, occlusion, and negative-space authority only.
- If maquettes have Character bindings, Composer must forward those Character sheet references to the Image Model and add explicit maquette-to-character mapping text so each maquette keeps its own assigned identity. Include a short placement/color descriptor for each mapped maquette because the rendered guide frame does not visibly contain maquette names.
- Composer-bound Character references are identity-only. The Composer guide remains the authority for pose, gesture, stance, limb endpoints, crop, scale, placement, and camera.
- When an Image Model is running from a Composer frame, the Composer's bound Character input lines should animate as active generation dependencies.
- The Composer frame should be labeled as the input guide image when sent to backend image-generation routes.
- Saved workflows with pre-refactor Composer prompt edges, or Character bindings for deleted maquettes, should drop those edges during graph normalization instead of keeping stale prompt plumbing.
- The Composer modal sidebar uses a visible scene-object list for Camera, maquettes, primitive props, and image planes. Clicking a row selects that object. `Delete Selected` lives in the header as a red destructive button and deletes the selected scene object only; it must never delete the Camera.
- Maquette object controls are always visible when a maquette is selected: `Name`, `Color`, `Location`, `Rotation`, and `Scale`. Do not hide these controls behind the pose foldout.
- Pose-specific maquette controls live under a collapsible `Pose Controls` section, closed by default. When open, the section should consume the remaining Composer sidebar height and expose a working scroll area instead of clipping lower controls or leaving dead space.
- The pose preset row is labeled `Pose Presets`. It contains a legible preset-name dropdown, a trashcan button for the selected preset, and a Save button. Saving writes to the Composer-local saved pose list and attempts to persist the pose under `public/models/poses`; deleting removes the pose from the Composer-local list and deletes the library JSON through `DELETE /api/composer-poses/:poseId` when the preset has a `fileName`.
- Current maquette pose control order is: `Head`, `Upper Body`, `L Upper Arm`, `L Lower Arm`, `L Hand`, `R Upper Arm`, `R Lower Arm`, `R Hand`, `Hips`, `L Upper Leg`, `L Lower Leg`, `L Foot`, `R Upper Leg`, `R Lower Leg`, `R Foot`.
- Current saved pose field groups include upper/lower arms, hands, upper/lower legs, feet, head, upper body, hips, and `lean`. When adding a pose field, update the client and server `composerPoseFieldKeys` lists (`src/composerState.js` and `server/index.js`), `defaultComposerMaquette`, `normalizedComposerScene`, saved pose snapshots/patches through the field-key list, the Composer modal controls, and both mannequin/procedural rendering when the field is visual.

## Backend API Standards

Local API routes should live in the smallest backend owner that fits the route. Node generation routes usually live under `/api/node/...`; focused route groups should live in `server/routes/*` and be registered by `server/index.js` with explicit dependencies.

- Validate required inputs early and return JSON errors.
- Use local asset helpers such as `readLocalAsset`, `localAssetToFalUrl`, or `uploadLocalOutputToFal` rather than passing local paths to remote APIs.
- Use managed asset helpers for uploaded, generated, and derived files so the current workflow package is honored.
- Download generated files into the attached package `outputs/` folder, or into `/outputs/<workflow-name>/` when no package is attached.
- Return local URLs such as `/workflow-assets/<workflow-id>/outputs/file.glb` for packaged assets or `/outputs/<workflow-name>/file.glb` for unpackaged assets.
- Add a health route flag for new API routes and update `scripts/smokeApp.mjs` required routes when the route is part of startup health.
- Add browser API wrappers in `src/api/newtApi.js` before UI code calls a route.
- Composer pose library routes live at `/api/composer-poses`: `GET` lists library poses, `POST` saves or updates pose JSON under `public/models/poses`, and `DELETE /api/composer-poses/:poseId` removes the selected library pose file. Keep file names sanitized server-side.
- Use `subscribeFal` for Fal calls so queue and failure logging stays consistent.
- Video generation and video upscaling have no NewtNode job-duration cutoff. Krea and Atlas video polling must wait for provider completion, failure, or cancellation, retrying transient read-only lookups with bounded backoff using the submitted job ID and API key. Preserve the existing limits for non-video jobs and individual network calls; these must not become an overall video-job timeout. Never replay a video submission after an uncertain browser response, and keep the Newt local video relay free of response deadlines. Auth/not-found errors must advise checking provider history without implying the paid job was canceled.
- Normalize Fal file responses with `normalizeFalFile` and fallback search helpers where useful.
- Keep request fields aligned with the provider's current API schema.
- Keep response payloads small and predictable: `image`, `video`, `model`, `thumbnail`, `cost`, `seed`, `text`, as appropriate.

## Cost And Stats Standards

Every paid remote model should record cost metadata.

- Keep bundled fallback pricing in the model's shared estimator. Current verified prices live in `src/pricingCatalog.js`, backed by `server/pricing-refresh.js` and provider adapters in `server/pricing-sources.js` and `server/atlas-pricing.js`; do not add a separate live-rate store per node.
- Allow environment overrides for pricing where model pricing may change.
- Add a local estimator function with a `pricingBasis` and `pricingSource`.
- Append history with `mediaType`, `provider`, `modelName`, `endpoint`, `mode`, `settings`, `cost`, and local output paths.
- Update `/api/stats` pricing payload.
- Update `StatsDashboard.jsx` so historical and current runs estimate consistently.
- If cost cannot be estimated, mark it unpriced rather than pretending it is free.
- GPT Image 2.5 uses variable token billing; Image 2's per-image table is not a valid estimate for it. Run buttons show `Variable cost`, history remains unpriced, and Newt's budget guard must reject unpriced automated generation. Monitor both variants through the existing weekly pricing sources without treating a single token rate as a fixed per-image charge.
- Free local operations should record `$0` only when they are truly local and costless.
- The local backend checks official prices every Monday at 04:00 in `America/New_York`, including DST. On startup/wake it catches up one missed weekly check, never a backlog. Failed sources retry hourly at most three times. Settings exposes an autosaved enable switch, manual check, timestamps, source warnings and a bounded change log. The check never generates media, calls an LLM, changes provider selection, or modifies source code.
- `server/data/pricing-catalog.json` is ignored, atomically saved owner-only runtime state, separate from project files. Validate currency, units, complete dimensions, duplicate rows, numeric values and extreme changes before publishing. Preserve last-known-good prices per model on missing/ambiguous/failed sources. Fal account quotes must not cross key versions or remain active when that key is disabled. Never include credentials or credential hashes in browser pricing responses.
- Krea's official OpenAPI `x-krea-pricing` tables are exact setting-specific request prices. OpenAI uses only the Standard short/long context table and the unambiguous per-minute transcription row. Fal's unit API auto-updates only explicitly verified fixed-price routes; variable billing rules and missing Krea tables are review-required, not guessed multipliers. Direct Google pricing tables are monitored for changes pending a supported billing adapter. Show these coverage limitations in Settings; do not label the entire catalog verified when only some models were updated.
- Atlas's shared estimators in `src/atlasPricing.js` return cost objects with nullable `amountUsd`, `pricingSource`, and `pricingBasis`. The existing refresh service is wired with `enableAtlasPricing: true`; weekly and manual checks GET the [public catalog](https://api.atlascloud.ai/api/v1/pricing/models) without authentication or paid requests. Apply only verified standard `official_price` rows, never promotional/account discounts, generic starting prices, or token estimates as fixed charges. Validate route IDs, rules, dimensions, units, and price versions; preserve snapshots and historical amounts. OpenAI image/Seedance token billing, absent REVE rates, Pro 2K, and other unverified settings remain variable/unknown, not zero. No separate Atlas pricing store.
- Run labels and agent reservations use the same shared quote helpers. Capture a pricing snapshot for a submitted generation and capture reasoning rates for reservation/settlement. A refresh affects future work, not already-submitted work. Stats must use recorded historical cost amounts regardless of their pricing-source label; historical runs without recorded charges remain unknown, never reconstructed using current rates.

## Persistence Standards

Saved workflows are long-lived project files. Changes must avoid breaking them.

- Save, Save As, Open, and Import live under the left toolbar File menu. Open replaces the current graph; Import merges the selected workflow into the current graph.
- When a workflow replacement would discard unsaved graph or project-name changes, prompt with Save, Don't Save, and Cancel. Save writes never-saved workflows to the local app saved-workflows folder.
- `workflowChangeGuard.js` keeps one pending replacement. Save keeps the dialog visible with disabled actions until the write succeeds; failures stay inline with retry/cancel choices. A second navigation or double click must not replace the pending target or launch a duplicate save. Save uses the latest editor state, and newly arrived graph changes must be saved before leaving. Cancel/discard never submit a save. Unmount cancels the pending replacement, not a filesystem write already in progress.
- Ctrl+S and Cmd+S save the current workflow. If it has never been saved, use the default local saved-workflows registry rather than requiring Save As.
- The Recent workflows dropdown behaves as a Recent Files list backed by the local server registry, not as a live scan of every JSON file on disk. The trash action removes the workflow from the dropdown only; it must not delete the local registry JSON, packaged workflow JSON, or external workflow JSON from disk. Re-saving or re-opening a workflow can register it in the dropdown again.
- Save/Open/Import orchestration belongs in `src/useWorkflowPersistence.js`; workflow document construction and display paths belong in `src/workflowFiles.js`; graph fingerprints, cloning, deduping, import remapping, and stale runtime cleanup belong in `src/workflowState.js`.
- The dirty/unsaved fingerprint includes nodes, edges, groups, project name, and package path. It intentionally excludes viewport pan/zoom.
- Add normalization for new node fields.
- Preserve unknown data fields when normalizing unless they are unsafe runtime state.
- Migrate renamed node types or ports.
- Clear stale `running` state on load.
- Keep `resultItems`, `resultUrl`, and selected result indexes compatible with existing workflows.
- Store reusable assets under `public/models` or `public/models/poses` only when they should be versioned with the repo.
- Store unpackaged generated outputs under `/outputs/<workflow-name>/`, unpackaged uploads under `/uploads/<workflow-name>/`, unpackaged helper dependencies under `/outputs/<workflow-name>/dependencies/`, and registry copies of saved workflows under `/saved_workflows`.
- Treat `/saved_workflows/inputs`, `/saved_workflows/outputs`, and `/saved_workflows/dependencies` as local app storage for copied/generated assets. Keep those media files ignored by git; only `.gitkeep` placeholders should be tracked.
- Treat `server/data/*.json`, including `recent-workflows.json` and index files, as local runtime state. These files should be ignored by git and never used as source fixtures.

## Workflow Package Standards

Portable packages are the default Save As shape for workflows that need to move between machines or live on a shared drive.

- Save As opens the native folder picker and lets the user choose the parent folder.
- Save As creates or updates a package folder named from the workflow, with this shape:

  ```text
  WorkflowName/
    WorkflowName.json
    inputs/
    outputs/
    dependencies/
    .newtnode/
      manifest.json
  ```

- `inputs/` contains uploaded source media used by graph nodes.
- `outputs/` contains generated media and explicit node outputs.
- `dependencies/` contains derived helper assets needed to rerun or inspect the graph, such as padded frames, composed mood boards, masks, and other intermediate support files that are not primary user uploads or final outputs.
- `.newtnode/manifest.json` records package metadata and copied asset entries. It should help diagnose missing assets without becoming required runtime state. Keep the package root visually focused on the workflow JSON and asset folders.
- A packaged workflow should still appear in the Recent workflows dropdown through the local `/saved_workflows` registry copy.
- Save updates the attached package in place. Save As copies the graph and its current local assets into the chosen package folder.
- Once a package is attached, upload and generation requests must include the workflow package context so new files are written into that package.
- Packaged assets must be served through `/workflow-assets/<workflow-id>/...`.
- Vite development proxy config must include `/workflow-assets` anywhere it includes `/uploads` and `/outputs`.
- Opening a packaged workflow must register its package path with the local server before packaged assets are expected to preview or run.
- Importing a workflow must remap node, edge, and group IDs and place the imported graph in a clear canvas area rather than directly on top of the current graph.
- Do not use browser-only object URLs or absolute machine-local paths as saved graph dependencies.

## Provider Key Routing

- Fal is the default provider route for remote models.
- Atlas Cloud uses the existing Settings API-key version controls, starting with Atlas Cloud API V1 and allowing one active version at a time. Preserve disabled versions and local-only storage; `ATLAS_API_KEY` remains the environment alternative. Never include keys in workflows, exports, or browser pricing data.
- Supported media routes choose enabled, configured providers in Fal > Krea > Atlas order before submission. LLM routing is independent of media routing; preserve explicit direct-Google behavior and direct ElevenLabs audio routing. Never retry a failed or uncertain paid request automatically or switch providers after submission.
- `src/llmProviders.js` selects the preferred enabled LLM provider, then Fal > OpenAI > Atlas. Preserve text-provider environment preferences; Newt retains direct OpenAI when enabled and otherwise uses Fal or Atlas. Krea's public OpenAPI has no general text/vision LLM endpoint (checked 2026-09-10); skip it for LLM tasks and name the companion-key requirement when Krea is the only key. Never silently replace an OpenAI model with another model or use disabled credentials.
- `server/llm-responses.js` adapts stateless OpenAI Responses requests for Atlas and Newt's Fal Responses route. Retain Astra/Luna choices, reasoning and structured/tool contracts; gateway conversations keep complete tool/result pairs but omit provider-specific item IDs and encrypted reasoning. Capture one key/provider before submission and keep the Director analysis-cache credential consistent with the actual request. Failed, malformed, incomplete and refused answers must not replace scene text or execute agent tools. No automatic paid retry or cross-provider replay. API schemas and mock tests do not establish live account access.
- Atlas LLM token rates for Astra/Luna use `src/atlasLlmPricing.js` and the existing weekly pricing catalog. Validate all eight standard short/long context rows, including Atlas's inclusive 272000 threshold, before updating. Prefer reported charges, otherwise record a provider-specific estimate; unknown charges remain unknown/reserved. Capture rates with the request so later price refreshes do not revalue it. Fal agent charges use reported usage, not direct OpenAI prices. Voice dictation and audio transcription still require the enabled direct OpenAI key; never send a Fal/Atlas key to OpenAI.
- Atlas image support covers GPT Image 2, Image 2.5 Sunburst/Flare, Nano Banana 2/Pro, and REVE 2.1, including compatible Character, Coverage, Storyboard, and Sunburst Image Edit paths. Preserve variant, masks, references, and quality. REVE is native 4K; irrelevant hidden resolution/quality defaults must not override its request contract.
- Atlas video support covers Seedance 2.0/2.5 and MiniMax H3. Exclude Kling from Atlas routing while its reference contract is unverified. Validate provider-specific reference, duration, resolution, mask, and audio constraints before upload/submission; fail unsupported settings without truncation, silent substitution, or paid fallback. Atlas Seedance 2.5 has no `1920p` or native `4k` output option; supported super-resolution tiers are separate choices.
- `src/atlasImages.js` and `src/atlasVideos.js` own request contracts; `server/atlas.js` and `server/atlas-media.js` own transport and managed-media integration. Public schema/catalog checks and mocked tests do not establish live account/model access or output quality. No paid generation or live API-key test was performed for this integration.
- Image Model nodes and image-generation fallbacks default to `16:9` aspect ratio and `1K` resolution.
- Google image models should use a direct Google API key only when `GOOGLE_API_KEY` exists. When it is absent, route the same Google-branded image model through Fal instead.
- Do not automatically fall back from direct Google to Fal after a Google request fails; if the user supplied a Google key, Google model failures should surface as Google failures.

## Cross-Platform App Standards

- Browser and shared helper code must not depend on Windows-only paths, drive letters, hidden-folder behavior, shell commands, or `.exe` names. Use URL helpers in browser code and Node `path`/`fs` APIs server-side.
- Preserve both Windows and macOS startup entry points when changing app launch behavior: `Launch_NewtNode.ps1`, `Launch_NewtNode.bat`, `Restart_NewtNode.ps1`, `Restart_NewtNode.bat`, `NewtNode.command`, `NewtNode.app`, and `mac/NewtNodeLauncher.applescript`.
- Preserve app icons and bundle metadata when changing launchers or packaging: `public/icon.png`, `NewtNode.app/Contents/Info.plist`, and the `.icns` resources under `NewtNode.app/Contents/Resources/`.
- Keep launcher ports, health URLs, package scripts, and README startup instructions aligned. Document platform-specific commands separately rather than baking them into shared code.
- Launchers run `scripts/prepareRuntimeDependencies.mjs` before building. Its ignored `node_modules` stamp tracks the package/lockfile, platform and Node version; missing direct packages invalidate it. Failed installs must stop startup without marking preparation complete. Do not touch runtime settings, keys, workflows or media during dependency preparation. Include both HTML entrypoints and dependency changes in build freshness checks.
- Older VS releases use `credentials`/`activeCredentialIds` rather than `apiKeyVersions`. Migrate only when current versioned keys are absent, retain up to the legacy maximum of 20 keys, and preserve the exact active selection or disabled state. Keep the original records in local settings. VS main release synchronization preserves both Git ancestries and a backup branch, never force-resets other users' clones. The older Settings updater only pulls source; the first upgrade requires a launcher relaunch to install dependencies and rebuild.

## UI Design Standards

- The canvas is the primary workspace, not a landing page.
- Canvas selection gestures (marquee, node/group selection, selection dragging, and edge selection) transfer keyboard focus to the canvas without scrolling. Keep Delete/Backspace protected in text/editable controls and while modal dialogs are open, for both nodes and connections; honor consumed keys and IME composition. Keyboard routing lives in `src/nodeKeyboardRouting.js`.
- Node cards should be functional, compact, and scannable.
- Controls should be familiar: sliders/inputs for numbers, toggles for booleans, selects for option sets, icon buttons for compact actions.
- Text must fit inside buttons, rows, cards, and panels at desktop and mobile widths.
- Avoid one-off color themes. New media colors must be distinct from existing node categories.
- Do not add decorative orbs, oversized hero elements, or marketing-style sections inside the app.
- For 3D scenes, use Three.js and verify nonblank rendering.
- Use stable dimensions for boards, previews, result panes, and tool rows so hover or dynamic content does not shift layout.
- Scrollable tool panels should consume available space before introducing nested scrollbars. When a control list must scroll, make the scrollbar discoverable and verify the first and last controls are reachable.

## 3D Node Standard

The 3D node establishes the standard for model generation nodes.

- UI label: `3D`.
- Internal type: `model3d`.
- Color: teal `#14d8c8`.
- Output port: `modelOut`.
- Output media: GLB by default.
- Preview: shared lazy `Model3DViewer` wrapper.
- Required input: `frontImageIn`.
- Optional inputs: `backImageIn`, `leftImageIn`, `rightImageIn`, `topImageIn`, `bottomImageIn`, `leftFrontImageIn`, `rightFrontImageIn`.
- Backend payload should preserve named view mapping instead of relying on connection order.
- Generated model results should be downloadable from the result pane.
- Stats should count 3D runs in media mix and estimated spend.

## Verification Checklist

Before committing node or UI changes:

- Run `npm run build`.
- Run `npm run bundle:report` after startup-loading, lazy-loading, or heavy UI ownership changes.
- Run `npm test` when pure helpers, workflow state, node runner scheduling, or geometry changed.
- Run `node --check server/index.js` and any touched `server/routes/*.js` file when the server changed.
- Run `git status --short --branch` and confirm only intentional source/doc changes are staged. Runtime files under `server/data/`, `outputs/`, `uploads/`, and generated workflow JSON should stay ignored.
- Confirm `/api/health` reports any new route flags.
- When the dev client is not on the smoke default port, pass explicit smoke URLs, for example `npm run smoke:app -- http://localhost:5176/ http://localhost:3336/api/health`.
- Check that existing saved workflows still load.
- Check that new ports connect, reject incompatible edges, and auto-connect correctly.
- Check collapsed and expanded node states.
- Check Preview behavior for every output media type touched.
- Check Stats after a recorded run or with representative history.
- Restart `npm run dev` when route changes are not visible in the running backend.

## Director and Storyboard Reasoning

- New Director nodes and added scene tabs share `filmDirectorNewSceneSetup`: Cinematic, 30s, Seedance 2.5, 1080p, 21:9, Auto shots, and Production Sound. Start the first scene at Scene 1 and number additional scenes normally. Apply these defaults only on creation; keep saved choices and legacy snapshot/loading fallbacks intact.
- Director Scene Setup owns `skillApproach`: Cinematic (unchanged default, including legacy scenes), Vintage, Animation, Stop-Motion, Commercial, Music Video, or Montage. `src/filmDirectorApproaches.js` owns normalized choices and approach-specific planning/scene-rule guidance; preserve the choice in each scene, revision snapshot, request and video output. Changing approach invalidates dependent style, camera and shot-list drafts for the normal setup-lock workflow without deleting scene overview or asset connections. Revisions preserve the selected approach unless explicitly changed. Vintage's 16fps/hand-cranked direction and Stop-Motion's stepped 8-12-pose cadence are visual instructions, not API frame-rate parameters. Animation uses coherent animation-medium language; Stop-Motion favors tactile miniature/clay materials rather than interpolated CGI. Commercial uses polished premium advertising language. Montage and Music Video preserve continuity within vignettes while allowing intentional location/time jumps between them. Audio updates and saved-prompt normalization must retain the selected visual scene rules.
- Director `musicIn` accepts one active full-resolution audio file, uses the orange audio port, and follows Scene Setup locks. It is required for Music Video; unused music is not forwarded for other approaches. The active track overrides Production Sound/Silent with a dedicated soundtrack policy, enables generated audio, and is visible in the connected Video node's reference summary. It replaces unrelated audio/Character voice references for this run. Keep the input connected across scene tabs; only the active Music Video scene uses it. Track changes invalidate camera/shot planning through normal lock-aware refresh and retain the other scene text. Preserve `skillDirectorLockedMusicSignature` in scene/revision snapshots.
- Music Video uses Seedance 2.0/2.5 or MiniMax H3 reference-to-video; reject Kling and start/end-frame routes before a paid request because they cannot carry the soundtrack. MiniMax H3 additionally requires a visual reference. Enforce guards on client and server, including after approach/model revisions. Do not promise perfect lip sync or original-audio fidelity from a generative model. `server/director-music.js` performs bounded, local FFmpeg waveform analysis of the opening segment (up to 30 seconds), caching 12 results by file path/size/mtime and analyzed duration. Relative level changes are optional pacing cues, not verified beats, BPM, lyrics or audio understanding. No paid analysis model is added. Keep the actual track as the generator's vocal/timing authority; never invent transcript content or replace/loop missing music.
- `server/creative-llm.js` owns GPT-6 Astra defaults, structured result schemas, bounded response allowances, API parameter compatibility, and shared Director/Storyboard reasoning instructions. Preserve explicit environment overrides and existing provider preference. Direct OpenAI and Atlas use Responses with High reasoning and strict JSON schemas; Fal's text/vision OpenRouter routes expose provider-default reasoning and require local Ajv validation. Validate all providers locally. Do not send unsupported effort/schema/sampling parameters or silently substitute another model.
- Keep Newt Economy and Smart Text routing independent from Director/Storyboard intelligence. Image-model choice, resolution and fidelity do not change with an LLM upgrade.
- Enable Fal router reasoning for creative routes with `reasoning: true`; both false and the schema's omitted-field default disable it and reject models with mandatory reasoning. Keep output contracts and local validation intact. Strip only explicitly delimited leading reasoning blocks before validating the final answer; reject reasoning-only or incomplete results. Director stores the active action while running/failed and shows stage-specific progress or an accessible error above Scene Setup. Surface provider error details, preserve existing content, reject empty successful responses, and offer only explicit, lock-respecting retries. No automatic paid replay after failure.
- Newest scene/revision instructions override stale drafts. Preserve unaffected sections and use local final assembly; do not add an LLM pass to changing output-only settings. Reject incomplete, refused, malformed, missing-field and inconsistent-count results before state replacement. Keep reported paid usage on rejected responses; unknown provider charges remain unknown.
- Director permits one targeted repair for structural shot-plan errors, then fails without replacing existing work. Editorial scale preferences remain soft. Reference analysis must match exact supplied tags, never assign another asset's description by array position.
- `server/creative-analysis-cache.js` reuses successful Director image analysis for 30 minutes in at most 40 in-memory entries. Fingerprints include image bytes, reference tag/type, instructions, provider/model and credential. A changed image at the same URL invalidates it. Never cache failures or charge cached/in-flight shared usage twice. Do not persist secrets or image bytes in the cache.
- `src/storyboardPlanValidation.js` validates Director CUT order, contiguous keyframes, minimum coverage, duplicate prompts and frame numbering. Same-CUT action progression is distinct from inter-CUT coverage; do not force new compositions on locked-off action or matched opposing speakers.
- A failed Storyboard planner preserves the existing frames, images and analysis, never substitutes generic fallback boards. Unavailable QC is explicitly unreviewed (`qcReviewStatus`), not passed, and cannot trigger a paid retry or become an approved continuity anchor. Preserve legacy frames lacking that field.
- Verify request adapters against mocked Fal/OpenAI responses and representative revision/keyframe fixtures. Do not use paid production generations for automated tests. Health exposes `creativeReasoningV2` for deployment checks.

## Newt Agent Standard

- Settings > Workspace places an autosaved API Cost switch directly below Newt. `nodePreferences.showApiCosts` defaults false when absent for both new installations and upgrades, and retains explicit choices. It controls generation-button cost labels (including variable-cost labels) and the image editor's cost hint only. Preserve Stats, History, estimates, Newt approvals and budget limits. Partial workspace saves must retain the other toggle and legacy Newt visibility. Publish changes only after a confirmed save; apply them immediately to existing nodes without mutating workflow data or generating media.

- Display the agent as `Newt`, first in the shared sidebar/context-menu registry. Keep the internal `myNewt` type, API routes, task IDs and storage unchanged. On load, migrate only the old default `My Newt` title (or a missing title); preserve custom node names and saved settings.
- Settings > Workspace groups the Newt menu switch with a compact server restart control. `nodePreferences.myNewt` is saved immediately in local runtime settings and filters both add-node menus only, never existing project nodes, connections, tasks, imports or presets. Default off for installations with no Newt task history; legacy users with saved tasks default on. An explicitly saved choice always wins over task history. Publish menu updates only after a successful save; failed saves leave the current visibility unchanged.

- Voice entry is click-to-listen, with a second click to finish, three-second post-speech silence shutoff, eight-second initial-silence cancellation, and a two-minute hard limit. `src/myNewt/voiceCapture.js` owns recording and local Web Audio level monitoring; always release tracks, timers and AudioContext resources on finish/cancel/error. Never restart listening automatically or upload recordings with no detected speech. `useMyNewtVoice.js` scopes it to the project/node/task and cancels on context changes, busy controls or loss of window focus; `MyNewtVoiceButton.jsx` uses native click/keyboard activation.
- `src/myNewt/voiceCommands.js` recognizes only explicit final command clauses: Start/Run/Begin task, Continue task, Send note. Preserve existing typed text and route the complete fresh draft directly through the existing controller, without waiting for React state propagation. Ordinary, quoted, negated, or ambiguous speech remains a draft. Never map speech to approval or resume, bypass permissions/budgets, queue a busy command, or resubmit a failure automatically. Failed submissions preserve direction. Cancellation and late transcription/permission responses must never start a task in a different project or task context.
- `/api/my-newt/transcribe` uses the enabled OpenAI key with `gpt-transcribe`, bounded audio-only uploads, a two-minute recording limit, transient OS-temp files, and no automatic paid retries. Delete temporary audio on success/failure. History/Stats record duration-based estimated transcription cost separately from task spending, without persisting the recording or transcript. Pricing and limits live in `src/myNewt/voiceConfig.js`; the microphone tooltip discloses provider, estimated cost, and audio handling.

- `src/myNewt/contract.js` owns creative edit allowlists, sanitized project snapshots, permission defaults, and singleton normalization. The agent must not edit credentials, locks, safety flags, or output fields.
- `src/myNewt/localActions.js` matches complete, explicit setup commands before paid planning: Image/Video/Coverage/Director/Storyboard workflows, adding a node type, inserting a saved preset by exact name, renaming a uniquely named node, exact supported settings, and wiring media outputs to Preview. No fuzzy or partial-command execution. Honor existing-node permission, locks, busy state, and Director-controlled Video settings. New workflow templates use current defaults, real compatible ports, non-overlapping preset placement, and one Undo entry. Their fresh, empty nodes can be prewired before generation; existing-node connection rules are unchanged. Preview starts on Layout. No media is generated.
- `server/my-newt-local.js` runs local plans through the persisted approval/claim/completion/history/checkpoint path with zero reservations, model calls, or generation relay access. Reject a client/server execution-route mismatch rather than silently switching to paid AI. Verify edits and resulting graph before completion. Failed, stale, interrupted, or redirected local actions must not retry or fall back to an LLM. The prompt and Start task button automatically select the route; do not expose a quick-action selector. `localOnly` blocks unmatched commands and further paid requests; paid voice dictation is unavailable in this mode. Otherwise voice transcription remains separately billed even for a local command.
- `localCommands.js`, `localAssets.js`, and `localCopies.js` handle project commands, typed asset-aware recipes, inventories, and duplication. Require unique titles/tags, explicit prop/location roles, compatible ports, and fresh source signatures at server claim and editor execution. Coverage has a single image input: each-source commands create separate workflows. Copies preserve completed results and external incoming references, never connect new outputs to old targets, and never rerun paid actions. Save uses the existing persistence hook with `preserveProjectId`; only transient Newt journal summaries are excluded from dirty-state fingerprints. Rename changes the draft project name; canvas Undo/checkpoints do not restore project names or files. Health `myNewtBackgroundActions` prevents new commands reaching an older backend.
- `src/myNewt/useMyNewt.js` bridges persisted backend commands to established editor callbacks. `src/components/MyNewtNodeBody.jsx` owns task UI. Newt is explicitly excluded from ordinary Run All scheduling.
- `server/my-newt.js`, `server/my-newt-media.js`, and `server/routes/myNewt.js` own the OpenAI-compatible Responses loop, media inspection, task persistence, and generation relay. Use enabled OpenAI, Fal or Atlas credentials through the shared LLM adapter; credentials remain request-local and never enter task journals. Auto routes clearly routine briefs to GPT-5.6 Luna Medium and creative/ambiguous briefs to GPT-6 Astra, with explicit escalation; Economy never upgrades automatically and Best always uses Astra. `intelligence.js` owns reasoning profiles, output allowances and direct-model fallback rates. Capture one profile, provider and rate snapshot for request, reservation, and History. Never lower downstream LLM/media quality through this control.
- Newt has image, video, audio, Character, and Mood Board inputs. Keep legacy Character/Mood Board connections to imageIn compatible. Snapshots include active sheet selections, generated/CU/custom sheets, and mood-board images using full-resolution sources.
- Agent creation checks measured canvas obstacles and validates placement after mount. Move only the newly created node, never rearrange existing nodes to make room. Presets insert as intact blocks to the right of existing measured nodes/groups.
- `src/myNewt/presets.js`, `useNewtPresets.js`, and `server/newt-presets.js` own preset snapshots, insertion, and local persistence. Exclude Newt and credentials; clear transient jobs; preserve creative settings, assets, locks, and results. Remap internal data references as well as edges and groups. Insert with one Undo entry and no automatic generation. Copy managed media into preset dependencies before atomic save; failed copies must not produce broken presets. Removing a library entry must not delete assets used by placed projects.
- Preset v2 adds optional typed asset slots. Bindings use existing compatible source nodes, never modify them, rewrite matching tags in the inserted copy, and clear that copy's dependent generated outputs. Old presets without slots remain valid.
- Only one Newt exists per project. Add focuses the existing node, paste omits duplicates, import detaches task IDs, and graph normalization removes duplicate agents and dangling edges.
- Every agent-owned paid node request uses a node-local request scope and the backend relay. Include `nodeId` on all nested requests. Do not add a runner that submits outside this scope, starts detached work, or uploads media without first extending the journal and budget guards.
- Persist the request receipt before submission. A repeated request ID must match its body digest; reuse completed responses, and never automatically resubmit an uncertain request. Recovered editor actions pause and are skipped on Resume. Already submitted generations can still complete and be billed after cancellation.
- Budgets use estimates with conservative reasoning allowances; actual reported media costs and LLM token usage replace reservations when available. Unknown-priced actions are blocked, not estimated as zero. Record reasoning usage in existing History/Stats alongside media history.
- `server/my-newt-budget.js` keeps spent and reserved separate. Reconcile all nested paid requests, including Storyboard planning/QC. Unknown charges retain an explicitly uncertain reservation. Missing credentials fail before reserving. Task duration counts active execution, not time spent paused or waiting for approval.
- Require approval for paid node runs by default, and default existing-node edits and image/video generation to off. Permission changes invalidate in-flight planning; new notes invalidate unclaimed commands. Check live node inputs and locks before applying a planned mutation.
- Newt Settings > Advanced includes persistent `autoReview`, off by default. It automatically accepts valid local/AI plans and permitted runs, including user-requested variants, without a second paid review call. Preserve the individual plan/run approval preferences while disabled under Auto Review. Use the shared review policy in the server and editor; automatic runs still require preparation, budget accounting, live permissions, protection, reuse and completion checks. Genuine blockers and uncertain/interrupted paid requests still require user intervention. Enabling it can continue a pending plan review, but never resumes paused, recovered or stopped tasks. Turning it off restores the saved approval preferences for future actions.
- Advanced also stores `favoriteImageModel` and `favoriteVideoModel`, both defaulting to no preference. `favoriteModels.js` owns normalization and fresh-creation suggestions. Offer the shared image/video lists and gray out disabled models without clearing the saved preference. Apply favorites only to newly created compatible Image Model, Video Model, Coverage, Character and Director nodes, including free workflow recipes; explicit model requests win. Use normal model-selection patches for dependent settings. Never apply favorites during existing-node updates, preset insertion, duplication, imports or restoration. Preserve preset model choices even when the preset was just inserted. Storyboard's chosen image model and LLM selection remain unchanged. Send preferences and their precedence rules to the planner; required capabilities, enabled models and actual run estimates still govern execution.
- `plan.js` normalizes approved steps, deliverables, and locally calculated media estimates. Plan approval precedes mutations; run approval shows complete batch details. New notes attached to approval must invalidate the old action first. Capture the exact graph used for reasoning and compare target/upstream inputs before claim and execution. Built Director changes use the real revise stage; unlocked sections in unfinished Directors remain editable without bypassing unrelated locks.
- `context.js` retains all graph nodes in the snapshot, gives the model a paged index plus focused details, and supports explicit detail/array/text reads. Bound tool conversation history while preserving call/result pairs and discard model-specific reasoning on a model switch. Send graph data only when changed and stop polling terminal tasks; heartbeats must not rewrite unchanged journals.
- Completion verifies counts, output kinds, requested settings, required reference connections, fresh output URLs, node failures, and managed file availability. This validates deliverable presence, not subjective creative quality; visual inspection remains explicit.
- `recovery.js` captures task-start creative graph checkpoints excluding Newt and secrets. Follow-ups inherit relevant context and created-node access with a new budget. Restoration requires confirmation and no active operation; preserve current Newt state, generated files, and billing history. Failed note/voice sends preserve the draft until acknowledged.
- Newt defaults to a $5 estimated budget; preserve user-saved budgets. Its highlight is yellow until a task completes successfully, then green, without a manual color picker. A newly observed task completion plays the shared chirp once and a short, non-interactive confetti burst (suppressed for reduced motion). Loading completed tasks, individual steps, errors, pauses, and stops must not trigger this celebration.
- Keep the editor mounted for tab changes. Project changes, editor closure, and backend restart pause tasks; do not claim fully headless execution. Persist compact activity in the project, with the full local journal under ignored `server/data/my-newt/`.
- Image review uses managed full-resolution sources resized only for LLM inspection. Video review is six explicitly timestamped samples; audio review is a transcript of at most two minutes. Do not label either as exhaustive audiovisual review.
- Unit tests and mocked browser workflows must cover permissions, budget limits, singleton/import behavior, batching, pause/recovery, and duplicate-submit prevention. Do not spend real provider credits during automated verification.

## Audio Model

- `src/audioModel.js` owns the four modes, model IDs, defaults, normalization, parameter validation, and published fallback estimates. `audioModel` has yellow `promptIn`, orange `audioIn`, and orange `audioOut`. Only Speech to Speech uses audioIn; other modes use promptIn. Inactive edges stay saved but cannot influence execution. Audio input is single-source.
- `AudioModelNodeBody.jsx` owns controls and account voice loading. Group the fully paginated account voice list into Default and Mine; preserve the saved voice ID across key changes and require explicit reselection when unavailable. Refresh on provider changes. Do not send account credentials to the node or store voice catalogs in projects.
- `server/elevenlabs.js` and `server/routes/audioModel.js` use the enabled ElevenLabs key only, captured for the whole request. Use fixed ElevenLabs endpoints, bounded response sizes, and timeouts. Validate speech recordings locally before paid submission. Speech conversion is multipart, voice settings are JSON within that form, and music prompt requests never include seed. Never automatically retry a paid POST on either frontend or backend.
- `nodeRunners/audioModels.js` submits only the model fields and standard workflow context. Run batches sequentially through shared runner helpers, preserve previous results, retain partial successes, and chime once per completed node. Store canonical audio result items and managed MP3 outputs. Preview, the output rail, workflow import/copy/reopen, History, and Stats must retain audio types and all results.
- Published estimates are shared by the button and backend History. Record estimated costs at generation time; unknown auto duration/custom voice rates stay unknown, not zero. ElevenLabs pricing is not yet auto-refreshed by the weekly catalog. Newt marks audioModel manual-only until dedicated audio permissions, request journaling, and budget reservation are implemented; never bypass the agent's paid-request scope.
- `test/audioModel.test.js` and `test/elevenlabs.test.js` cover key versions, parameter contracts, voices/pagination, mode controls, batching, output preservation, pricing, and readable failures with mocked providers. Do not spend live provider funds in automated tests.

## Amendment Rule

This document is not law carved in stone. If a future feature needs a different pattern, update this document in the same PR or commit that introduces the new pattern. The important thing is that future development has one shared reference point.
