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
- Generate image, video, audio, text, utility, and 3D outputs through local API routes.
- Use the Composer node to block camera, pose, image planes, props, maquettes, and guide frames before generation.
- Keep multiple node results, preview them in-node, send them to Preview nodes, or browse recent project outputs in the right rail.
- Drag outputs or external files onto the canvas to create matching Image, Video, Audio, 3D, or Text nodes.
- Save portable workflow packages with their inputs, outputs, and helper dependencies.
- Track model usage and estimated spend through the local stats view.

## Key Features

- **Local-first workflow files**: Save, Save As, Open, Import, Recent workflows, and unsaved-change prompts are handled locally.
- **Portable packages**: Packaged workflows keep project assets together so they can move across machines or shared drives.
- **Provider routing**: Enable or disable Fal, Google, Krea, Atlas Cloud, OpenAI, and ElevenLabs independently in Settings. Supported media routes select an enabled, configured provider in Fal > Krea > Atlas order before submission, never as an automatic paid retry. Existing LLM/OpenAI routing and direct ElevenLabs audio are unchanged.
- **Director and Storyboard**: Build structured shot direction, continuity-aware boards, editable layouts, compiled board references, frame exports, and client-ready PDFs.
- **Frame It**: Pose and frame multiple 3D figures, save complete compositions, and capture guide images for downstream generation.
- **Preview editing**: Assemble mixed-aspect layouts and apply crop, rotate, curves, color, text, and masked inpainting edits while keeping full-resolution source assets.
- **Current image models**: Work with GPT Image 2, GPT Image 2.5 Sunburst and Flare, Nano Banana Pro, Nano Banana 2, REVE 2.1, and Krea 2 Large from the same reference-aware image workflow.
- **GPT Image 2.5**: Sunburst and Flare are separate Image Model choices, using enabled providers in Fal > Krea > Atlas order. Both offer Low through Maximum quality. Fal supports 1K/2K/4K output, reference edits (up to 16 images), masks, and transparent PNGs. Krea's launch API supports 1K at 1:1, 3:2, or 2:3 with up to 10 references; only Flare exposes background controls there. Controls adapt to the active provider; Atlas uses its own size/reference limits. Pricing is variable and remains unpriced until a reliable estimate is available, so budget-limited Newt generation will not auto-run these models. Existing saved model choices and Utility defaults are unchanged.
- **Creative model defaults**: New Character nodes default to Nano Banana Pro at 4K. Coverage and Storyboard default to GPT Image 2.5 Sunburst at High quality; Flare is not offered in these three nodes. Character retains 4K regular/CU bases and masked wardrobe edits, supported through Fal or Atlas for Sunburst. Coverage retains nine separate outputs. Storyboard's Advanced tab offers Sunburst or Image 2, keeping 1K frames, continuity and QC; its internal character preparation uses the selected model. Coverage and Storyboard adapt to Krea's supported sizes and also support Atlas. Existing projects retain their models and generated media until the user requests a change or generation.
- **Composer**: Pose maquettes, save pose presets, bind Character nodes, add primitives and image planes, then capture a guide frame for downstream image models.
- **Preview rail**: Recent project outputs lazy-load, support full-size lightbox preview, and can be dragged back into the graph.
- **3D preview**: GLB results render in-node with the shared lazy Three.js viewer.
- **Color ID Matte**: Image and video matte pickers support color sampling, tolerance controls, and enlarged picker views.
- **Cross-platform launchers**: Windows and macOS launchers are included for local app-style startup.

## Atlas Cloud

Add an **Atlas Cloud API V1** key in **Settings > API Providers**. Additional versions use the existing key-version controls with one active version at a time; disabled versions remain saved. `ATLAS_API_KEY` is the optional environment alternative. Keys stay local, outside workflows and exports.

