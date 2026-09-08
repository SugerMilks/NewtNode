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
import { recordedCostAmount } from "./pricingCatalog.js";

const mediaColors = {
  text: "#f0c83b",
  image: "#3d85ff",
  video: "#58ce63",
  model3d: "#14d8c8"
};

export default function StatsDashboard() {
  const [history, setHistory] = React.useState([]);
  const [status, setStatus] = React.useState("loading");
  const [lastUpdated, setLastUpdated] = React.useState(null);

  React.useEffect(() => {
    refreshStats();
    const interval = window.setInterval(refreshStats, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const stats = React.useMemo(() => buildUsageStats(history), [history]);

  async function refreshStats() {
    try {
      setStatus((current) => (current === "loading" ? "loading" : "refreshing"));
      const data = await statsApi.load();
      setHistory(Array.isArray(data.history) ? data.history : []);
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

function buildUsageStats(history) {
  const days = makeThirtyDays();
  const dayMap = new Map(days.map((day) => [day.key, day]));
  const normalized = history.map((item) => normalizeUsageItem(item)).filter((item) => item.inWindow);
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

function normalizeUsageItem(item) {
  const date = new Date(item.createdAt || Date.now());
  const mediaType = item.mediaType || (item.localModel ? "model3d" : item.localImage ? "image" : "video");
  const settings = item.settings || {};
  const modelName = item.modelName || inferModelName(item, mediaType);
  const projectId = item.project?.id || (mediaType === "image" ? "image" : mediaType === "text" ? "text" : mediaType === "model3d" ? "model3d" : "video");
  const projectName = item.project?.name || (mediaType === "image" ? "Image" : mediaType === "text" ? "Text" : mediaType === "model3d" ? "3D" : "Video");
  const cost = recordedCostAmount(item.cost);
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

function inferModelName(item, mediaType) {
  if (mediaType === "image") return "Nano Banana Pro";
  if (mediaType === "text") return item.settings?.model || "Text processing";
  if (mediaType === "model3d") return "Hunyuan 3D 3.1 Pro";
  if (String(item.endpoint || "").includes("seedance-2.5")) return "Seedance 2.5";
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
