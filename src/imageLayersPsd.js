import { systemApi } from "./api/newtApi.js";

export async function chooseLayersPsdPath({ title = "Layers", workflowContext = {} } = {}, selectSavePath = systemApi.selectSavePath) {
  const name = String(title).replace(/\.psd$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 100) || "Layers";
  const { response, data } = await selectSavePath({ title: "Name and save the layered Photoshop file", defaultName: `${name}.psd`,
    defaultPath: workflowContext.workflowPackagePath || "", extension: "psd" });
  if (data?.canceled) return null;
  if (!response.ok) throw new Error(data?.error || "Could not choose where to save the PSD.");
  return data?.path || null;
}
