To pull and update changes:
```
cd /opt/panki-vibe-coded
git pull
pnpm build
pm2 restart panki-api
```

WORKING ON THIS:
ok so I wrote al lthese ntoes down jsut rambling and I rtyihngh we can start thinkign abotu this. obivosuyl imeplement ntohign i want solid plan first.
Things ElevenLabs could do for the transcripts, for later:
- Key terms: give it a list of words to listen for (the video's title, the channel's name, words I've fixed by hand on that video), so names, game words and slang come out right more often. Costs 20% more.
- Let ElevenLabs fetch the YouTube video itself and transcribe the whole thing in one go. No hidden second player, no cutting into pieces, and the timing comes straight from the real video. But the whole video is paid for up front (about 7 cents for 20 minutes), the words only show up once it's all done, and some videos might refuse.
- Send the sound in a slightly different format so ElevenLabs answers faster. Same quality, just quicker.
- Improvmenet for algorithm: Add 'automatic' to lead as na option. When chosen, it will transcribe "as we go" as normal, hwoeer, the moment we reach a point in the video where we would have enough time to trnascribe the entire vide forom start to finish asyncsorusly without the untranscribed portion cathcing up to us, thern it will do that. Also assuming there's enough time elft in the video utnranscirbed to justfiy this (if by the time it estimeates the entire video would've ifnisheed trnasciribng from zero till finsih, the user could have watchee the video til tlhe end wit hthe as we go transcirption, then don't trigger this from zero transcirption). The algorithm will have the data of previous live trnascribtions as well as from zer otranscritptiosn to amek these decisisons. For the first ocupe olf tiems of course it will nto ahve hte data so it will just have to collecit t by trying to doit anyway and seeing. Note the time has to be a ltitle mroe on the edge of safety sicnei dont want tit to starr t from zero and rteacht thend btu then the palyer get os tothe utnrascribe part nad we end up reahcign utnrascribed portiosn fo the video. I said fro mzero even the start that we alreadyu ahve trnascribed, because i ebelive transciribng the ENTIRE video usign the special api and also givign ti the contexto fhj te videddo will lead ot ebtter results. But then what if the user switche sot antoehr protio nof the video imemdaitely? and what are hte detiasl fo thsi algorithm? I want a full breakdown of you and for oyu to tlel me hwo this algorithm woudl work i nthe best way possible. And also detial tohe me the current algorutjn,m / thow the normla non-auto lead algortn wlud lwork. or if yo uthink there a better way ot do all this entirely. I sjsut thought of an algorithm of my own but maybe im wrong aobut all this. Also along with all this I'll need some way to debug the trasncirption algorithm and process so maybe a button that shows the "thought" process and execution for this particualr session in the trnascirbe button. Along with just in general always logging this shit into the console just so we have some logging in case we run into problems.


- Auto deploy on chrome extension? Maybe shwo when theres na udpate and sugggest ot udpate immediately? Also build ci/cd pipeline?

- Bury, in Anki's sense: hide the card until tomorrow, schedule untouched. For a card you can't judge right now, a bad clip, a tired evening. The one I'd build first.
- Suspend: out of rotation until you bring it back from the deck's list. For leeches and cards that need fixing.
- Flag: answer as normal but mark the card, so a list in the deck shows what to fix later. Useful in a mining app where the audio or meaning is sometimes off.



- Instead of being able to edit the sentence directly, we should be able to edit the subtitles (their content and start/end timestamp, for each word). Once we do that, the trasncription can't override it.
Even if we forget and re-trasnribe it in any other way. Ours are the top most priority wise.

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