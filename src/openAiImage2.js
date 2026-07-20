export const openAiImage2Quality = "high";
export const openAiImage2QualityOptions = ["low", "medium", "high"];

export const openAiImage2Costs = {
  low: {
    text: {
      "1K": { landscape: 0.005, square: 0.006, portrait: 0.005 },
      "2K": { landscape: 0.005, square: 0.007, portrait: 0.007 },
      "4K": { landscape: 0.012, square: 0.012, portrait: 0.012 }
    },
    edit: {
      "1K": { landscape: 0.011, square: 0.015, portrait: 0.018 },
      "2K": { landscape: 0.017, square: 0.019, portrait: 0.019 },
      "4K": { landscape: 0.024, square: 0.024, portrait: 0.024 }
    }
  },
  medium: {
    text: {
      "1K": { landscape: 0.037, square: 0.053, portrait: 0.042 },
      "2K": { landscape: 0.04, square: 0.056, portrait: 0.056 },
      "4K": { landscape: 0.101, square: 0.101, portrait: 0.101 }
    },
    edit: {
      "1K": { landscape: 0.043, square: 0.061, portrait: 0.054 },
      "2K": { landscape: 0.053, square: 0.068, portrait: 0.068 },
      "4K": { landscape: 0.113, square: 0.113, portrait: 0.113 }
    }
  },
  high: {
    text: {
      "1K": { landscape: 0.145, square: 0.211, portrait: 0.165 },
      "2K": { landscape: 0.158, square: 0.222, portrait: 0.222 },
      "4K": { landscape: 0.401, square: 0.401, portrait: 0.401 }
    },
    edit: {
      "1K": { landscape: 0.151, square: 0.219, portrait: 0.178 },
      "2K": { landscape: 0.158, square: 0.234, portrait: 0.234 },
      "4K": { landscape: 0.413, square: 0.413, portrait: 0.413 }
    }
  }
};

export const openAiImage2HighCosts = openAiImage2Costs.high;

export function normalizeOpenAiImage2Quality(value, fallback = openAiImage2Quality) {
  const normalized = String(value || "").trim().toLowerCase();
  return openAiImage2QualityOptions.includes(normalized) ? normalized : fallback;
}

export function estimateOpenAiImage2Cost({ resolution, size, quality = openAiImage2Quality, edit = false, pricing = openAiImage2Costs }) {
  const qualityKey = normalizeOpenAiImage2Quality(quality);
  const resolutionKey = normalizeOpenAiImage2Resolution(resolution, size);
  const orientation = openAiImage2Orientation(size);
  const qualityPricing = pricing?.[qualityKey] || openAiImage2Costs[qualityKey];
  const routePricing = qualityPricing?.[edit ? "edit" : "text"];
  return Number(routePricing?.[resolutionKey]?.[orientation] ?? openAiImage2Costs[qualityKey][edit ? "edit" : "text"][resolutionKey][orientation]);
}

export function estimateOpenAiImage2HighCost({ resolution, size, edit = false, pricing = openAiImage2HighCosts }) {
  return estimateOpenAiImage2Cost({
    resolution,
    size,
    quality: "high",
    edit,
    pricing: { high: pricing }
  });
}

function normalizeOpenAiImage2Resolution(resolution, size) {
  const normalized = String(resolution || "").toUpperCase();
  if (["1K", "2K", "4K"].includes(normalized)) return normalized;
  const dimensions = openAiImage2Dimensions(size);
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  return longestEdge >= 2800 ? "4K" : longestEdge >= 1600 ? "2K" : "1K";
}

function openAiImage2Orientation(size) {
  const { width, height } = openAiImage2Dimensions(size);
  if (!width || !height) return "landscape";
  if (Math.abs(width / height - 1) < 0.12) return "square";
  return height > width ? "portrait" : "landscape";
}

function openAiImage2Dimensions(size) {
  const match = String(size || "").match(/(\d+)\s*x\s*(\d+)/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
}
