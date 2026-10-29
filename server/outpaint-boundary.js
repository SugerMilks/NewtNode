export function overlapBlendFilters({ w, h, sw, sh, x, y, feather }) {
  const edges = [x > 0 ? `X-${x}` : null, x + sw < w ? `${x + sw - 1}-X` : null, y > 0 ? `Y-${y}` : null, y + sh < h ? `${y + sh - 1}-Y` : null].filter(Boolean);
  const inside = `between(X,${x},${x + sw - 1})*between(Y,${y},${y + sh - 1})`;
  const inward = edges.length ? edges.reduce((a, b) => `min(${a},${b})`) : "0";
  const a = `min(1,max(0,${inward})/${feather})`;
  const weight = feather > 0 && edges.length ? `${inside}*(${a})*(${a})*(3-2*(${a}))` : inside;
  // maskedmerge preserves 4:4:4 ten-bit planes on FFmpeg 6 as well as newer
  // releases, unlike overlay's version-specific yuv444p10 output option.
  return [
    `[bg]format=yuv444p10le,split[background][maskbase]`,
    `[source]format=yuv444p10le,pad=${w}:${h}:${x}:${y}:black[plate]`,
    `[maskbase]geq=lum='1023*(${weight})':cb='1023*(${weight})':cr='1023*(${weight})'[mask]`,
    `[background][plate][mask]maskedmerge=planes=7[out]`
  ];
}
