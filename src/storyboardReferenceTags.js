import { cleanReferenceTag } from "./referenceTags.js";

const key = reference => `${reference.type || ""}:${reference.nodeId || reference.tag}`;
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function storyboardReferenceMentions(value, references = []) {
  const text = String(value || "");
  const aliases = new Map();
  for (const reference of references) {
    const tag = cleanReferenceTag(reference.tag);
    if (!tag) continue;
    for (const alias of new Set([`@${tag}`, tag, String(reference.name || "").trim()].filter(Boolean))) {
      const lower = alias.toLowerCase();
      if (!aliases.has(lower)) aliases.set(lower, new Map());
      aliases.get(lower).set(key(reference), reference);
    }
  }
  if (!aliases.size) return [];
  // Consume whole explicit tags and longest names, including ambiguous ones, so a
  // shorter alias cannot color part of another identity or an unknown @tag.
  const names = [...aliases.keys()].filter(alias => !alias.startsWith("@"))
    .sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_@-])(?:@[\\p{L}\\p{N}_-]+|(?:${names.join("|")}))(?![\\p{L}\\p{N}_-])`, "giu");
  const mentions = [];
  for (const match of text.matchAll(pattern)) {
    const owners = aliases.get(match[0].toLowerCase());
    if (owners?.size !== 1) continue;
    mentions.push({ start: match.index, end: match.index + match[0].length, text: match[0], reference: [...owners.values()][0] });
  }
  return mentions;
}

export function storyboardReferenceTagMatches(value, references = []) {
  const mentions = storyboardReferenceMentions(value, references);
  const unique = new Map();
  for (const reference of references) {
    const ranges = mentions.filter(mention => key(mention.reference) === key(reference));
    if (ranges.length) unique.set(key(reference), { ...reference, mentions: ranges });
  }
  return [...unique.values()];
}

export function storyboardReferenceHighlightParts(value, references) {
  const text = String(value || ""), parts = [];
  let end = 0;
  for (const mention of references.flatMap(reference => reference.mentions || []).sort((a, b) => a.start - b.start)) {
    if (mention.start < end || text.slice(mention.start, mention.end) !== mention.text) continue;
    if (mention.start > end) parts.push({ text: text.slice(end, mention.start), active: false });
    parts.push({ text: mention.text, active: true, color: mention.reference.color });
    end = mention.end;
  }
  if (end < text.length || !parts.length) parts.push({ text: text.slice(end), active: false });
  return parts;
}

export function tagStoryboardReferences(value, references, maxLength = 1400) {
  const text = String(value || "");
  let result = "", end = 0;
  for (const mention of storyboardReferenceMentions(text, references)) {
    result += text.slice(end, mention.start) + (mention.text.startsWith("@") ? mention.text : `@${cleanReferenceTag(mention.reference.tag)}`);
    end = mention.end;
  }
  result += text.slice(end);
  // Tagging must never make a valid authored shot too long to plan.
  return result.length <= maxLength ? result : text;
}
