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
- **Director and Storyboard**: Build structured shot direction, continuity-aware boards, editable layouts, compiled board references, frame exports, and client-ready PDFs.
- **Frame It**: Pose and frame multiple 3D figures, save complete compositions, and capture guide images for downstream generation.
- **Preview editing**: Assemble mixed-aspect layouts and apply crop, rotate, curves, color, text, and masked inpainting edits while keeping full-resolution source assets.
- **Current image models**: Work with GPT Image 2, Nano Banana Pro, Nano Banana 2, Seedream 5.0 Pro, REVE 2.1, Krea 2 Large, and Z-Image from the same reference-aware image workflow.
- **Composer**: Pose maquettes, save pose presets, bind Character nodes, add primitives and image planes, then capture a guide frame for downstream image models.
- **Preview rail**: Recent project outputs lazy-load, support full-size lightbox preview, and can be dragged back into the graph.
- **3D preview**: GLB results render in-node with the shared lazy Three.js viewer.
- **Color ID Matte**: Image and video matte pickers support color sampling, tolerance controls, and enlarged picker views.
- **Cross-platform launchers**: Windows and macOS launchers are included for local app-style startup.

## Director and Storyboard Intelligence

The Director **Music** input is available only for **Music Video** and **Montage**. Other approaches gray out both its field and connection dot and ignore any saved music connection. Switching approaches retains the connection. Music Video requires a track; Montage optionally uses one as its soundtrack and timing guide, with no automatic singing requirement. Without a track, Montage keeps the selected audio policy. Connected music uses reference-to-video with Seedance 2.0, Seedance 2.5, or MiniMax H3; unsupported models or start/end-frame routes produce a clear error instead of dropping the track.

Director planning, revisions and visual analysis, plus Storyboard planning, visual QC and captions now default to **GPT-6 Astra**. Existing provider priority and explicit model environment overrides remain intact. Fal uses `openai/gpt-6-astra` through its OpenRouter adapter; direct OpenAI uses `gpt-6-astra` on Responses with High reasoning and strict structured outputs. Fal exposes provider-default reasoning rather than a selectable effort, so its outputs are schema-validated locally. Account/model access is still required; no silent downgrade or automatic cross-provider paid retry occurs. Smart Text and image/video generation models and quality are unchanged.

Director maintains a dependency-aware continuity brief and limits corrective shot-plan work to one repair. Unchanged visual reference analysis is reused in a bounded, 30-minute memory cache keyed by image content, tag, model, active key and instructions. Final prompt assembly remains local. Storyboard validates every connected Director CUT and its required keyframes, preserves existing boards on planning failures, and marks unavailable QC as unreviewed without triggering paid retries or using that frame as an approved continuity anchor.

