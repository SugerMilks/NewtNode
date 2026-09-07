import { appendDictation } from "./voiceConfig.js";

export function parseMyNewtVoiceCommand(transcript) {
  const text = String(transcript || "").trim();
  // Only a final, explicit command clause can submit; never infer approval from prose.
  const match = /(?:^|[.!?;,\n]\s*|\s+(?:and then|and|then)\s+)(?:my newt[, ]+|newt[, ]+)?(?:please\s+)?(start(?: the)? task|run(?: the)? task|begin(?: the)? task|continue(?: the)? task|send(?: the)? note)(?:\s+(?:now|please))?[.!]*$/i.exec(text);
  if (!match) return { text, command: "" };
  const prefix = text.slice(0, match.index).trim();
  const clause = prefix.split(/[.!?\n]/).at(-1);
  if (!/^[.!?\n]/.test(match[0]) && /\b(?:do not|don't|never|wait|hold off|not yet|say|says|said|label|called|named|no)\b/i.test(clause)) return { text, command: "" };
  const command = /^(start|run|begin)/i.test(match[1]) ? "start" : /^continue/i.test(match[1]) ? "continue" : "note";
  return { text: prefix, command };
}

export async function applyMyNewtVoiceTranscript({ transcript, current, target, terminal, busy, setDraft, clearDraft, control }) {
  const { text, command } = parseMyNewtVoiceCommand(transcript);
  const draft = appendDictation(current, text);
  setDraft(draft);
  if (!command) return "";
  const action = target === "brief" && terminal && command === "start" ? "start"
    : target === "note" && terminal && ["start", "continue"].includes(command) ? "continue"
      : target === "note" && !terminal && command === "note" ? "note" : "";
  if (!action) return "Direction saved. Use the task controls for this action; voice cannot approve or resume a pending task.";
  if (!draft.trim()) return "Add a task brief or direction before submitting.";
  if (busy || !control) return "Direction saved. Wait for the current action to finish, then try again.";
  if (!await control(action, draft)) return "Direction saved. The task was not submitted; check the task message before retrying.";
  if (action === "note") clearDraft?.(draft);
  return "";
}
