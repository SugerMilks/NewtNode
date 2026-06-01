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
- `Text Model` is the AI text-processing node. It can accept text, image, video, and style inputs, calls the local text-processing route, and records text model history/cost.
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

## Run And Dependency Standards

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
- Normalize Fal file responses with `normalizeFalFile` and fallback search helpers where useful.
- Keep request fields aligned with the provider's current API schema.
- Keep response payloads small and predictable: `image`, `video`, `model`, `thumbnail`, `cost`, `seed`, `text`, as appropriate.

## Cost And Stats Standards

Every paid remote model should record cost metadata.

- Add pricing constants near the top of `server/index.js`.
- Allow environment overrides for pricing where model pricing may change.
- Add a local estimator function with a `pricingBasis` and `pricingSource`.
- Append history with `mediaType`, `provider`, `modelName`, `endpoint`, `mode`, `settings`, `cost`, and local output paths.
- Update `/api/stats` pricing payload.
- Update `StatsDashboard.jsx` so historical and current runs estimate consistently.
- If cost cannot be estimated, mark it unpriced rather than pretending it is free.
- Free local operations should record `$0` only when they are truly local and costless.

## Persistence Standards

Saved workflows are long-lived project files. Changes must avoid breaking them.

- Save, Save As, Open, and Import live under the left toolbar File menu. Open replaces the current graph; Import merges the selected workflow into the current graph.
- When a workflow replacement would discard unsaved graph or project-name changes, prompt with Save, Don't Save, and Cancel. Save writes never-saved workflows to the local app saved-workflows folder.
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
- Image Model nodes and image-generation fallbacks default to `16:9` aspect ratio and `1K` resolution.
- Google image models should use a direct Google API key only when `GOOGLE_API_KEY` exists. When it is absent, route the same Google-branded image model through Fal instead.
- Do not automatically fall back from direct Google to Fal after a Google request fails; if the user supplied a Google key, Google model failures should surface as Google failures.

## Cross-Platform App Standards

- Browser and shared helper code must not depend on Windows-only paths, drive letters, hidden-folder behavior, shell commands, or `.exe` names. Use URL helpers in browser code and Node `path`/`fs` APIs server-side.
- Preserve both Windows and macOS startup entry points when changing app launch behavior: `Launch_NewtNode.ps1`, `Launch_NewtNode.bat`, `Restart_NewtNode.ps1`, `Restart_NewtNode.bat`, `NewtNode.command`, `NewtNode.app`, and `mac/NewtNodeLauncher.applescript`.
- Preserve app icons and bundle metadata when changing launchers or packaging: `public/icon.png`, `NewtNode.app/Contents/Info.plist`, and the `.icns` resources under `NewtNode.app/Contents/Resources/`.
- Keep launcher ports, health URLs, package scripts, and README startup instructions aligned. Document platform-specific commands separately rather than baking them into shared code.

## UI Design Standards

- The canvas is the primary workspace, not a landing page.
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
- When the dev client is not on the smoke default port, pass explicit smoke URLs, for example `npm run smoke:app -- http://localhost:5174/ http://localhost:3333/api/health`.
- Check that existing saved workflows still load.
- Check that new ports connect, reject incompatible edges, and auto-connect correctly.
- Check collapsed and expanded node states.
- Check Preview behavior for every output media type touched.
- Check Stats after a recorded run or with representative history.
- Restart `npm run dev` when route changes are not visible in the running backend.

## Amendment Rule

This document is not law carved in stone. If a future feature needs a different pattern, update this document in the same PR or commit that introduces the new pattern. The important thing is that future development has one shared reference point.
