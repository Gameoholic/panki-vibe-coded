import type { ReactNode } from "react";
import type { Site } from "../components/Explainer";
import thumbMinecraft113 from "./thumbs/o7Kj73TQ3CU.jpg";
import thumbMinecraft111 from "./thumbs/1V029k8jaGY.jpg";
import thumbGuardman from "./thumbs/ssm_RZv9PDc.jpg";
import thumbJarujaru from "./thumbs/XrLtQqseSv8.jpg";
import thumbHikakinClip from "./thumbs/78IdbiNak-M.jpg";
import thumbViolinSamurai from "./thumbs/EjlG-dMzm3s.jpg";
import thumbHiroyuki from "./thumbs/I6mScxP5UMA.jpg";
import thumbOnePiece from "./thumbs/06PeLyzcnJk.jpg";
import thumbHajime from "./thumbs/gzESogpdOfg.jpg";
import thumbSplatoon from "./thumbs/pq5CscA1Anc.jpg";
import faceHikakinGames from "./thumbs/channel-hikakingames.jpg";
import faceGuardman from "./thumbs/channel-guardman.jpg";
import faceJarujaru from "./thumbs/channel-jarujaru.jpg";
import faceHikakinClip from "./thumbs/channel-hikakinclip.jpg";
import faceViolinSamurai from "./thumbs/channel-violinsamurai.jpg";
import faceHiroyuki from "./thumbs/channel-hiroyuki.jpg";
import faceOnePiece from "./thumbs/channel-onepiece.jpg";
import faceHajime from "./thumbs/channel-hajime.jpg";

/**
 * The made-up video site the explainers play on (`components/Explainer.tsx`): its header bar, a video's own page, and
 * the videos on it. The extension's options page's scenes (`options/explainerScenes.tsx`) and Settings → Panki AI's
 * (`aiScenes.tsx`) are both on it, in its own colours (`theme.css` → `--site-dark-*`; `app.css` → `.ex-yt`).
 */

export const WATCH: Site = { tab: "【マインクラフト】未来のマイクラ!?やってみた！ - YouTube", url: "www.youtube.com/watch?v=o7Kj73TQ3CU", icon: "video" };

/**
 * Real videos for the video site: their thumbnails bundled with Panki, so nothing is
 * fetched; their titles, channels and channels' icons as YouTube gives them. The first is the one being watched.
 */
export type Video = { picture: string; title: string; channel: string; face: string; length: string };
const VIDEOS: readonly Video[] = [
  { picture: thumbMinecraft113, title: "【マインクラフト】未来のマイクラ!?やってみた！エイプリルフールアプデ！【ヒカキンのマイクラ実況 Part113】【ヒカクラ】", channel: "HikakinGames", face: faceHikakinGames, length: "18:40" },
  { picture: thumbMinecraft111, title: "【マインクラフト】めっちゃ遠出してみたらついにあれを発見!?!?【ヒカキンのマイクラ実況 Part111】【ヒカクラ】", channel: "HikakinGames", face: faceHikakinGames, length: "21:07" },
  { picture: thumbGuardman, title: "旅行中にがーどまんを雪山で下ろして置き去りにしてみたドッキリ【復讐の１週間】", channel: "Guardmanチャンネルがーどまん", face: faceGuardman, length: "15:32" },
  { picture: thumbJarujaru, title: "第一声で不採用確定させる就活生の奴", channel: "ジャルジャルアイランド JARUJARU ISLAND", face: faceJarujaru, length: "3:58" },
  { picture: thumbHikakinClip, title: "やぎゅう先輩によってTikTokアカBANされるヒカキン【イナイレ・柳生先輩】", channel: "HikakinClipTV", face: faceHikakinClip, length: "9:14" },
  { picture: thumbViolinSamurai, title: "アメリカの警察にポケモンバトル仕掛けたら逮捕になるのか！？【バイオリニスト】", channel: "ViolinSamuraiバイオリン侍とポケモンマスターしずく社長", face: faceViolinSamurai, length: "12:26" },
  { picture: thumbHiroyuki, title: "【ひろゆき】240円のスパチャした質問者にガチ説教するひろゆき。240円をバカにする人は成功しません【切り抜き/論破】", channel: "ひろゆきの部屋【ひろゆき, hiroyuki】切り抜き", face: faceHiroyuki, length: "8:03" },
  { picture: thumbOnePiece, title: "『ワンピース・オン・アイス』ナミ役 本田望結", channel: "ONE PIECE公式YouTubeチャンネル", face: faceOnePiece, length: "1:12" },
  { picture: thumbHajime, title: "［戦慄］激辛ペヤングにデスソースをかけるドッキリ", channel: "はじめしゃちょー（hajime）", face: faceHajime, length: "10:48" },
  { picture: thumbSplatoon, title: "8年前のおしり実況してみた【スプラトゥーン1】", channel: "HikakinGames", face: faceHikakinGames, length: "16:55" },
];
export const videoAt = (i: number): Video => VIDEOS[i % VIDEOS.length] ?? (VIDEOS[0] as Video);
export const WATCHED = videoAt(0);

/** The site's header bar: its menu, its mark, its search, and what's at its right (Panki's pill, on the home). */
export function SiteTop({ right }: { right?: ReactNode }) {
  return (
    <header className="ex-yt-top">
      <span className="ex-yt-menu" />
      <span className="ex-yt-mark" />
      <span className="ex-yt-search" />
      {right}
      <span className="ex-yt-avatar" />
    </header>
  );
}

/** A video's own page: the video, what's under it, its title and channel, and what's beside it. */
export function WatchPage({ video, under, side, paused = false, children }: { video?: ReactNode; under?: ReactNode; side?: ReactNode; paused?: boolean; children?: ReactNode }) {
  return (
    <div className="ex-yt">
      <SiteTop />
      <div className="ex-yt-left">
        <div className={`ex-video ${paused ? "is-paused" : ""}`.trim()}>
          <img className="ex-frame" src={WATCHED.picture} alt="" />
          {video}
        </div>
        {under}
        <h1 className="ex-yt-title" lang="ja">
          {WATCHED.title}
        </h1>
        <div className="ex-yt-channel">
          <img className="ex-yt-face" src={WATCHED.face} alt="" />
          <span className="ex-yt-name" lang="ja">
            {WATCHED.channel}
          </span>
          <span className="ex-yt-sub">Subscribe</span>
        </div>
      </div>
      <div className="ex-yt-side">
        {side ??
          [1, 2, 3, 4, 5].map(videoAt).map((v) => (
            <div key={v.title} className="ex-rec">
              <span className="ex-rec-pic">
                <img className="ex-thumb" src={v.picture} alt="" />
                <span className="yc-time">{v.length}</span>
              </span>
              <span className="ex-rec-words">
                <b lang="ja">{v.title}</b>
                <small lang="ja">{v.channel}</small>
              </span>
            </div>
          ))}
      </div>
      {children}
    </div>
  );
}
