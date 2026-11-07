To pull and update changes:
```
cd /opt/panki-vibe-coded
git pull
pnpm build
pm2 restart panki-api
```


- Netflix / Jellyfin Support
- Fun games for memorization and learning including the video clips
- Speedrun "Video" sessions - Will pick a random video and will skip along to the parts where there's words I don't understand until I get them?
- Import / export button for all thigns (card types, decks, etc), and make sure all have default presets like srs types does


"Communities" (per language?) or "friends" or "parties"
I want to plan a "multiplayer" feature for Panki. Don't write code yet: read CLAUDE.md and docs/ first, then plan with me and show me options I can play with (an artifact is fine).

Where it comes from: my notes from the immersion epic (branch `immersion`, now merged), in my words:
"Count immersion (maybe even make it multiplayer like I wanted? like compare?)" and "Maybe I can even create parties or groups or something so I can do this with multiple people, or even have global leaderboard/tracking for all users on the app." I also said things like a watch party belong on panki.pro.

The pain point, from a chat with my Japanese friend Rena (she uses the extension for her ENGLISH studies, I use it for Japanese, we both learn by watching YouTube):
"お互いの観たYouTube動画を記録して、毎日観ないとストリークが切れるシステム" — a system that records the YouTube videos we each watch, where the streak breaks if you don't watch every day. The motivation I want: "やっべ、れなは今日、動画を見たけど俺まだ全然見てない、ストリークがなくなるのは嫌だ、少しなくても、何かを見ないと" — "oh no, Rena watched videos today and I haven't watched anything, I don't want to lose the streak, I have to watch something, even a little."

What exists now that this can build on: each account's watching is tracked on Panki (stretches watched per video, time per day, in the account's own time zone; Immersion / Just watching per video), all of it the account's own and shown to nobody else. Every stretch is kept, so daily totals and streaks can be computed from history.

What was tried and taken out: for one day the branch had a "Together" tile (everyone on this Panki with today's minutes, streak, last video watched, and what they're learning), a "Together · this week" tile ranking time watched over 7 days, a sharing setting (off / minutes and streak / also what I watch), then all-or-nothing sharing, and a daily watch goal with a watch streak. I removed the goal and the streak from immersion ("I don't want a target goal for immersion nor streaks… it might change in the future") and then shelved everything about other people so the branch could ship. Don't bring those back as they were; rethink it with me.

Things to think about: friends vs groups vs everyone on the app; what others can see and whether I choose; streaks with friends without a personal goal; nudges ("Rena watched today"); privacy; that Rena and I learn different languages and live in different time zones; that I'm not always on PC (phone has no extension).

- Private/public playlists? Track your progress in each playlist? Maybe reuse native youtube playlists?


- Shadowing practice?

Before sharing with public:
- Deploy via docker.
- redacat all repo history because i put some texts int his repo that probably private
- Remove cronjob for running daily backups. Make it so the app triggers it, like whiteboard, minimal setup on sysadmin side.

- Investigate youtube comments feature to learn from them. "Dive" into the video. meaning title, descirption, comments being analyzed and drilld on them. Deep Dive feature.

- Card type default that comes with Panki?


    
- reminder to do reviews today to eke pthe streak (autoamtically activates aftert having a strrreak of >5 ) (have it schangeablei n settigns per user, and have it for reviews and for video watching) draft an artifact to sohw me how it'd look like. maybe we can even ahve streaks for "target" of watching or doigmn revies in roder otuphodl the streak (obviosuly wil lrequire changes to the way that the strre akwidgetrts are shown os it mgith eb bea bigger hcnag.e how is the estsreak stored today/ isit calcualted ydhamically meanign we can esayily ad docnditios nto the streak featurelogic and/or widgets? or is it litrally a "streak" table in the database in which case that's kinda weird. not jsut streak but liekw atchtitme and all that etc. is it all calcualted dynamically every time? or is it stored like wit ha sepcific logic). we coudl edit the widgets per user like to see the sepcific conditiosn ro wahtever i guess.and for reviews it'd be like for example "did ALL my reviews" or "did at least 5 reviews". obvbiosuyl if theres no revies to do in abatch or the last 2 reviews we ned will noyl come at the last 5m intues of the ad ay itd be bad so need a way to like soft cap it or soemthing (maybe if i complete a full batch regardless itll finsih it). we need like a builder for this cuz like also do we rseparrte revies from new cards? what if iwant a streak for new cards? also wanikani has like "savign grace" and shit we could optioanly ldo that int he buidler too.


https://www.youtube.com/watch?v=JfvEIHYU24o
https://www.youtube.com/watch?v=5AtlfA_wYW8
https://sluka.app/
https://migaku.com/
https://www.youtube.com/watch?v=4tKINZwRzVs
https://www.youtube.com/watch?v=pg98lmTOO9I
