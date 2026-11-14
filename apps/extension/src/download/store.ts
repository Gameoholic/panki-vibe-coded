/** @panki The videos downloaded in this browser, kept and listed (`startDownload`, `claimDownload`, `keepPiece`, `holdDownload`, `listDownloads`, `removeDownload`). Never a second store of them. */
import { DownloadVideo, KeptPiece, TROUBLE_MAX, coveredMsOf, coveredOf, retryAfterMs, stateOf, trackStretchesOf, type DownloadAbout, type DownloadJob, type DownloadRow, type HoldEnd, type PieceAsk } from "./download";

/**
 * Where downloaded videos are kept: the browser's own database, in the extension's own corner of this browser (the
 * extension asks for unlimited room, `build.mjs`), never sent anywhere. The worker keeps what a page sends and hands
 * downloads out to run; the options page lists them and takes them off. A page's script never opens it (its database
 * would be the site's).
 *
 * Three stores: the downloads, one a video; the pieces' facts, keyed by the video and their place in the order they came
 * in (`seq`); and the pieces' bytes under the same key, apart, so listing never reads a video's bytes.
 */
const NAME = "panki-downloads";
const VERSION = 1;

let opened: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The downloads database failed."));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The downloads database failed."));
    tx.onabort = () => reject(tx.error ?? new Error("The downloads database stopped."));
  });
}

function open(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("videos", { keyPath: "videoId" });
      db.createObjectStore("pieces", { keyPath: ["videoId", "seq"] });
      db.createObjectStore("bytes");
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        opened = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opened = null;
      reject(req.error ?? new Error("The downloads database wouldn't open."));
    };
  });
  return opened;
}

/** Every key of one video's pieces, in the order they came in. */
const piecesOf = (videoId: string) => IDBKeyRange.bound([videoId, 0], [videoId, Number.MAX_SAFE_INTEGER]);

/** What's kept of a download, read as its shape; a record that isn't is left out. */
const videoOf = (kept: unknown): DownloadVideo | null => {
  const read = DownloadVideo.safeParse(kept);
  return read.success ? read.data : null;
};
const piecesRead = (kept: unknown[]): KeptPiece[] => kept.flatMap((one) => {
  const read = KeptPiece.safeParse(one);
  return read.success ? [read.data] : [];
});

/**
 * A video asked to be downloaded, at the quality set now. One asked for already is left as it is, but for one that
 * stopped, which is tried again at once.
 */
export async function startDownload(about: DownloadAbout, quality: number, now: number): Promise<void> {
  const db = await open();
  const tx = db.transaction("videos", "readwrite");
  const videos = tx.objectStore("videos");
  const was = videoOf(await request(videos.get(about.videoId)));
  if (!was) {
    const video: DownloadVideo = { ...about, quality, startedAt: now, doneAt: null, heldBy: null, heldAt: null, trouble: null, troubleAt: null, tries: 0 };
    videos.put(video);
  } else if (was.doneAt === null && was.troubleAt !== null) videos.put({ ...was, troubleAt: null } satisfies DownloadVideo);
  await finished(tx);
}

/**
 * A download for a page to run (`tabId`, the page's tab), or none: one at a time in this browser, so while another page
 * holds one (it said so within `DOWNLOAD.holdMs`) there's none, unless it's this page's own (a page opened again takes
 * up where it left off). Otherwise the one asked for first that isn't waiting to be tried again, now held by this page.
 * It runs at `speed`, the Download speed set as it's taken up.
 */
export async function claimDownload(tabId: number, speed: number, now: number): Promise<DownloadJob | null> {
  const db = await open();
  const tx = db.transaction(["videos", "pieces"], "readwrite");
  const videos = tx.objectStore("videos");
  const all = (await request(videos.getAll())).flatMap((kept: unknown) => videoOf(kept) ?? []);
  const held = all.find((v) => stateOf(v, now) === "going");
  let job: DownloadVideo | null = null;
  if (held) job = held.heldBy === tabId ? held : null;
  else {
    const ready = all.filter((v) => v.doneAt === null && (v.troubleAt === null || now - v.troubleAt >= retryAfterMs(v.tries)));
    job = ready.sort((a, b) => a.startedAt - b.startedAt)[0] ?? null;
  }
  if (!job) {
    await finished(tx);
    return null;
  }
  videos.put({ ...job, heldBy: tabId, heldAt: now } satisfies DownloadVideo);
  const pieces = piecesRead(await request(tx.objectStore("pieces").getAll(piecesOf(job.videoId))));
  await finished(tx);
  return { videoId: job.videoId, durationMs: job.durationMs, quality: job.quality, speed, covered: trackStretchesOf(pieces) };
}

