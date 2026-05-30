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
- Preserve old saved workflows with normalization or migration when fields, ports, node types, or asset URLs change.
- Keep generated files and copied dependencies inside the current workflow package when a package is attached.
- Update this document when the feature intentionally changes one of these standards.

## Refactored Code Ownership

`NodeEditor.jsx` remains the canvas/UI orchestrator, but new work should not default to adding more pure logic there. Keep reusable logic in the smallest existing module that owns the concern.

| Area | Primary files | Standard |
| --- | --- | --- |
| API clients | `src/api/newtApi.js` | Add browser-side route wrappers here instead of scattering raw `fetch` calls. |
| Node registry | `src/nodeRegistry.js`, `src/NodeEditor.jsx` icon map | Add catalog definitions in `nodeRegistry.js`; add only the display icon mapping in `NodeEditor.jsx`. |
| Node config/defaults/normalization | `src/NodeEditor.jsx` | `getNodeConfig`, `createDefaultNodeData`, and `normalizeCurrentNode` still live here. Keep backward-compatible migrations close to these functions until they are deliberately extracted. |
| Run scheduling and result state | `src/nodeRunner.js` | Batch counts, batch result aggregation, selected-node dependency scheduling, and run status text belong here. Node-specific API calls can still live near `runNode` until moved as a complete provider pass. |
| Media drag/drop and imported asset shape | `src/mediaAssets.js` | Output-rail drag payloads, external file type detection, file-to-node mapping, and media accept rules live here. |
| Result items | `src/mediaResults.js` | Normalize, append, label, and download result items here. Do not hand-roll result array merging in node run branches. |
| Preview/result UI | `src/components/MediaViews.jsx` | Shared previews, result panes, project output drawer, output lightbox, and 3D viewer live here. |
| Project output rail data | `src/projectOutputs.js` | Build and filter project output rail items here; keep filesystem/history filtering out of render code. |
| Canvas geometry | `src/nodeGeometry.js` | Node bounds, graph bounds, rectangle math, menu clamping, and viewport modulo helpers live here. |
| Canvas media utilities | `src/canvasMedia.js` | Canvas-to-blob, browser image loading, cover drawing, and mood-board collage layout live here. |
| Color ID matte helpers | `src/colorIdMatte.js` | Color normalization, matte preview rendering, sample radius/tolerance bounds, and matte run item normalization live here. |
| Three.js runtime | `src/threeRuntime.js` | Lazy Three/GLTF loading and shared 3D math helpers live here. |
| Workflow persistence | `src/useWorkflowPersistence.js` | Save, Save As, Open, Import, unsaved-change prompts, Recent workflows updates, and workflow status messages live here. |
| Draft persistence | `src/useNodeEditorDraft.js` | Browser draft loading, snapshotting, and debounced local draft writes live here. |
| Workflow files/session/state | `src/workflowFiles.js`, `src/workflowSession.js`, `src/workflowPreferences.js`, `src/workflowContext.js`, `src/workflowState.js` | File document shape, display paths, package/request context, picker preferences, graph cloning/remapping/fingerprints, deduping, and stale runtime cleanup live here. |

When adding a new feature, put pure helpers in one of these modules or create a similarly focused module. `NodeEditor.jsx` should coordinate React state, node rendering, event handlers, and node-specific orchestration, not become the home for reusable algorithms.

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
- Backward compatibility matters: if a port is renamed, migrate old edges in `normalizeEdgeForCurrentGraph`.

## Result And Preview Standards

