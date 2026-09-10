export function createWorkflowChangeGuard({ needsSave, save, onPrompt }) {
  let pending = null;

  function finish(request, allowed) {
    if (pending !== request) return;
    pending = null;
    onPrompt(null);
    request.resolve(allowed);
  }

  return {
    request(actionLabel) {
      // A second navigation must not replace the first request's resolver.
      if (pending) return Promise.resolve(false);
      if (!needsSave()) return Promise.resolve(true);
      return new Promise((resolve) => {
        pending = { actionLabel, resolve, saving: false };
        onPrompt({ actionLabel, saving: false, error: "" });
      });
    },
    async decide(decision) {
      const request = pending;
      if (!request || request.saving) return;
      if (decision === "cancel" || decision === "discard") {
        finish(request, decision === "discard");
        return;
      }
      if (decision !== "save") return;
      request.saving = true;
      onPrompt({ actionLabel: request.actionLabel, saving: true, error: "" });
      try {
        if (!await save()) throw new Error("Could not save this workflow. Your current project is still open.");
        finish(request, true);
      } catch (error) {
        if (pending !== request) return;
        request.saving = false;
        onPrompt({ actionLabel: request.actionLabel, saving: false, error: error?.message || "Could not save this workflow. Please try again." });
      }
    },
    dispose() {
      const request = pending;
      pending = null;
      request?.resolve(false);
    }
  };
}
