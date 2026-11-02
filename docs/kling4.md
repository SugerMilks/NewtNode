# Kling 4 integration

Kling 4 is available as an additional model in Video Model, Director, Frame It, model preferences and Newt favorites. Existing model selections and defaults are retained. Generation uses the first enabled, configured provider in the existing order: **Fal, Krea, Atlas Cloud**. Atlas Cloud is the app's existing provider at `api.atlascloud.ai`, not World Labs Atlas.

## Supported workflow

- Text prompts, optional Start/End Frames, and image/Character/video references.
- Native 720p or 1080p, integer durations from 3 to 30 seconds, and 16:9, 9:16, 1:1 or 21:9. Image-to-video follows the source frame's aspect.
- Director sends its complete compiled narrative in one video request, including authored audio guidance. It does not use native multi-shot arrays or an additional prompt-optimization call. No audio control is documented in these API contracts. Audio guidance, including Silent, is a prompt instruction rather than a guaranteed output audio setting.
- Reference Audio and Director Music Video are unsupported; no claim of Krea native audio support is made. Automatic Character voices are omitted; Character image references still work.
- Fal and Atlas allow ten images including Start/End Frames and five reference videos, with 30 seconds of reference video total. Krea allows ten reference images and five videos/30 seconds; its End Frame requires Start Frame and cannot be combined with references.
- Request validation checks counts, complete prompt, managed media, and each provider's documented media limits before uploading. It reports unsupported settings instead of truncating inputs.

Explicit video editing, middle keyframes, element/voice-ID controls, Flash, and Atlas ESR enhancement are not exposed in this addition. Existing Seedance editing remains unchanged. Output download, History, Stats, node result selection, Preview and workflow packages use the normal app paths.

## Official contracts checked October 31, 2026

| Provider | Text | Frames | References |
| --- | --- | --- | --- |
| Fal | `kling/v4/text-to-video` | `kling/v4/image-to-video` | `kling/v4/reference-to-video` |
| Krea | `/generate/video/kling/kling-4` | Same endpoint | Same endpoint |
| Atlas Cloud | `kwaivgi/kling-v4.0/text-to-video` | `kwaivgi/kling-v4.0/image-to-video` | `kwaivgi/kling-v4.0/reference-to-video` |

Fal schemas: [text](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=kling/v4/text-to-video), [frames](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=kling/v4/image-to-video), [references](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=kling/v4/reference-to-video). Use integer duration, `start_image_url`/`end_image_url`, `image_urls`/`video_urls` and `@ImageN`/`@VideoN` tags. Fal's [landing page](https://fal.ai/kling-4) still says API access is coming soon despite these published schemas; account entitlement is untested.

Krea: [API](https://www.krea.ai/docs/api-reference/video/kling-40), [OpenAPI](https://api.krea.ai/openapi.json), [reference and frame guide](https://www.krea.ai/models/kling-4). Fields use `start_image`, `end_image`, `reference_images` and `reference_videos`; reference tags are `@ImageN`/`@VideoN`. The API permits ten reference images despite the consumer guide's nine-image UI limit.

Atlas Cloud: [text](https://www.atlascloud.ai/models/kwaivgi/kling-v4.0/text-to-video), [frames](https://www.atlascloud.ai/models/kwaivgi/kling-v4.0/image-to-video), [references](https://www.atlascloud.ai/models/kwaivgi/kling-v4.0/reference-to-video). Existing `generateVideo` submission/prediction polling uses `image`, `last_image`, `reference_images`, `reference_videos`; tags are lowercase `@image_N`/`@video_N`, with image references numbered after keyframes. For prompts containing non-ASCII characters, this adapter conservatively enforces the documented 11,000-character non-English ceiling; ASCII prompts allow 26,000.

## Costs and verification

Fal and Krea publish $0.157/output second at 720p and $0.235/output second at 1080p. Fal requests containing reference video use $0.094/$0.141 per billable second: input plus output duration, minimum twice output duration. Their pre-run estimate remains unknown until input duration is known. Krea's OpenAPI price table is based only on output duration/resolution and integrates with the existing shared refresh. Atlas's complete settings-dependent tariff is unverified, so cost remains unknown; its advertised starting rate is not used as a full request estimate. Recorded historical charges remain unchanged.

`kling4` in API health protects against older backends silently routing a new model name as Seedance. The server captures provider/key before preparation and uses existing single-submission/polling transports without paid retries or fallback. No credentials are stored in projects.

Focused verification: `node --test test/kling4.test.js test/kling4Server.test.js test/klingModelOptions.test.js test/atlasVideos.test.js test/atlasVideoUi.test.js test/videoGenerationApi.test.js test/kreaApi.test.js test/generationPricing.test.js`. Also run the full suite, build, server syntax checks and isolated health/shell smoke checks. Mocked tests verify contracts and behavior, not paid account access or generated quality. App activation/reload and paid verification require separate authorization.
