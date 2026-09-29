import path from "node:path";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, lstat, stat, realpath, mkdir, mkdtemp, open, opendir, link, rename, unlink, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";

export const outputLimits = Object.freeze({ items: 100, jobs: 200, concurrent: 2, inspections: 4,
  sourceBytes: 20 * 1024 ** 3, pixels: 100000000, seconds: 86400, collisions: 10000, receipts: 2000, receiptBytes: 8 * 1024 ** 2 });
const types = ["image", "video", "audio"];
const formats = { image: ["original", "png", "jpeg", "webp"], video: ["original", "mp4", "mov"], audio: ["original", "wav", "mp3"] };
const badChars = /[\x00-\x1f\x7f<>:"|?*\\/]/;
const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const sameVersion = (a, b) => sameFile(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const inside = (root, file) => { const rel = path.relative(root, file); return rel && !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel); };
const canceled = signal => signal?.throwIfAborted();

export function outputError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function outputFileError(error) {
  if (["ENOENT", "ENODEV", "ENXIO", "ESTALE", "EIO", "ENOTCONN"].includes(error.code)) return "The source or destination is unavailable. Reconnect an offline drive and choose the folder again. Paths must exist on the computer running the NewtNode server, not just in a remote browser.";
  if (["EACCES", "EPERM", "EROFS"].includes(error.code)) return "NewtNode cannot write to or read this location. Check folder permissions, read-only drives, and server access, then choose the folder again.";
  if (["ENOSPC", "EDQUOT"].includes(error.code)) return "The destination drive is full or its quota was reached. Free space and retry the failed items with a new request ID.";
  return error.message || "The local export failed.";
}

function basename(value, label = "Output name") {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || badChars.test(value) || /[. ]$/.test(value)
    || value === "." || value === ".." || reserved.test(value) || Buffer.byteLength(value) > 160) throw outputError(`${label} must be a plain file/folder name (no separators, reserved names, trailing dots, or control characters).`);
  return value;
}

