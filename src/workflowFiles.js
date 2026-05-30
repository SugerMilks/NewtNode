const defaultWorkflowName = "Untitled node project";

export function buildWorkflowDocument({
  id,
  name,
  fileName = null,
  createdAt = null,
  updatedAt = null,
  packagePath = "",
  nodes = [],
  edges = [],
  groups = [],
  viewport = { x: 0, y: 0, scale: 1 }
} = {}) {
  const now = updatedAt || new Date().toISOString();
  const cleanProjectName = String(name || "").trim() || defaultWorkflowName;

  return {
    id,
    name: cleanProjectName,
    fileName,
    createdAt: createdAt || now,
    updatedAt: now,
    app: "NewtNode",
    version: 1,
    packagePath: packagePath || "",
    graph: {
      nodes,
      edges,
      groups,
      viewport
    }
  };
}

export function workflowFileNameForProject(name) {
  const cleanName = String(name || defaultWorkflowName)
    .trim()
    .replace(/[^a-z0-9-_ ]+/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${cleanName || "newtnode-workflow"}.json`;
}

export function workflowDisplayPath(project = {}, fallback = "") {
  const workflow = project || {};
  const packageRoot = firstNonEmptyString(workflow.packagePath, workflow.package?.rootPath);
  const packageFile = firstNonEmptyString(workflow.package?.workflowFileName, workflow.fileName);
  if (packageRoot) return joinDisplayPath(packageRoot, packageFile);

  return firstNonEmptyString(workflow.filePath, workflow.workflowFilePath, workflow.fullPath, workflow.path, workflow.fileName, fallback);
}

export async function ensureWritableWorkflowHandle(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) return true;
  const options = { mode: "readwrite" };
  const currentPermission = await handle.queryPermission(options);
  if (currentPermission === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

export async function writeWorkflowFileHandle(handle, workflow) {
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(workflow, null, 2));
  } finally {
    await writable.close();
  }
}

function firstNonEmptyString(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function joinDisplayPath(root, child) {
  const cleanRoot = String(root || "").trim().replace(/[\\/]+$/, "");
  const cleanChild = String(child || "").trim().replace(/^[\\/]+/, "");
  if (!cleanRoot) return cleanChild;
  if (!cleanChild) return cleanRoot;
  if (cleanRoot.endsWith(`\\${cleanChild}`) || cleanRoot.endsWith(`/${cleanChild}`)) return cleanRoot;

  const separator = cleanRoot.includes("\\") && !cleanRoot.includes("/") ? "\\" : "/";
  return `${cleanRoot}${separator}${cleanChild}`;
}
