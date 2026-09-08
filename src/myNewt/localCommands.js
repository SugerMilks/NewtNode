import { localNamedNode, localAttachedNodes, localAssetChoices, localWorkflowBindings } from "./localAssets.js";
import { newtPresetDisplayName } from "./presets.js";

const action = (summary, operation, payload = {}) => ({ route: "local", summary, action: { operation, payload } });
export function myNewtBackgroundCommand(text, snapshot, workflows) {
  if (/^save(?: (?:the |my |this )?(?:project|work|workflow))?$/i.test(text)) return action("Save the current project.", "save-project");
  let match = text.match(/^rename (?:the |my |this )?project to (?:"([^"\n]+)"|([^"\n]+))$/i);
  if (match) {
    const name = (match[1] || match[2]).trim();
    if (!name || name.length > 160 || (!match[1] && /\b(?:and|then)\b/i.test(name))) throw new Error('Use a project name in quotes, for example Rename project to "Summer Campaign".');
    return action(`Rename the project to "${name}". Save the project to persist the new name.`, "rename-project", { name });
  }
  match = text.match(/^(?:duplicate|copy) (?:(\d+) copies of )?(?:(?:the )?selected nodes?|(?:the )?group "([^"\n]+)"|(@[\w-]+|"[^"\n]+"))(?: (\d+) times)?$/i);
  if (match) {
    if (match[1] && match[4]) throw new Error("Specify the copy count only once.");
    const count = Number(match[1] || match[4] || 1);
    let nodeIds, groupId;
    if (match[2]) {
      const groups = (snapshot.groups || []).filter((group) => (group.title || group.name || "").toLowerCase() === match[2].toLowerCase());
      if (groups.length !== 1) throw new Error("Use a unique, existing group name.");
      nodeIds = groups[0].nodeIds; groupId = groups[0].id;
    } else if (match[3]) nodeIds = [localNamedNode(snapshot, match[3]).id];
    else nodeIds = (snapshot.selectedNodeIds || []).filter((id) => snapshot.nodes.find((node) => node.id === id)?.type !== "myNewt");
    nodeIds = [...new Set(nodeIds)];
    if (!Number.isInteger(count) || count < 1 || count > 10 || !nodeIds.length || nodeIds.length * count > 100) throw new Error("Select creative nodes and request 1 to 10 copies, up to 100 new nodes.");
    if (nodeIds.some((id) => ["running", "planning", "compiling", "uploading", "generating"].includes(snapshot.nodes.find((node) => node.id === id)?.data?.status))) throw new Error("Wait for these nodes to finish before duplicating them.");
    return action(`Duplicate ${nodeIds.length} node${nodeIds.length === 1 ? "" : "s"}, ${count} ${count === 1 ? "copy" : "copies"}. Preserve results and incoming references; do not generate.`, "duplicate", { nodeIds, count, ...(groupId ? { groupId } : {}) });
  }
  if (/^(?:list|show) (?:the |my )?(?:attached assets|connected assets|inputs)$|^what(?:'s| is) (?:attached|connected)\??$/i.test(text)) {
    const assets = localAttachedNodes(snapshot);
    return action(assets.length ? `Attached assets: ${assets.map((node) => `${node.data?.title || node.type} (${node.type})`).join(", ")}.` : "No assets are attached to Newt.", "report");
  }
  if (/^(?:list|show) (?:the |my )?(?:saved )?presets$/i.test(text)) return action(`Saved presets: ${(snapshot.presets || []).map(newtPresetDisplayName).join(", ") || "none"}.`, "report");
  if (/^(?:list|show) (?:the |my )?nodes$/i.test(text)) return action(`Project nodes: ${(snapshot.nodes || []).filter((node) => node.type !== "myNewt").map((node) => node.data?.title || node.type).join(", ") || "none"}.`, "report");

  match = text.match(/^(?:set up|setup|build|create|add|insert) (?:an? |the )?coverage(?: workflow)? for each (?:of the )?attached images?$/i);
  if (match) {
    const sources = localAssetChoices(snapshot, "attached images");
    if (sources.length > 10) throw new Error("Set up Coverage for up to 10 attached image sources at a time.");
    return action(`Create ${sources.length} Coverage workflows, one per attached image source, each with a Preview layout. No generation.`, "workflow", { workflowId: "coverage", copies: sources.map((choice) => ({ bindings: localWorkflowBindings("coverage", [choice], 0) })) });
  }
  match = text.match(/^(?:show|preview) (.+?) (?:in|on) (?:a |the )?preview(?: node)?$/i);
  if (match) return workflowAction("asset-preview", match[1]);
  match = text.match(/^(?:set up|setup|build|create|add|insert) (?:an? |the )?(image edit|music video|image|video|coverage|director storyboard|director|storyboard)(?: workflow)? (?:using|with|from|for) (.+)$/i);
  if (match && /^(?:@|"|(?:(?:the|my) )?attached\b)/i.test(match[2])) return workflowAction(match[1].toLowerCase().replace(/ /g, "-"), match[2]);
  return null;

  function workflowAction(id, references) {
    const workflow = workflows.find((item) => item.id === id);
    if (!workflow || workflow.types.some((type) => !snapshot.catalog.some((entry) => entry.type === type))) throw new Error("This workflow is unavailable in the current node catalog.");
    const choices = localAssetChoices(snapshot, references);
    const index = ["director", "music-video", "director-storyboard", "coverage", "image-edit", "asset-preview"].includes(id) ? 0 : 1;
    const bindings = localWorkflowBindings(id === "director-storyboard" ? "director" : id, choices, index);
    return action(`Set up ${workflow.label} using ${choices.map(({ node }) => node.data?.title || node.type).join(", ")}. Keep the original assets connected. No generation.`, "workflow", { workflowId: id, bindings });
  }
}
