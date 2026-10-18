To pull and update changes:
```
cd /opt/panki-vibe-coded
git pull
pnpm build
pm2 restart panki-api
```

- Auto deploy on chrome extension?

- Bury, in Anki's sense: hide the card until tomorrow, schedule untouched. For a card you can't judge right now, a bad clip, a tired evening. The one I'd build first.
- Suspend: out of rotation until you bring it back from the deck's list. For leeches and cards that need fixing.
- Flag: answer as normal but mark the card, so a list in the deck shows what to fix later. Useful in a mining app where the audio or meaning is sometimes off.

Things ElevenLabs could do for the transcripts, for later:
- Key terms: give it a list of words to listen for (the video's title, the channel's name, words I've fixed by hand on that video), so names, game words and slang come out right more often. Costs 20% more.
- Let ElevenLabs fetch the YouTube video itself and transcribe the whole thing in one go. No hidden second player, no cutting into pieces, and the timing comes straight from the real video. But the whole video is paid for up front (about 7 cents for 20 minutes), the words only show up once it's all done, and some videos might refuse.
- Send the sound in a slightly different format so ElevenLabs answers faster. Same quality, just quicker.
- Improvmenet for algorithm: Add 'automatic' to lead as na option. When chosen, it will transcribe "as we go" as normal, hwoeer, the moment we reach a point in the video where we would have enough time to trnascribe the entire vide forom start to finish asyncsorusly without the untranscribed portion cathcing up to us, thern it will do that. Also assuming there's enough time elft in the video utnranscirbed to justfiy this (if by the time it estimeates the entire video would've ifnisheed trnasciribng from zero till finsih, the user could have watchee the video til tlhe end wit hthe as we go transcirption, then don't trigger this from zero transcirption). The algorithm will have the data of previous live trnascribtions as well as from zer otranscritptiosn to amek these decisisons. For the first ocupe olf tiems of course it will nto ahve hte data so it will just have to collecit t by trying to doit anyway and seeing. Note the time has to be a ltitle mroe on the edge of safety sicnei dont want tit to starr t from zero and rteacht thend btu then the palyer get os tothe utnrascribe part nad we end up reahcign utnrascribed portiosn fo the video. I said fro mzero even the start that we alreadyu ahve trnascribed, because i ebelive transciribng the ENTIRE video usign the special api and also givign ti the contexto fhj te videddo will lead ot ebtter results. But then what if the user switche sot antoehr protio nof the video imemdaitely? and what are hte detiasl fo thsi algorithm? I want a full breakdown of you and for oyu to tlel me hwo this algorithm woudl work i nthe best way possible. And also detial tohe me the current algorutjn,m / thow the normla non-auto lead algortn wlud lwork. or if yo uthink there a better way ot do all this entirely. I sjsut thought of an algorithm of my own but maybe im wrong aobut all this.

- Remember last played timestamp?
- Remember last played video in home page?


- Netflix / Jellyfin Support
- Fun games for memorization and learning including the video clips
- Speedrun "Video" sessions - Will pick a random video and will skip along to the parts where there's words I don't understand until I get them?
- Count immersion (mayb even make it multiplayer like I wanted?)