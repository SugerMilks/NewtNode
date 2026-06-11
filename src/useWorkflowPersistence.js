import React from "react";
import { systemApi, workflowApi } from "./api/newtApi.js";
import {
  buildWorkflowDocument,
  ensureWritableWorkflowHandle,
  workflowDisplayPath,
  workflowFileNameForProject,
  writeWorkflowFileHandle
} from "./workflowFiles.js";
import { lastPackageParentPath, rememberOpenedWorkflowPath, rememberPackageParentPath, workflowPickerDefaultPath } from "./workflowPreferences.js";
import { appendWorkflowRequestContextToForm, currentWorkflowDisplayPath, selectedWorkflowProjectName, workflowRequestContextForState } from "./workflowSession.js";
import { createNodeId, remapImportedGraph, workflowStateFingerprint } from "./workflowState.js";

export function useWorkflowPersistence({
  savedDraft,
  nodes,
  edges,
  groups,
  viewport,
  projectId,
  projectName,
  savedProjectName,
  projectPackagePath,
  workflowFilePath,
  setNodes,
  setEdges,
  setGroups,
  setViewport,
  setProjectId,
  setProjectName,
  setSavedProjectName,
  setProjectPackagePath,
  setWorkflowFilePath,
  setSelectedNodeIds,
  setSelectedEdgeId,
  setProjectMenuOpen,
  setFileMenuOpen,
  newProjectNodes = [],
  newProjectEdges = [],
  newProjectGroups = [],
  newProjectViewport = { x: 0, y: 0, scale: 1 },
  normalizeEditorGraph,
  dedupeEdges,
  pushUndoSnapshot,
  clearUndoStack,
  importOffsetForNodes,
  onStatusChange
}) {
  const workflowFileInputRef = React.useRef(null);
  const localWorkflowHandleRef = React.useRef(null);
  const unsavedPromptResolverRef = React.useRef(null);
  const saveInFlightRef = React.useRef(null);
  const [cleanWorkflowFingerprint, setCleanWorkflowFingerprint] = React.useState(() => workflowStateFingerprint(savedDraft));
  const [projects, setProjects] = React.useState([]);
  const [localWorkflowFileName, setLocalWorkflowFileName] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState("");
  const [unsavedPrompt, setUnsavedPrompt] = React.useState(null);

  const selectedProjectName = selectedWorkflowProjectName(projects, projectId);
  const currentWorkflowFingerprint = React.useMemo(
    () => workflowStateFingerprint({ nodes, edges, groups, projectName, projectPackagePath }),
    [nodes, edges, groups, projectName, projectPackagePath]
  );
  const hasUnsavedChanges = currentWorkflowFingerprint !== cleanWorkflowFingerprint;
  const currentWorkflowPath = React.useMemo(
    () => currentWorkflowDisplayPath({ workflowFilePath, projectPackagePath, localWorkflowFileName, savedProjectName, projectName }),
    [workflowFilePath, projectPackagePath, localWorkflowFileName, savedProjectName, projectName]
  );

  React.useEffect(() => {
    if (!currentWorkflowPath && !saveStatus) {
      onStatusChange?.("");
      return;
    }

    onStatusChange?.({
      message: saveStatus || "",
      workflowPath: currentWorkflowPath,
      workflowState: currentWorkflowPath ? (hasUnsavedChanges ? "unsaved" : "saved") : ""
    });
  }, [onStatusChange, saveStatus, currentWorkflowPath, hasUnsavedChanges]);

  function workflowRequestContext(overrides = {}) {
    return workflowRequestContextForState({ projectId, projectName, savedProjectName, selectedProjectName, projectPackagePath }, overrides);
  }

  function appendWorkflowContextToForm(form, overrides = {}) {
    appendWorkflowRequestContextToForm(form, { projectId, projectName, savedProjectName, selectedProjectName, projectPackagePath }, overrides);
  }

  async function loadProjects() {
    try {
      const projectList = await workflowApi.listSummary();
      setProjects(projectList);
      if (projectId && !savedProjectName) {
        const currentProject = projectList.find((project) => project.id === projectId);
        if (currentProject?.name) setSavedProjectName(currentProject.name);
      }
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  function currentWorkflowDocument({ id = projectId || createNodeId("workflow"), name = projectName, fileName = null, createdAt = null } = {}) {
    return buildWorkflowDocument({
      id,
      name,
      fileName,
      packagePath: projectPackagePath || "",
      createdAt,
      nodes,
      edges,
      groups,
      viewport
    });
  }

  function markWorkflowClean(overrides = {}) {
    setCleanWorkflowFingerprint(
      workflowStateFingerprint({
        nodes,
        edges,
        groups,
        projectName,
        projectPackagePath,
        ...overrides
      })
    );
  }

  function requestUnsavedWorkflowDecision(actionLabel) {
    if (!hasUnsavedChanges) return Promise.resolve("discard");
    return new Promise((resolve) => {
      unsavedPromptResolverRef.current = resolve;
      setUnsavedPrompt({ actionLabel });
    });
  }

  function resolveUnsavedWorkflowPrompt(decision) {
    const resolver = unsavedPromptResolverRef.current;
    unsavedPromptResolverRef.current = null;
    setUnsavedPrompt(null);
    resolver?.(decision);
  }

  async function guardUnsavedWorkflowChange(actionLabel) {
    if (!hasUnsavedChanges) return true;
    const decision = await requestUnsavedWorkflowDecision(actionLabel);
    if (decision === "cancel") return false;
    if (decision === "save") return saveProject();
    return true;
  }

  async function saveProjectToLocalHandle(handle) {
    const cleanProjectName = String(projectName || "").trim() || "Untitled node project";
    const id = projectId || createNodeId("workflow");
    const workflow = currentWorkflowDocument({
      id,
      name: cleanProjectName,
      fileName: handle.name || localWorkflowFileName || workflowFileNameForProject(cleanProjectName)
    });

    if (!(await ensureWritableWorkflowHandle(handle))) {
      throw new Error("Permission to write that workflow file was denied.");
    }

    await writeWorkflowFileHandle(handle, workflow);
    setProjectId(id);
    setProjectName(workflow.name);
    setSavedProjectName(workflow.name);
    setLocalWorkflowFileName(handle.name || workflow.fileName);
    setWorkflowFilePath(workflowDisplayPath(workflow, handle.name || workflow.fileName));
    markWorkflowClean({ projectName: workflow.name });
    setSaveStatus(`Saved ${workflowDisplayPath(workflow, handle.name || workflow.fileName)}`);
    return true;
  }

  async function saveProjectAsLocalFile() {
    const cleanProjectName = String(projectName || "").trim() || "Untitled node project";

    try {
      const suggestedParent = lastPackageParentPath();
      setSaveStatus("Choosing package folder...");
      const { response, data } = await systemApi.selectFolder({
        title: "Choose parent folder for this NewtNode workflow package",
        defaultPath: suggestedParent
      });
      if (!response.ok) {
        if (data.canceled) {
          setSaveStatus("Save As canceled");
          return false;
        }
        throw new Error(data.error || "Could not choose a package folder.");
      }

      const packageParentPath = data.path || "";
      if (!packageParentPath) {
        setSaveStatus("Save As canceled");
        return false;
      }

      rememberPackageParentPath(packageParentPath);
      return saveProjectToSavedWorkflows({ packageParentPath, saveAsPackage: true, name: cleanProjectName });
    } catch (error) {
      setSaveStatus(error.message || "Could not save workflow package.");
      return false;
    }
  }

  async function saveProjectToSavedWorkflows(options = {}) {
    try {
      const cleanProjectName = String(options.name || projectName || "").trim() || "Untitled node project";
      const lastSavedName = String(savedProjectName || selectedProjectName || "").trim();
      const shouldCreateNewProject = Boolean(!projectPackagePath && projectId && lastSavedName && cleanProjectName !== lastSavedName);

      setSaveStatus(options.saveAsPackage ? "Saving workflow package..." : "Saving...");
      const project = await workflowApi.save({
        id: shouldCreateNewProject ? null : projectId,
        name: cleanProjectName,
        packageParentPath: options.packageParentPath || "",
        packagePath: options.packageParentPath ? "" : options.packagePath || projectPackagePath || "",
        nodes,
        edges,
        groups,
        viewport
      });
      setProjectId(project.id);
      setProjectName(project.name);
      setSavedProjectName(project.name);
      const nextPackagePath = project.packagePath || project.package?.rootPath || "";
      setProjectPackagePath(nextPackagePath);
      const savedPath = workflowDisplayPath(project);
      setWorkflowFilePath(savedPath);
      setSaveStatus(savedPath ? `Saved ${savedPath}` : shouldCreateNewProject ? "Saved as new workflow" : "Saved");
      await loadProjects();
      markWorkflowClean({
        nodes,
        edges,
        groups,
        projectName: project.name,
        projectPackagePath: nextPackagePath
      });
      return true;
    } catch (error) {
      setSaveStatus(error.message);
      return false;
    }
  }

  async function saveProject() {
    if (saveInFlightRef.current) return saveInFlightRef.current;

    saveInFlightRef.current = (async () => {
      if (localWorkflowHandleRef.current) {
        try {
          setSaveStatus("Saving local workflow...");
          await saveProjectToLocalHandle(localWorkflowHandleRef.current);
        } catch (error) {
          setSaveStatus(error.message || "Could not save workflow JSON.");
          return false;
        }
        return true;
      }

      return saveProjectToSavedWorkflows();
    })();

    try {
      return await saveInFlightRef.current;
    } finally {
      saveInFlightRef.current = null;
    }
  }

  async function startNewProject() {
    try {
      if (!(await guardUnsavedWorkflowChange("start a new project"))) return false;

      const graph = normalizeEditorGraph(newProjectNodes, newProjectEdges, newProjectGroups);
      localWorkflowHandleRef.current = null;
      setLocalWorkflowFileName("");
      setProjectId(null);
      setProjectName("Untitled node project");
      setSavedProjectName(null);
      setProjectPackagePath("");
      setWorkflowFilePath("");
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setGroups(graph.groups);
      setViewport(newProjectViewport);
      setSelectedNodeIds([]);
      setSelectedEdgeId(null);
      clearUndoStack?.();
      setProjectMenuOpen(false);
      setFileMenuOpen(false);
      markWorkflowClean({
        nodes: graph.nodes,
        edges: graph.edges,
        groups: graph.groups,
        projectName: "Untitled node project",
        projectPackagePath: ""
      });
      setSaveStatus("New project ready");
      return true;
    } catch (error) {
      setSaveStatus(error.message || "Could not start a new project.");
      return false;
    }
  }

  function applyWorkflow(project, sourceLabel = "Loaded") {
    const graph = normalizeEditorGraph(project.graph?.nodes || [], project.graph?.edges || [], project.graph?.groups || []);
    const nextProjectName = project.name || "Untitled node project";
    const nextPackagePath = project.packagePath || project.package?.rootPath || "";
    const nextViewport = project.graph?.viewport || { x: 0, y: 0, scale: 1 };
    const displayPath = workflowDisplayPath(project);
    localWorkflowHandleRef.current = null;
    setLocalWorkflowFileName("");
    setProjectId(project.id || null);
    setProjectName(nextProjectName);
    setSavedProjectName(project.name || null);
    setProjectPackagePath(nextPackagePath);
    setWorkflowFilePath(displayPath);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setGroups(graph.groups);
    setViewport(nextViewport);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    clearUndoStack?.();
    setProjectMenuOpen(false);
    markWorkflowClean({
      nodes: graph.nodes,
      edges: graph.edges,
      groups: graph.groups,
      projectName: nextProjectName,
      projectPackagePath: nextPackagePath
    });
    setSaveStatus(displayPath ? `${sourceLabel} ${displayPath}` : sourceLabel);
  }

  async function openWorkflowFile(file) {
    if (!file) return;

    try {
      if (!(await guardUnsavedWorkflowChange("open another workflow"))) return;
      const project = JSON.parse(await file.text());
      if (!project?.graph || !Array.isArray(project.graph.nodes) || !Array.isArray(project.graph.edges)) {
        throw new Error("That JSON file is not a NewtNode workflow.");
      }

      let openedProject = {
        ...project,
        id: project.id || null,
        name: project.name || file.name.replace(/\.json$/i, "") || "Untitled node project",
        fileName: project.fileName || file.name,
        filePath: project.filePath || project.workflowFilePath || project.fullPath || project.path || file.name
      };

      if (openedProject.packagePath || openedProject.package?.rootPath) {
        const registered = await workflowApi.registerPackage({ workflow: openedProject });
        openedProject = registered;
      }

      applyWorkflow(openedProject, "Opened");
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message || "Could not open workflow.");
    } finally {
      if (workflowFileInputRef.current) {
        workflowFileInputRef.current.value = "";
      }
    }
  }

  async function openWorkflowFromSystemPicker() {
    try {
      if (!(await guardUnsavedWorkflowChange("open another workflow"))) return;
      const defaultPath = workflowPickerDefaultPath(projectPackagePath);
      setSaveStatus("Opening workflow...");
      const { response, data } = await systemApi.openWorkflowFile(
        {
          title: "Open NewtNode workflow package",
          defaultPath
        },
        "Open workflow"
      );

      if (!response.ok) {
        if (data.canceled) {
          setSaveStatus("Open canceled");
          return;
        }
        throw new Error(data.error || "Could not open workflow.");
      }

      applyWorkflow(data, "Opened");
      rememberOpenedWorkflowPath(data);
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message || "Could not open workflow.");
    }
  }

  async function openWorkflowPackageFolderFromSystemPicker() {
    try {
      if (!(await guardUnsavedWorkflowChange("open another workflow package"))) return;
      const defaultPath = workflowPickerDefaultPath(projectPackagePath);
      setSaveStatus("Opening workflow package...");
      const { response, data } = await systemApi.openWorkflowFile(
        {
          title: "Open NewtNode workflow package folder",
          defaultPath,
          mode: "folder"
        },
        "Open workflow package"
      );

      if (!response.ok) {
        if (data.canceled) {
          setSaveStatus("Open canceled");
          return;
        }
        throw new Error(data.error || "Could not open workflow package.");
      }

      applyWorkflow(data, "Opened");
      rememberOpenedWorkflowPath(data);
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message || "Could not open workflow package.");
    }
  }

  async function importWorkflowFromSystemPicker() {
    try {
      const defaultPath = workflowPickerDefaultPath(projectPackagePath);
      setSaveStatus("Importing workflow...");
      const { response, data } = await systemApi.openWorkflowFile(
        {
          title: "Import NewtNode workflow",
          defaultPath
        },
        "Import workflow"
      );

      if (!response.ok) {
        if (data.canceled) {
          setSaveStatus("Import canceled");
          return;
        }
        throw new Error(data.error || "Could not import workflow.");
      }

      importWorkflow(data);
      rememberOpenedWorkflowPath(data);
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message || "Could not import workflow.");
    }
  }

  async function importWorkflowPackageFolderFromSystemPicker() {
    try {
      const defaultPath = workflowPickerDefaultPath(projectPackagePath);
      setSaveStatus("Importing workflow package...");
      const { response, data } = await systemApi.openWorkflowFile(
        {
          title: "Import NewtNode workflow package folder",
          defaultPath,
          mode: "folder"
        },
        "Import workflow package"
      );

      if (!response.ok) {
        if (data.canceled) {
          setSaveStatus("Import canceled");
          return;
        }
        throw new Error(data.error || "Could not import workflow package.");
      }

      importWorkflow(data);
      rememberOpenedWorkflowPath(data);
      await loadProjects();
    } catch (error) {
      setSaveStatus(error.message || "Could not import workflow package.");
    }
  }

  function importWorkflow(project) {
    const graph = normalizeEditorGraph(project.graph?.nodes || [], project.graph?.edges || [], project.graph?.groups || []);
    if (!graph.nodes.length) {
      setSaveStatus("That workflow has no nodes to import");
      return;
    }

    const offset = importOffsetForNodes(graph.nodes);
    const { nodes: importedNodes, edges: importedEdges, groups: importedGroups } = remapImportedGraph(graph, offset);

    pushUndoSnapshot();
    setNodes((current) => [...current, ...importedNodes]);
    setEdges((current) => dedupeEdges([...current, ...importedEdges]));
    setGroups((current) => [...current, ...importedGroups]);
    setSelectedNodeIds(importedNodes.map((node) => node.id));
    setSelectedEdgeId(null);
    setProjectMenuOpen(false);
    setFileMenuOpen(false);
    setSaveStatus(`Imported ${project.name || "workflow"} into a clear canvas area`);
  }

  async function loadProject(id) {
    if (!id) return;

    try {
      if (!(await guardUnsavedWorkflowChange("load another workflow"))) return;
      const selectedProject = projects.find((project) => project.id === id || project.fileName === id);
      const fileName = selectedProject?.registryFileName || selectedProject?.fileName || id;
      const project = await workflowApi.open(fileName);
      applyWorkflow(project, "Loaded");
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  async function deleteProject(project) {
    if (!window.confirm(`Remove "${project.name}" from the workflow dropdown? The JSON file will stay on disk.`)) return;

    try {
      const nextProjects = await workflowApi.remove(project.registryFileName || project.fileName || project.id);
      setProjects(nextProjects);
      if (projectId === project.id) {
        setProjectId(null);
        setProjectName("Untitled node project");
        setSavedProjectName(null);
        setProjectPackagePath("");
        setWorkflowFilePath("");
      }
      setProjectMenuOpen(false);
      setSaveStatus("Workflow removed from dropdown");
    } catch (error) {
      setSaveStatus(error.message);
    }
  }

  return {
    workflowFileInputRef,
    projects,
    selectedProjectName,
    saveStatus,
    setSaveStatus,
    unsavedPrompt,
    resolveUnsavedWorkflowPrompt,
    currentWorkflowPath,
    hasUnsavedChanges,
    workflowRequestContext,
    appendWorkflowContextToForm,
    loadProjects,
    saveProject,
    startNewProject,
    saveProjectAsLocalFile,
    openWorkflowFile,
    openWorkflowFromSystemPicker,
    openWorkflowPackageFolderFromSystemPicker,
    importWorkflowFromSystemPicker,
    importWorkflowPackageFolderFromSystemPicker,
    loadProject,
    deleteProject
  };
}
