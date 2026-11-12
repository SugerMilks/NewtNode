import React from "react";
import { createRoot } from "react-dom/client";
import ImageLayersDialog from "../../src/components/ImageLayersDialog.jsx";
import { ImageEditStudio } from "../../src/components/ImageEditStudio.jsx";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const document = { id: "layer-edit-fixture", name: "Separation", width: 800, height: 450, sourceUrl: "/uploads/raster-edit-source.png", layers: [
  { id: "bg", name: "Background", url: "/outputs/raster-edit-bg.png", x: 0, y: 0, width: 800, height: 450, opacity: 1, visible: true, locked: false },
  { id: "subject", name: "Subject", url: "/outputs/raster-edit-subject.png", x: 300, y: 80, width: 200, height: 280, rotation: 25, opacity: .9, visible: true, locked: false }
], items: [{ url: "/outputs/raster-edit-composite.png", type: "image", width: 800, height: 450 }] };
const item = { ...document.items[0], imageLayersDocument: document, label: "Layered artwork", editContext: { nodeId: "layer-edit-node" } };
function Harness() {
  const [open, setOpen] = React.useState(true), [saved, setSaved] = React.useState(null);
  const [scope, setScope] = React.useState("layer-edit-qa");
  React.useEffect(() => { window.changeLayerEditScope = () => setScope("another-project"); }, []);
  return <main><button onClick={() => setOpen(true)}>Open</button><pre aria-label="Saved layers">{JSON.stringify(saved)}</pre>{open && (new URLSearchParams(location.search).has("embedded")
    ? <ImageEditStudio key={scope} item={item} workflowContext={{ projectId: scope }} provider="fal" canApply showApiCosts onAccept={(_source, result) => setSaved(result)} onClose={() => setOpen(false)} />
    : <ImageLayersDialog key={scope} document={document} originalSeparation={document} workflowContext={{ projectId: scope }} nodeId="layer-edit-node" provider="fal" showApiCosts onSave={doc => setSaved(doc)} onExportPsd={doc => setSaved(doc)} onClose={() => setOpen(false)} />)}</main>;
}
createRoot(globalThis.document.getElementById("root")).render(<Harness />);