export function validateOutputUrl(url) {
  if (typeof url !== "string" || url.length > 4096 || !/^\/(uploads|outputs|workflow-assets)\//.test(url) || /[?#\x00-\x20\\]/.test(url)) throw outputError("Use a managed image, video, or audio URL from NewtNode uploads, outputs, or a registered workflow package.");
  let decoded;
  try { decoded = decodeURIComponent(url); } catch { throw outputError("The managed source URL is malformed."); }
  if (/[\x00-\x1f\x7f\\:?#]/.test(decoded) || /%(?:2e|2f|5c|00)/i.test(decoded)
    || decoded.slice(1).split("/").some(part => !part || part === "." || part === "..")) throw outputError("The managed source URL contains an unsafe path.");
  return decoded;
}

// Unlike the general asset resolver, this adapter never downloads or repairs missing assets.
export function createOutputAssetResolver({ uploadsDir, outputsDir, findRegisteredWorkflowPackage }) {
  return async url => {
    const [, group, ...parts] = validateOutputUrl(url).split("/");
    let root = group === "uploads" ? uploadsDir : outputsDir;
    if (group === "workflow-assets") {
      const workflow = await findRegisteredWorkflowPackage(parts.shift());
      root = workflow?.packagePath;
      if (!["inputs", "outputs", "dependencies"].includes(parts[0])) throw outputError("Choose media inside a registered workflow's inputs, outputs, or dependencies.");
    }
    if (!root) throw outputError("This source's workflow or storage location is unavailable. Open its workflow on the server computer and reconnect the source.");
    const base = await realpath(root), filePath = await realpath(path.join(base, ...parts));
    if (!inside(base, filePath)) throw outputError("The source resolves outside its managed media directory.");
    return { filePath };
  };
}

export function normalizeOutputDestinations(raw, requestedTypes) {
  if (!Array.isArray(requestedTypes) || !requestedTypes.length || requestedTypes.length > 3 || requestedTypes.some(type => !types.includes(type))) throw outputError("Choose one or more media types: image, video, audio.");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw outputError("Choose a destination folder for each connected media type.");
  const result = {};
  for (const type of new Set(requestedTypes)) {
    const value = raw[type];
    if (!value || typeof value.path !== "string" || !path.isAbsolute(value.path) || /[\x00-\x1f\x7f]/.test(value.path) || value.path.length > 4096) throw outputError(`Choose an absolute ${type} destination folder on the computer running the NewtNode server. A path on a remote browser's computer is not a server path.`);
    const subfolder = value.subfolder ?? "";
    if (typeof subfolder !== "string" || subfolder.length > 1024 || path.posix.isAbsolute(subfolder) || path.win32.isAbsolute(subfolder)) throw outputError("Subfolders must be relative to the selected destination.");
    const parts = subfolder ? subfolder.split(/[\\/]/) : [];
    if (parts.length > 16) throw outputError("Use at most 16 nested export subfolders.");
    for (const part of parts) basename(part, "Subfolder");
    const format = value.format ?? "original", quality = value.quality ?? (type === "image" ? 90 : "high");
    if (!formats[type].includes(format)) throw outputError(`Unsupported ${type} export format. Choose ${formats[type].join(", ")}.`);
    if (type === "image" ? (!Number.isInteger(quality) || quality < 1 || quality > 100) : !["high", "standard"].includes(quality)) throw outputError(type === "image" ? "Image quality must be an integer from 1 to 100." : `${type} quality must be high or standard.`);
    result[type] = { path: path.resolve(value.path), subfolder: parts.join(path.sep), format, quality };
  }
  return result;
}

export function normalizeOutputRequest(body) {
  if (!body || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) throw outputError("A valid UUID requestId is required for this export.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > outputLimits.items) throw outputError(`Export between 1 and ${outputLimits.items} items at a time.`);
  const items = body.items.map(item => {
    if (!item || !types.includes(item.type)) throw outputError("Each export item must have an image, video, or audio type.");
    validateOutputUrl(item.url);
    return { url: item.url, type: item.type, name: basename(item.name) };
  });
  const destinations = normalizeOutputDestinations(body.destinations, [...new Set(items.map(item => item.type))]);
  const collision = body.collision ?? "number";
  if (!["number", "skip"].includes(collision)) throw outputError("Collision handling must be number or skip. Output never overwrites existing files.");
  // Normalize key order for retries; context does not change the filesystem operation.
  return { requestId: body.requestId.toLowerCase(), items, destinations: Object.fromEntries(types.filter(type => destinations[type]).map(type => [type, destinations[type]])), collision };
}

async function pinDirectory(directory) {
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw outputError("An export folder is a symbolic link or not a directory. Choose a real folder without linked subfolders.");
  if (path.resolve(await realpath(directory)) !== path.resolve(directory)) throw outputError("An export subfolder resolves through a symbolic link. Choose a real folder.");
  return { path: directory, dev: info.dev, ino: info.ino };
}

async function checkPins(pins) {
  for (const pin of pins) {
    const current = await pinDirectory(pin.path);
    if (!sameFile(pin, current)) throw outputError("The destination folder changed during export. Choose the folder again; no existing file was replaced.");
  }
}

async function locatePinnedDirectory(pins) {
  // A rename inside the same parent must not strand our private staging directory.
  // Only recover matching directory identities, never traverse a replacement symlink.
  let parent = path.dirname(pins[0].path);
  await pinDirectory(parent);
  for (const pin of pins) {
    let found;
    const expected = path.join(parent, path.basename(pin.path));
    try { if (sameFile(pin, await pinDirectory(expected))) found = expected; } catch { /* Try a renamed sibling. */ }
    if (!found) {
      let count = 0;
      for await (const entry of await opendir(parent)) {
        if (++count > 1024) break;
        if (!entry.isDirectory()) continue;
        const candidate = path.join(parent, entry.name);
        try { if (sameFile(pin, await pinDirectory(candidate))) { found = candidate; break; } } catch { /* Never follow replaced entries. */ }
      }
    }
    if (!found) throw outputError("The export folder moved; its private staging files could not be located safely for cleanup.");
    parent = found;
  }
  return parent;
}

export async function inspectOutputDestination(destination, { create = false, signal, expected } = {}) {
  canceled(signal);
  const selected = await lstat(destination.path);
  if (selected.isSymbolicLink() || !selected.isDirectory()) throw outputError("Choose an existing directory, not a file or symbolic link.");
  const root = await realpath(destination.path), pins = [await pinDirectory(root)];
  if (expected) await checkPins(expected.pins);
  if (expected && !sameFile(expected.pins[0], pins[0])) throw outputError("The selected destination changed. Choose the folder again.");
  let directory = root, missing = false;
  await access(root, constants.W_OK | constants.X_OK);
  for (const part of destination.subfolder ? destination.subfolder.split(path.sep) : []) {
    canceled(signal);
    directory = path.join(directory, part);
    if (missing) continue;
    try { pins.push(await pinDirectory(directory)); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) { missing = true; continue; }
      await checkPins(pins);
      try { await mkdir(directory); } catch (mkdirError) { if (mkdirError.code !== "EEXIST") throw mkdirError; }
      pins.push(await pinDirectory(directory));
    }
    await access(directory, constants.W_OK | constants.X_OK);
  }
  await checkPins(pins);
  return { ...destination, path: root, directory, missingSubfolder: missing, pins };
}

export async function validateOutputDestinations(raw, requestedTypes) {
  const normalized = normalizeOutputDestinations(raw, requestedTypes), destinations = {};
  for (const [type, destination] of Object.entries(normalized)) {
    const { pins, ...info } = await inspectOutputDestination(destination);
    destinations[type] = { ...info, writable: true };
  }
  return { valid: true, destinations };
}

// Wait for close, including on abort, so cleanup cannot race a still-running encoder.
export function runOutputProcess(binary, args, { signal, timeoutMs = 30000, onProgress = () => {} } = {}) {
  canceled(signal);
  return new Promise((resolve, reject) => {
    let child, stdout = "", stderr = "", pending = "", failure, timer, killTimer;
    const stop = error => { failure ||= error; child?.kill("SIGTERM"); killTimer ||= setTimeout(() => child?.kill("SIGKILL"), 1000); killTimer.unref(); };
    const abort = () => stop(outputError("Export canceled."));
    try { child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { reject(error); return; }
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    timer = setTimeout(() => stop(outputError("Local media processing took too long. Check the source and destination drive, then retry failed items.")), timeoutMs); timer.unref();
    child.stdout.on("data", data => {
      stdout += data;
      if (stdout.length > 2 * 1024 * 1024) { stop(outputError("Media inspection exceeded its output limit.")); stdout = stdout.slice(-6000); }
      pending += data;
      const lines = pending.split("\n"); pending = lines.pop().slice(-6000);
      for (const line of lines) if (line.startsWith("out_time_us=")) onProgress(Number(line.slice(12)) / 1000000);
    });
    child.stderr.on("data", data => { stderr = (stderr + data).slice(-6000); });
    child.on("error", error => {
      failure = error.code === "ENOENT" ? outputError(`The local command ${path.basename(String(binary))} is unavailable on this server. Check the bundled FFmpeg/FFprobe installation or desktop file-manager availability.`) : error;
    });
    child.on("close", code => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener("abort", abort);
      if (failure || code !== 0) reject(failure || outputError(`Local FFmpeg/FFprobe could not process this media. ${stderr.trim() || `Exit code ${code}.`}`));
      else resolve(stdout);
    });
  });
}

async function signature(filePath) {
  const handle = await open(filePath, "r");
  try {
    const data = Buffer.alloc(4096), { bytesRead } = await handle.read(data, 0, data.length, 0), bytes = data.subarray(0, bytesRead);
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { image: "png" };
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { image: "jpeg" };
    if (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))) return { image: "gif" };
    if (["II*\0", "MM\0*"].includes(bytes.toString("ascii", 0, 4))) return { image: "tiff" };
    const riff = bytes.toString("ascii", 0, 4), kind = bytes.toString("ascii", 8, 12);
    if (riff === "RIFF" && kind === "WEBP") return { image: "webp" };
    if (["RIFF", "RF64"].includes(riff) && kind === "WAVE") return { demuxer: "wav", extension: ".wav" };
    if (riff === "RIFF" && kind === "AVI ") return { demuxer: "avi", extension: ".avi" };
    if (bytes.toString("ascii", 4, 8) === "ftyp") {
      const size = Math.min(bytes.readUInt32BE(0), bytes.length), brands = [];
      for (let i = 8; i + 4 <= size; i += 4) if (i !== 12) brands.push(bytes.toString("ascii", i, i + 4));
      if (brands.some(brand => ["avif", "avis"].includes(brand))) return { image: "heif", extension: ".avif" };
      if (brands.some(brand => ["heic", "heix", "hevc", "hevx", "mif1"].includes(brand))) throw outputError("This HEIF variant is not supported for Output. Import a PNG, JPEG, WebP, or AVIF source.");
      return { demuxer: "mov", extension: brands.includes("qt  ") ? ".mov" : ".mp4" };
    }
    if (["moov", "mdat", "wide", "free"].includes(bytes.toString("ascii", 4, 8))) return { demuxer: "mov", extension: ".mov" };
    if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { demuxer: "matroska", extension: bytes.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])) ? ".webm" : ".mkv" };
    if (riff === "fLaC") return { demuxer: "flac", extension: ".flac" };
    if (riff === "OggS") return { demuxer: "ogg", extension: ".ogg" };
    if (bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)) return { demuxer: "mp3", extension: ".mp3" };
    if (bytes[0] === 255 && (bytes[1] & 0xf6) === 0xf0) return { demuxer: "aac", extension: ".aac" };
    throw outputError("This is not a supported image, video, or audio file. Renaming a file does not convert its media type.");
  } finally { await handle.close(); }
}

