import { useEffect, useRef, useState } from "react";
import { myNewtApi } from "../api/newtApi.js";

export function useMyNewtRemote(context) {
  const live = useRef(context); live.current = context;
  const credentials = useRef(null);
  const clientId = useRef(crypto.randomUUID());
  const receipt = useRef(null);
  const queue = useRef(Promise.resolve());
  const [state, setState] = useState({ enabled: false, devices: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changing = useRef(false);
  const [pairing, setPairing] = useState(null);
  const key = `${context.projectId}:${context.nodeId || ""}`;
  const currentKey = useRef(key); currentKey.current = key;
  const serialize = (fn) => {
    const result = queue.current.then(fn);
    queue.current = result.catch(() => {});
    return result;
  };
  const updateState = (next) => setState((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);

  useEffect(() => {
    let cancelled = false, polling = false;
    setState({ enabled: false, devices: [] }); setPairing(null); setError("");
    const tick = async () => {
      if (polling || changing.current || cancelled) return;
      polling = true;
      try {
        await serialize(async () => {
          if (cancelled) return;
          const c = live.current;
          if (!c.nodeId || !c.projectId) return;
          if (!credentials.current) {
            const result = await myNewtApi.remote("resume", { clientId: clientId.current,
              projectId: c.projectId, nodeId: c.nodeId, projectName: c.projectName });
            const { hostToken, ...status } = result;
            if (cancelled) {
              if (hostToken) await myNewtApi.remote("detach", { hostToken, clientId: clientId.current }).catch(() => {});
              return;
            }
            if (hostToken) credentials.current = { hostToken, clientId: clientId.current };
            updateState(status); setError("");
          }
          const owner = credentials.current;
          if (!owner || cancelled) return;
          const acknowledged = receipt.current;
          const next = await myNewtApi.remote("heartbeat", { ...owner, projectId: c.projectId, nodeId: c.nodeId,
            projectName: c.projectName, jobId: c.jobId, budget: c.budget, busy: c.busy, receipt: acknowledged });
          if (cancelled || credentials.current !== owner) return;
          if (receipt.current === acknowledged) receipt.current = null;
          const { command, ...status } = next;
          updateState(status); setError("");
          if (command) {
            // Never replay delivered commands, including across project switches or reconnections.
            const latest = live.current;
            let ok = false;
            if (currentKey.current === key && command.jobId === latest.jobId && command.budget === latest.budget) {
              ok = await latest.control(command.action, command.note, { jobId: command.jobId, version: command.version });
            }
            if (credentials.current === owner) receipt.current = { id: command.id, ok, message: ok ? "Accepted by the home editor." : latest.getControlError?.() || "The home editor did not accept this command. Review task status; no automatic retry was made." };
          }
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          if (err.status === 401 || err.status === 409) { credentials.current = null; setState({ enabled: false, devices: [] }); setPairing(null); }
        }
      } finally { polling = false; }
    };
    const timer = setInterval(tick, 2000); tick();
    return () => {
      cancelled = true; clearInterval(timer);
      const owner = credentials.current;
      credentials.current = null; receipt.current = null;
      if (owner) serialize(() => myNewtApi.remote("detach", owner)).catch(() => {});
    };
  }, [key]);

  async function change(action, body = {}) {
    if (changing.current) return;
    changing.current = true; setBusy(true); setError("");
    try {
      await serialize(async () => {
        if (currentKey.current !== key) return;
        const owner = credentials.current;
        const result = await myNewtApi.remote(action, action === "enable" ? { ...body, clientId: clientId.current,
          projectId: context.projectId, nodeId: context.nodeId, projectName: context.projectName } : { ...owner, ...body });
        if (currentKey.current !== key) {
          if (result.hostToken) await myNewtApi.remote("detach", { hostToken: result.hostToken, clientId: clientId.current }).catch(() => {});
          return;
        }
        if (action === "enable") {
          const { hostToken, ...status } = result;
          credentials.current = { hostToken, clientId: clientId.current };
          updateState(status); receipt.current = null;
        } else if (action === "pair") setPairing(result);
        else {
          updateState(result);
          if (action === "disable") { credentials.current = null; receipt.current = null; setPairing(null); }
        }
      });
    } catch (err) { if (currentKey.current === key) setError(err.message); }
    finally { changing.current = false; setBusy(false); }
  }
  return { ...state, error, busy, pairing, change };
}
