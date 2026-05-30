const lastPackageParentKey = "newtnode-last-package-parent";
const lastOpenWorkflowKey = "newtnode-last-open-workflow";

export function lastPackageParentPath() {
  return readPreference(lastPackageParentKey);
}

export function rememberPackageParentPath(path) {
  writePreference(lastPackageParentKey, path);
}

export function workflowPickerDefaultPath(projectPackagePath = "") {
  return projectPackagePath || readPreference(lastOpenWorkflowKey) || readPreference(lastPackageParentKey) || "";
}

export function rememberOpenedWorkflowPath(workflow = {}) {
  const packagePath = workflow.packagePath || workflow.package?.rootPath || "";
  writePreference(lastOpenWorkflowKey, packagePath || workflow.filePath || workflow.fileName || "");
}

function readPreference(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value || "");
  } catch {
    // Dialog history should never block workflow operations.
  }
}
