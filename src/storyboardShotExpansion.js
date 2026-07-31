const storyboardMaxFrames = 35;

function normalizedCutText(value = "") {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function storyboardDirectorCuts(shotList = "") {
  const source = normalizedCutText(shotList);
  if (!source) return [];

  const matches = [...source.matchAll(/\bCUT\s+(\d+)\b/gi)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index ?? source.length;
    return {
      number: Math.max(1, Number.parseInt(match[1], 10) || index + 1),
      text: source.slice(start, end).trim()
    };
  });
}

export function storyboardKeyframeCountForCut(cutText = "") {
  const text = normalizedCutText(cutText).toLowerCase();
  if (!text) return 1;

  const transitionCount = (text.match(/\b(?:then|before|after|until|finally|eventually|next|continues?|transitions?|shifts?|changes?)\b/g) || []).length;
  const cameraMoveCount = (text.match(/\b(?:pan(?:s|ning)?|tilt(?:s|ing)?|doll(?:y|ies|ying)|track(?:s|ing)?|crane(?:s|ing)?|orbit(?:s|ing)?|zoom(?:s|ing)?|push(?:es|ing)?|pull(?:s|ing)?|rise(?:s|n|ing)?|ascend(?:s|ing)?|descend(?:s|ing)?|move(?:s|ment|ing)?|travel(?:s|ing)?|sweep(?:s|ing)?|reveal(?:s|ing)?)\b/g) || []).length;
  const destinationCount = (text.match(/\b(?:bird'?s[- ]eye|overhead|top[- ]down|aerial|above the clouds?|through the clouds?|ground level|worm'?s[- ]eye|extreme wide|extreme close|close[- ]?up|wide view|entire (?:field|room|location|landscape))\b/g) || []).length;
  const explicitRange = /\bfrom\b[\s\S]{0,100}\bto\b/.test(text);
  const multiStageMove = cameraMoveCount >= 2 || (cameraMoveCount >= 1 && (transitionCount >= 1 || destinationCount >= 1 || explicitRange));

  let count = 1;
  if (transitionCount >= 1 || multiStageMove) count += 1;
  if (transitionCount >= 2 || destinationCount >= 2 || (cameraMoveCount >= 2 && explicitRange)) count += 1;
  return Math.min(4, count);
}

export function storyboardDirectorFramePlan(shotList = "", maxFrames = storyboardMaxFrames) {
  const cuts = storyboardDirectorCuts(shotList).slice(0, storyboardMaxFrames);
  if (!cuts.length) {
    return {
      cutCount: 0,
      frameCount: 0,
      cuts: []
    };
  }

  const safeMax = Math.max(cuts.length, Math.min(storyboardMaxFrames, Number.parseInt(maxFrames, 10) || storyboardMaxFrames));
  const plannedCuts = cuts.map((cut) => ({
    ...cut,
    frameCount: storyboardKeyframeCountForCut(cut.text)
  }));

  let frameCount = plannedCuts.reduce((total, cut) => total + cut.frameCount, 0);
  while (frameCount > safeMax) {
    const reducible = [...plannedCuts]
      .filter((cut) => cut.frameCount > 1)
      .sort((left, right) => right.frameCount - left.frameCount || right.number - left.number)[0];
    if (!reducible) break;
    reducible.frameCount -= 1;
    frameCount -= 1;
  }

  return {
    cutCount: plannedCuts.length,
    frameCount,
    cuts: plannedCuts
  };
}

export function storyboardDirectorExpansionInstruction(shotList = "", maxFrames = storyboardMaxFrames) {
  const plan = storyboardDirectorFramePlan(shotList, maxFrames);
  if (!plan.cutCount) return "";

  const budget = plan.cuts
    .map((cut) => {
      const phases = cut.frameCount === 1
        ? "key visual"
        : cut.frameCount === 2
          ? "opening, end"
          : cut.frameCount === 3
            ? "opening, transition, end"
            : "opening, transition 1, transition 2, end";
      const phaseNotes = phases
        .split(", ")
        .map((phase) => `CUT ${cut.number} · ${phase}`)
        .join(", ");
      return `CUT ${cut.number}: ${cut.frameCount} storyboard frame${cut.frameCount === 1 ? "" : "s"} (${phaseNotes})`;
    })
    .join("\n");

  return `FILM DIRECTOR SHOT-TO-FRAME PLAN:
The connected Film Director contains ${plan.cutCount} CUT${plan.cutCount === 1 ? "" : "s"}. A CUT is one continuous shot, not necessarily one storyboard frame.
Preserve every CUT and its order. Create at least one storyboard frame for every CUT.
Use multiple sequential keyframes inside one CUT whenever its subject action, blocking, camera position, framing, angle, altitude, scale, or reveal changes materially.
For a complex continuous move, show the opening composition, each necessary transition or action beat, and the final composition. For example, a child playing soccer, a move to a bird's-eye view of the field, and a rise above the clouds requires at least three frames within the same CUT.
Do not invent extra CUTS merely because a shot receives multiple frames. Keep those frames grouped together and identify their source in notes as "CUT N · opening", "CUT N · transition", or "CUT N · end".
Simple static shots with one visual state should remain one frame. Use no more than ${Math.min(storyboardMaxFrames, maxFrames)} frames total.

Recommended keyframe budget:
${budget}

Connected Film Director shot list:
${normalizedCutText(shotList)}`;
}
