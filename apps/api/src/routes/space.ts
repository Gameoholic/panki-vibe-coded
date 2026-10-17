import { Router } from "express";
import type { Space, StorageReport } from "@panki/contracts";
import { requireAdmin } from "../session";

/**
 * `GET /api/space`: what's left on the disk Panki keeps its data on, read afresh each time. The same for every
 * account: they share the disk. `GET /api/space/report`, for an admin alone: everything Panki's data takes on it,
 * account by account and by kind of file, what everyone shares, and the disk; read-only, what `pnpm space` prints.
 */
export function spaceRouter(read: () => Space, report: () => StorageReport) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ space: read() });
  });

  router.get("/report", requireAdmin, (_req, res) => {
    res.json({ report: report() });
  });

  return router;
}
