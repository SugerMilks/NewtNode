# Project Canvases

A project is now the saved container. Its canvases appear as compact tabs above the workspace. Existing projects open intact in Canvas 1, including their saved view. New projects start with one empty canvas.

## Working With Canvases

- Add a blank canvas with +. Double-click its tab to rename it.
- Drag tabs to reorder them. The tab's options menu also offers Rename, Duplicate, Move left/right, and Delete.
- Find canvas searches by name when the tab row gets long.
- Select nodes, then right-click a destination tab to copy or move the selection there. Ordinary node copy/paste also works between canvases.
- The asset sidebar's Project scope shares local outputs and uploads across the project. Drag an asset into the current canvas to reuse it. Canvas scope filters to the current canvas's assets.
- File > Import as Canvases brings existing single- or multi-canvas projects into the open project. File > Open replaces the open project as before, after the unsaved-work prompt.
- Save and Save As save every canvas together. Each canvas keeps its own pan/zoom and undo history during the session.

Switching canvases does not cancel generation. A small activity indicator marks working canvases. Media playback pauses on switching. Keep NewtNode open until requests finish; browser closure/restart recovery still depends on the particular node/provider, not on canvas tabs.

Moving nodes preserves completed media but disconnects wires to nodes left behind, with confirmation. Duplicating/copying never resubmits a generation and disables copied automatic exports. The existing single-Newt-per-project rule remains: Newt operates on its owning canvas, and duplicate canvases omit Newt. Imported projects retain Newt only when the open project does not already have one.

Deleting a canvas removes its nodes, not files on disk. The last canvas and canvases with active jobs cannot be deleted. Deletion is confirmed and is not undoable; cross-canvas transfers clear graph undo history to avoid resurrecting conflicting node IDs.

## Persistence

Version-2 documents keep the flat `graph.nodes`, `graph.edges` and `graph.groups` arrays for media packaging. Nodes/groups have `canvasId`; `graph.canvases` stores ordered descriptors and viewports. `activeCanvasId` selects the open view. There are no cross-canvas connections. Unknown canvas owners are recovered into named canvases instead of losing nodes.

The server must advertise `routes.projectCanvases` before the client saves this format. Older clients cannot overwrite an existing version-2 project through the current backend. Other installations should update NewtNode before opening these projects.

## Verification

`test/projectCanvases.test.js` covers migration, storage round trips, isolated undo, copy/move, busy protection, shared uploads, and capability gating. `scripts/verifyProjectCanvases.mjs` exercises the real app in an isolated browser with mocked saves and generation. It cannot submit paid requests or edit user projects.