/**
 * A piece sent by the page running a download, kept after the ones before it; whether the download goes on. It doesn't,
 * and nothing is kept, once it's whole, taken off, or held by another page.
 */
export async function keepPiece(videoId: string, tabId: number, ask: PieceAsk, bytes: Uint8Array<ArrayBuffer>, now: number): Promise<boolean> {
  const db = await open();
  const tx = db.transaction(["videos", "pieces", "bytes"], "readwrite");
  const videos = tx.objectStore("videos");
  const video = videoOf(await request(videos.get(videoId)));
  if (!video || video.doneAt !== null || video.heldBy !== tabId) {
    await finished(tx);
    return false;
  }
  const pieces = tx.objectStore("pieces");
  const last = await request(pieces.openKeyCursor(piecesOf(videoId), "prev"));
  const lastSeq = Array.isArray(last?.primaryKey) ? Number(last.primaryKey[1]) : -1;
  const seq = Number.isFinite(lastSeq) ? lastSeq + 1 : 0;
  const piece: KeptPiece = { ...ask, videoId, seq, size: bytes.byteLength, keptAt: now };
  pieces.put(piece);
  tx.objectStore("bytes").put(new Blob([bytes]), [videoId, seq]);
  videos.put({ ...video, heldAt: now, trouble: null, troubleAt: null, tries: 0 } satisfies DownloadVideo);
  await finished(tx);
  return true;
}

/**
 * The page running a download says how it stands: still going (it holds it a while longer), whole, or stopped, which
 * lets it go to be tried again later, a little later each time in a row. Whether the page is to go on with it: not once
 * it's let go, taken off, or held by another page.
 */
export async function holdDownload(videoId: string, tabId: number, end: HoldEnd, now: number): Promise<boolean> {
  const db = await open();
  const tx = db.transaction("videos", "readwrite");
  const videos = tx.objectStore("videos");
  const video = videoOf(await request(videos.get(videoId)));
  const mine = video !== null && video.doneAt === null && (video.heldBy === tabId || stateOf(video, now) !== "going");
  if (!video || !mine) {
    await finished(tx);
    return false;
  }
  if (end.kind === "going") videos.put({ ...video, heldBy: tabId, heldAt: now } satisfies DownloadVideo);
  else if (end.kind === "done") videos.put({ ...video, doneAt: now, heldBy: null, heldAt: null, trouble: null, troubleAt: null, tries: 0 } satisfies DownloadVideo);
  else videos.put({ ...video, heldBy: null, heldAt: null, trouble: end.trouble.slice(0, TROUBLE_MAX), troubleAt: now, tries: video.tries + 1 } satisfies DownloadVideo);
  await finished(tx);
  return end.kind === "going";
}

/** Every download, the one asked for last first: how each stands, how much of its video is in, and its size. */
export async function listDownloads(now: number): Promise<DownloadRow[]> {
  const db = await open();
  const tx = db.transaction(["videos", "pieces"]);
  const all = (await request(tx.objectStore("videos").getAll())).flatMap((kept: unknown) => videoOf(kept) ?? []);
  const pieces = tx.objectStore("pieces");
  const rows = await Promise.all(
    all.map(async (video): Promise<DownloadRow> => {
      const kept = piecesRead(await request(pieces.getAll(piecesOf(video.videoId))));
      const { heldBy: _by, heldAt: _at, troubleAt: _when, tries: _tries, ...rest } = video;
      return {
        ...rest,
        state: stateOf(video, now),
        coveredMs: video.doneAt !== null ? video.durationMs : coveredMsOf(coveredOf(kept), video.durationMs),
        bytes: kept.reduce((sum, piece) => sum + piece.size, 0),
      };
    }),
  );
  return rows.sort((a, b) => b.startedAt - a.startedAt);
}

/** A download taken off, its pieces with it, so the room they took is free again. A page running it stops at its next word. */
export async function removeDownload(videoId: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(["videos", "pieces", "bytes"], "readwrite");
  tx.objectStore("videos").delete(videoId);
  tx.objectStore("pieces").delete(piecesOf(videoId));
  tx.objectStore("bytes").delete(piecesOf(videoId));
  await finished(tx);
}
