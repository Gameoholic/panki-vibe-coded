To pull and update changes:
```
cd /opt/panki-vibe-coded
git pull
pnpm build
pm2 restart panki-api
```



- Auto deploy on chrome extension? Maybe shwo when theres na udpate and sugggest ot udpate immediately? Also build ci/cd pipeline?


- Netflix / Jellyfin Support
- Fun games for memorization and learning including the video clips
- Speedrun "Video" sessions - Will pick a random video and will skip along to the parts where there's words I don't understand until I get them?

NEW FEATURE/EPIC: IMMERSION + VIDEO TRACKING + BETTER YOUTUBE + MODULE/FEATURE TOGGLING
It's important these f eatures are togglable in the settings and are off by default.
Toggleable: The entire Panki panel - enalbed by defualt
The "yomitan"-like panel on shift (needs to be togglable, enabled by default). MAKE SURE TO NTO CLAL ORIT YOMTIA NOR YOMICAH NI NTHE CODE!!!! to not induce copyright and whatever. Don't call it that nayhwere!!!! We might have some palces referring to it. Even in the docs, don't do that. I don't wanna get sued or soemthing.
Also need to maek the panki subtitle serlectort dropdown i nthe panel bewl othe video to eihter be "none", "youtueb subtitles", OR isnteadof elevenlabs scribe v2 or whatever, say "Panki subtitles" opr something. I want this change because it's describing the type of subtitles nt oiteh engine used fori t. The engine is itn hes ettings like it is today. Like we';re saying "hey use the vnailla defautl youtube subtitles, OR use our custom ones whic harem eore about the view nd integraito nrather than necessarily the soruce of the subtitles. like it's an entire different subtitrles, not just the text that appears inthe mitself". I'm being descirptivie for you so you udnesratnd claude, dont ptu t hat sehti in visible text or osmething. It's just so oyu knwo fro the implementation you udnerstand my reaosnign and thinking. Also need to make the thign that showsi n yellow/orange/blue liek the seekbar/playbar of youtube also tgoggleable, its ON by default.
Video tracking for stats is enabled by default and ther;'ell be a toolti pro descirption ro soemthign saying what it does - like what data it tracks about us for privacy reasons and wht it means if we disable it.

- Stats for immersion (track time watched)
- Remember last played timestamp in the video? Autoamtically contineu from where we left off? Maybe even mark it in the video seekbar as a color (not color but maybe something more distinct and visible)..
- Remember last played video in home page?
- Netflix like (Toggleable/ button for it or something) "continue watching" for videos in the HOME PAGER for youtube, Remember I can watch multipel videos at simultionusly. or I watched one last week, stopped at hte middle nad woudl like for it to awlasy be visible itn eh home page liek entflix., it's impriotant this entire thignsi customziable and liek i said its otggleable int he setting si nthe first palce and defaulted to off (tracking i srequried to be enabled for this, but its enabled by default.)
- Count immersion (mayb even make it multiplayer like I wanted? like compare? Claude I had an idea for this-ask away for me to explain it.) Here's the ocnversaiton with my japanese friend that lead me to this thought na idea maybe oyu can just infer, she will also use the extension for her ENGLISH studies and her youtube watching: you can be creative with this claude. we're just plannign all thsi for nwo anyway. 19:13 ダニエル この前はさ、マインクラの実況をおすすめしたよね
自分も、ヒカキンのマインクラ実況を
19:13 ダニエル Photos
19:15 ダニエル また見始めました
19:15 ダニエル で、今突然面白いアイデアを考えた
19:19 ダニエル 私たち、同じことをするね？
勉強のために、youtubeの動画みてる
考えたのは、お互いの観たYouTube動画を記録して、毎日観ないとストリークが切れるシステム
19:19 ダニエル っていうサイトを作る
19:20 ダニエル と思っちゃった
19:20 ダニエル どうだろう。。。
19:20 ダニエル こうしたら、絶対英語は上手になるよ
19:21 ダニエル だって、僕もmotivation欲しい
19:22 ダニエル 「やっべ、れなは今日、動画を見たけど俺まだ全然見てない、ストリークがなくなるのは嫌だ、少しなくても、何かを見ないと」って
Maybe I can even create parties or groups ro soemthign s oI can d othsi with multipel people, or even ahve globla leaderboard/tracking for all users on the app.
It's improtan tthnis entire epic/feature is carefully thought to respect al lthe dguideliesn and covnentiosn int he docs, and that you previwe it to me in artifact.

- redacat all repo history because fo the above in the readme^