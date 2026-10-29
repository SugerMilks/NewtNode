// Bounded analysis dimensions; never load production-size clips into memory.
export function matchingGeometry(plan) {
  const width = 192, height = Math.round(width * plan.height / plan.width);
  return { width, height, stride: width * height * 3, source: {
    x: Math.round(plan.left / plan.width * width), y: Math.round(plan.top / plan.height * height),
    width: Math.round(plan.sourceWidth / plan.width * width), height: Math.round(plan.sourceHeight / plan.height * height)
  } };
}
