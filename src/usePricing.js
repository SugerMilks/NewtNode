import React from "react";
import { pricingApi } from "./api/newtApi.js";
import { pricingRevision, setPricingCatalog, subscribePricing } from "./pricingCatalog.js";

export function usePricingRevision() {
  return React.useSyncExternalStore(subscribePricing, pricingRevision, pricingRevision);
}

export function usePricingSync() {
  React.useEffect(() => {
    let cancelled = false, pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const result = await pricingApi.load();
        if (!cancelled) setPricingCatalog(result.catalog);
      } catch { /* Keep last-known-good estimates while the backend restarts. */ }
      finally { pending = false; }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("newtnode:model-settings-updated", refresh);
    return () => {
      cancelled = true; clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("newtnode:model-settings-updated", refresh);
    };
  }, []);
}
