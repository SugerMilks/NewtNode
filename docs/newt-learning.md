# Newt Learning

## Scope

Watch Me is an opt-in observation and reviewed-guidance layer for the existing Newt agent. It is not model training, continuous screen recording, or autonomous skill rewriting. Existing Creative Skills, preset-first planning, approvals, protected work, task budgets and canvas ownership remain authoritative.

This first release covers recording, session review, user notes, optional text-only AI suggestions, approved lessons and portable Markdown export. It does not expose an MCP server, watch other applications, infer image quality, automatically create presets, or grant cross-canvas editing. Those need separate integrations and evaluation, not an alternate unguarded agent runner.

## Artist Workflow

1. In Newt, enable **Watch Me** and accept the recording disclosure. Recording starts off and never resumes automatically.
2. Work across the project's canvases. A project-level indicator provides pause, finish, notes and library access even when Newt is offscreen.
3. Use **Remember this** to explain an intentional choice. If exactly one non-Newt node is selected, its current managed output is attached as local evidence. Mere selection, repetition, or deletion is not interpreted as approval or rejection.
4. Finish to review the session. Explicit notes become editable lesson drafts without a provider call. A **My takeaway** field also creates drafts after recording.
5. Optionally request **Suggest lessons**. Confirm one paid, bounded text analysis. It returns a factual recap and proposed lessons tied to recorded evidence. Images are displayed locally for your review but are not sent to this analysis.
6. Review the wording, kind, topics and scope, then approve individual lessons. Dismiss anything speculative or irrelevant. Default scope is this project; all-project scope requires an explicit confirmation.
7. New AI tasks retrieve up to five relevant, enabled lessons. **Applied lessons** in the task details shows what was captured. Existing and paused tasks keep their original versions, even after a library edit or deletion.

## What Is Recorded

- Allowlisted creative prompt/settings changes, node additions/removals, connections, result references, and explicit user notes. Node position changes, transient generation flags, credentials/settings fields, raw files and arbitrary node objects are excluded.
- A bounded initial sample of up to 40 nodes and 40 connections, followed by coalesced changes after 700 ms of quiet. This is a meaningful-action journal, not a complete event replay. Fast intermediate edits can be omitted.
- At most 400 project nodes and 600 events per session. Text is bounded and common credential/absolute-path patterns are redacted. Never deliberately put secrets into creative prompts; redaction cannot recognize every possible secret.
- Local managed image references only. External URLs, signed URLs, inline bytes and filesystem paths are not retained as media evidence. Deleting a referenced file may make its thumbnail unavailable; the written observation remains.

Recording pauses when Newt starts working, the browser document becomes hidden, Newt is removed, or storage fails. Switching projects stops observation; reloading restores only a paused local outbox. No automatic resume, paid analysis, or background provider request occurs. Work completed while paused is not retroactively recorded.

## Persistence and Privacy

`server/newt-learning.js` stores session JSON and reviewed lessons under ignored `server/data/newt-learning/`, using atomic private writes. A tab-local `sessionStorage` outbox preserves unacknowledged observations. Append IDs make explicit retry safe; writes are serialized and failed saves retain buffered events. Session files are capped at 100 and approved lessons at 200; the UI asks users to remove older records instead of silently deleting them.

The learning routes require the local editor origin, loopback connection and `X-Newt-Local` marker. They are not exposed through Newt's project-action tool or paired remote control. No recording flag is saved in workflow/project data. Session media is referenced, not copied or deleted.

Deleting a session also removes lessons/evidence approved from it. Deleting an individual lesson leaves its source session. Neither operation deletes media, the project, preset workflows or previously captured task journals. This is not a forensic-erasure feature; existing task snapshots and provider billing records remain under their normal retention rules.

Personal lessons can be retrieved across projects; project lessons cannot. Evidence from another project's personal lesson is not included in the library response. AI task retrieval includes only reviewed text, title, kind, scope, topics and revision, never raw recordings or source media.

## Optional Analysis and Billing

One explicit analysis per session uses the existing enabled Newt OpenAI/Fal/Atlas Responses connection with the Economy model (`gpt-5.6-luna`), medium reasoning and a 4,000-token output cap. It receives a maximum 30 KB sample, prioritizing explicit notes, initial context and recent actions. The model receives no tools, images or permission to act. Schema and evidence-ID validation reject fabricated/unmatched lessons; malformed output is never promoted.

A receipt is saved before submission. Concurrent/duplicate requests, browser reconnects and backend restarts never replay analysis. Interrupted/failed analysis stays visible and may have been billed; the local notes remain usable. Only a confirmed provider rejection of the request's JSON schema offers **Try analysis again**, after updating NewtNode. This requires new paid-call consent and the exact failed attempt token; the prior receipt and all observations, notes and approvals remain intact. A stale confirmation cannot submit again after another attempt. Timeouts, unknown failures, malformed model output and interrupted/successful receipts remain non-retryable. Billing for rejected requests is not assumed to be zero.

The provider receives the supported Structured Outputs schema subset; duplicate evidence IDs remain rejected by stricter local validation rather than a provider `uniqueItems` constraint. The client checks `myNewtLearningAnalysis` before submitting to avoid the older incompatible backend. Safe failure codes/reasons are retained, without raw provider errors or credentials.

There is no automatic repair call, provider fallback or image generation. History records each explicitly authorized analysis separately, outside the task budget, including malformed/failed results; unknown costs remain unknown, not zero. Local actions only disables AI suggestions, while recording, manual review and lesson edits remain free of LLM calls. Applying lessons adds a bounded amount of context to a normal Newt reasoning request.

## Maintenance

- Lessons have editable title, guidance, topics, kind, project/personal scope and enabled state. Revision-checked saves reject stale edits and retain the previous ten versions for restoration.
- Topic/text relevance is lexical and bounded, not an embedding service. Use specific topics such as `location`, `cinematic`, `storyboard`, or `typography`. Vague topics may not match the intended brief.
- Export produces a text-only `SKILL.md` with name/description front matter. This does not modify bundled Creative Skills, install a skill elsewhere or include media. Review project-specific content before sharing it.
- Saved node arrangements remain preset workflows. Learning does not duplicate or rewrite the preset library; Newt continues to discover and use existing presets through its guarded planner.
- User instructions and explicit saved workflow settings take precedence over learned preferences. Nothing learned can authorize paid runs, filesystem access, bypassing approvals, changing budgets or crossing canvas boundaries.

## Verification

Run `node --test test/newtLearning.test.js`, the full suite, `npm run build`, `node --check server/index.js`, and `git diff --check`.

`test/browser/newt-learning.html` and `scripts/verifyNewtLearning.mjs` exercise the real recording hook and review UI with an in-memory mock API. They cover default-off, consent, notes, pause/recovery, project switching, approval, explicit analysis, keyboard save, and desktop/mobile layout without real projects or paid calls.

Before claiming creative improvement, evaluate with user-approved representative sessions and briefs. Compare relevant guidance, preserved intent, preset reuse, unnecessary generations, cost and actual selected outputs. Automated tests establish behavior and safety boundaries, not subjective artistic quality.
