export function workflowContextPayload(workflowContext = {}, projectId = "", projectName = "") {
  return {
    projectId: workflowContext.projectId || projectId || "",
    projectName: workflowContext.projectName || projectName || "Untitled node project",
    workflowName: workflowContext.workflowName || workflowContext.projectName || projectName || "Untitled node project",
    workflowPackageId: workflowContext.workflowPackageId || "",
    workflowPackagePath: workflowContext.workflowPackagePath || ""
  };
}

export function appendWorkflowContextFormFields(form, workflowContext = {}, projectId = "", projectName = "") {
  Object.entries(workflowContextPayload(workflowContext, projectId, projectName)).forEach(([key, value]) => {
    form.append(key, value || "");
  });
}
