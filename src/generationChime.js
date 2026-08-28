let audioContext = null;
let unlockInstalled = false;
let queuedChime = null;

function browserAudioContext() {
  if (typeof globalThis === "undefined") return null;
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    audioContext ||= new AudioContextClass();
  } catch {
    return null;
  }

  return audioContext;
}

function playTone(context, frequency, startsAt, duration, peakGain) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startsAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.02);
}

async function playGenerationCompleteChime() {
  const context = browserAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return;

    const startsAt = context.currentTime + 0.015;
    playTone(context, 659.25, startsAt, 0.15, 0.035);
    playTone(context, 880, startsAt + 0.09, 0.2, 0.03);
  } catch {
    // Sound is a courtesy notification; browser audio restrictions should never affect a generation.
  }
}

const notifyingNodeTypes = new Set([
  "imageModel",
  "videoModel",
  "autoAspect",
  "coverage",
  "utility",
  "storyboard",
  "character",
  "frameIt"
]);

const activeGenerationStatuses = new Set(["running", "compiling"]);

export function shouldNotifyNodeGenerationComplete(previousNode, currentNode) {
  if (!previousNode || !currentNode || previousNode.id !== currentNode.id) return false;
  if (!notifyingNodeTypes.has(currentNode.type)) return false;

  const previousStatus = String(previousNode.data?.status || "");
  const currentStatus = String(currentNode.data?.status || "");
  if (!activeGenerationStatuses.has(previousStatus)) return false;

  return currentStatus === "complete" || (currentNode.type === "character" && currentStatus === "ready");
}

export function notifyGenerationTaskComplete() {
  if (typeof globalThis?.setTimeout !== "function") return;
  if (queuedChime) globalThis.clearTimeout(queuedChime);

  // Nearby node completions share one clean chime instead of producing overlapping tones.
  queuedChime = globalThis.setTimeout(() => {
    queuedChime = null;
    void playGenerationCompleteChime();
  }, 180);
}

export function installGenerationChimeUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;

  const unlock = () => {
    const context = browserAudioContext();
    if (context?.state === "suspended") void context.resume().catch(() => {});
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}
