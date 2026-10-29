# Explore

Explore develops several art directions from one brief, then generates individual images for comparison. It lives next to Preview and Style in the node menu.

## First run

Write a brief, optionally connect assets, and click Explore. Defaults are nine directions, one image each, OpenAI Image 2.5 Flare, medium quality, 2K and 16:9. A new node falls back to an enabled model and its supported format if necessary; saved selections are not silently changed. Settings offer task, style family, creative range, reference influence, Grade, image model, format and direction count (one to 25).

Grade uses the same named presets as Style, defaulting to None. It guides both planning and image generation without changing product/character identity or explicit brand colors. The selected image's direction details include the grade used for that image. Style Family and Grade in Settings replace the former Style input; describe custom palette requirements in the brief. Changing future settings does not modify old images or their saved prompts.

Auto interprets the brief. Photographic work uses cinematic/editorial craft; logos and other graphic work use graphic design criteria rather than forcing a photographic film treatment.

Style Family and Grade each offer **Random**, independently of Auto/None or a specific preset. A new batch assigns different named looks before planning, reusing each family/grade only after cycling through its available pool. Random style choices avoid presets that deliberately change anatomy, wardrobe or subject matter. The resolved look is saved with each image and appears in Direction Details; it does not change when future settings change. Push Further can explore fresh random looks. More Like This and Refine retain their parent's resolved look when the selector is still Random, and Resume never rerolls an unfinished batch. Explicit fixed selections still apply.

**Explore Mode** sits beside Settings and defaults on. On asks for eclectic, clearly distinct professional treatments within the brief's constraints. Off asks for restrained, faithful variations; it does not cancel a deliberately selected Random style or grade. Neither mode authorizes changes to attached image content. Random selection is local and adds no extra planning calls or image generations.

With Explore Mode on, a fixed style now defines the medium, not a repeated recipe. Each new direction receives a contrasting camera/viewpoint, framing, staging, light, palette and material strategy before the single planning call. The planner turns these into coherent concepts specific to the brief and checks for near-duplicates within its response. At the default Creative Range of 55, the target is a visibly different visual idea, not a minor seed or color variation. Higher range increases the extremity of those choices; lower range stays distinctive but less adventurous.

For example, **Claymation** can explore imposing low-angle miniature photography, graphic overhead views, hard shadows, spare theatrical staging and different palette systems without losing its clay materials. **Cinematic Standard** can explore symmetrical formalism, black-and-white suspense and luminous naturalism instead of giving every image the same shallow-focus film treatment. The complete planned composition, lighting, palette and material decisions now accompany every image request. These are generative instructions, not a guarantee that every model will execute every direction perfectly.

Explicit grade, camera, brand-color and brief constraints take priority. Connected Image / Product references still lock scene content and framing, so their contrast strategies stay within lighting, palette, texture and tonal design. Use a text brief or look-only Mood Board when the intent is freely exploring new staging and perspectives. More Like This and Refine remain focused on the selected direction; they do not receive a new random concept. Saved/resumed queues keep their original assignments and prompts. No extra LLM review or automatic paid retries have been added.

## References

- Image / Product: preserve the depicted subjects, count, identity, wardrobe, objects, environment, framing and spatial layout. Explore lighting, grade, texture and rendering treatment on the same content. Only explicit brief/revision changes override the corresponding constraint; this is generative guidance, not a pixel-perfect lock.
- Character: use the locked, selected non-base Character sheet.
- Mood Board: borrow visual treatment, not its depicted subjects or collage layout.
- Camera: use its existing hidden prompts where appropriate to the medium.

Up to eight image references are supported, including parent images when branching. Reference Influence changes how freely mood references are interpreted, not how faithfully an identity or product must be kept.

References has its own collapsible section, independent of Settings, starting closed whenever the node is opened, including saved nodes. Expansion is local UI state and does not dirty the project or restore an older expanded setting. Each input has a connected-source description box. When collapsed, existing wires converge on one gray anchor; clicking it expands the typed ports for connecting or disconnecting assets. Collapsing never changes the underlying connections or their types.

## Develop a direction

Select an image to make it the active output. Double-click opens the standard image viewer. A star saves a favorite in this node.

- More Like This reuses the selected direction without a new planning call.
- Push Further develops a bolder child direction.
- Refine applies a written adjustment.
- Check two results and use Combine to describe which qualities to take from each.
- Direction Details shows the concept, reusable style brief and image prompt.

New images append to a compact horizontal thumbnail strip. Removing a result removes it from this node only; the local file and History remain. **Images output** is Explore's only output. Connect it to Preview to browse the entire collection at full resolution, retaining direction names. Connecting it to other image inputs uses the selected image.

The former Style input, Selected style output, Style brief output and Advanced Outputs section have been removed. When restoring or importing older graphs, connections on those removed ports are discarded without deleting any nodes, images or saved direction details. Camera/Mood Board and other remaining references and existing Images output connections remain unchanged. New batches no longer read connected Style guidance; unfinished saved queues retain their original prompt snapshots.

## Cost and recovery

Planning uses the existing OpenAI creative-model provider routing. Image generation uses the existing image providers, output storage and History/Stats. API Cost visibility follows Workspace settings. Planning is billed separately, so the full exploration price is variable; More Like This can show the existing image estimate.

Images run sequentially. Stop lets the submitted image finish and leaves the rest unsubmitted. Resume uses the saved plan, references and original image settings, not newly edited settings. Successful siblings are never repeated by Resume. Interrupted requests are not automatically retried: check History and the provider first, since the request may still finish and be billed.

Variations / Direction was replaced by Grade. New runs always generate one image per direction, and More Like This adds one image. Old results remain intact; unfinished legacy queues still resume their original variation counts and settings. New and resumed batches support up to 25 images, including older twelve-image queues.

Explore is currently a manual node. Newt cannot run it autonomously until its multi-request planning and image costs are covered by the agent's approval and budget journal.

## Maintenance

Prompt rules, request construction and result normalization live in `src/explore.js`; provider-independent orchestration in `src/nodeRunners/explore.js`; planning route in `server/routes/explore.js`; UI in `src/components/ExploreNodeBody.jsx`. Update these rules and `test/explore.test.js` together. The isolated `test/browser/explore.html` harness uses mocked providers and bundled media, never paid generations.

Explore-only medium and contrast definitions live in `src/exploreArtDirection.js`. Version 3 requires the backend `exploreArtDirection` capability; restart and refresh to activate it. Existing nodes need not be recreated. `test/exploreArtDirection.test.js` covers style/grade/camera constraints, reference protection, bounded contrast choices, route reconstruction, focused branches and legacy queue preservation. `scripts/verifyExploreArtDirection.mjs` exercises the UI/runner with mocked providers on an isolated Vite server at port 5185 (or `EXPLORE_QA_URL`).
