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

- Remember last played timestamp?
- Remember last played video in home page?


- Netflix / Jellyfin Support
- Fun games for memorization and learning including the video clips
- Speedrun "Video" sessions - Will pick a random video and will skip along to the parts where there's words I don't understand until I get them?