export async function probeOutputMedia(filePath, ffprobePath, { signal } = {}) {
  canceled(signal);
  const detected = await signature(filePath);
  if (detected.image) {
    const info = await sharp(filePath, { limitInputPixels: outputLimits.pixels, failOn: "error" }).metadata();
    if (info.format !== detected.image || !info.width || !info.height) throw outputError("The image contents are invalid or do not match their container.");
    // Force a pixel decode as well as a header read, including in Original mode.
    await sharp(filePath, { limitInputPixels: outputLimits.pixels, failOn: "error" }).stats();
    canceled(signal);
    return { type: "image", extension: detected.extension || ({ jpeg: ".jpg", tiff: ".tiff" }[info.format] || `.${info.format}`), width: info.width, height: info.height, pages: info.pages || 1 };
  }
  const data = JSON.parse(await runOutputProcess(ffprobePath, ["-v", "error", "-protocol_whitelist", "file", "-f", detected.demuxer,
    "-show_format", "-show_streams", "-of", "json", filePath], { signal }));
  const video = data.streams?.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
  const audio = data.streams?.find(stream => stream.codec_type === "audio");
  const duration = Number(data.format?.duration || video?.duration || audio?.duration);
  if ((!video && !audio) || !Number.isFinite(duration) || duration <= 0 || duration > outputLimits.seconds) throw outputError("The file has no valid playable media, or exceeds the 24-hour local export limit.");
  if (video && (!video.width || !video.height || video.width * video.height > outputLimits.pixels)) throw outputError("The video's frame dimensions are invalid or too large.");
  return { type: video ? "video" : "audio", extension: !video && detected.extension === ".mp4" ? ".m4a" : detected.extension,
    duration, width: video?.width, height: video?.height, videoIndex: video?.index, audioIndex: audio?.index,
    hasAudio: Boolean(audio), demuxer: detected.demuxer };
}

