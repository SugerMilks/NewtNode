export const MY_NEWT_BURST_MS = 1300;

export function myNewtTaskKey(task) {
  return task?.id && task.nodeId && task.projectId ? JSON.stringify([task.projectId, task.nodeId, task.id]) : "";
}

export function myNewtHighlightColor(data = {}) {
  return data.jobId && data.myNewtSummary?.status === "complete" ? "#58ce63" : "#f0c83b";
}

const unfinishedStatuses = new Set(["running", "waiting", "approval", "paused"]);

export function createMyNewtCompletionTracker() {
  let key = "", status = "", completed = false;
  return (task) => {
    const nextKey = myNewtTaskKey(task);
    if (key !== nextKey) {
      key = nextKey; status = ""; completed = false;
    }
    if (!key || !task.status) return false;
    // Loading an already-finished task is not a new completion notification.
    const notify = !completed && unfinishedStatuses.has(status) && task.status === "complete";
    if (task.status === "complete") completed = true;
    status = task.status;
    return notify;
  };
}
