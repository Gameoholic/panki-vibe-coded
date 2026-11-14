/** @panki The options page's Downloads tab: every video downloaded in this browser with its room, taken off from here, and the quality they're downloaded at (`DownloadsTab`). */
import { useCallback, useEffect, useRef, useState } from "react";
import { sizeWords } from "@panki/contracts";
import { Ask } from "@web/components/Ask";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { PerDevice } from "@web/components/PerDevice";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { Skeleton } from "@web/components/Skeleton";
import { Toggle } from "@web/components/Toggle";
import { DOWNLOAD_QUALITIES, DOWNLOAD_SPEEDS, type DownloadRow } from "../download/download";
import { listDownloads } from "../download/store";
import { downloadWords, shareOf, totalWords } from "../download/words";
import { askUndownload } from "../messages";
import { writeStore, type Stored } from "../storage";

/** How often the list is read again while the page is in view: a download coming in on a YouTube page moves on. */
const READ_EVERY_MS = 2000;
/** How strong each download's share of the bar is, in turn, so neighbours stand apart. */
const TINTS = [100, 76, 58, 44, 34, 26];

/** Every download, read straight from the extension's own database (this page is the extension's), again while it's in view. */
function useDownloads(): { rows: DownloadRow[] | null; read: () => void } {
  const [rows, setRows] = useState<DownloadRow[] | null>(null);
  const read = useCallback(() => {
    void listDownloads(Date.now()).then(setRows, (e: unknown) => console.error("Panki:", e));
  }, []);
  useEffect(() => {
    read();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") read();
    }, READ_EVERY_MS);
    return () => clearInterval(timer);
  }, [read]);
  return { rows, read };
}

/** One download: its still, its name, how it stands, and Remove, which asks first in a panel hanging from it. */
function DownloadListRow({ row, onRemoved }: { row: DownloadRow; onRemoved: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const at = useRef<HTMLButtonElement>(null);
  return (
    <div className={`kept-row download-row ${asking ? "is-asking" : ""}`.trim()}>
      <span className="download-still" aria-hidden="true">
        {row.still ? <img src={row.still} alt="" /> : null}
      </span>
      <span className="download-words">
        <span className="kept-name">{row.title}</span>
        <span className="row-sub">{[row.channel, downloadWords(row, Date.now())].filter((part) => part !== "").join(" · ")}</span>
      </span>
      <Button ref={at} className="is-danger" aria-expanded={asking} onClick={() => setAsking(!asking)}>
        <Icon name="trash" />
        Remove
      </Button>
      {asking ? (
        <Ask
          idPrefix={`download-${row.videoId}-remove`}
          anchor={at}
          question={row.state === "done" ? `Remove “${row.title}”?` : `Stop and remove “${row.title}”?`}
          detail={row.state === "done" ? sizeWords(row.bytes) : `${shareOf(row)}% in, ${sizeWords(row.bytes)}`}
          go={{ words: "Remove", busy: "Removing…" }}
          busy={busy}
          failure={null}
          onKeep={() => setAsking(false)}
          onGo={() => {
            setBusy(true);
            // Through the worker, which tells every page, so the video's mark goes everywhere at once.
            void askUndownload(row.videoId).finally(() => {
              setBusy(false);
              setAsking(false);
              onRemoved();
            });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The Downloads tab, all of it this browser's: every download, the one asked for last first, with how much room they
 * take together, drawn as a bar of each one's share; the quality a video is downloaded at, kept with each as it's
 * asked for; and whether a downloaded video wears its mark wherever it shows.
 */
export function DownloadsTab({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const { rows, read } = useDownloads();
  const total = rows?.reduce((sum, row) => sum + row.bytes, 0) ?? 0;
  return (
    <>
      <div className="settings-tab-head">
        <PerDevice />
      </div>
      <section className="panel" aria-labelledby="downloads-title">
        <h2 id="downloads-title" className="panel-title">
          Downloads
        </h2>
        {rows === null ? (
          <Skeleton shape="kept" count={2} />
        ) : rows.length === 0 ? (
          <p className="empty">No downloads yet.</p>
        ) : (
          <>
            <div className="download-meter" aria-hidden="true">
              {total > 0 ? rows.map((row, i) => <i key={row.videoId} style={{ flexGrow: row.bytes, background: `color-mix(in srgb, var(--accent) ${TINTS[i % TINTS.length] ?? 100}%, var(--surface-2))` }} />) : null}
            </div>
            <p className="download-total">{totalWords(rows)}</p>
            <div className="kept-rows">
              {rows.map((row) => (
                <DownloadListRow key={row.videoId} row={row} onRemoved={read} />
              ))}
            </div>
          </>
        )}
      </section>
      <section className="panel" aria-labelledby="download-quality-title">
        <h2 id="download-quality-title" className="panel-title">
          Quality and speed
        </h2>
        <Setting
          id="download-quality"
          label="Download quality"
          // Said, since no one could guess it: the quality is the most asked for, never promised.
          why="The most a video is downloaded at. On a slow connection YouTube sends less, and that's what's kept."
          control={<Segmented idPrefix="download-quality" label="Download quality" options={DOWNLOAD_QUALITIES} value={store.downloadQuality} onChange={(downloadQuality) => void writeStore({ downloadQuality }).then(onChanged)} />}
        />
        <Setting
          id="download-speed"
          label="Download speed"
          // Said, since no one could guess it: faster isn't free, it trades away quality on a slow connection.
          why="Faster needs a faster connection. Past what the connection gives, YouTube sends a lower quality, and that's what's kept."
          control={<Segmented idPrefix="download-speed" label="Download speed" options={DOWNLOAD_SPEEDS} value={store.downloadSpeed} onChange={(downloadSpeed) => void writeStore({ downloadSpeed }).then(onChanged)} />}
        />
      </section>
      <section className="panel" aria-labelledby="download-mark-title">
        <h2 id="download-mark-title" className="panel-title">
          Mark
        </h2>
        <Setting
          id="download-mark"
          label="Downloaded mark"
          control={<Toggle id="download-mark-on" says={{ on: "Shown", off: "Hidden" }} on={store.downloadMark} onChange={(downloadMark) => void writeStore({ downloadMark }).then(onChanged)} />}
        />
      </section>
    </>
  );
}
