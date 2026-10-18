import { createHash } from "node:crypto";
import express, { Router, type Request, type RequestHandler, type Response } from "express";
import { MEDIA_MAX_BYTES, MediaCuesBody, MediaId, bareMime, mediaKindOfMime, type MediaKind } from "@panki/contracts";
import type { DbOf } from "../app";
import { hasMediaFile, sniffMimes, writeMediaFile } from "../mediaFiles";

/** Where the files of whoever the request belongs to live. */
export type MediaDirOf = (res: Response) => string;

const MB = 1024 * 1024;
const NOT_THERE = "That file doesn't exist.";

function isTooLarge(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && err.status === 413;
}

export function mediaRouter(dbOf: DbOf, mediaDirOf: MediaDirOf, now: () => number) {
  const router = Router();

  // A file is the request's whole body, read by its kind's own reader under that kind's own ceiling. Every other route
  // keeps the 64 KB of the JSON reader in app.ts, which leaves a body that isn't JSON alone.
  const reader = (kind: MediaKind): RequestHandler => express.raw({ type: () => true, limit: MEDIA_MAX_BYTES[kind] });
  const readers: Record<MediaKind, RequestHandler> = { audio: reader("audio"), video: reader("video"), image: reader("image") };

  /** What an upload says it is: its id from the address, its type from the header. Answers the request itself when either is wrong. */
  function uploadOf(req: Request, res: Response): { id: string; mime: string; kind: MediaKind } | null {
    const id = MediaId.safeParse(req.params.mediaId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That file id isn't valid." } });
      return null;
    }
    const mime = bareMime(req.headers["content-type"] ?? "");
    const kind = mediaKindOfMime(mime);
    if (!kind) {
      res.status(415).json({ error: { message: "Panki doesn't take that kind of file." } });
      return null;
    }
    return { id: id.data, mime, kind };
  }

  // The sender mints the id, so sending the same file again is harmless: it answers with the file that's there. The
  // same id with other bytes is refused, never overwritten: a card may already be pointing at it.
  router.put(
    "/:mediaId",
    (req, res, next) => {
      const upload = uploadOf(req, res);
      if (!upload) return;
      readers[upload.kind](req, res, (err?: unknown) => {
        if (isTooLarge(err)) res.status(413).json({ error: { message: `That file is over ${MEDIA_MAX_BYTES[upload.kind] / MB} MB.` } });
        else next(err);
      });
    },
    (req, res) => {
      const upload = uploadOf(req, res);
      if (!upload) return;
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: { message: "That file is empty." } });
        return;
      }
      // The type in the header is only what the sender says; the file's own first bytes decide.
      if (!sniffMimes(body).includes(upload.mime)) {
        res.status(400).json({ error: { message: "That file isn't the kind it says it is." } });
        return;
      }
      const db = dbOf(res);
      const dir = mediaDirOf(res);
      const sha256 = createHash("sha256").update(body).digest("hex");
      const taken = db.mediaHash(upload.id);
      if (taken !== null && taken !== sha256) {
        res.status(409).json({ error: { message: "Another file already has that id." } });
        return;
      }
      // The bytes first, then the row: an upload that fails part-way leaves nothing that claims a file is there.
      if (taken === null || !hasMediaFile(dir, upload.id)) writeMediaFile(dir, upload.id, body);
      const media = db.insertMedia({ id: upload.id, kind: upload.kind, mime: upload.mime, bytes: body.length, sha256 }, now());
      res.status(taken === null ? 201 : 200).json({ media });
    },
  );

  // What's said in a clip, sent with it by whoever recorded it (the extension, as it heard the video then): kept once,
  // for a sound or a clip the account holds. A retry is harmless and answers with what's kept; what's kept never changes.
  router.put("/:mediaId/cues", (req, res) => {
    const id = MediaId.safeParse(req.params.mediaId);
    const body = MediaCuesBody.safeParse(req.body);
    if (!id.success || !body.success) {
      res.status(400).json({ error: { message: "Those subtitles aren't valid." } });
      return;
    }
    const db = dbOf(res);
    const media = db.getMedia(id.data);
    if (!media || media.kind === "image") {
      res.status(404).json({ error: { message: NOT_THERE } });
      return;
    }
    res.json({ cues: db.insertMediaCues(id.data, body.data.cues, now()) });
  });

  // The bytes, to a signed-in device of the account that holds them and to no one else. A file never changes under its
  // id, so the browser may keep it for good; a part of it can be asked for, which is how a clip is skipped through.
  router.get("/:mediaId", (req, res, next) => {
    const id = MediaId.safeParse(req.params.mediaId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That file id isn't valid." } });
      return;
    }
    const media = dbOf(res).getMedia(id.data);
    if (!media) {
      res.status(404).json({ error: { message: NOT_THERE } });
      return;
    }
    res.sendFile(
      id.data,
      {
        root: mediaDirOf(res),
        headers: {
          // The file has no ending to go by: what it is comes from its row, and the browser is told not to guess.
          "Content-Type": media.mime,
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      },
      (err) => {
        // Once the headers are out, the browser stopped listening part-way (a skip, a closed tab): nothing to answer.
        if (!err || res.headersSent) return;
        if ("code" in err && err.code === "ENOENT") res.status(404).json({ error: { message: NOT_THERE } });
        else next(err);
      },
    );
  });

  return router;
}
