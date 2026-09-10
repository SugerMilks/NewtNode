const fail = (message) => { throw Object.assign(new Error(`Atlas Cloud: ${message}`), { status: 400 }); };

export async function validateAtlasVideoAssets({ model, startImage, endImage, images = [], videos = [], audios = [] }, inspect) {
  const seedance = model.startsWith("Seedance");
  const seconds = model === "Seedance 2.5" ? 30 : 15;
  const groups = { image: [startImage, endImage, ...images].filter(Boolean), video: videos, audio: audios };
  for (const [kind, sources] of Object.entries(groups)) {
    let totalSeconds = 0;
    for (const [index, source] of sources.entries()) {
      const asset = await inspect(source);
      const label = `${kind} reference ${index + 1}`;
      if (!asset.mimeType?.startsWith(`${kind}/`)) fail(`${label} is not a ${kind} file.`);
      if (seedance) {
        const maxBytes = (kind === "image" ? 30 : kind === "audio" ? 15 : seconds === 30 ? 200 : 50) * 1024 * 1024;
        if (kind === "image" ? asset.bytes >= maxBytes : asset.bytes > maxBytes) fail(`${label} exceeds the provider's ${maxBytes / 1024 / 1024} MB limit.`);
        if (kind === "image") {
          if (!(asset.width >= 300 && asset.height >= 300 && asset.width <= 6000 && asset.height <= 6000 && asset.width / asset.height >= 0.4 && asset.width / asset.height <= 2.5))
            fail(`${label} needs dimensions between 300 and 6000 pixels and an aspect ratio between 0.4 and 2.5.`);
        } else {
          const types = kind === "video" ? ["video/mp4", "video/quicktime"] : ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"];
          if (!types.includes(asset.mimeType)) fail(`${label} needs ${kind === "video" ? "MP4 or MOV" : "MP3 or WAV"} format.`);
          if (kind === "video" && !(asset.fps >= 24 && asset.fps <= 60)) fail(`${label} needs a frame rate between 24 and 60 fps.`);
        }
      }
      if (kind !== "image") {
        if (!(asset.duration >= 2 && asset.duration <= seconds)) fail(`${label} must be between 2 and ${seconds} seconds.`);
        totalSeconds += asset.duration;
      }
    }
    if (totalSeconds > seconds + 0.01) fail(`The combined ${kind} references exceed ${seconds} seconds. Shorten the references; none have been dropped.`);
  }
}