export function buildOutputFfmpegArgs(sourcePath, targetPath, media, destination) {
  const high = destination.quality === "high";
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-protocol_whitelist", "file", "-threads", "2", "-f", media.demuxer, "-i", sourcePath];
  if (media.type === "video") {
    // 4:4:4 handles odd dimensions without padding, cropping, or resizing the picture.
    args.push("-map", `0:${media.videoIndex}`, "-map", "0:a:0?", "-c:v", "libx264", "-preset", "fast", "-crf", high ? "18" : "23",
      "-pix_fmt", media.width % 2 || media.height % 2 ? "yuv444p" : "yuv420p", "-fps_mode", "passthrough", "-c:a", "aac", "-b:a", high ? "256k" : "128k", "-movflags", "+faststart");
  } else {
    args.push("-map", `0:${media.audioIndex}`, "-vn", "-c:a", destination.format === "wav" ? (high ? "pcm_s24le" : "pcm_s16le") : "libmp3lame");
    if (destination.format === "mp3") args.push("-b:a", high ? "320k" : "192k");
  }
  args.push("-threads", "2", "-progress", "pipe:1", "-f", destination.format, targetPath);
  return args;
}

export async function convertOutputMedia(sourcePath, targetPath, media, destination, { ffmpegPath, signal, onProgress } = {}) {
  canceled(signal);
  if (destination.format === "original") {
    const size = (await stat(sourcePath)).size;
    let copied = 0;
    const input = createReadStream(sourcePath);
    input.on("data", chunk => { copied += chunk.length; onProgress?.(copied / size); });
    await pipeline(input, createWriteStream(targetPath, { flags: "wx", mode: 0o600 }), { signal });
  } else if (media.type === "image") {
    if (media.pages > 1) throw outputError("Animated or multi-page images must use Original to retain every frame/page.");
    let image = sharp(sourcePath, { limitInputPixels: outputLimits.pixels, failOn: "error" }).rotate();
    if (destination.format === "jpeg") image = image.flatten({ background: "#ffffff" }).jpeg({ quality: destination.quality });
    else if (destination.format === "webp") image = image.webp({ quality: destination.quality });
    else image = image.png();
    await pipeline(image, createWriteStream(targetPath, { flags: "wx", mode: 0o600 }), { signal });
  } else {
    await runOutputProcess(ffmpegPath, buildOutputFfmpegArgs(sourcePath, targetPath, media, destination), {
      signal, timeoutMs: 2 * 60 * 60 * 1000, onProgress: seconds => onProgress?.(Math.min(0.99, seconds / media.duration)) });
  }
  canceled(signal);
}

