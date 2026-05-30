import path from "node:path";
import { mkdir } from "node:fs/promises";
import { writeJsonAtomic } from "../json-store.js";

export function registerComposerPoseRoutes(
  app,
  {
    composerPosesDir,
    readComposerPoses,
    normalizeComposerPose,
    safeComposerPoseFileName,
    uniqueComposerPoseFileName
  }
) {
  app.get("/api/composer-poses", async (_req, res) => {
    res.json({ poses: await readComposerPoses() });
  });

  app.post("/api/composer-poses", async (req, res) => {
    const pose = normalizeComposerPose(req.body.pose || req.body);
    if (!pose) {
      return res.status(400).json({ error: "Invalid pose." });
    }

    const existing = await readComposerPoses();
    const fileName = pose.fileName && safeComposerPoseFileName(pose.fileName) ? safeComposerPoseFileName(pose.fileName) : uniqueComposerPoseFileName(pose.name, existing);
    const savedPose = {
      ...pose,
      fileName,
      savedAt: new Date().toISOString()
    };

    await mkdir(composerPosesDir, { recursive: true });
    await writeJsonAtomic(path.join(composerPosesDir, fileName), savedPose);
    res.json({ pose: savedPose, poses: await readComposerPoses() });
  });
}
