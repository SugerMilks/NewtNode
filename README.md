# NewtNode

<p align="center">
  <img src="public/newtnode-logo.png" alt="NewtNode wordmark" width="620" />
</p>

<p align="center">
  <strong>A local-first node canvas for AI media workflows.</strong>
</p>

NewtNode is a desktop-friendly browser app for building repeatable creative pipelines with connected nodes. It can generate, preview, save, import, and remix images, video, audio, 3D assets, text, character references, style references, camera instructions, and Composer guide frames while keeping API keys and workflow files on your machine.

Current release: `v3.0.0-beta.0`

## What It Does

- Build media workflows visually with typed node ports and dependency-aware `Run All`.
- Generate image, video, text, utility, and 3D outputs through local API routes.
- Use the Composer node to block camera, pose, image planes, props, maquettes, and guide frames before generation.
- Keep multiple node results, preview them in-node, send them to Preview nodes, or browse recent project outputs in the right rail.
- Drag outputs or external files onto the canvas to create matching Image, Video, Audio, 3D, or Text nodes.
- Save portable workflow packages with their inputs, outputs, and helper dependencies.
- Track model usage and estimated spend through the local stats view.

## Key Features

- **Local-first workflow files**: Save, Save As, Open, Import, Recent workflows, and unsaved-change prompts are handled locally.
- **Portable packages**: Packaged workflows keep project assets together so they can move across machines or shared drives.
- **Provider routing**: Enable or disable Fal, Google, Krea, and OpenAI independently in Settings. Seedance prefers Fal when both Fal and Krea are enabled, then falls back to Krea when Fal is disabled.
- **Film Director and Storyboard**: Build structured shot direction, continuity-aware boards, editable layouts, compiled board references, frame exports, and client-ready PDFs.
- **Frame It**: Pose and frame multiple 3D figures, save complete compositions, and capture guide images for downstream generation.
- **Preview editing**: Assemble mixed-aspect layouts and apply crop, rotate, curves, color, text, and masked inpainting edits while keeping full-resolution source assets.
- **Current image models**: Work with GPT Image 2, Nano Banana Pro, Nano Banana 2, Seedream 5.0 Pro, Krea 2 Large, Z-Image, and Luma from the same reference-aware image workflow.
- **Composer**: Pose maquettes, save pose presets, bind Character nodes, add primitives and image planes, then capture a guide frame for downstream image models.
- **Preview rail**: Recent project outputs lazy-load, support full-size lightbox preview, and can be dragged back into the graph.
- **3D preview**: GLB results render in-node with the shared lazy Three.js viewer.
- **Color ID Matte**: Image and video matte pickers support color sampling, tolerance controls, and enlarged picker views.
- **Cross-platform launchers**: Windows and macOS launchers are included for local app-style startup.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- At least one supported provider API key for remote generation.
- Fal is required for Fal-hosted models and utilities.
- Google, Krea, and OpenAI keys are optional and can be enabled independently.

## Setup

The easiest setup is inside **Settings > API Providers**. Paste each key, enable the providers you want, and save. Keys and enable/disable preferences are stored locally and are ignored by git.

You can alternatively copy `.env.example` to `.env` and add keys there:

```bash
FAL_KEY=your_fal_key_here
GOOGLE_API_KEY=your_google_api_key_here
KREA_API_KEY=your_krea_key_here
OPENAI_API_KEY=your_openai_key_here
```

Settings takes priority for providers explicitly enabled or disabled there. Disabling a provider prevents NewtNode from using its `.env` key until it is enabled again.

### macOS

From Terminal in the repository folder:

```bash
npm install
cp .env.example .env
open -e .env
npm run dev
```

Then open `http://127.0.0.1:5176`.

You can also double-click `Versus_NewtNode.app` for the app-style launcher when it is included, or run `NewtNode.command` / `Versus_NewtNode.command` when you want terminal logs visible.

### Windows

From PowerShell in the repository folder:

```powershell
npm.cmd install
Copy-Item .env.example .env
notepad .env
npm.cmd run dev
```

Then open `http://127.0.0.1:5176`.

You can also double-click `Launch_NewtNode.bat`, or run `Launch_NewtNode.ps1` from PowerShell, to start the local backend, start the Vite UI, and open NewtNode.

If PowerShell blocks scripts, use the `.bat` launcher or run PowerShell as:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Launch_NewtNode.ps1
```

## Useful Commands

```bash
npm run dev
npm run build
npm test
npm run bundle:report
npm run smoke:app
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`, for example:

```powershell
npm.cmd run build
```

## Workflow Storage

NewtNode stores runtime workflow state, recent workflow indexes, uploads, generated outputs, and package registrations locally. These files are intentionally ignored by git. Portable workflow packages use this shape:

```text
WorkflowName/
  WorkflowName.json
  inputs/
  outputs/
  dependencies/
  .newtnode/
    manifest.json
```

## Named References

Reference images can be renamed in the thumbnail strip. Use those handles in your prompt with `@`, such as `@product` or `@talent`. The app translates your names to provider-specific reference tokens when needed.

## Development Standards

Before adding a new feature, read `docs/node-standards.md`. It is the shared checklist for node behavior, UI conventions, workflow packages, asset storage, backend routes, stats, and verification.
