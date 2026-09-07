import { LoaderCircle, Mic, Square } from "lucide-react";

export function MyNewtVoiceButton({ voice, disabled }) {
  const processing = voice.phase === "transcribing";
  const recording = voice.phase === "recording";
  const requesting = voice.phase === "requesting";
  return <button type="button"
    className={`my-newt-icon my-newt-mic ${voice.phase === "recording" ? "is-recording" : ""}`}
    aria-label={recording ? "Stop listening to My Newt" : requesting ? "Cancel microphone request" : "Speak to My Newt"}
    aria-pressed={recording || requesting}
    title="Click to speak; click again to finish. Stops after 3 seconds of silence (8 seconds if you have not spoken). End with 'Start task', 'Run task', or 'Begin task' to submit; otherwise your words stay as a draft. 'Send note' submits additional direction; 'Continue task' starts a follow-up. Approvals remain manual. Esc cancels. Uses your enabled OpenAI key (estimated $0.0045/minute, separate from the task budget; two-minute limit). Audio is sent to OpenAI and is not saved in your project."
    disabled={disabled || processing}
    onPointerDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => { if ([" ", "Enter"].includes(event.key)) { event.stopPropagation(); if (event.repeat) event.preventDefault(); } }}
    onKeyUp={(event) => { if ([" ", "Enter"].includes(event.key)) event.stopPropagation(); }}
    onClick={(event) => {
      event.stopPropagation();
      if (disabled || processing) return;
      if (requesting) voice.cancel();
      else if (recording) voice.release();
      else void voice.start();
    }}
    onContextMenu={(event) => event.preventDefault()}
  >{processing || requesting ? <LoaderCircle size={17} className="my-newt-mic-spinner" /> : recording ? <Square size={17} /> : <Mic size={17} />}</button>;
}