export async function publishOutputFile(temporary, target, { signal, pins, linkFile = link, onCopyProgress } = {}) {
  canceled(signal);
  await checkPins(pins);
  try {
    await linkFile(temporary, target);
    return { file: await lstat(temporary) };
  } catch (error) {
    if (!["EXDEV", "ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EPERM"].includes(error.code)) throw error;
  }
  // exFAT and some network drives cannot link. O_EXCL still guarantees no overwrite,
  // but the reserved final name is visible during this fallback copy.
  canceled(signal);
  await checkPins(pins);
  const handle = await open(target, "wx", 0o600);
  let owned, complete = false;
  try {
    owned = await handle.stat();
    const input = createReadStream(temporary, { signal });
    for await (const chunk of input) {
      for (let offset = 0; offset < chunk.length;) {
        canceled(signal);
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        if (!bytesWritten) throw outputError("The destination stopped accepting export bytes. Check the drive and available space.");
        offset += bytesWritten;
      }
      await onCopyProgress?.(chunk.length);
    }
    canceled(signal);
    await handle.sync();
    await checkPins(pins);
    const written = await handle.stat(), current = await lstat(target);
    if (!sameFile(written, current) || !current.isFile()) throw outputError("The destination file changed during export. The replacement was not modified or removed.");
    canceled(signal);
    complete = true;
    return { file: written };
  } finally {
    await handle.close().catch(() => {});
    if (!complete && owned) {
      // Never unlink a replacement file or follow a replaced parent during cleanup.
      const parentIndex = pins.findIndex(pin => pin.path === path.dirname(target));
      await locatePinnedDirectory(pins.slice(0, parentIndex + 1)).then(async directory => {
        const ownedPath = path.join(directory, path.basename(target)), current = await lstat(ownedPath);
        if (current.isFile() && sameFile(current, owned)) await unlink(ownedPath);
      }).catch(() => {});
    }
  }
}

