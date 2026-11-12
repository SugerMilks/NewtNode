import path from "node:path";

export function isDialogCancellation(error, command) {
  if (error?.code === "DIALOG_CANCELED" || error?.code === 2) return true;
  // osascript exits with 1 for both Cancel and real failures; -128 in stderr distinguishes Cancel.
  // Do not inspect the echoed command/message, which can contain user-supplied folder names.
  return path.basename(String(command || "")) === "osascript" && /\(-128\)\s*$/m.test(String(error?.stderr || ""));
}
