# Newt Creative Skills

Newt combines the live preset library with versioned creative guidance. This is an instruction system, not model training or automatic learning from every project. The skills draw from the [Dreamers workflow study](newt-dreamers-workflow-study.md) and the [tutorial library study](newt-tutorial-library-study.md), which records sources, timestamps, review limitations and evaluation cases.

## Adjusting Your Process

Open **Newt > Settings > Advanced > Creative Skills**. Choose a skill, edit its instructions, and Save. Each skill can be disabled or reset to the latest System version. These preferences apply to new AI tasks on this computer, across projects. Running, paused and recovered tasks retain their original snapshot; start a new task to use changed guidance. Task details identify the captured skill versions.

- **Workflow Planning:** prefer suitable saved workflows, preserve their settings, and adapt their sample subjects only in inserted copies.
- **Cinematic Narrative:** prepare identities, wardrobe, locations and props before directing and generating a narrative scene. Keep style, action, camera and pacing responsibilities distinct.
- **Asset Selection and Review:** choose references deliberately, retain factual inspection findings, and make bounded, justified revisions.
- **Canvas Organization:** align Newt-created work, preserve whole preset layouts, and conservatively remove disposable preparation branches after keeping the selected asset independently.
- **Image Direction and Mood Boards:** keep subject, style, grade and camera independent; curate coherent references and compare useful candidates.
- **Visual Exploration:** develop genuinely different directions while preserving required content; narrow around a chosen look.
- **Character Preparation:** develop identity before costume, reuse ready sheets, and verify the intended wardrobe and CU reference.
- **Storyboard Direction and Revision:** plan purposeful coverage, maintain geography/object state, and preserve good panels during targeted corrections.
- **Editing and Delivery:** prepare selected clips and clear manual timeline/export handoffs without regenerating approved media.

These skills do not add executable tools. Some demonstrated actions, including Explore runs, PDF script import, selected-board revisions, Advanced Edit and Editor timeline editing, still need manual interaction. Newt should identify the exact remaining step instead of claiming it performed it. The source study lists the audited boundaries.

Use short, actionable instructions: when the skill applies, what order to work in, what makes a good result, what to preserve, and what to avoid. Keep examples separate from universal requirements. Each skill allows 6,000 characters; enabled guidance is limited to 24,000 total. Enabled guidance adds input tokens to AI requests, so avoid pasting whole tutorials. Free local commands still bypass the LLM.

The editor shows System or Custom, the base version, and whether a newer System version is available. Custom text survives application updates. Reset uses the latest bundled version; the previous ten revisions are retained locally. Concurrent edits are rejected instead of overwriting someone else's save. Local overrides and history are not included in workflow packages, presets or Git.

## Using Preset Workflows

For creative AI tasks, Newt receives current preset names, node types, model/style/camera settings and input slots directly from the backend library. It can inspect saved prompts and connections before planning. A plan records whether it uses presets, existing work, or a custom layout, with a reason. Several complementary presets can supply different branches.

Preset insertion preserves the saved model, style, grade, layout, assets and locks. Favorites do not override those choices. The agent adapts the inserted copy through normal supported tools, never edits the library itself, and cannot bypass locks. Newt must inspect the selected preset revision before proposing it. If that revision changes before insertion, it must inspect and plan again. Already inserted copies are independent of later library changes.

For useful presets:

1. Give each a clear purpose, such as Headshot Image, Cinematic Location, or Cinematic Prop.
2. Keep reusable production direction separate from example-specific text.
3. Use reusable input slots for assets that should be supplied by each task.
4. Leave subject-specific controls editable; lock only the content that should stay fixed.
5. Save successful variations with descriptive names. Avoid several indistinguishable versions.

Exact free commands such as Add a Text node or Create an Image workflow retain their deterministic behavior. An exact named-preset command inserts that preset without paid planning. Creative briefs use the richer preset-first planning path. There is no fuzzy automatic execution, background generation, or new paid review service.

## Keeping the Canvas Clean

Newt-created nodes and inserted workflow blocks use the shared canvas grid automatically, without changing the user's manual Snap to Grid switch. The `arrange` action aligns this task's nodes at milestones using the same measured-size layout as the canvas alignment tool. Existing nodes stay put and preset blocks retain their internal spacing. Locked, protected or busy nodes are left alone.

For clearly disposable prop or location preparation, Newt can mark a `create` or `preset` action `temporary: true`. Before using `cleanup`, it must retain the exact selected full-resolution result in an independent Image asset node and use that node downstream. Cleanup is limited to temporary nodes created in the current task. Director, Character, Storyboard, Video, Editor and other main production node types are never eligible. Connected dependencies, internal references, required deliverables, incomplete groups, locks and uncertain jobs block removal. Retained local media are verified before cleanup is offered and again when claimed; the editor rechecks the live graph before removal.

Both arrangement and cleanup are undoable canvas edits. Cleanup does not delete local files, History, preset-library entries or original projects. It is optional, not a demand to delete every experiment: keep anything likely to be reused or revised. The Canvas Organization skill can refine those preferences but cannot weaken the enforced guards. No paid generation is part of either action; AI planning still uses the normal task budget.

## Maintaining the Bundled Agent

Bundled skills are plain Markdown in `server/newt-skills/`. `manifest.json` lists stable IDs, titles, scopes and versions. To refine a system skill, update its Markdown and bump its version. To add a skill, add an ID-matching Markdown file and manifest entry; the editor and task loader discover it without component changes. These files are read on demand: a skill-only update does not require a backend restart. Reopen Creative Skills to see refreshed entries and start a new AI task to use them. Prefer focused scopes rather than duplicating the same rule across skills.

Local overrides live in ignored `server/data/newt-skills/`. A Custom override stays intact after a system version bump; compare it with the bundled Markdown before resetting or revising. Do not put API keys, passwords or private filesystem paths in skills. Enabled instruction text is sent to the configured LLM for AI tasks and captured in the local task journal.

Keep creative guidance separate from executable capabilities:

- `server/my-newt.js`: enforced tool loop, plan/preset revision checks, and task skill snapshots.
- `server/newt-preset-discovery.js`: bounded, sanitized, paginated library inspection.
- `src/myNewt/contract.js` and the editor adapters: allowed fields, supported operations and live project guards.
- `src/myNewt/canvasActions.js`: current-task ownership, temporary cleanup, retained-output checks and grid arrangement.
- `src/myNewt/intelligence.js`: model routing, reasoning effort and cost allowances. A model upgrade does not require rewriting the skills.

Skill text cannot grant permissions, bypass a budget or approval, edit protected output fields, add tools, or claim unobserved visual evidence. Keep those rules in code. Additional tutorial insights should become concise, scoped changes with test cases, not a growing transcript in every request.

## Verification

Run `node --test test/newtSkills.test.js test/newtCreativePlanning.test.js test/myNewtCanvas.test.js test/newtPresets.test.js`, then the full `npm test`, `npm run build`, and `npm run smoke:app` against the current backend. Restart only if executable backend changes require it, with the user's permission. The skill tests verify registration, length headroom, live discovery, override preservation and capture in the actual planning request. The mock-only `test/browser/newt-skills.html` page exercises editing, disabling, persistence during the page session, conflict handling and reset without any provider requests. Review the modal at desktop and narrow viewport sizes when changing the interface. `test/browser/newt-canvas.html` exercises grid arrangement, temporary cleanup, preservation and Undo using a mock graph, never an open project.

Mocked tests validate wiring and safeguards, not creative quality. Evaluate future skill/model revisions on the same small set of representative briefs and curated presets; compare reference selection, continuity, justified retries and actual cost with explicit permission for paid runs.
