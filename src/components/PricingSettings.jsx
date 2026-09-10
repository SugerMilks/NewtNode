import React from "react";
import { RefreshCcw } from "lucide-react";
import { pricingApi } from "../api/newtApi.js";
import { setPricingCatalog } from "../pricingCatalog.js";

const providerLabels = { fal: "Fal", krea: "Krea", atlas: "Atlas Cloud", openai: "OpenAI", google: "Google" };
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short"
}).format(new Date(value)) : "Not checked yet";

export function PricingSettings() {
  const [state, setState] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const mounted = React.useRef(false);
  const operation = React.useRef(false);
  const requestVersion = React.useRef(0);
  function apply(result) { setState(result); setPricingCatalog(result.catalog); }
  React.useEffect(() => {
    mounted.current = true;
    let pending = false;
    async function load() {
      if (pending || operation.current) return;
      pending = true;
      const version = ++requestVersion.current;
      try { const result = await pricingApi.load(); if (mounted.current && version === requestVersion.current) { apply(result); setError(""); } }
      catch (error) { if (mounted.current && version === requestVersion.current) setError(error.message); }
      finally { pending = false; }
    }
    load(); const timer = setInterval(load, 5000);
    return () => { mounted.current = false; requestVersion.current++; clearInterval(timer); };
  }, []);

  async function update(action) {
    if (operation.current) return;
    requestVersion.current++;
    operation.current = true; setBusy(true); setError("");
    try { const result = await action(); if (mounted.current) apply(result); }
    catch (error) { if (mounted.current) setError(error.message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  const working = busy || state?.running;
  return <section className="stats-panel settings-panel wide pricing-settings">
    <div className="pricing-settings-heading">
      <h2>API Pricing</h2>
      <div className="pricing-settings-actions">
        <button type="button" className={`settings-key-toggle ${state?.enabled ? "enabled" : ""}`} role="switch"
          aria-label="Weekly pricing updates" aria-checked={Boolean(state?.enabled)} disabled={!state || working}
          onClick={() => update(() => pricingApi.setEnabled(!state.enabled))}>
          <span className="settings-key-toggle-track" aria-hidden="true"><span /></span><em>Weekly updates</em>
        </button>
        <button type="button" className="settings-key-version-action" title="Check prices now" aria-label="Check prices now"
          disabled={!state || working} onClick={() => update(pricingApi.refresh)}>
          <RefreshCcw size={16} className={working ? "spin" : ""} />
        </button>
      </div>
    </div>
    <div className="pricing-settings-meta">
      <span>{state?.schedule || "Monday, 4:00 AM Eastern"}</span>
      <span>Last check: {date(state?.lastCheckAt)}</span>
      <span>{state?.enabled ? `Next: ${date(state.nextCheckAt)}` : "Automatic updates off"}</span>
    </div>
    <div role="status" className="pricing-settings-status">{working ? "Checking official prices..." : error || state?.error || ""}</div>
    <div className="pricing-provider-list">
      {Object.entries(providerLabels).map(([provider, label]) => {
        const source = state?.sources?.[provider];
        return <details key={provider} className="pricing-provider">
          <summary><strong>{label}</strong><span>{source?.applied ? `${source.applied} model price tables verified` : "Bundled estimates"}</span>
            <span className={source?.status === "current" ? "pricing-current" : "pricing-review"}>{source?.status === "current" ? "Up to date" : source?.status === "error" ? "Check failed" : source?.status === "partial" ? "Review needed" : "Not verified"}</span></summary>
          <div className="pricing-provider-details">
            <p>Last checked: {date(source?.checkedAt)}</p>
            {source?.message && <p>{source.message}</p>}
            {source?.reviews?.map((review, index) => <p key={index}><strong>{review.model}</strong>: {review.message} {review.source && <a href={review.source} target="_blank" rel="noreferrer">Source</a>}</p>)}
          </div>
        </details>;
      })}
    </div>
    {state?.changes?.length > 0 && <details className="pricing-change-log"><summary>Recent pricing changes</summary>
      {state.changes.slice(0, 20).map((change, index) => <p key={index}>{date(change.at)} / {providerLabels[change.provider]} / {change.model}: {change.action}{change.pricePoints ? ` (${change.pricePoints} prices)` : ""}</p>)}
    </details>}
  </section>;
}
