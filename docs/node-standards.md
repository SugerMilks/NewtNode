# Newt Node Development Standards

This is a living standard for Newt_Node. It describes the current conventions for nodes, UI, media flow, backend routes, cost tracking, and verification. Amend it when the app deliberately changes direction. Do not bypass it casually.

## Goals

- Keep every node predictable to build, use, save, load, preview, run, and debug.
- Preserve a clean canvas by default, with advanced controls hidden behind Settings.
- Make media types explicit so connector lines, ports, previews, stats, and backend routes stay in agreement.
- Track generation cost honestly whenever the app can estimate or record it.
- Prefer small, compatible changes over one-off node behavior.

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

## Node Definition Checklist

Every new node type should touch the same core surfaces unless there is a clear reason not to.

- Add it to `nodeCatalog` with a concise label and lucide icon.
- Add `getNodeConfig(type)` with all input and output ports.
- Add defaults in `createDefaultNodeData`.
- Add normalization in `normalizeCurrentNode` so saved workflows remain stable.
- Add connection rules in `getConnectionError`.
- Add auto-connect behavior in `preferredAutoInputPorts` and `autoConnectionOutputKind`.
- Add edge migration/color handling in `normalizeEdgeForCurrentGraph` when needed.
- Add run behavior in `runNode` and a focused `runXGeneration` helper for API calls.
- Add result item typing through `normalizedResultItems` and `appendResultItems`.
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

## Run And Dependency Standards

- `Run All` must respect dependencies.
- Prompt/Text processing runs before media generation.
- Image-producing nodes run before nodes that depend on images.
- 3D nodes should run after their image dependencies are available.
- Video-producing nodes run after prompt, image, 3D, or utility dependencies they consume.
- Independent nodes of the same stage may run concurrently.
- Nodes should set `status`, `error`, `resultUrl`, `resultItems`, `selectedResultIndex`, and `resultType` consistently.
- Batch failures should report partial success without discarding successful outputs.

## Backend API Standards

Local node routes should live in `server/index.js` under `/api/node/...`.

- Validate required inputs early and return JSON errors.
- Use local asset helpers such as `readLocalAsset`, `localAssetToFalUrl`, or `uploadLocalOutputToFal` rather than passing local paths to remote APIs.
- Download generated files into `/outputs`.
- Return local URLs such as `/outputs/file.glb` to the client.
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

- Add normalization for new node fields.
- Preserve unknown data fields when normalizing unless they are unsafe runtime state.
- Migrate renamed node types or ports.
- Clear stale `running` state on load.
- Keep `resultItems`, `resultUrl`, and selected result indexes compatible with older workflows.
- Store reusable assets under `public/models` or `public/models/poses` only when they should be versioned with the repo.
- Store generated outputs under `/outputs`, uploads under `/uploads`, and project saves under `/saved_workflows`.

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
- Confirm `/api/health` reports any new route flags.
- Check that existing saved workflows still load.
- Check that new ports connect, reject incompatible edges, and auto-connect correctly.
- Check collapsed and expanded node states.
- Check Preview behavior for every output media type touched.
- Check Stats after a recorded run or with representative history.
- Restart `npm run dev` when route changes are not visible in the running backend.

## Amendment Rule

This document is not law carved in stone. If a future feature needs a different pattern, update this document in the same PR or commit that introduces the new pattern. The important thing is that future development has one shared reference point.
