To pull and update changes:
```
cd /opt/panki-vibe-coded
git pull
pnpm build
pm2 restart panki-api
```


- big feature / epic: LLM support for sentence translation and/or correction "touch-up". Or maybe we translate the videos at the same way as transcirption? as an admin toggle?

- Netflix / Jellyfin Support
- Fun games for memorization and learning including the video clips
- Speedrun "Video" sessions - Will pick a random video and will skip along to the parts where there's words I don't understand until I get them?
- Import / export button for all thigns (card types, decks, etc), and make sure all have default presets like srs types does


I want to plan a "multiplayer" feature for Panki. Don't write code yet: read CLAUDE.md and docs/ first, then plan with me and show me options I can play with (an artifact is fine).

Where it comes from: my notes from the immersion epic (branch `immersion`, now merged), in my words:
"Count immersion (maybe even make it multiplayer like I wanted? like compare?)" and "Maybe I can even create parties or groups or something so I can do this with multiple people, or even have global leaderboard/tracking for all users on the app." I also said things like a watch party belong on panki.pro.

The pain point, from a chat with my Japanese friend Rena (she uses the extension for her ENGLISH studies, I use it for Japanese, we both learn by watching YouTube):
"お互いの観たYouTube動画を記録して、毎日観ないとストリークが切れるシステム" — a system that records the YouTube videos we each watch, where the streak breaks if you don't watch every day. The motivation I want: "やっべ、れなは今日、動画を見たけど俺まだ全然見てない、ストリークがなくなるのは嫌だ、少しなくても、何かを見ないと" — "oh no, Rena watched videos today and I haven't watched anything, I don't want to lose the streak, I have to watch something, even a little."

What exists now that this can build on: each account's watching is tracked on Panki (stretches watched per video, time per day, in the account's own time zone; Immersion / Just watching per video), all of it the account's own and shown to nobody else. Every stretch is kept, so daily totals and streaks can be computed from history.

What was tried and taken out: for one day the branch had a "Together" tile (everyone on this Panki with today's minutes, streak, last video watched, and what they're learning), a "Together · this week" tile ranking time watched over 7 days, a sharing setting (off / minutes and streak / also what I watch), then all-or-nothing sharing, and a daily watch goal with a watch streak. I removed the goal and the streak from immersion ("I don't want a target goal for immersion nor streaks… it might change in the future") and then shelved everything about other people so the branch could ship. Don't bring those back as they were; rethink it with me.

Things to think about: friends vs groups vs everyone on the app; what others can see and whether I choose; streaks with friends without a personal goal; nudges ("Rena watched today"); privacy; that Rena and I learn different languages and live in different time zones; that I'm not always on PC (phone has no extension).




- Shadowing practice?

Before sharing with public:
- Deploy via docker.
- redacat all repo history because i put some texts int his repo that probably private
- Remove cronjob for running daily backups. Make it so the app triggers it, like whiteboard, minimal setup on sysadmin side.