import React from "react";
import {
  Activity,
  CalendarDays,
  DollarSign,
  Film,
  Image,
  Layers3,
  RefreshCcw,
  TrendingUp
} from "lucide-react";
import { statsApi } from "./api/newtApi.js";

const defaultPricing = {
  seedance: {
    standardCostPerSecond: 0.3034,
    fastCostPerSecond: 0.2419,
    standardCostPerThousandTokens: 0.014,
    fastCostPerThousandTokens: 0.0112,
    billingFps: 24
  },
  nanoBananaPro: {
    cost1K2K: 0.15,
    cost4K: 0.3
  },
  zImage: {
    costPerMegapixel: 0.005
  },
  openAiImage2: {
    mediumCost: 0.053
  },
  krea2Large: {
    cost: 0.06,
    styleReferenceCost: 0.065
  },
  luma: {
    photonCostPerMegapixel: 0.019,
    ray2CostPerFiveSeconds540p: 0.5
  },
  hunyuan3DPro: {
    baseCost: 0.375,
    addOnCost: 0.15
  },
  textProcessing: {
    falRequestCost: 0.001,
    falVisionUnitCost: 0.01,
    falVideoUnitCost: 0.01
  },
  utility: {
    wanFunControl: {
      costPerSecond: 0.1
    },
    voidVideoInpainting: {
      baseCost: 0.05,
      pass2Cost: 0.05,
      sam3QuadMaskCost: 0.05
    },
    sam3Image: {
      costPerRequest: 0.005
    },
    sam3Video: {
      costPer16Frames: 0.005
    },
    aurora: {
      costPerSecond480p: 0.07,
      costPerSecond720p: 0.14
    },
    bytedanceUpscaler: {
      costPerSecond1080p: 0.0072,
      costPerSecond2K: 0.0144,
      costPerSecond4K: 0.0288,
      proMultiplier: 10,
      fps60Multiplier: 2
    },
    topazUpscaler: {
      costPerSecondUpTo720p: 0.01,
      costPerSecond720pTo1080p: 0.02,
      costPerSecondAbove1080p: 0.08,
      fps60Multiplier: 2,
      gaia2Multiplier: 0.5
    },
    dwpose: {
      costPerComputeSecond: 0.0006
    },
    depthAnything: {
      costPerComputeSecond: 0
    },
    birefnet: {
      costPerComputeSecond: 0
    },
    patina: {
      baseCost: 0.01,
      mapCostPerMegapixel: 0.01
    }
  }
};

const mediaColors = {
  text: "#f0c83b",
  image: "#3d85ff",
  video: "#58ce63",
  model3d: "#14d8c8"
};

