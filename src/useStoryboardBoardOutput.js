import React from "react";

const busyStates = new Set(["running", "planning", "revising", "reviewing-sequence", "exporting", "compiling-characters", "compiling-board", "uploading"]);
export function storyboardBoardBuildSignature(node) {
  if (node?.type !== "storyboard") return "";
  const data = node.data || {};
  const frames = (data.storyboardFrames || []).filter(frame => frame.exportUrl || frame.resultUrl);
  if (!frames.length) return "";
  return JSON.stringify([data.sceneName || data.title || "Storyboard", data.aspectRatio || "16:9", frames.map(frame => [
    frame.id, frame.number, frame.exportUrl || frame.resultUrl, frame.resultVersion || 0,
    frame.description || frame.beat || frame.prompt || "", frame.fileName || ""
  ])]);
}

export function storyboardBoardIsCurrent(node) {
  return Boolean(node?.data?.storyboardBoardUrl && storyboardBoardBuildSignature(node)
    && (!node.data.storyboardBoardSource || node.data.storyboardBoardSource === storyboardBoardBuildSignature(node)));
}

export function storyboardBoardCanBuild(node) {
  return Boolean(storyboardBoardBuildSignature(node) && !busyStates.has(node.data.status)
    && !(node.data.storyboardFrames || []).some(frame => ["queued", "running", "reviewing"].includes(frame.status)));
}

export function useStoryboardBoardOutput({ nodes, scope, onBuild }) {
  const current = React.useRef({ nodes, scope, onBuild, epoch: 0 });
  current.current = { nodes, scope, onBuild, epoch: current.current.epoch + (current.current.scope !== scope ? 1 : 0) };
  const mounted = React.useRef(false);
  const jobs = React.useRef(new Map());
  const [revision, setRevision] = React.useState(0);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const prepare = React.useCallback(nodeOrId => {
    const id = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
    const node = current.current.nodes.find(item => item.id === id);
    if (!storyboardBoardCanBuild(node)) return Promise.resolve(null);
    if (storyboardBoardIsCurrent(node)) return Promise.resolve(node.data.storyboardBoardUrl);
    const signature = storyboardBoardBuildSignature(node), epoch = current.current.epoch;
    const key = JSON.stringify([epoch, id, signature]);
    if (jobs.current.has(key)) return jobs.current.get(key);
    const isCurrent = () => {
      const live = current.current.nodes.find(item => item.id === id);
      return mounted.current && current.current.epoch === epoch && storyboardBoardCanBuild(live) && storyboardBoardBuildSignature(live) === signature;
    };
    const build = current.current.onBuild;
    const promise = Promise.resolve().then(() => isCurrent() ? build(node, { signature, isCurrent }) : null).finally(() => {
      jobs.current.delete(key);
      if (mounted.current) setRevision(value => value + 1);
    });
    jobs.current.set(key, promise);
    return promise;
  }, []);

  // Debounce local contact-sheet assembly, not paid generation; changed/stale projects cannot publish.
  const candidates = JSON.stringify(nodes.filter(node => storyboardBoardCanBuild(node) && !storyboardBoardIsCurrent(node)
    && node.data.storyboardBoardErrorSource !== storyboardBoardBuildSignature(node)).map(node => [node.id, storyboardBoardBuildSignature(node)]));
  React.useEffect(() => {
    if (candidates === "[]") return;
    const timer = setTimeout(() => { for (const [id] of JSON.parse(candidates)) void prepare(id); }, 750);
    return () => clearTimeout(timer);
  }, [candidates, scope, revision, prepare]);
  return prepare;
}