- Generation nodes should keep previous results instead of clearing the result pane.
- Result panes should support image, video, and 3D model display.
- Videos should loop when played in Video and Preview nodes.
- Preview nodes should preserve existing preview history and update to the latest connected generation result.
- Preview nodes should support stepping through multiple connected or generated results.
- Generated outputs should have a node-level download affordance when possible.
- 3D outputs should be displayed with the shared Three.js GLTF viewer.
- If a node returns multiple outputs, store them in `resultItems` with explicit `type`, `url`, `label`, and optional `cost`.
- Result item normalization and append behavior belongs in `src/mediaResults.js` and `src/nodeRunner.js`; do not duplicate result merging logic inside individual node branches.
- The project output rail should show recent local outputs from the current graph and matching history only. Include `/outputs/<workflow-name>/...` and packaged `/workflow-assets/<workflow-id>/outputs/...` URLs; do not add absolute machine-local paths or browser object URLs.
- Project output rail data belongs in `src/projectOutputs.js`; shared preview/result UI belongs in `src/components/MediaViews.jsx`.
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
- Saved workflows with older Composer prompt edges, or Character bindings for deleted maquettes, should drop those edges during graph normalization instead of keeping stale prompt plumbing.

## Backend API Standards

Local node routes should live in `server/index.js` under `/api/node/...`.

- Validate required inputs early and return JSON errors.
- Use local asset helpers such as `readLocalAsset`, `localAssetToFalUrl`, or `uploadLocalOutputToFal` rather than passing local paths to remote APIs.
- Use managed asset helpers for uploaded, generated, and derived files so the current workflow package is honored.
- Download generated files into the attached package `outputs/` folder, or into `/outputs/<workflow-name>/` when no package is attached.
- Return local URLs such as `/workflow-assets/<workflow-id>/outputs/file.glb` for packaged assets or `/outputs/<workflow-name>/file.glb` for unpackaged assets.
- Add a health route flag for new API routes.
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
- Keep `resultItems`, `resultUrl`, and selected result indexes compatible with older workflows.
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
- Google image models should use a direct Google API key only when `GOOGLE_API_KEY` exists. When it is absent, route the same Google-branded image model through Fal instead.
- Do not automatically fall back from direct Google to Fal after a Google request fails; if the user supplied a Google key, Google model failures should surface as Google failures.

## UI Design Standards

- The canvas is the primary workspace, not a landing page.
- Node cards should be functional, compact, and scannable.
- Controls should be familiar: sliders/inputs for numbers, toggles for booleans, selects for option sets, icon buttons for compact actions.
- Text must fit inside buttons, rows, cards, and panels at desktop and mobile widths.
- Avoid one-off color themes. New media colors must be distinct from existing node categories.
- Do not add decorative orbs, oversized hero elements, or marketing-style sections inside the app.
- For 3D scenes, use Three.js and verify nonblank rendering.
- Use stable dimensions for boards, previews, result panes, and tool rows so hover or dynamic content does not shift layout.

## 3D Node Standard

The 3D node establishes the standard for model generation nodes.

- UI label: `3D`.
- Internal type: `model3d`.
- Color: teal `#14d8c8`.
- Output port: `modelOut`.
- Output media: GLB by default.
- Preview: shared `Model3DViewer`.
- Required input: `frontImageIn`.
- Optional inputs: `backImageIn`, `leftImageIn`, `rightImageIn`, `topImageIn`, `bottomImageIn`, `leftFrontImageIn`, `rightFrontImageIn`.
- Backend payload should preserve named view mapping instead of relying on connection order.
- Generated model results should be downloadable from the result pane.
- Stats should count 3D runs in media mix and estimated spend.

## Verification Checklist

Before committing node or UI changes:

- Run `npm run build`.
- Run `node --check server/index.js` when the server changed.
- Run `git status --short --branch` and confirm only intentional source/doc changes are staged. Runtime files under `server/data/`, `outputs/`, `uploads/`, and generated workflow JSON should stay ignored.
- Confirm `/api/health` reports any new route flags.
- Check that existing saved workflows still load.
- Check that new ports connect, reject incompatible edges, and auto-connect correctly.
- Check collapsed and expanded node states.
- Check Preview behavior for every output media type touched.
- Check Stats after a recorded run or with representative history.
- Restart `npm run dev` when route changes are not visible in the running backend.

## Amendment Rule

This document is not law carved in stone. If a future feature needs a different pattern, update this document in the same PR or commit that introduces the new pattern. The important thing is that future development has one shared reference point.