export default function StatsDashboard() {
  const [history, setHistory] = React.useState([]);
  const [pricing, setPricing] = React.useState(defaultPricing);
  const [status, setStatus] = React.useState("loading");
  const [lastUpdated, setLastUpdated] = React.useState(null);

  React.useEffect(() => {
    refreshStats();
    const interval = window.setInterval(refreshStats, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = React.useMemo(() => buildUsageStats(history, pricing), [history, pricing]);

  async function refreshStats() {
    try {
      setStatus((current) => (current === "loading" ? "loading" : "refreshing"));
      const data = await statsApi.load();
      setHistory(Array.isArray(data.history) ? data.history : []);
      setPricing(data.pricing || defaultPricing);
      setStatus("ready");
      setLastUpdated(new Date());
    } catch {
      try {
        const historyData = await statsApi.loadHistoryFallback();
        setHistory(Array.isArray(historyData) ? historyData : []);
        setStatus("ready");
        setLastUpdated(new Date());
      } catch {
        setStatus("error");
      }
    }
  }

  return (
    <section className="stats-page">
      <header className="stats-hero">
        <div>
          <span className="stats-kicker">Past 30 days</span>
          <h1>Generation stats</h1>
        </div>
        <button onClick={refreshStats} disabled={status === "loading" || status === "refreshing"} title="Refresh stats">
          <RefreshCcw className={status === "refreshing" ? "spin" : ""} size={17} />
          <span>{lastUpdated ? `Updated ${timeLabel(lastUpdated)}` : "Syncing"}</span>
        </button>
      </header>

      <div className="stats-metrics">
        <MetricCard icon={<DollarSign size={20} />} label="Estimated spend" value={formatCurrency(stats.totalCost)} detail={`${formatCurrency(stats.averageCost)} avg / priced run${unpricedSuffix(stats.unpricedCount)}`} />
        <MetricCard icon={<Activity size={20} />} label="Generations" value={stats.totalCount} detail={`${stats.videoCount} video, ${stats.imageCount} image, ${stats.textCount} text, ${stats.model3dCount} 3D`} />
        <MetricCard icon={<Film size={20} />} label="Video seconds" value={`${stats.videoSeconds}s`} detail={`${stats.fastCount} fast runs`} />
        <MetricCard icon={<Layers3 size={20} />} label="Top project" value={stats.topProject?.name || "None yet"} detail={stats.topProject ? `${formatCostLabel(stats.topProject)} tracked${unpricedSuffix(stats.topProject.unpricedCount)}` : "Waiting for runs"} />
      </div>

      <div className="stats-grid">
        <section className="stats-panel wide">
          <PanelTitle icon={<TrendingUp size={17} />} title="Cost over time" aside={stats.unpricedCount ? `${stats.unpricedCount} unpriced` : "Estimated USD"} />
          <CostChart days={stats.days} />
        </section>

        <section className="stats-panel">
          <PanelTitle icon={<CalendarDays size={17} />} title="Daily volume" aside="30 days" />
          <VolumeBars days={stats.days} />
        </section>

        <section className="stats-panel">
          <PanelTitle icon={<Image size={17} />} title="Media mix" aside={`${stats.totalCount} total`} />
          <MediaSplit imageCount={stats.imageCount} videoCount={stats.videoCount} textCount={stats.textCount} model3dCount={stats.model3dCount} />
        </section>

        <section className="stats-panel">
          <PanelTitle icon={<Activity size={17} />} title="Models" aside="By spend" />
          <RankedBars rows={stats.models} emptyLabel="No model usage yet" />
        </section>

        <section className="stats-panel">
          <PanelTitle icon={<Layers3 size={17} />} title="Projects" aside="By spend" />
          <RankedBars rows={stats.projects} emptyLabel="No project data yet" />
        </section>

        <section className="stats-panel wide">
          <PanelTitle icon={<CalendarDays size={17} />} title="Recent runs" aside="Auto-updating" />
          <RecentRuns rows={stats.recent} />
        </section>
      </div>

      <p className="cost-note">
        Costs use each run's recorded cost when available, with fal model-page estimates for older runs. Unpriced means the app does not have enough billing detail yet; confirm final charges in fal.ai, Google Cloud, and OpenAI dashboards.
      </p>
    </section>
  );
}

function MetricCard({ icon, label, value, detail }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function PanelTitle({ icon, title, aside }) {
  return (
    <div className="panel-title">
      <span>
        {icon}
        {title}
      </span>
      <small>{aside}</small>
    </div>
  );
}

function CostChart({ days }) {
  const width = 680;
  const height = 220;
  const padding = 22;
  const maxCost = Math.max(1, ...days.map((day) => day.cost));
  const points = days.map((day, index) => {
    const x = padding + (index / Math.max(1, days.length - 1)) * (width - padding * 2);
    const y = height - padding - (day.cost / maxCost) * (height - padding * 2);
    return { x, y, day };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Estimated cost over the past 30 days">
        <defs>
          <linearGradient id="costFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ddc631" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#ddc631" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline className="chart-grid-line" points={`${padding},${height - padding} ${width - padding},${height - padding}`} />
        <polygon points={area} fill="url(#costFill)" />
        <polyline className="cost-line" points={line} />
        {points
          .filter((point) => point.day.cost > 0)
          .map((point) => (
            <circle key={point.day.key} cx={point.x} cy={point.y} r="4" />
          ))}
      </svg>
      <div className="chart-axis">
        <span>{formatShortDate(days[0]?.date)}</span>
        <span>{formatShortDate(days[14]?.date)}</span>
        <span>{formatShortDate(days.at(-1)?.date)}</span>
      </div>
    </div>
  );
}

function VolumeBars({ days }) {
  const maxCount = Math.max(1, ...days.map((day) => day.count));

  return (
    <div className="volume-bars" aria-label="Daily generation volume">
      {days.map((day, index) => (
        <div className="volume-bar" key={day.key} title={`${formatShortDate(day.date)}: ${day.count} generations`}>
          <span style={{ height: `${Math.max(4, (day.count / maxCount) * 100)}%` }} />
          {index % 7 === 0 && <small>{formatDay(day.date)}</small>}
        </div>
      ))}
    </div>
  );
}

function MediaSplit({ imageCount, videoCount, textCount, model3dCount }) {
  const totalCount = imageCount + videoCount + textCount + model3dCount;
  const total = Math.max(1, totalCount);
  const imagePercent = Math.round((imageCount / total) * 100);
  const videoPercent = Math.round((videoCount / total) * 100);
  const textPercent = Math.round((textCount / total) * 100);
  const imageStop = imagePercent;
  const videoStop = imagePercent + videoPercent;
  const textStop = videoStop + textPercent;
  const dominant = [
    { label: "image", count: imageCount },
    { label: "video", count: videoCount },
    { label: "text", count: textCount },
    { label: "3D", count: model3dCount }
  ].sort((a, b) => b.count - a.count)[0];
  const donutBackground = totalCount
    ? `conic-gradient(${mediaColors.image} 0 ${imageStop}%, ${mediaColors.video} ${imageStop}% ${videoStop}%, ${mediaColors.text} ${videoStop}% ${textStop}%, ${mediaColors.model3d} ${textStop}% 100%)`
    : "rgba(255, 255, 255, 0.08)";

  return (
    <div className="media-split">
      <div className="media-donut" style={{ background: donutBackground }}>
        <span>{totalCount}</span>
      </div>
      <div className="media-legend">
        <span>
          <i className="image-dot" />
          Images
          <strong>{imageCount}</strong>
        </span>
        <span>
          <i className="video-dot" />
          Videos
          <strong>{videoCount}</strong>
        </span>
        <span>
          <i className="text-dot" />
          Text
          <strong>{textCount}</strong>
        </span>
        <span>
          <i className="model3d-dot" />
          3D
          <strong>{model3dCount}</strong>
        </span>
        <small>{dominant.count ? `${dominant.label} leads by count` : "No runs yet"}</small>
      </div>
    </div>
  );
}

function RankedBars({ rows, emptyLabel }) {
  const maxCost = Math.max(1, ...rows.map((row) => row.cost));

  if (!rows.length) {
    return <div className="empty-stats">{emptyLabel}</div>;
  }

  return (
    <div className="ranked-bars">
      {rows.slice(0, 6).map((row) => (
        <div className="ranked-row" key={row.name}>
          <div>
            <span>{row.name}</span>
            <small>{row.count} run{row.count === 1 ? "" : "s"}{unpricedSuffix(row.unpricedCount)}</small>
          </div>
          <div className="ranked-meter">
            <span style={{ width: `${(row.cost / maxCost) * 100}%` }} />
          </div>
          <strong className={row.pricedCount ? "" : "unpriced-cost"}>{formatCostLabel(row)}</strong>
        </div>
      ))}
    </div>
  );
}

function RecentRuns({ rows }) {
  if (!rows.length) {
    return <div className="empty-stats">No generations in the last 30 days yet.</div>;
  }

  return (
    <div className="recent-table">
      {rows.slice(0, 12).map((row) => (
        <article key={row.id}>
          <span className={`media-pill ${row.mediaType}`}>{row.mediaType}</span>
          <div>
            <strong>{row.modelName}</strong>
            <small>{row.projectName}</small>
          </div>
          <p>{row.prompt || "Untitled generation"}</p>
          <span>{formatShortDate(row.date)}</span>
          <strong className={row.hasCostEstimate ? "" : "unpriced-cost"}>{formatCostLabel(row)}</strong>
        </article>
      ))}
    </div>
  );
}

function buildUsageStats(history, pricing) {
  const days = makeThirtyDays();
  const dayMap = new Map(days.map((day) => [day.key, day]));
  const normalized = history.map((item) => normalizeUsageItem(item, pricing)).filter((item) => item.inWindow);
  const modelMap = new Map();
  const projectMap = new Map();

  normalized.forEach((item) => {
    const day = dayMap.get(item.dayKey);
    if (day) {
      day.count += 1;
      day.cost += item.cost;
      if (!item.hasCostEstimate) day.unpricedCount += 1;
      if (item.mediaType === "image") day.imageCount += 1;
      if (item.mediaType === "video") day.videoCount += 1;
      if (item.mediaType === "text") day.textCount += 1;
      if (item.mediaType === "model3d") day.model3dCount += 1;
    }

    addAggregate(modelMap, item.modelName, item);
    addAggregate(projectMap, item.projectId, item, item.projectName);
  });

  days.forEach((day) => {
    day.cost = round(day.cost);
  });

  const models = aggregateRows(modelMap);
  const projects = aggregateRows(projectMap);
  const totalCost = round(normalized.reduce((sum, item) => sum + item.cost, 0));
  const totalCount = normalized.length;
  const pricedCount = normalized.filter((item) => item.hasCostEstimate).length;
  const unpricedCount = totalCount - pricedCount;
  const videoCount = normalized.filter((item) => item.mediaType === "video").length;
  const imageCount = normalized.filter((item) => item.mediaType === "image").length;
  const textCount = normalized.filter((item) => item.mediaType === "text").length;
  const model3dCount = normalized.filter((item) => item.mediaType === "model3d").length;
  const videoSeconds = normalized.reduce((sum, item) => sum + (item.mediaType === "video" ? item.durationSeconds : 0), 0);

  return {
    days,
    totalCost,
    totalCount,
    imageCount,
    videoCount,
    textCount,
    model3dCount,
    pricedCount,
    unpricedCount,
    videoSeconds,
    fastCount: normalized.filter((item) => item.isFast).length,
    averageCost: pricedCount ? round(totalCost / pricedCount) : 0,
    topProject: projects[0],
    models,
    projects,
    recent: normalized.sort((a, b) => b.date - a.date)
  };
}

function normalizeUsageItem(item, pricing) {
  const date = new Date(item.createdAt || Date.now());
  const mediaType = item.mediaType || (item.localModel ? "model3d" : item.localImage ? "image" : "video");
  const settings = item.settings || {};
  const modelName = item.modelName || inferModelName(item, mediaType);
  const projectId = item.project?.id || (mediaType === "image" ? "image" : mediaType === "text" ? "text" : mediaType === "model3d" ? "model3d" : "video");
  const projectName = item.project?.name || (mediaType === "image" ? "Image" : mediaType === "text" ? "Text" : mediaType === "model3d" ? "3D" : "Video");
  const cost = resolvedItemCost(item, mediaType, pricing);
  const hasCostEstimate = Number.isFinite(cost);
  const durationSeconds = mediaType === "video" ? durationToSeconds(settings.duration) : 0;
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - 29);

  return {
    id: item.id || `${item.createdAt}-${item.prompt}`,
    date,
    dayKey: dayKey(date),
    inWindow: date >= cutoff,
    mediaType,
    modelName,
    projectId,
    projectName,
    prompt: item.prompt,
    cost: hasCostEstimate ? round(cost) : 0,
    hasCostEstimate,
    pricingBasis: item.cost?.pricingBasis || "",
    durationSeconds,
    isFast: settings.speed === "fast" || String(item.endpoint || "").includes("/fast/")
  };
}

function resolvedItemCost(item, mediaType, pricing) {
  const storedCost = numericCostAmount(item.cost);
  const estimatedCost = estimateItemCost(item, mediaType, pricing);
  const trustedSource = item.cost?.pricingSource && item.cost.pricingSource !== "configured-pricing-v1";

  if (storedCost !== null && item.cost?.pricingSource === "fal-usage-response") return storedCost;
  if (estimatedCost !== null) return estimatedCost;
  if (storedCost !== null && trustedSource) return storedCost;
  return storedCost;
}

function estimateItemCost(item, mediaType, pricing) {
  const settings = item.settings || {};
  const modelKey = [item.modelName, settings.model, item.endpoint, item.mode].filter(Boolean).join(" ").toLowerCase();

  if (mediaType === "image") {
    if (modelKey.includes("qwen")) {
      return estimateMegapixelCost(item.remoteImage, 0.035);
    }

    if (modelKey.includes("z-image") || modelKey.includes("z image") || modelKey.includes("zimage")) {
      return estimateZImageStatsCost(item, settings, pricing);
    }

    if (modelKey.includes("sam 3") || modelKey.includes("sam-3")) {
      return pricing.utility?.sam3Image?.costPerRequest ?? defaultPricing.utility.sam3Image.costPerRequest;
    }

    if (modelKey.includes("depth anything") || modelKey.includes("depth-anything") || modelKey.includes("birefnet")) {
      return 0;
    }

    if (modelKey.includes("patina")) {
      return estimatePatinaStatsCost(item, pricing);
    }

    if (modelKey.includes("dwpose")) {
      return null;
    }

    if (modelKey.includes("openai")) {
      return pricing.openAiImage2?.mediumCost || defaultPricing.openAiImage2.mediumCost;
    }

    if (modelKey.includes("krea") && modelKey.includes("large")) {
      const kreaPricing = pricing.krea2Large || defaultPricing.krea2Large;
      return Number(settings.imageStyleReferenceCount || 0) > 0
        ? kreaPricing.styleReferenceCost
        : kreaPricing.cost;
    }

    if (modelKey.includes("nano") || modelKey.includes("banana") || modelKey.includes("gemini")) {
      return String(settings.resolution || "").toUpperCase().includes("4K")
        ? pricing.nanoBananaPro.cost4K
        : pricing.nanoBananaPro.cost1K2K;
    }

    return null;
  }

  if (mediaType === "text") {
    const textPricing = pricing.textProcessing || defaultPricing.textProcessing;
    if (String(item.provider || settings.provider || "").toLowerCase() !== "fal") return null;

    const usageAmount = usageCost(item.usage);
    if (usageAmount !== null) return usageAmount;

    return (
      textPricing.falRequestCost +
      (Number(settings.imageInputCount || 0) > 0 ? textPricing.falVisionUnitCost : 0) +
      (Number(settings.videoInputCount || 0) > 0 ? textPricing.falVideoUnitCost : 0)
    );
  }

  if (mediaType === "model3d") {
    if (modelKey.includes("hunyuan") || modelKey.includes("3d")) {
      return estimateHunyuan3DStatsCost(settings, pricing);
    }
    return null;
  }

  if (modelKey.includes("seedance") || modelKey.includes("bytedance/seedance")) {
    return estimateSeedanceStatsCost(item, settings, pricing);
  }

  if (modelKey.includes("luma") || modelKey.includes("luma-dream-machine") || modelKey.includes("luma-photon")) {
    return mediaType === "image" ? estimateLumaPhotonStatsCost(item, pricing) : estimateLumaRay2StatsCost(item, settings, pricing);
  }

  if (modelKey.includes("wan-fun-control") || modelKey.includes("wan fun control")) {
    const utilityPricing = pricing.utility?.wanFunControl || defaultPricing.utility.wanFunControl;
    const billingFrames = settings.matchInputNumFrames === false ? Number(settings.numFrames || 81) : 81;
    return (billingFrames / 16) * utilityPricing.costPerSecond;
  }

  if (modelKey.includes("void") || modelKey.includes("video inpainting")) {
    return estimateVoidStatsCost(settings, pricing);
  }

  if (modelKey.includes("aurora") || modelKey.includes("creatify")) {
    return estimateAuroraStatsCost(item, settings, pricing);
  }

  if (modelKey.includes("bytedance") && modelKey.includes("upscal")) {
    return estimateBytedanceUpscalerStatsCost(item, settings, pricing);
  }

  if (modelKey.includes("topaz")) {
    return estimateTopazUpscalerStatsCost(item, settings, pricing);
  }

  if (modelKey.includes("sam 3") || modelKey.includes("sam-3")) {
    return estimateSam3VideoStatsCost(item, settings, pricing);
  }

  if (modelKey.includes("birefnet")) {
    return 0;
  }

  return null;
}

function numericCostAmount(cost) {
  if (!cost || cost.amountUsd === null || cost.amountUsd === undefined || cost.amountUsd === "") return null;
  const amount = Number(cost.amountUsd);
  return Number.isFinite(amount) ? amount : null;
}

function usageCost(usage) {
  if (!usage) return null;

  if (Array.isArray(usage)) {
    const amounts = usage.map(usageCost).filter((amount) => amount !== null);
    return amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
  }

  if (typeof usage === "object") {
    const nestedAmounts = [usage.request, ...(Array.isArray(usage.helpers) ? usage.helpers : [])].map(usageCost).filter((amount) => amount !== null);
    if (nestedAmounts.length) return nestedAmounts.reduce((sum, amount) => sum + amount, 0);

    for (const key of ["cost", "amountUsd", "amount_usd", "totalCost", "total_cost"]) {
      const amount = Number(usage[key]);
      if (usage[key] !== null && usage[key] !== undefined && Number.isFinite(amount)) return amount;
    }
  }

  return null;
}

function estimateMegapixelCost(image, unitRateUsd) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  if (width <= 0 || height <= 0) return null;
  return (width * height * unitRateUsd) / 1000000;
}

function estimateZImageStatsCost(item, settings, pricing) {
  const zImagePricing = pricing.zImage || defaultPricing.zImage;
  const unitRateUsd = zImagePricing.costPerMegapixel ?? defaultPricing.zImage.costPerMegapixel;
  const remoteImageCost = estimateMegapixelCost(item.remoteImage, unitRateUsd);
  if (remoteImageCost !== null) return remoteImageCost;

  const imageSize = settings.imageSize || item.cost?.imageSize;
  const width = Number(imageSize?.width || 0);
  const height = Number(imageSize?.height || 0);
  if (width <= 0 || height <= 0) return null;
  return (width * height * unitRateUsd) / 1000000;
}

const seedanceResolutionDimensions = {
  "480p": {
    "21:9": [992, 432],
    "16:9": [864, 496],
    "4:3": [752, 560],
    "1:1": [640, 640],
    "3:4": [560, 752],
    "9:16": [496, 864]
  },
  "720p": {
    "21:9": [1470, 630],
    "16:9": [1280, 720],
    "4:3": [1112, 834],
    "1:1": [960, 960],
    "3:4": [834, 1112],
    "9:16": [720, 1280]
  },
  "1080p": {
    "21:9": [2352, 1008],
    "16:9": [2048, 1152],
    "4:3": [1792, 1344],
    "1:1": [1536, 1536],
    "3:4": [1344, 1792],
    "9:16": [1152, 2048]
  }
};

function estimateSeedanceStatsCost(item, settings, pricing) {
  const seedancePricing = pricing.seedance || defaultPricing.seedance;
  const isFast = settings.speed === "fast" || String(item.endpoint || "").includes("/fast/");
  const fallbackTokenRate =
    isFast && seedancePricing.fastCostPerSecond
      ? seedancePricing.fastCostPerSecond / 21.6
      : seedancePricing.standardCostPerSecond
        ? seedancePricing.standardCostPerSecond / 21.6
        : defaultPricing.seedance.standardCostPerThousandTokens;
  const unitRate = isFast
    ? seedancePricing.fastCostPerThousandTokens || fallbackTokenRate
    : seedancePricing.standardCostPerThousandTokens || fallbackTokenRate;
  const billingFps = Number(seedancePricing.billingFps || defaultPricing.seedance.billingFps);
  const durationSeconds = durationToSeconds(settings.duration || item.cost?.durationSeconds || item.cost?.units);
  const dimensions = seedanceBillingDimensions(settings.resolution || item.cost?.resolution, settings.aspectRatio || item.cost?.aspectRatio);
  const billableUnits = (dimensions.width * dimensions.height * durationSeconds * billingFps) / 1024 / 1000;
  return billableUnits * unitRate;
}

function estimateLumaPhotonStatsCost(item, pricing) {
  const lumaPricing = pricing.luma || defaultPricing.luma;
  const megapixelCost = estimateMegapixelCost(item.remoteImage, lumaPricing.photonCostPerMegapixel);
  return megapixelCost === null ? lumaPricing.photonCostPerMegapixel : megapixelCost;
}

function estimateLumaRay2StatsCost(item, settings, pricing) {
  const lumaPricing = pricing.luma || defaultPricing.luma;
  const seconds = durationToSeconds(settings.duration || item.cost?.durationSeconds || "5");
  const durationMultiplier = seconds > 5 ? 2 : 1;
  const resolution = String(settings.resolution || item.cost?.resolution || "540p").toLowerCase();
  const resolutionMultiplier = resolution === "1080p" ? 4 : resolution === "720p" ? 2 : 1;
  return lumaPricing.ray2CostPerFiveSeconds540p * durationMultiplier * resolutionMultiplier;
}

function seedanceBillingDimensions(resolution, aspectRatio) {
  const normalizedResolution = normalizeChoice(resolution, ["480p", "720p", "1080p"], "720p");
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  const [width, height] =
    seedanceResolutionDimensions[normalizedResolution]?.[normalizedAspectRatio] ||
    seedanceResolutionDimensions[normalizedResolution]?.["16:9"] ||
    seedanceResolutionDimensions["720p"]["16:9"];
  return { width, height };
}

function estimatePatinaStatsCost(item, pricing) {
  const image = item.remoteImage || item.remoteImages?.[0];
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  if (width <= 0 || height <= 0) return null;

  const utilityPricing = pricing.utility?.patina || defaultPricing.utility.patina;
  const maps = Array.isArray(item.settings?.maps) ? item.settings.maps : [];
  const mapCount = Math.max(1, maps.length || Number(item.settings?.mapCount || 0) || 1);
  const megapixels = (width * height) / 1000000;
  return utilityPricing.baseCost + megapixels * mapCount * utilityPricing.mapCostPerMegapixel;
}

function estimateVoidStatsCost(settings, pricing) {
  const utilityPricing = pricing.utility?.voidVideoInpainting || defaultPricing.utility.voidVideoInpainting;
  return (
    utilityPricing.baseCost +
    (settings.enablePass2Refinement ? utilityPricing.pass2Cost : 0) +
    (Number(settings.maskVideoCount || 0) > 0 ? 0 : utilityPricing.sam3QuadMaskCost)
  );
}

function estimateHunyuan3DStatsCost(settings, pricing) {
  const modelPricing = pricing.hunyuan3DPro || defaultPricing.hunyuan3DPro;
  const addOnCount =
    (settings.enablePbr && settings.generateType !== "Geometry" ? 1 : 0) +
    (Number(settings.faceCount || 500000) !== 500000 ? 1 : 0) +
    (Number(settings.inputImageCount || 1) > 1 ? 1 : 0);
  return modelPricing.baseCost + addOnCount * modelPricing.addOnCost;
}

function estimateAuroraStatsCost(item, settings, pricing) {
  const utilityPricing = pricing.utility?.aurora || defaultPricing.utility.aurora;
  const duration = Number(item.remoteVideo?.duration || settings.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const rate = settings.resolution === "480p" ? utilityPricing.costPerSecond480p : utilityPricing.costPerSecond720p;
  return Math.ceil(duration) * rate;
}

function estimateBytedanceUpscalerStatsCost(item, settings, pricing) {
  const utilityPricing = pricing.utility?.bytedanceUpscaler || defaultPricing.utility.bytedanceUpscaler;
  const duration = Number(item.remoteVideo?.duration || settings.durationSeconds || item.cost?.durationSeconds || item.cost?.units || 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const resolution = String(settings.targetResolution || item.cost?.targetResolution || "1080p").toLowerCase();
  const baseRate =
    resolution === "4k"
      ? utilityPricing.costPerSecond4K
      : resolution === "2k"
        ? utilityPricing.costPerSecond2K
        : utilityPricing.costPerSecond1080p;
  const fpsMultiplier = String(settings.targetFps || item.cost?.targetFps || "30fps") === "60fps" ? utilityPricing.fps60Multiplier : 1;
  const tierMultiplier = String(settings.enhancementTier || item.cost?.enhancementTier || "standard") === "pro" ? utilityPricing.proMultiplier : 1;
  return duration * baseRate * fpsMultiplier * tierMultiplier;
}

function estimateTopazUpscalerStatsCost(item, settings, pricing) {
  const utilityPricing = pricing.utility?.topazUpscaler || defaultPricing.utility.topazUpscaler;
  const duration = Number(item.remoteVideo?.duration || settings.durationSeconds || item.cost?.durationSeconds || item.cost?.units || 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const tier = resolveTopazStatsBillingTier(settings.billingResolutionTier || item.cost?.billingResolutionTier, item.remoteVideo);
  const baseRate =
    tier === "up-to-720p"
      ? utilityPricing.costPerSecondUpTo720p
      : tier === "720p-1080p"
        ? utilityPricing.costPerSecond720pTo1080p
        : utilityPricing.costPerSecondAbove1080p;
  const fpsMultiplier = Number(settings.targetFps || item.cost?.targetFps || 0) >= 60 ? utilityPricing.fps60Multiplier : 1;
  const modelMultiplier = String(settings.model || item.cost?.model || "").toLowerCase() === "gaia 2" ? utilityPricing.gaia2Multiplier : 1;
  return duration * baseRate * fpsMultiplier * modelMultiplier;
}

function resolveTopazStatsBillingTier(value, remoteVideo) {
  const configured = String(value || "auto");
  if (["up-to-720p", "720p-1080p", "above-1080p"].includes(configured)) return configured;
  const width = Number(remoteVideo?.width || remoteVideo?.metadata?.width || 0);
  const height = Number(remoteVideo?.height || remoteVideo?.metadata?.height || 0);
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide > 0 && shortSide > 0) {
    if (longSide <= 1280 && shortSide <= 720) return "up-to-720p";
    if (longSide <= 1920 && shortSide <= 1080) return "720p-1080p";
  }
  return "above-1080p";
}

function estimateSam3VideoStatsCost(item, settings, pricing) {
  const utilityPricing = pricing.utility?.sam3Video || defaultPricing.utility.sam3Video;
  const frames = Number(item.remoteVideo?.num_frames || item.remoteVideo?.numFrames || settings.numFrames || 0);
  if (!Number.isFinite(frames) || frames <= 0) return null;
  return Math.ceil(frames / 16) * utilityPricing.costPer16Frames;
}

function inferModelName(item, mediaType) {
  if (mediaType === "image") return "Nano Banana Pro";
  if (mediaType === "text") return item.settings?.model || "Text processing";
  if (mediaType === "model3d") return "Hunyuan 3D 3.1 Pro";
  return item.settings?.speed === "fast" || String(item.endpoint || "").includes("/fast/") ? "Seedance 2.0 Fast" : "Seedance 2.0";
}

function addAggregate(map, key, item, label = key) {
  const row = map.get(key) || { name: label, count: 0, pricedCount: 0, unpricedCount: 0, cost: 0 };
  row.count += 1;
  if (item.hasCostEstimate) {
    row.pricedCount += 1;
  } else {
    row.unpricedCount += 1;
  }
  row.cost = round(row.cost + item.cost);
  map.set(key, row);
}

function aggregateRows(map) {
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

function makeThirtyDays() {
  const today = startOfDay(new Date());

  return Array.from({ length: 30 }, (_value, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    return {
      date,
      key: dayKey(date),
      count: 0,
      cost: 0,
      imageCount: 0,
      videoCount: 0,
      textCount: 0,
      model3dCount: 0,
      unpricedCount: 0
    };
  });
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function durationToSeconds(duration) {
  if (duration === "auto") return 15;
  const match = String(duration || "15").match(/\d+/);
  return Number(match?.[0] || 15);
}

function normalizeChoice(value, choices, fallback) {
  const normalized = String(value || fallback);
  return choices.includes(normalized) ? normalized : fallback;
}

function normalizeAspectRatio(value) {
  const normalized = String(value || "16:9").match(/\d+:\d+/)?.[0] || "16:9";
  return normalizeChoice(normalized, ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "16:9");
}

function formatCostLabel(row) {
  if (row?.hasCostEstimate === false || row?.pricedCount === 0) return "Unpriced";
  return formatCurrency(row?.cost ?? row);
}

function unpricedSuffix(count) {
  return count ? ` · ${count} unpriced` : "";
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Unpriced";
  const absolute = Math.abs(amount);
  const maximumFractionDigits = absolute > 0 && absolute < 0.01 ? 4 : amount >= 10 ? 2 : 3;
  const minimumFractionDigits = absolute > 0 && absolute < 0.01 ? 4 : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amount);
}

function formatShortDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatDay(date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
}

function timeLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function round(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 10000) / 10000 : 0;
}
