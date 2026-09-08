import { ExternalLink, Link, Smartphone, Unplug, X } from "lucide-react";
import { useEffect, useState } from "react";

export function MyNewtRemoteSettings({ remote }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => { if (remote?.origin) setOrigin(remote.origin); }, [remote?.origin]);
  if (!remote) return null;
  return <div className="my-newt-remote-settings">
    <strong><Smartphone size={15} />Remote access</strong>
    {!remote.enabled ? <>
      <label>Private address<input aria-label="Newt private remote address" type="url" value={origin} placeholder="https://computer.tailnet.ts.net" onChange={(event) => setOrigin(event.target.value)} /></label>
      <button type="button" disabled={remote.busy} onClick={() => remote.change("enable", { origin })}><Link size={15} />Enable remote</button>
    </> : <>
      <a href={remote.origin} target="_blank" rel="noreferrer">Open Newt Remote<ExternalLink size={14} /></a>
      <div className="my-newt-remote-actions"><button type="button" disabled={remote.busy} onClick={() => remote.change("pair")}><Link size={15} />Pair device</button><button type="button" title="Disable remote access and revoke all devices" aria-label="Disable remote access" disabled={remote.busy} onClick={() => remote.change("disable")}><Unplug size={15} /></button></div>
      {remote.pairing && <label>Pairing code<output className="my-newt-pair-code">{remote.pairing.code}</output><small>Expires {new Date(remote.pairing.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></label>}
      {(remote.devices || []).map((device) => <div className="my-newt-remote-device" key={device.id}><Smartphone size={14} /><span title={`Trusted until ${new Date(device.expiresAt).toLocaleDateString()}`}>{device.name}</span><button type="button" title={`Revoke ${device.name}`} aria-label={`Revoke ${device.name}`} disabled={remote.busy} onClick={() => remote.change("revoke", { deviceId: device.id })}><X size={14} /></button></div>)}
    </>}
    {remote.error && <p className="my-newt-message error" role="alert">{remote.error}</p>}
  </div>;
}
