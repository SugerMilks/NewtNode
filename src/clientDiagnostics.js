const diagnosticEndpoint = "/api/system/client-diagnostic";
const longTaskThresholdMs = 1200;
const memoryPressureRatio = 0.82;
let diagnosticsInstalled = false;
let lastLongTaskReportAt = 0;
let lastMemoryReportAt = 0;

export function reportClientDiagnostic(event, details = {}) {
  const payload = {
    event,
    createdAt: new Date().toISOString(),
    message: String(details.message || "").slice(0, 1600),
    stack: String(details.stack || "").slice(0, 3000),
    durationMs: finiteDiagnosticNumber(details.durationMs),
    usedHeapBytes: finiteDiagnosticNumber(details.usedHeapBytes),
    heapLimitBytes: finiteDiagnosticNumber(details.heapLimitBytes),
    path: `${window.location.pathname}${window.location.search}`,
    userAgent: window.navigator.userAgent
  };
  const body = JSON.stringify(payload);

  try {
    if (window.navigator.sendBeacon) {
      window.navigator.sendBeacon(diagnosticEndpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(diagnosticEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    });
  } catch {
    // Diagnostics must never interfere with the app.
  }
}

export function installClientDiagnostics() {
  if (diagnosticsInstalled || typeof window === "undefined") return;
  diagnosticsInstalled = true;

  window.addEventListener("error", (event) => {
    reportClientDiagnostic("window-error", {
      message: event.message || event.error?.message,
      stack: event.error?.stack
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientDiagnostic("unhandled-rejection", {
      message: reason?.message || reason,
      stack: reason?.stack
    });
  });

  if ("PerformanceObserver" in window) {
    try {
      const observer = new window.PerformanceObserver((list) => {
        const longest = Math.max(0, ...list.getEntries().map((entry) => Number(entry.duration) || 0));
        const now = Date.now();
        if (longest < longTaskThresholdMs || now - lastLongTaskReportAt < 30000) return;
        lastLongTaskReportAt = now;
        reportClientDiagnostic("long-task", { durationMs: Math.round(longest) });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long-task observation is not available in every browser.
    }
  }

  window.setInterval(reportMemoryPressure, 20000);
}

function reportMemoryPressure() {
  const memory = window.performance?.memory;
  if (!memory?.jsHeapSizeLimit || !memory.usedJSHeapSize) return;
  const ratio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
  const now = Date.now();
  if (ratio < memoryPressureRatio || now - lastMemoryReportAt < 60000) return;
  lastMemoryReportAt = now;
  reportClientDiagnostic("memory-pressure", {
    usedHeapBytes: memory.usedJSHeapSize,
    heapLimitBytes: memory.jsHeapSizeLimit
  });
}

function finiteDiagnosticNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}
