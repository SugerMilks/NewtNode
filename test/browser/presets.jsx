import React from "react";
import { createRoot } from "react-dom/client";
import { FolderOpen, FolderClock, Save, Download, Trash2, Plus, PanelLeftClose } from "lucide-react";
import { PresetWorkflowPicker } from "../../src/components/PresetWorkflowPicker.jsx";
import { SidebarMenu } from "../../src/components/SidebarMenu.jsx";
import { CanvasSnapToggle } from "../../src/components/CanvasChrome.jsx";
import { useNewtPresets } from "../../src/myNewt/useNewtPresets.js";
import { newtPresetsApi } from "../../src/api/newtApi.js";
import { bindNewtPresetInputs, instantiateNewtPreset, newtPresetOffset } from "../../src/myNewt/presets.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Real selector/controller, isolated preset library and canvas; no backend writes or generation.
const graph = { nodes: [{ id: "brief", type: "plainText", x: 0, y: 0, data: { title: "Brief", text: "A cinematic landscape" } },
  { id: "image", type: "imageModel", x: 450, y: 0, data: { title: "Image Model", model: "Nano Banana Pro" } }],
  edges: [{ id: "wire", from: { nodeId: "brief", port: "promptOut" }, to: { nodeId: "image", port: "promptIn" } }], groups: [], slots: [] };
const presets = [
  { id: "system", name: "Cinematic Image Workflow", isSystem: true, graph },
  { id: "user", name: "A very long user workflow name for a product campaign", isSystem: false, graph },
  { id: "bound", name: "Character Workflow", isSystem: true, graph: {
    nodes: [{ id: "character", type: "character", x: 0, y: 0, data: { title: "Lead" } }], edges: [], groups: [],
    slots: [{ nodeId: "character", label: "Lead", role: "Character", type: "character" }] } }
];
let failInsert = false, confirmDelete = true;
newtPresetsApi.list = async () => presets.map(({ graph, ...item }) => ({ ...item, nodeCount: graph.nodes.length, slots: graph.slots }));
newtPresetsApi.get = async id => {
  await new Promise(resolve => setTimeout(resolve, 300));
  if (failInsert) throw new Error("Could not load this preset. Try again.");
  return structuredClone(presets.find(item => item.id === id));
};
newtPresetsApi.remove = async id => {
  const index = presets.findIndex(item => item.id === id);
  if (index < 0 || presets[index].isSystem) throw new Error("Cannot delete this preset.");
  presets.splice(index, 1);
};
function Harness() {
  const [nodes, setNodes] = React.useState([{ id: "emma", type: "character", x: 0, y: 0, data: { title: "Emma", characterName: "Emma" } }]);
  const [status, setStatus] = React.useState("Ready"), [blocked, setBlocked] = React.useState(false);
  const [insertions, setInsertions] = React.useState(0);
  const [confirmation, setConfirmation] = React.useState("");
  const [fileOpen, setFileOpen] = React.useState(false), [recentOpen, setRecentOpen] = React.useState(false), [collapsed, setCollapsed] = React.useState(false);
  const [fileAction, setFileAction] = React.useState("");
  const [snap, setSnap] = React.useState(false);
  const [projects, setProjects] = React.useState([{ id: "one", name: "Vector Example" }, { id: "two", name: "A very long recent project name that should fit the sidebar" }]);
  React.useEffect(() => {
    const previous = window.confirm;
    window.confirm = message => { setConfirmation(message); return confirmDelete; };
    return () => { window.confirm = previous; };
  }, []);
  const ref = React.useRef(nodes); ref.current = nodes;
  const controller = useNewtPresets({ projectId: "qa", getNodes: () => nodes, onStatus: setStatus,
    insert: (source, bindings) => {
      const occupied = ref.current.map(node => ({ left: node.x, top: node.y, right: node.x + 400, bottom: node.y + 500 }));
      const inserted = bindNewtPresetInputs(instantiateNewtPreset(source, newtPresetOffset(source, occupied)), bindings, ref.current);
      setNodes(current => [...current, ...inserted.nodes]); setInsertions(count => count + 1);
    }
  });
  return <main style={{ padding: 16 }}>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
      <label><input type="checkbox" checked={blocked} onChange={event => setBlocked(event.target.checked)} />Newt running</label>
      <label><input type="checkbox" onChange={event => { failInsert = event.target.checked; }} />Fail preset load</label>
      <label><input type="checkbox" defaultChecked onChange={event => { confirmDelete = event.target.checked; }} />Confirm deletion</label>
      <output aria-label="Insertions">{insertions}</output><output aria-label="Status">{status}</output>
      <output aria-label="Confirmation">{confirmation}</output>
      <output aria-label="File action">{fileAction}</output>
    </div>
    <section className={`node-workspace${collapsed ? " toolbar-collapsed" : ""}`} style={{ height: "calc(100dvh - 110px)", minHeight: 0 }}>
      {collapsed && <button className="sidebar-restore" title="Show node palette" onClick={() => setCollapsed(false)}>Show</button>}
      <aside className="node-toolbar">
        <div className="toolbar-header">
          {!collapsed && <>
          <SidebarMenu label="File" icon={FolderOpen} open={fileOpen} onOpenChange={setFileOpen} menuClassName="file-menu-list">
            {[["Save", Save], ["Save As", Save], ["Open", FolderOpen], ["Import", Download]].map(([name, Icon]) => <button type="button" role="menuitem" key={name} onClick={() => setFileAction(name)}><Icon size={15} /><span>{name}</span></button>)}
          </SidebarMenu>
          <SidebarMenu label="Recent Projects" icon={FolderClock} open={recentOpen} onOpenChange={setRecentOpen}>
            {projects.length ? projects.map(project => <div className="project-menu-row" role="none" key={project.id}>
              <button type="button" role="menuitem" className="project-load" onClick={() => setFileAction(`Load ${project.id}`)}>{project.name}</button>
              <button type="button" role="menuitem" className="project-delete" title={`Remove ${project.name}`} aria-label={`Remove ${project.name}`} onClick={() => setProjects(items => items.filter(item => item.id !== project.id))}><Trash2 size={13} /></button>
            </div>) : <small>No saved workflows</small>}
          </SidebarMenu>
          <PresetWorkflowPicker controller={controller} insertionDisabled={blocked} />
          <CanvasSnapToggle enabled={snap} onToggle={() => setSnap(value => !value)} />
          </>}
          <button className="sidebar-hide" title="Hide node palette" onClick={() => { setFileOpen(false); setRecentOpen(false); setCollapsed(true); }}><PanelLeftClose size={16} /></button>
        </div>
        <div className="project-tools">
          <button className="new-project-button"><Plus size={14} /><span>New Project</span></button>
          <input aria-label="Project name" defaultValue="Sidebar test" />
        </div>
        <button><Plus size={17} /><span>Image Model</span><Plus size={14} /></button>
      </aside>
      <div className="node-canvas" style={{ overflow: "auto", padding: 10 }}><output aria-label="Canvas nodes">{nodes.map(node => <div key={node.id}>{node.data.title} ({node.type})</div>)}</output></div>
    </section>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
