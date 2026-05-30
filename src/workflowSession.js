import { workflowDisplayPath, workflowFileNameForProject } from "./workflowFiles.js";

export function selectedWorkflowProjectName(projects = [], projectId = "") {
  return projects.find((project) => project.id === projectId)?.name;
}

export function currentWorkflowDisplayPath({
  workflowFilePath = "",
  projectPackagePath = "",
  localWorkflowFileName = "",
  savedProjectName = "",
  projectName = ""
} = {}) {
  const savedPath = String(workflowFilePath || "").trim();
  if (savedPath) return savedPath;
  if (projectPackagePath) {
    return workflowDisplayPath({
      packagePath: projectPackagePath,
      fileName: localWorkflowFileName || workflowFileNameForProject(savedProjectName || projectName)
    });
  }
  return localWorkflowFileName || "";
}

export function workflowRequestContextForState({
  projectId = "",
  projectName = "",
  savedProjectName = "",
  selectedProjectName = "",
  projectPackagePath = ""
} = {}, overrides = {}) {
  const workflowName = savedProjectName || selectedProjectName || projectName || "Untitled node project";
  return {
    projectId: projectId || "",
    projectName: projectName || "Untitled node project",
    workflowName,
    workflowPackageId: projectPackagePath ? projectId || "" : "",
    workflowPackagePath: projectPackagePath || "",
    ...overrides
  };
}

export function appendWorkflowRequestContextToForm(form, state = {}, overrides = {}) {
  Object.entries(workflowRequestContextForState(state, overrides)).forEach(([key, value]) => {
    form.append(key, value || "");
  });
}
