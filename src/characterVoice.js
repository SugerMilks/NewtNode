import { isSeedance25Model, seedance25ReferenceLimits } from "./seedance25.js";

export const characterDialoguePrompt = "Use the provided dialogue audio file for the character and make sure the dialogue is seamlessly and realistically integrated into the scene with professional mixing techniques.";
export const characterVoiceReferenceHelp = "The selected audio travels with the Character output to Director and supported video models; no separate audio connection is needed. Off: use the recording as dialogue. On: Seedance uses the recording as a guide to this character's voice, while the video or Director prompt supplies the words. Use a clear, single-speaker sample you have permission to use. Voice similarity is not guaranteed.";

export function characterVoicePromptForSource(source, audioIndex, imageTag = "") {
  if (!Number.isInteger(audioIndex) || audioIndex < 1) return "";
  const data = source?.data || {};
  if (data.characterVoiceReferenceOnly !== true) {
    return `${data.compiledVoicePrompt || characterDialoguePrompt} Use the dialogue reference labeled @Audio${audioIndex} for this character.`;
  }
  const name = String(data.characterName || data.title || "Character").replace(/@/g, "").trim();
  const identity = imageTag ? ` The character ${JSON.stringify(name)} is the subject in the image reference @${imageTag}.` : "";
  return `VOICE REFERENCE ONLY for the character ${JSON.stringify(name)}: Use @Audio${audioIndex} only as a reference for this character's vocal identity: timbre, pitch range, accent, and vocal texture.${identity} Speak only the dialogue assigned to this character in the written video prompt or Director scene; those written words are authoritative. Do not repeat, transcribe, or continue the sample's words, and do not copy its background sounds, music, or exact timing. Adapt the delivery, emotion, and timing to the written scene with natural synchronized speech and professional mixing. Do not apply this voice to other characters or invent dialogue when none is written for this character.`;
}

export function characterVoiceReferenceInputs(incoming = {}) {
  const sources = [
    ...(incoming.characterIn || []),
    ...(incoming.referenceAudioIn || []).filter(({ edge }) => edge?.from?.port === "voiceOut")
  ];
  const seen = new Set();
  return sources.flatMap(({ source }) => {
    const data = source?.data;
    if (source?.type !== "character" || !data?.locked || !data.activated || data.characterVoiceReferenceOnly !== true || seen.has(source.id)) return [];
    const voice = (data.characterVoices || []).find(item => item.id === data.activeVoiceId);
    if (!voice?.localUrl) return [];
    seen.add(source.id);
    return [{ source, url: voice.localUrl }];
  });
}

export function directCharacterVoiceReferencePrompts(incoming, audioUrls) {
  const characterIds = new Set((incoming.characterIn || []).map(({ source }) => source.id));
  return characterVoiceReferenceInputs({ referenceAudioIn: incoming.referenceAudioIn })
    .filter(({ source }) => !characterIds.has(source.id))
    .map(({ source, url }) => characterVoicePromptForSource(source, audioUrls.indexOf(url) + 1))
    .filter(Boolean);
}

export function validateCharacterVoiceReferences({ inputs = [], model, audioUrls, generateAudio, startFrames, endFrames, usesMusic }) {
  // Music Video intentionally owns all audio; preserve that existing policy.
  if (!inputs.length || usesMusic) return;
  if (!/^Seedance 2(?:\.0|\.5)?(?: Fast)?$/i.test(String(model || "").trim())) {
    throw new Error("Character Voice Reference Only requires Seedance 2 or 2.5. Choose Seedance or turn off Voice Reference Only on the connected Character node.");
  }
  if (!generateAudio) throw new Error("Turn on Generate Audio (or enable audio in Director) to use Character Voice Reference Only.");
  if (startFrames.length || endFrames.length) {
    throw new Error("Character voice references need reference-to-video. Move Start/End Frame images to Reference Images so the voice is not ignored.");
  }
  const limit = isSeedance25Model(model) ? seedance25ReferenceLimits.audio : 3;
  if (inputs.some(({ url }) => !audioUrls.includes(url)) || audioUrls.length > limit) {
    throw new Error(`Character voice references must be included in Reference Audio, with no more than ${limit} total audio files. No generation has been submitted.`);
  }
}
