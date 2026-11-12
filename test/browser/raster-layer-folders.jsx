import React from "react";
import { createRoot } from "react-dom/client";
import ImageLayersDialog from "../../src/components/ImageLayersDialog.jsx";
import { ImageEditStudio } from "../../src/components/ImageEditStudio.jsx";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

const original = { id: "folders-fixture", name: "Separation", width: 800, height: 450, sourceUrl: "/uploads/folder-source.png", layers: [
  { id: "bg", name: "Background", url: "/outputs/folder-base.png", x: 0, y: 0, width: 800, height: 450, opacity: 1, visible: true, locked: false },
  { id: "subject", name: "Subject", url: "/outputs/folder-subject.png", x: 300, y: 80, width: 200, height: 280, opacity: 1, visible: true, locked: false },
  { id: "detail", name: "Detail", url: "/outputs/folder-detail.png", x: 520, y: 100, width: 120, height: 140, opacity: 1, visible: true, locked: false }
], items: [{ url: "/outputs/folder-composite.png", type: "image", width: 800, height: 450 }] };
const item = { ...original.items[0], imageLayersDocument: original, editContext: { nodeId: "folder-node" } };
function Harness() {
  const [doc, setDoc] = React.useState(original), [draft, setDraft] = React.useState(original), [exported, setExported] = React.useState(null), [saved, setSaved] = React.useState(null);
  const embedded = new URLSearchParams(location.search).has("embedded");
  return <main><output hidden aria-label="Folder draft">{JSON.stringify(draft)}</output><output hidden aria-label="Folder export">{JSON.stringify(exported)}</output><output hidden aria-label="Folder saved">{JSON.stringify(saved)}</output>
    {embedded ? <ImageEditStudio item={item} workflowContext={{ projectId: "folders-qa" }} provider="fal" canApply onAccept={(_source, result) => setSaved(result)} onClose={() => {}} />
      : <ImageLayersDialog key={doc.id} document={doc} originalSeparation={original} onDraftChange={(layers, changed, folders) => setDraft({ ...doc, layers, folders, changed })}
        onSave={value => { setSaved(value); setDoc({ ...value, id: `saved-${Date.now()}` }); }} onExportPsd={setExported} onClose={() => {}} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
