import sharp from "sharp";

// Allocate the source alpha across overlapping children rather than multiplying each
// child independently, which would thicken semi-transparent edges when composited.
export function confineLayerAlpha(pixels, source, remaining, opacity = 1) {
  for (let p = 0, i = 3; i < pixels.length; p++, i += 4) {
    const alpha = source[i] / 255 * opacity;
    const original = pixels[i] / 255;
    const visible = remaining[p] * original;
    const available = 1 - alpha * (1 - remaining[p]);
    pixels[i] = available > 0 ? Math.round(255 * alpha * visible / available) : 0;
    remaining[p] *= 1 - original;
  }
  return pixels;
}

export async function prepareIsolatedLayer(source, limit) {
  if (source.width * source.height * (limit + 1) > 128000000) throw new Error("This layer is too large for the chosen layer limit. Use fewer layers.");
  const factor = Math.max(1, Math.sqrt(262144 / (source.width * source.height)));
  const buffer = await sharp(source.buffer).resize(Math.ceil(source.width * factor), Math.ceil(source.height * factor), { fit: "fill" }).png().toBuffer();
  return { ...source, buffer };
}