export async function exportOutputItem(item, destination, { resolveAsset, ffprobePath, ffmpegPath, signal, collision = "number", onProgress,
  probe = probeOutputMedia, convert = convertOutputMedia, publish = publishOutputFile, onSaved = () => {} } = {}) {
  canceled(signal);
  validateOutputUrl(item.url);
  const resolved = await resolveAsset(item.url), filePath = resolved?.filePath;
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw outputError("The managed source could not be resolved to a local file.");
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink() || !before.size || before.size > outputLimits.sourceBytes) throw outputError("Choose a regular, nonempty managed media file no larger than 20 GB (not a link or directory).");
  const media = await probe(filePath, ffprobePath, { signal });
  if (media.type !== item.type) throw outputError(`This source contains ${media.type}, but was connected as ${item.type}. Reconnect it to the matching Output input.`);
  canceled(signal);
  const inspected = await inspectOutputDestination(destination, { signal });
  const directory = await inspectOutputDestination(destination, { create: true, expected: inspected, signal });
  const extension = destination.format === "original" ? media.extension : destination.format === "jpeg" ? ".jpg" : `.${destination.format}`;
  if (!/^\.[a-z0-9]{2,5}$/.test(extension)) throw outputError("The source has no supported export extension.");
  const result = target => ({ sourceUrl: item.url, type: item.type, filePath: target, fileName: path.basename(target) });
  const first = path.join(directory.directory, `${item.name}${extension}`);
  if (collision === "skip") {
    try { await lstat(first); return { ...result(first), status: "skipped" }; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  let staging, stagingPin;
  try {
    await checkPins(directory.pins);
    canceled(signal);
    // A private sibling staging directory also keeps converters away from user filenames.
    staging = await mkdtemp(path.join(directory.directory, ".newtnode-output-"));
    stagingPin = await pinDirectory(staging);
    const temporary = path.join(staging, `media${extension}`);
    await checkPins([...directory.pins, stagingPin]);
    await convert(filePath, temporary, media, destination, { ffmpegPath, signal, onProgress });
    canceled(signal);
    await checkPins([...directory.pins, stagingPin]);
    if (!sameVersion(before, await lstat(filePath))) throw outputError("The source changed during export. Reconnect the current source and retry; the original was not modified by Output.");
    const written = await lstat(temporary);
    if (!written.isFile() || !written.size) throw outputError("The converter produced no complete media file.");
    const handle = await open(temporary, "r");
    try { await handle.sync(); } finally { await handle.close(); }
    for (let n = 0; n < outputLimits.collisions; n++) {
      canceled(signal);
      await checkPins([...directory.pins, stagingPin]);
      const target = path.join(directory.directory, `${item.name}${n ? ` (${n})` : ""}${extension}`);
      let publication;
      try {
        // Prefer atomic link; the fallback exclusively owns its final-path file handle.
        publication = await publish(temporary, target, { signal, pins: [...directory.pins, stagingPin] });
      } catch (error) {
        if (error.code === "EEXIST") {
          if (collision === "skip") return { ...result(target), status: "skipped" };
          continue;
        }
        throw error;
      }
      // Publication is the commit point: cancellation after it retains this success.
      onSaved({ filePath: target, file: publication.file, directory: directory.directory, pins: directory.pins });
      return { ...result(target), status: "saved" };
    }
    throw outputError("Too many files share this name. Choose another export name or folder.");
  } finally {
    if (staging && stagingPin) {
      // Never traverse a replaced parent during cleanup.
      await locatePinnedDirectory([...directory.pins, stagingPin]).then(ownedPath => rm(ownedPath, { recursive: true, force: true })).catch(() => {});
    }
  }
}

function serializableReceipt(receipt) {
  const safePath = value => typeof value === "string" && value.length <= 8192 && path.isAbsolute(value) && path.normalize(value) === value && !/[\x00-\x1f\x7f]/.test(value);
  const identity = value => value && ["dev", "ino"].every(key => Number.isInteger(value[key]) && value[key] >= 0);
  if (!receipt || !safePath(receipt.filePath) || !safePath(receipt.directory) || path.dirname(receipt.filePath) !== receipt.directory
    || !identity(receipt.file) || !Number.isFinite(receipt.file.size) || receipt.file.size <= 0 || !Number.isFinite(receipt.file.mtimeMs)
    || !Array.isArray(receipt.pins) || !receipt.pins.length || receipt.pins.length > 17
    || receipt.pins.some((pin, index) => !identity(pin) || !safePath(pin.path) || (index && !inside(receipt.pins[index - 1].path, pin.path)))
    || receipt.pins.at(-1).path !== receipt.directory) throw outputError("The Output receipt ledger contains invalid paths or filesystem identities; it was not overwritten.");
  return { filePath: receipt.filePath, directory: receipt.directory,
    file: { dev: receipt.file.dev, ino: receipt.file.ino, size: receipt.file.size, mtimeMs: receipt.file.mtimeMs },
    pins: receipt.pins.map(pin => ({ path: pin.path, dev: pin.dev, ino: pin.ino })) };
}

async function readReceiptLedger(filePath) {
  let handle;
  try {
    const before = await lstat(filePath);
    if (!before.isFile() || before.isSymbolicLink() || before.size > outputLimits.receiptBytes) throw outputError("The Output receipt ledger is not a regular bounded file; it was not overwritten.");
    handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const info = await handle.stat();
    if (!sameVersion(before, info)) throw outputError("The Output receipt ledger changed while being read; it was not overwritten.");
    let data;
    try { data = JSON.parse(await handle.readFile("utf8")); }
    catch { throw outputError("The Output receipt ledger is unreadable or invalid JSON; it was not overwritten."); }
    if (!data || data.kind !== "newtnode-output-receipts" || data.version !== 1 || !Array.isArray(data.receipts) || data.receipts.length > outputLimits.receipts) throw outputError("The Output receipt ledger is invalid or from an unsupported version; it was not overwritten.");
    return { info, receipts: data.receipts.map(serializableReceipt) };
  } catch (error) {
    if (error.code === "ENOENT") return { info: null, receipts: [] };
    throw error;
  } finally { await handle?.close(); }
}

export function createOutputReceiptStore(receiptStorePath) {
  if (receiptStorePath != null && (typeof receiptStorePath !== "string" || !path.isAbsolute(receiptStorePath))) throw new TypeError("receiptStorePath must be an absolute server-owned ledger path.");
  const receipts = new Map(), pending = new Map();
  let queue = Promise.resolve(), loadWarning = "";
  const remember = (receipt, restored = false) => {
    const clean = serializableReceipt(receipt);
    receipts.delete(clean.filePath); receipts.set(clean.filePath, clean);
    if (!restored) { pending.delete(clean.filePath); pending.set(clean.filePath, clean); }
    while (receipts.size > outputLimits.receipts) receipts.delete(receipts.keys().next().value);
    while (pending.size > outputLimits.receipts) pending.delete(pending.keys().next().value);
  };
  const warning = error => `Files already saved were retained, but Reveal persistence is unavailable. ${outputFileError(error)} Open saved paths manually after a restart; do not re-export just to enable Reveal.`;
  // Restore only the allowlist, never jobs, source URLs, media, or export requests.
  const ready = receiptStorePath ? readReceiptLedger(receiptStorePath).then(data => { for (const receipt of data.receipts) remember(receipt, true); })
    .catch(error => { loadWarning = warning(error); }) : Promise.resolve();
  async function persist() {
    await ready;
    if (loadWarning || !receiptStorePath) return loadWarning;
    let lock, temporary, parentPin;
    const lockPath = `${receiptStorePath}.lock`;
    try {
      await mkdir(path.dirname(receiptStorePath), { recursive: true });
      parentPin = await pinDirectory(await realpath(path.dirname(receiptStorePath)));
      // Serialize across route instances/processes as well as this instance's promise queue.
      for (let attempt = 0; !lock; attempt++) {
        try { lock = await open(lockPath, "wx", 0o600); }
        catch (error) {
          if (error.code !== "EEXIST") throw error;
          if (attempt >= 49) throw outputError(`The Output receipt ledger is locked. When no Output exports are running, remove the stale lock at ${lockPath} and retry a future export; existing saved files are safe.`);
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
      const previous = await readReceiptLedger(receiptStorePath), combined = new Map(previous.receipts.map(receipt => [receipt.filePath, receipt]));
      const updating = [...pending.values()];
      for (const receipt of updating) { combined.delete(receipt.filePath); combined.set(receipt.filePath, receipt); }
      let entries = [...combined.values()].slice(-outputLimits.receipts), serialized;
      do {
        serialized = JSON.stringify({ kind: "newtnode-output-receipts", version: 1, receipts: entries });
        if (Buffer.byteLength(serialized) <= outputLimits.receiptBytes) break;
        entries = entries.slice(Math.max(1, Math.ceil(entries.length / 10)));
      } while (entries.length);
      temporary = path.join(parentPin.path, `.output-receipts-${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(serialized); await handle.sync(); } finally { await handle.close(); }
      await checkPins([parentPin]);
      let current = null;
      try { current = await lstat(receiptStorePath); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (previous.info ? !current || !sameVersion(previous.info, current) : current) throw outputError("The Output receipt ledger changed during persistence; the changed file was not overwritten.");
      if (previous.info) await rename(temporary, receiptStorePath);
      else await link(temporary, receiptStorePath);
      for (const receipt of updating) if (pending.get(receipt.filePath) === receipt) pending.delete(receipt.filePath);
      return "";
    } catch (error) { return warning(error); }
    finally {
      await lock?.close().catch(() => {});
      if (parentPin) await checkPins([parentPin]).then(async () => {
        if (temporary) await rm(temporary, { force: true });
        if (lock) await rm(lockPath, { force: true });
      }).catch(() => {});
    }
  }
  return { ready, remember,
    find: filePath => receipts.get(filePath) || [...receipts.values()].find(receipt => receipt.directory === filePath),
    get loadWarning() { return loadWarning; },
    persist: () => { queue = queue.then(persist, persist); return queue; }
  };
}

export async function verifyOutputReceipt(receipt, filePath) {
  await checkPins(receipt.pins);
  if (filePath === receipt.directory) return { directory: true };
  const info = await lstat(filePath);
  // Hard-link publication and staging unlink change ctime, but not media content or mtime.
  if (!info.isFile() || !sameFile(info, receipt.file) || info.size !== receipt.file.size || info.mtimeMs !== receipt.file.mtimeMs) throw outputError("This saved export has moved or changed. Reveal is only allowed for unchanged files saved by Output.", 403);
  return { directory: false };
}

export function outputRevealCommand(filePath, { directory = false, platform = process.platform } = {}) {
  if (platform === "darwin") return { command: "open", args: directory ? [filePath] : ["-R", filePath] };
  if (platform === "win32") return { command: "explorer.exe", args: directory ? [filePath] : ["/select,", filePath] };
  return { command: "xdg-open", args: [directory ? filePath : path.dirname(filePath)] };
}

export async function revealOutputPath(filePath, options = {}) {
  const { command, args } = outputRevealCommand(filePath, options);
  await runOutputProcess(command, args, { timeoutMs: 15000 });
}
