export function myNewtRequiresPlanApproval(settings = {}) {
  return settings.autoReview !== true && settings.approvePlan !== false;
}

export function myNewtRequiresRunApproval(settings = {}, payload = {}, { uncertain = false } = {}) {
  return uncertain || (settings.autoReview !== true && (settings.approveRuns !== false || payload.force === true));
}

export function myNewtReviewInstructions(settings = {}) {
  return settings.autoReview === true
    ? "Auto Review is enabled. Review your own plan against the brief and proceed without asking the user to approve plans, ordinary runs, or user-requested new variants. Use reasonable defaults for optional creative choices within the brief. Continue through execution and verified completion; do not call ask merely to obtain routine confirmation. Budget, permissions, locks, protected work, required assets, and interrupted or uncertain paid requests still apply. Ask only for a genuine blocker or indispensable missing information. This mode never authorizes speculative repeated generations or changing permissions."
    : "Auto Review is disabled. Respect the configured plan and run approval settings. Deliberate repeat runs require explicit approval even when ordinary run approval is off.";
}
