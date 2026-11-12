import path from "node:path";
import { constants } from "node:fs";
import { access, copyFile, lstat, realpath, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export function normalizeEditorExportPath(value) {
  if (typeof value !== "string" || !value.trim() || /[\0\r\n]/.test(value) || !path.isAbsolute(value)) throw new Error("Choose an absolute save path for the MP4 export.");
  const extension = path.extname(value);
  if (extension && extension.toLowerCase() !== ".mp4") throw new Error("Save the edited sequence with an .mp4 extension.");
  return path.resolve(extension ? value : `${value}.mp4`);
}

async function existingFile(filePath) {
  try {
    const info = await lstat(filePath);
    if (!info.isFile()) throw new Error("Choose a file, not a folder or symbolic link.");
    return { dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs };
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function prepareEditorExport(filePath, sources) {
  return prepareFileExport(normalizeEditorExportPath(filePath), sources, "timeline source file");
}

// File-type validation belongs to the caller; source and destination protection is shared.
export async function prepareFileExport(normalized, sources, sourceLabel = "source file") {
  const directory = await realpath(path.dirname(normalized));
  await access(directory, constants.W_OK);
  const target = path.join(directory, path.basename(normalized)), before = await existingFile(target);
  for (const source of sources) {
    const sourcePath = await realpath(source.filePath);
    const sourceInfo = await lstat(sourcePath);
    if (sourcePath === target || (before && before.dev === sourceInfo.dev && before.ino === sourceInfo.ino)) throw new Error(`Choose a different name or folder. An export must not replace a ${sourceLabel}.`);
  }
  return { filePath: target, before };
}

export async function saveEditorExport(sourcePath, destination, { signal } = {}) {
  // Stage beside the chosen file so a failed/canceled copy never replaces a good export.
  const temporary = path.join(path.dirname(destination.filePath), `.newtnode-export-${randomUUID()}.tmp`);
  try {
    signal?.throwIfAborted();
    await copyFile(sourcePath, temporary, constants.COPYFILE_EXCL);
    signal?.throwIfAborted();
    if (JSON.stringify(await existingFile(destination.filePath)) !== JSON.stringify(destination.before)) throw new Error("The destination changed during rendering. Choose the save path again to avoid overwriting it.");
    await rename(temporary, destination.filePath);
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
