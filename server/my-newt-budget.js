export function reservedTotal(job) {
  return Object.values(job.reservations || {}).reduce((sum, item) => sum + item.amount, 0);
}

export function reserveMyNewtCost(job, id, amount, label) {
  if (amount == null || !Number.isFinite(amount) || amount < 0) throw new Error("No reliable price estimate is available for this operation.");
  if (job.spent + reservedTotal(job) + amount > job.settings.budget) throw new Error("Estimated task budget reached. Increase the budget in Settings or stop here.");
  job.reservations ||= {};
  job.reservations[id] = { amount, label, state: "pending" };
}

export function settleMyNewtCost(job, id, amount) {
  if (!job.reservations?.[id]) return;
  if (amount != null && Number.isFinite(Number(amount)) && Number(amount) >= 0) {
    job.spent += Number(amount);
    delete job.reservations[id];
  } else job.reservations[id].state = "uncertain";
}