Compatibility sources: [OpenAI Astra migration](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-update-api-and-model-parameters), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Fal router schema](https://fal.ai/models/openrouter/router/api), [OpenRouter Astra listing](https://openrouter.ai/openai/gpt-6-astra). Provider schema/catalog checks and mocked API tests do not establish subjective creative quality; evaluate production results with a small approved run.

## My Newt (Experimental)

Add **My Newt** from the node palette, enter a brief, and start a task. There is one My Newt per project. Exact local shortcuts run without an API key or LLM; AI tasks use the enabled OpenAI key, with access to the selected model. **Auto** uses GPT-5.6 Luna Medium for remaining routine operations and GPT-6 Astra for creative or complex briefs, with escalation when needed. **Economy** stays on Luna; **Best** always uses Astra for AI tasks. The Creative reasoning slider adjusts Astra's effort and token allowance, defaulting to High. These controls never lower Director/Storyboard reasoning or image/video quality. The $5 default estimated budget remains a separate limit.

Routine commands run automatically in the background through the normal prompt and **Start task** button, without a quick-action menu or mode selection. Local plans cost **$0.00**, retain approval/history, and never generate media. Examples include `Save`, `Rename project to "Summer Campaign"`, `Duplicate "Image Model"`, `Duplicate 2 copies of group "Campaign"`, `Copy selected nodes`, `List attached assets`, `Set "Image Model" batch count to 4`, `Set "Video Model" audio to off`, and `Set "Text" text to "A quiet park"`. Copies preserve results and incoming references, leave existing nodes untouched, and get unique names. Project rename changes the current name; Save persists it without creating a second project. Canvas edits retain Undo; task checkpoints restore the canvas, not previous project names or saved files.

Hidden recipes include Image, Image Edit, Video, Coverage, Director, Storyboard, Director-to-Storyboard, Music Video, and asset-preview layouts. Try `Set up image workflow using attached assets`, `Set up Coverage for each attached image`, `Preview attached images in a Preview`, `Set up music video workflow using @Song and @Emma`, or `Insert preset "Brand setup"`. Each-image Coverage creates one workflow per attached image source, not per result inside that source. Director/Storyboard images need explicit roles, e.g. `Set up Director workflow using @Emma as character, @Park as location, @Book as prop`. Unsupported references are reported instead of silently discarded; busy sources and references changed after planning stop the action. Names must be unique and settings must match available options. Edits to existing nodes still require permission. **Local actions only** optionally blocks unmatched requests instead of sending them to AI and disables paid dictation. Otherwise, voice transcription has its separate charge; creative AI work and actual media generation remain paid. Failed or interrupted local actions never retry automatically or escalate to AI.

Connect Images, Videos, Audio, Character nodes, or Mood Boards to supply context. New agent-created nodes are placed in free canvas space, checked again against their rendered dimensions. Select creative nodes and choose **Newt Preset** beside **+ Group** to name and save a reusable workflow. Mark replaceable asset inputs under **Advanced** while saving, then optionally bind existing Character, Location, Prop, Mood Board, Image, Video, or Audio nodes when inserting a copy. Bound references and tags are remapped, and dependent generated results are cleared only in the new copy. Original nodes and library media remain untouched. Inserting never starts paid generations. My Newt itself is excluded.

**Preset Workflow** distinguishes permanent **(System)** presets from removable **(User)** presets. The built-in library includes Cinematic Location, Cinematic Prop, Edit Image, Headshot Image, Standard Workflow, and Style Transfer. Their original layouts, settings, and full-resolution media ship in `server/system-newt-presets/`. System definitions cannot be deleted through the UI or API; inserted copies remain normal editable nodes and can be saved under a new name as User presets. New saves always remain User presets in ignored `server/data/newt-presets/`. Legacy personal copies with system IDs are retained but do not duplicate or override built-ins. Managed media lives under `outputs/Newt-Presets/dependencies/`; missing system media is restored from the bundled library on insertion. Include `server/system-newt-presets/` when distributing NewtNode.

My Newt can create, configure, and connect nodes; run Smart Text, Director, Storyboard, Character, Coverage, Image Model, and Video Model workflows; and inspect managed project images, sampled video frames, and audio transcripts. Composer, Frame It, 3D, Mood Board compilation, and Utility operations remain manual in this first version. Existing results are preserved, locked inputs cannot be edited, and graph changes use the normal canvas Undo history.

Start with the default plan and per-run approvals. The plan lists steps, deliverables, and an estimated media total; run approval shows the model, batch/settings, references, prompt, and estimated cost. Enable image/video generation and existing-node edits only as needed. **Spent**, **Reserved**, and **Remaining** distinguish reported costs from pending or uncertain charges. Reported LLM usage, including Storyboard planning and quality checks, reconciles reservations. Prices are estimates, not a provider billing cap; submitted work may finish and incur charges after Pause/Stop. Unknown-priced operations are blocked. Three consecutive unsuccessful steps pause the task.

Keep the project open while My Newt works. Switching NewtNode tabs is supported; closing/switching projects pauses editor work. Task state, activity, and request receipts are stored locally in ignored `server/data/my-newt/`. Restarted tasks require Resume and never automatically replay an interrupted paid request. Imported tasks are detached from their original running sessions. Use History to recover outputs if the editor closed before a result was applied.

Notes invalidate unstarted actions before approval, and failed sends retain the draft. Completed tasks can continue with a follow-up brief and a new budget allowance; Task history keeps prior runs accessible. Each new task captures a starting checkpoint. Restoring it replaces later canvas changes after confirmation, but never deletes generated files or reverses provider charges. Completion checks require the approved deliverables and available output files before the green highlight, chirp, and confetti.

Video review samples six frames, and audio transcription covers at most the first two minutes. These are not full-motion or sound-quality evaluations. No desktop control, arbitrary filesystem access, or shell execution is exposed to the agent.

Click the microphone beside the brief or follow-up note to listen (Space/Enter also activate the focused button). Click again to finish, or pause for three seconds: the microphone turns off and transcribes once. Without speech it turns off after eight seconds without uploading; recordings have a two-minute maximum. It never automatically starts listening again. End with a separate command clause such as "Start task", "Run task", or "Begin task" to submit the complete brief through the normal task controls. "Send note" submits additional direction to an existing task; "Continue task" starts a follow-up to a finished task. Other speech stays in the draft, preserving typed text. Voice cannot approve a plan/run, resume a paused task, or bypass permissions and budgets. Esc, cancellation, leaving the tab, and project/task changes discard pending dictation. A late microphone permission response never starts recording after cancellation. Voice uses the enabled OpenAI key and `gpt-transcribe`, with no provider fallback; typed input is always available. Audio-level monitoring uses local [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) without speaker playback. Audio is sent to OpenAI only once listening finishes, processed temporarily, and deleted locally rather than saved into the project. History/Stats record the estimated transcription charge, not the audio or transcript: approximately $0.0045 per minute, separate from the agent task budget ([OpenAI pricing](https://developers.openai.com/api/docs/pricing), verified September 4, 2026).

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
