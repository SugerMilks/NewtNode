import React from "react";
import { createRoot } from "react-dom/client";
import { OutputPreviewLightbox, MediaPreview } from "../../src/components/MediaViews.jsx";
import "../../src/styles.css";
import "../../src/nodeEditor.css";
const source = { url: "/uploads/layers-edit-source.png", type: "image", label: "Layered artwork", editContext: { type: "nodeResult", nodeId: "qa", itemIndex: 0 } };
function Harness() {
  const [item, setItem] = React.useState(null), [saved, setSaved] = React.useState(null), [projectId, setProjectId] = React.useState(new URLSearchParams(location.search).get("project") || "advanced-layers-qa");
  return <main><button onClick={() => setItem(source)}>Open image</button><button disabled={!saved} onClick={() => setItem({ ...saved.result, editContext: source.editContext })}>Open saved image</button><button onClick={() => { setItem(null); setProjectId("recovery-qa"); history.replaceState(null, "", "?project=recovery-qa"); }}>Other project</button><pre aria-label="Accepted image">{JSON.stringify(saved)}</pre>
    {saved && <div style={{ width: 320 }}><MediaPreview node={{ id: "saved", type: "image", data: { resultUrl: saved.result.url, resultItems: [saved.result], fileName: "Layered.png" } }} onPreviewOpen={setItem} /></div>}
    {item && <OutputPreviewLightbox key={projectId + item.url} item={item} workflowContext={{ projectId }} onClose={() => setItem(null)} onApplyImageEdit={async () => {}} onAcceptAiEdit={async (source, result, action) => { setSaved({ source, result, action }); setItem(null); }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
