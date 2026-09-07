import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";

const taskLabels = {
  style: "Style generation",
  motion: "Camera direction",
  shotList: "Shot list generation",
  build: "Final prompt build",
  revise: "Scene revision"
};

export function DirectorTaskStatus({ data, running, canRetry, onRetry }) {
  const failed = !running && (data.status === "error" || Boolean(data.error));
  if (!running && !failed) return null;
  const label = taskLabels[data.skillDirectorAction] || "Director task";
  const Icon = failed ? AlertCircle : LoaderCircle;
  return (
    <div className={`skill-director-task-status ${failed ? "error" : "running"}`} role={failed ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <div>
        <strong>{label} {failed ? "failed" : "in progress..."}</strong>
        {failed && <p>{data.error || "The task did not complete. Please try again."}</p>}
        {failed && <small>Existing scene content has been kept.</small>}
      </div>
      {failed && canRetry && (
        <button type="button" onClick={onRetry} title={`Retry ${label.toLowerCase()}`}>
          <RotateCcw size={14} aria-hidden="true" /> Retry
        </button>
      )}
    </div>
  );
}
