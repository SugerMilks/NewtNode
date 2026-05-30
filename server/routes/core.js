export function registerCoreRoutes(
  app,
  {
    safeRelativeAssetPath,
    resolveLocalAssetPath,
    workflowPackagePublicPath,
    selectFolderWithDialog,
    selectWorkflowFileWithDialog,
    readWorkflowFromFilePath,
    buildHealthPayload,
    timedApi,
    buildStorageDiagnostics
  }
) {
  app.get(/^\/workflow-assets\/([^/]+)\/(.+)$/, async (req, res) => {
    try {
      const workflowId = decodeURIComponent(req.params[0] || "");
      const relativePath = safeRelativeAssetPath(decodeURIComponent(req.params[1] || ""));
      if (!workflowId || !relativePath) return res.status(400).send("Invalid workflow asset path.");

      const { filePath } = await resolveLocalAssetPath(workflowPackagePublicPath(workflowId, relativePath));
      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) res.status(error.statusCode || 404).send("Workflow asset not found.");
      });
    } catch (error) {
      if (!res.headersSent) res.status(400).send(error.message || "Invalid workflow asset path.");
    }
  });

  app.post("/api/system/select-folder", async (req, res) => {
    try {
      const selectedPath = await selectFolderWithDialog({
        title: String(req.body.title || "Choose folder"),
        defaultPath: String(req.body.defaultPath || "")
      });
      res.json({ path: selectedPath });
    } catch (error) {
      const status = error.code === "DIALOG_CANCELED" ? 499 : 500;
      res.status(status).json({ error: error.message || "Folder selection failed.", canceled: error.code === "DIALOG_CANCELED" });
    }
  });

  app.post("/api/system/open-workflow-file", async (req, res) => {
    try {
      const selectedPath = await selectWorkflowFileWithDialog({
        title: String(req.body.title || "Open NewtNode workflow"),
        defaultPath: String(req.body.defaultPath || "")
      });
      const workflow = await readWorkflowFromFilePath(selectedPath);
      res.json(workflow);
    } catch (error) {
      const status = error.code === "DIALOG_CANCELED" ? 499 : 500;
      res.status(status).json({ error: error.message || "Workflow selection failed.", canceled: error.code === "DIALOG_CANCELED" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json(buildHealthPayload());
  });

  app.get("/api/storage/diagnostics", async (_req, res) => {
    await timedApi("storage:diagnostics", async () => {
      res.json(await buildStorageDiagnostics());
    });
  });
}
