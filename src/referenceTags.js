export function cleanReferenceTag(value) {
  return String(value || "")
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 28);
}

export function promptHasReferenceTag(prompt, tag) {
  const cleanTag = cleanReferenceTag(tag);
  if (!cleanTag) return false;
  return new RegExp(`@${escapeRegExp(cleanTag)}(?![A-Za-z0-9_-])`, "i").test(String(prompt || ""));
}

export function taggedReferenceLabel(prompt, value, fallback = "") {
  const tag = cleanReferenceTag(value);
  return tag && promptHasReferenceTag(prompt, tag) ? `@${tag}` : fallback;
}

export function resolveTaggedImageReferences(prompt, values = []) {
  const tags = new Map();
  values.forEach((value) => {
    const tag = cleanReferenceTag(value);
    if (tag) tags.set(tag.toLowerCase(), tag);
  });

  return [...tags.values()].reduce((text, tag) => {
    const pattern = new RegExp(`@${escapeRegExp(tag)}(?![A-Za-z0-9_-])`, "gi");
    const replacement = `the connected image reference labeled "@${tag}"`;
    return text.replace(pattern, (_match, offset) => (
      offset === 0
        ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`
        : replacement
    ));
  }, String(prompt || ""));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
