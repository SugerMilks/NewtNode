// Freeze the inherited scene and rewire its actual assets before removing the old control edge.
export function migrateStoryboardDirectors(nodes, edges, { sceneText, usesReference }) {
  const map = new Map(nodes.map(node => [node.id, node]));
  const migrated = new Map();
  const removed = new Set();
  const added = [];
  for (const edge of edges) {
    if (!edge?.from?.nodeId || !edge?.to?.nodeId) continue;
    const director = map.get(edge.from.nodeId);
    const board = map.get(edge.to.nodeId);
    if (board?.type !== "storyboard" || director?.type !== "skillDirector" || !["directorIn", "sceneDescriptionIn"].includes(edge.to.port)) continue;
    removed.add(edge.id);
    if (migrated.has(board.id)) continue;
    const description = sceneText(director) || director.data.sceneOverview || director.data.resultText || board.data.sceneDescription || "";
    const wasPlanned = Boolean(board.data.storyboardPlanSceneDescription || board.data.storyboardFrames?.some(frame => frame.resultUrl || frame.exportUrl));
    migrated.set(board.id, { ...board, data: { ...board.data,
      sceneDescription: description,
      sceneName: director.data.sceneName || board.data.sceneName,
      storyboardPlanSceneDescription: wasPlanned ? description : "",
      storyboardLegacyDirector: { nodeId: director.id, originalSceneDescription: board.data.sceneDescription || "", shotList: director.data.shotList || "", previousInputs: edges.filter(item => item?.to?.nodeId === board.id) },
      storyboardMigrationNotice: "Director scene and references were copied into this independent Storyboard.",
      useInternalStoryboardCharacters: false
    } });
    for (const input of edges.filter(item => item?.from?.nodeId && item?.to?.nodeId === director.id)) {
      const port = { locationIn: "sceneReferenceIn", imageIn: "propsIn", characterIn: "characterIn" }[input.to.port];
      const type = { locationIn: "location", imageIn: "element", characterIn: "character" }[input.to.port];
      if (!port || !usesReference(director, map.get(input.from.nodeId), type)) continue;
      added.push({ ...input, id: `storyboard-migrated-${board.id}-${input.id}`, to: { nodeId: board.id, port } });
    }
  }
  const result = edges.filter(edge => edge?.from?.nodeId && edge?.to?.nodeId && !removed.has(edge.id) && !(migrated.has(edge.to.nodeId) && ["sceneDescriptionIn", "sceneReferenceIn", "propsIn", "characterIn"].includes(edge.to.port)));
  for (const edge of added) if (![...result].some(item => item.from.nodeId === edge.from.nodeId && item.from.port === edge.from.port && item.to.nodeId === edge.to.nodeId && item.to.port === edge.to.port)) result.push(edge);
  return { nodes: nodes.map(node => migrated.get(node.id) || node), edges: result };
}