Atlas supports **GPT Image 2, Image 2.5 Sunburst/Flare, Nano Banana 2/Pro, and REVE 2.1**, including compatible Character, Coverage, Storyboard, and Sunburst Image Edit workflows. REVE uses native 4K output; hidden resolution/quality defaults do not change it. Video support covers **Seedance 2.0, Seedance 2.5, and MiniMax H3**. Kling is excluded from Atlas routing until its reference contract is verified. This does not change LLM/OpenAI or direct ElevenLabs routing.

Provider-specific reference, duration, resolution, mask, and audio limits are validated before upload/submission. Unsupported settings fail clearly instead of dropping inputs or silently switching providers. Atlas Seedance 2.5 does **not** expose a `1920p` or native `4k` output option; explicitly supported super-resolution tiers are distinct. Paid submissions are never automatically retried or moved to another provider after failure. Video jobs have no NewtNode job-duration cutoff; read-only status checks keep polling the submitted job with bounded backoff.

Atlas estimates use verified standard prices only, without promotional or account discounts. Token-billed or unverified costs remain variable/unknown, never zero. Atlas is wired into the existing weekly/manual pricing refresh using its [public pricing catalog](https://api.atlascloud.ai/api/v1/pricing/models). Verification used public schemas/catalogs and mocked requests; no paid generation or live API-key test was performed. [Atlas API reference](https://www.atlascloud.ai/docs/en/openapi-index).

## Audio Model

**Audio Model**, directly below Video Model in the node menus, generates Text to Speech, Speech to Speech, Sound Effects, and Music through ElevenLabs. Add and enable an **ElevenLabs API V1** key in Settings; extra key versions use the existing mutually exclusive toggles. Allow Voices Read plus the generation features you intend to use. Account balance, model access, and voice permissions still apply. No key needs to be placed in a workflow or shared in chat.

Text to Speech speaks the supplied text literally. Speech to Speech takes a connected or uploaded MP3, WAV, or M4A recording (up to 50 MB and five minutes), preserving its speech/performance rather than rewriting a prompt. Both provide **Default** and **Mine** voice groups from the current account, voice samples, model selection, and mode-appropriate voice controls. Mine includes voices saved to the account, including added library voices. Changing keys never silently substitutes a missing saved voice. Sound Effects supports duration, automatic duration, looping, and prompt influence. Music supports duration, automatic duration, and instrumental output; disable Instrumental and describe lyrics/vocals in the prompt when wanted.

Outputs are MP3, with 128 kbps as the default. The 192 kbps speech option requires an eligible ElevenLabs plan. Generate one to four results per run, play/download them, and connect the orange output to Preview or compatible audio inputs, including Director music. Each batch chimes once when finished. Previous successful results remain available after a partial or failed run. Files save into the current workflow's managed output folder, with History and estimated costs in Stats.

Run Audio displays a total batch estimate based on the [published standard API rates](https://elevenlabs.io/pricing/api), verified September 8, 2026. Account discounts, custom voice rates, and unknown automatic duration can make the actual bill differ; unknown prices display **cost varies**. Optional `ELEVENLABS_*_USD` overrides are listed in `.env.example`. ElevenLabs rates are not yet part of the automatic weekly pricing refresh. Requests are never automatically replayed after a timeout; check ElevenLabs history before rerunning. Audio Model generation is manual/Run All only, not agent-executable until Newt has dedicated audio budget permissions.

API contracts: [speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [voice conversion](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert), [sound effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [music](https://elevenlabs.io/docs/api-reference/music/compose), [voice list](https://elevenlabs.io/docs/api-reference/voices/search).

## Director and Storyboard Intelligence

The Director **Music** input is available only for **Music Video** and **Montage**. Other approaches gray out both its field and connection dot and ignore any saved music connection. Switching approaches retains the connection. Music Video requires a track; Montage optionally uses one as its soundtrack and timing guide, with no automatic singing requirement. Without a track, Montage keeps the selected audio policy. Connected music uses reference-to-video with Seedance 2.0, Seedance 2.5, or MiniMax H3; unsupported models or start/end-frame routes produce a clear error instead of dropping the track.

Director planning, revisions and visual analysis, plus Storyboard planning, visual QC and captions now default to **GPT-6 Astra**. Existing provider priority and explicit model environment overrides remain intact. Fal uses `openai/gpt-6-astra` through its OpenRouter adapter; direct OpenAI uses `gpt-6-astra` on Responses with High reasoning and strict structured outputs. Fal exposes provider-default reasoning rather than a selectable effort, so its outputs are schema-validated locally. Account/model access is still required; no silent downgrade or automatic cross-provider paid retry occurs. Smart Text and image/video generation models and quality are unchanged.

Director maintains a dependency-aware continuity brief and limits corrective shot-plan work to one repair. Unchanged visual reference analysis is reused in a bounded, 30-minute memory cache keyed by image content, tag, model, active key and instructions. Final prompt assembly remains local. Storyboard validates every connected Director CUT and its required keyframes, preserves existing boards on planning failures, and marks unavailable QC as unreviewed without triggering paid retries or using that frame as an approved continuity anchor.

Compatibility sources: [OpenAI Astra migration](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-update-api-and-model-parameters), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Fal router schema](https://fal.ai/models/openrouter/router/api), [OpenRouter Astra listing](https://openrouter.ai/openai/gpt-6-astra). Provider schema/catalog checks and mocked API tests do not establish subjective creative quality; evaluate production results with a small approved run.

## Newt (Experimental)

Enable **Settings > Workspace > Newt** to show Newt at the top of the node menus. It starts hidden for new users; existing users with saved Newt tasks keep it visible. The switch saves immediately and hides only the menu entry, not Newt nodes already in projects.

**Settings > Workspace > API Cost** shows or hides generation-button prices and variable-cost labels. It saves immediately and defaults off for new installations and upgrades without a saved choice. Stats, History, Newt approvals, and budget limits remain active regardless of this display preference.

### Newt Remote

**Settings > Remote access** in Newt pairs a phone-friendly companion with the exact project and node already open at home. It can submit briefs and revisions, approve plans or prepared runs, pause/stop/resume tasks, and display costs, activity and full-resolution task results. The home editor remains the only canvas executor; the companion never loads a second project copy. Generation permissions, protected work, budgets and approval safeguards still apply. Starting or continuing a task uses a new allowance from the home node's current budget. Remote users cannot change keys, permissions, checkpoints or budgets through the companion controls.

Remote access is off by default. Enabling it starts a **separate loopback-only gateway on port 3337** (`NEWT_REMOTE_PORT` can override it) and remembers the private address on this Mac. Leave Private address empty to test on the home computer at `http://127.0.0.1:3337`. Click **Pair device**, then enter its one-use, five-minute code on the companion page. Phones stay trusted for 30 days through an HttpOnly, SameSite cookie (Secure over HTTPS). Only token hashes, device names, expiration dates and remote configuration are stored in the owner-only `server/data/my-newt-remote-devices.json`, outside saved projects and Git. Revoke a device individually, choose **Forget this device** on the phone, or disable remote access to revoke all. Clearing phone browser data or reaching the 30-day expiry requires pairing again.

Bookmark the same private address. The home bridge reconnects automatically when a project with Newt is open, including after a backend restart or editor reload. The phone must select **Connect to this project** after each home connection/project change before viewing task details or sending commands; project changes do not require a new pairing code. Project switching discards pending commands, clears the phone's previous draft, and never carries approvals into another project. Without an open Newt project the phone remains paired on a waiting screen. An unresponsive home editor stops accepting commands after 15 seconds and releases its project connection after 90 seconds; trusted devices remain remembered. Keep the home machine awake and its editor tab running, not browser-suspended. Budgets and generation/edit permissions are still set separately on each project's Newt node.

For access away from home, configure **Tailscale Serve**, not Funnel or a router port-forward. Install/sign into Tailscale on the home computer and phone, restrict tailnet access to your authorized devices, and serve only `http://127.0.0.1:3337`. The official command is `tailscale serve 3337`; it provides an HTTPS `https://device.tailnet.ts.net` address and any required HTTPS consent steps. Enter that exact address in Newt's **Private address** before enabling remote access, then pair from that address on your phone. Serve keeps the endpoint inside your private tailnet: [Tailscale Serve documentation](https://tailscale.com/docs/features/tailscale-serve). **Never proxy NewtNode's editor port 5176 or unrestricted API port 3336.** NewtNode does not install Tailscale, change network settings or expose public services automatically. App authentication does not replace tailnet access restrictions.

Commands have unique IDs and are delivered at most once. Expired commands and approvals for changed tasks are rejected. A lost delivery acknowledgement is reported as uncertain and is never replayed automatically; check the task before retrying. Pause/stop prevent new work but cannot recall provider requests already submitted. Pairing and state endpoints are separately authenticated, origin/Host/CSRF checked and rate-limited for pairing; media is restricted to the current task's managed outputs. The remote gateway has no settings, file-browser, shell, upload, or arbitrary-URL proxy routes. Tests use isolated home-editor fixtures and simulated generation, not paid providers.

### Local Tasks

Add **Newt** from the node palette, enter a brief, and start a task. There is one Newt per project. Exact local shortcuts run without an API key or LLM; AI tasks use the enabled OpenAI key, with access to the selected model. **Auto** uses GPT-5.6 Luna Medium for remaining routine operations and GPT-6 Astra for creative or complex briefs, with escalation when needed. **Economy** stays on Luna; **Best** always uses Astra for AI tasks. The Creative reasoning slider adjusts Astra's effort and token allowance, defaulting to High. These controls never lower Director/Storyboard reasoning or image/video quality. The $5 default estimated budget remains a separate limit.

Routine commands run automatically in the background through the normal prompt and **Start task** button, without a quick-action menu or mode selection. Local plans cost **$0.00**, retain approval/history, and never generate media. Examples include `Save`, `Rename project to "Summer Campaign"`, `Duplicate "Image Model"`, `Duplicate 2 copies of group "Campaign"`, `Copy selected nodes`, `List attached assets`, `Set "Image Model" batch count to 4`, `Set "Video Model" audio to off`, and `Set "Text" text to "A quiet park"`. Copies preserve results and incoming references, leave existing nodes untouched, and get unique names. Project rename changes the current name; Save persists it without creating a second project. Canvas edits retain Undo; task checkpoints restore the canvas, not previous project names or saved files.

Hidden recipes include Image, Image Edit, Video, Coverage, Director, Storyboard, Director-to-Storyboard, Music Video, and asset-preview layouts. Try `Set up image workflow using attached assets`, `Set up Coverage for each attached image`, `Preview attached images in a Preview`, `Set up music video workflow using @Song and @Emma`, or `Insert preset "Brand setup"`. Each-image Coverage creates one workflow per attached image source, not per result inside that source. Director/Storyboard images need explicit roles, e.g. `Set up Director workflow using @Emma as character, @Park as location, @Book as prop`. Unsupported references are reported instead of silently discarded; busy sources and references changed after planning stop the action. Names must be unique and settings must match available options. Edits to existing nodes still require permission. **Local actions only** optionally blocks unmatched requests instead of sending them to AI and disables paid dictation. Otherwise, voice transcription has its separate charge; creative AI work and actual media generation remain paid. Failed or interrupted local actions never retry automatically or escalate to AI.

Connect Images, Videos, Audio, Character nodes, or Mood Boards to supply context. New agent-created nodes are placed in free canvas space, checked again against their rendered dimensions. Select creative nodes and choose **Newt Preset** beside **+ Group** to name and save a reusable workflow. Mark replaceable asset inputs under **Advanced** while saving, then optionally bind existing Character, Location, Prop, Mood Board, Image, Video, or Audio nodes when inserting a copy. Bound references and tags are remapped, and dependent generated results are cleared only in the new copy. Original nodes and library media remain untouched. Inserting never starts paid generations. Newt itself is excluded.

**Preset Workflow** distinguishes permanent **(System)** presets from removable **(User)** presets. The built-in library includes Cinematic Location, Cinematic Prop, Edit Image, Headshot Image, Standard Workflow, and Style Transfer. Their original layouts, settings, and full-resolution media ship in `server/system-newt-presets/`. System definitions cannot be deleted through the UI or API; inserted copies remain normal editable nodes and can be saved under a new name as User presets. New saves always remain User presets in ignored `server/data/newt-presets/`. Legacy personal copies with system IDs are retained but do not duplicate or override built-ins. Managed media lives under `outputs/Newt-Presets/dependencies/`; missing system media is restored from the bundled library on insertion. Include `server/system-newt-presets/` when distributing NewtNode.

Newt can create, configure, and connect nodes; run Smart Text, Director, Storyboard, Character, Coverage, Image Model, and Video Model workflows; and inspect managed project images, sampled video frames, and audio transcripts. Composer, Frame It, 3D, Mood Board compilation, and Utility operations remain manual in this first version. Existing results are preserved, locked inputs cannot be edited, and graph changes use the normal canvas Undo history.

**Approved work:** `Protect "Emma"`, `Approve "Hero"`, or `Keep selected nodes unchanged` mark whole nodes as approved without an LLM call. Approval persists in the project across tasks and restarts. Newt may use approved nodes as references, but editor and backend checks block edits, incoming connection changes, generation, and changes to their upstream dependencies. Manual user editing remains available. Newt cannot release approval itself: use **Settings > Approved work**, or a direct command such as `Release "Emma"`. Pause active work before releasing it. Copies and preset insertions are editable and do not inherit approval or previous run fingerprints. Protection is currently whole-node, not individual shots inside a Director or frames inside a Storyboard.

**Selective reuse:** successful Newt runs record input/output fingerprints for Image Model, Video Model, Coverage, and Smart Text. An unchanged completed run is reused without another provider request; Activity reports the $0.00 generation cost. Resolved prompts, selected references, model/settings and provider are compared, and missing or changed outputs prevent reuse. Canvas movement and unrelated scene edits do not invalidate results. Legacy/manual results without a recorded fingerprint are not assumed current. An explicit new variant or retry requires per-run approval unless Auto Review is enabled, even when ordinary run approvals are disabled. Reasoning may still cost money; fingerprints are not a visual-quality assessment. Director, Storyboard, and Character retain their existing stage/base/wardrobe rules rather than applying an unsafe blanket cache. Newt is instructed to preserve unaffected stages and ask for manual frame selection when only part of a board needs regeneration.

**Auto Review:** Newt > Settings > Advanced can automatically accept plans and permitted runs, including free local actions and requested variants. It is off by default and preserves the individual approval preferences when switched off again. No additional LLM review call is made. Budgets, permissions, protected work, output checks, and duplicate-request protection still apply; missing requirements or uncertain charges still pause the task. It never resumes a paused task without an explicit Resume.

**Favorite models:** the same Advanced section offers favorite image and video models, with No preference as the default. Newt prefers them for new compatible nodes and fresh workflow recipes. Explicit requests, existing node selections, saved presets and duplicates take precedence; choosing a favorite never changes those models or enables a disabled model. Storyboard and reasoning model choices remain unchanged.

`test/myNewtApprovedWork.test.js` covers representative production requests, indirect protection bypasses, copies, changed references, partial/missing outputs, zero-request reuse, and repeat approval using isolated data and mocked providers. These mechanical regression checks do not substitute for human review of generated creative work.

Start with the default plan and per-run approvals. The plan lists steps, deliverables, and an estimated media total; run approval shows the model, batch/settings, references, prompt, and estimated cost. Enable image/video generation and existing-node edits only as needed. **Spent**, **Reserved**, and **Remaining** distinguish reported costs from pending or uncertain charges. Reported LLM usage, including Storyboard planning and quality checks, reconciles reservations. Prices are estimates, not a provider billing cap; submitted work may finish and incur charges after Pause/Stop. Unknown-priced operations are blocked. Three consecutive unsuccessful steps pause the task.

Keep the project open while Newt works. Switching NewtNode tabs is supported; closing/switching projects pauses editor work. Task state, activity, and request receipts are stored locally in ignored `server/data/my-newt/`. Restarted tasks require Resume and never automatically replay an interrupted paid request. Imported tasks are detached from their original running sessions. Use History to recover outputs if the editor closed before a result was applied.

Notes invalidate unstarted actions before approval, and failed sends retain the draft. Completed tasks can continue with a follow-up brief and a new budget allowance; Task history keeps prior runs accessible. Each new task captures a starting checkpoint. Restoring it replaces later canvas changes after confirmation, but never deletes generated files or reverses provider charges. Completion checks require the approved deliverables and available output files before the green highlight, chirp, and confetti.

Video review samples six frames, and audio transcription covers at most the first two minutes. These are not full-motion or sound-quality evaluations. No desktop control, arbitrary filesystem access, or shell execution is exposed to the agent.

Click the microphone beside the brief or follow-up note to listen (Space/Enter also activate the focused button). Click again to finish, or pause for three seconds: the microphone turns off and transcribes once. Without speech it turns off after eight seconds without uploading; recordings have a two-minute maximum. It never automatically starts listening again. End with a separate command clause such as "Start task", "Run task", or "Begin task" to submit the complete brief through the normal task controls. "Send note" submits additional direction to an existing task; "Continue task" starts a follow-up to a finished task. Other speech stays in the draft, preserving typed text. Voice cannot approve a plan/run, resume a paused task, or bypass permissions and budgets. Esc, cancellation, leaving the tab, and project/task changes discard pending dictation. A late microphone permission response never starts recording after cancellation. Voice uses the enabled OpenAI key and `gpt-transcribe`, with no provider fallback; typed input is always available. Audio-level monitoring uses local [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData) without speaker playback. Audio is sent to OpenAI only once listening finishes, processed temporarily, and deleted locally rather than saved into the project. History/Stats record the estimated transcription charge, not the audio or transcript: approximately $0.0045 per minute, separate from the agent task budget ([OpenAI pricing](https://developers.openai.com/api/docs/pricing), verified September 4, 2026).

## Updating The VS Beta

The team release repository is [VersusAIStudio/newt-node-beta](https://github.com/VersusAIStudio/newt-node-beta), branch `main`. In **Settings > Repository**, set the repository URL to `https://github.com/VersusAIStudio/newt-node-beta.git` and click **Update** after saving your project and letting generations finish. Existing repository overrides are preserved, so check this URL on each installation.

Finish the update by closing NewtNode and relaunching using `NewtNode.command` on macOS or `Restart_NewtNode.bat` on Windows. Settings Update downloads source but does not install new dependencies or rebuild the displayed app. The updated launchers perform those steps automatically; the Settings server-only Restart is not a substitute. Allow an internet connection and extra time for the first launch. Later unchanged launches skip dependency installation. Terminal users can run `npm install`, `npm run build`, then restart their existing app processes.

The release retains VS Git ancestry so clean `main` checkouts can update without force/reset. The pre-sync VS version remains on `backup/pre-newtnode-sync-2026-09-08`; VS-only tools are not part of the current release. Local `.env`, runtime settings, projects, generated outputs and uploads stay outside the source update. Existing VS credential selections migrate to the V1/V2 key controls, including disabled providers, and the original credential records are retained in local settings. Local source edits or a different active branch may require manual reconciliation; do not discard them to update.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- At least one supported provider API key for remote generation.
- Fal is required for Fal-hosted models and utilities.
- Google, Krea, Atlas Cloud, OpenAI, and ElevenLabs keys are optional and can be enabled independently.

## Setup

The easiest setup is inside **Settings > API Providers**. Paste each key, enable the providers you want, and save. Keys and enable/disable preferences are stored locally and are ignored by git.

You can alternatively copy `.env.example` to `.env` and add keys there:

```bash
FAL_KEY=your_fal_key_here
GOOGLE_API_KEY=your_google_api_key_here
KREA_API_KEY=your_krea_key_here
ATLAS_API_KEY=your_atlas_key_here
OPENAI_API_KEY=your_openai_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here
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

## Image Editing

Double-click an image thumbnail, then choose the pencil icon for **Image Edit**. Draw, circle, add arrows or text notes, or paint a separate selection to identify the area to change. Pen size, color, opacity, eraser, undo/redo, zoom and pan are available. **Edit image** interprets the marks and your prompt; **Render sketch** can start on a blank canvas; **Remove selected** fills a selected area from its surroundings.

Edits use **Image 2.5 Sunburst through Fal or Atlas**, with High, Extra High and Maximum quality. Enable the intended provider in Settings; Krea does not currently expose the mask/custom-size features used here. Provider-specific limits still apply, with no automatic paid fallback. API cost is variable. No request is sent until Generate Edit is clicked, and failed requests are not automatically retried.

Review results with the before/after slider, select earlier edits, or continue editing a result. **Add Image to Canvas** creates a separate Image node. **Apply to Source** is available for editable Image, Preview layout and Storyboard images; model/Character outputs stay protected. Generated edits are saved in project storage and History. Originals remain on disk, selection edits preserve untouched pixels locally, and downloaded results retain the original dimensions/aspect. Images up to 24 megapixels and aspect ratios from 1:3 to 3:1 are supported; AI rendering itself is limited to the model's supported size (up to 3840 pixels per edge), then restored to the original canvas dimensions.

Drawing drafts are temporary and require confirmation before discarding; generated edits remain saved. For no-cost UI testing, run the development client and open `/test/browser/image-edit.html` for the isolated mock editor.

## Named References

Reference images can be renamed in the thumbnail strip. Use those handles in your prompt with `@`, such as `@product` or `@talent`. The app translates your names to provider-specific reference tokens when needed.

## Weekly API Pricing

Settings > API Pricing enables a local weekly check every Monday at 4 AM Eastern (`America/New_York`, including daylight saving). The backend must be running and online; missed checks catch up on startup or wake. Failed sources retry hourly up to three times. The refresh icon checks immediately, even when weekly updates are disabled. No LLM or paid generation is used, and no project, API-key preference, or source file is changed.

Verified rates feed shared run estimates and Newt budgeting. Krea's official structured billing tables and OpenAI's Standard reasoning/transcription tables update automatically. Fal's authenticated unit-price API updates verified fixed-price REVE routes; models with variable billing rules are checked but marked for review rather than applying an unreliable multiplier. Missing Krea pricing and direct Google token-based image pricing also remain review-required. Settings shows per-provider coverage, failures, sources, and recent changes. Published prices are estimates, not a promise of an account's final invoice.

Atlas's weekly/manual adapter reads its public catalog without a key or paid request, applying only verified standard `official_price` rows for supported Banana and H3 settings. Promotional/account prices and generic starting-price summaries are not used. OpenAI image and Seedance token billing, missing REVE rates, and ambiguous tiers such as Nano Banana Pro 2K stay variable/unknown or review-required. Atlas shares the existing runtime catalog; there is no separate pricing store.

Missing, invalid, unusually changed, or ambiguous rates keep their previous estimate. Fal account-specific prices are invalidated when switching or disabling keys. In-flight generations keep their starting pricing snapshot; historical spending uses its recorded amount and unknown charges stay unknown. The owner-only runtime cache is `server/data/pricing-catalog.json`, ignored by Git and excluded from project exports.

## Development Standards

Before adding a new feature, read `docs/node-standards.md`. It is the shared checklist for node behavior, UI conventions, workflow packages, asset storage, backend routes, stats, and verification.
