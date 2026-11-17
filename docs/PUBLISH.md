# Publishing Panki — the plan

> Everything that turns Panki from something the owner set up for themself into a product others use: a huge overhaul, for when the owner decides to publish. Nothing here is decided or designed yet: these are the owner's points and problems as they said them (2026-11-17), kept to be brainstormed and planned properly when this epic is reached. No solutions are written here on purpose. Accounts, credits, pricing and billing moved here from `docs/AI.md`.

## The points, as problems

### Accounts
- Creating accounts and managing them: sign-up, password reset, who may join, in place of `pnpm user:add`.
- Giving free credits to friends; maybe a free trial; charging people.
- Should any of this be exposed in the open source at all? (Same question as the business model below.)

### Money: credits, pricing, the business model
- **Which system at all?** Stick with credits, or something else entirely? It probably has to be usage-based because of AI and transcription, but is there a base package? How is it priced?
- **Dynamic pricing is confusing.** Transcribing per video makes sense. But AI usage? Maybe users just see the bill at the end of the month and roll with it, maybe not. Maybe fixed credits per AI action is better, but then Panki can lose money on it, and follow-ups alone literally double the usage. How to combat that?
- **What Touch up costs today:** the card drawer runs on Sonnet at about $0.02 a card. That's hard to price and still profit at a price users will pay.
- **Videos are huge.** Limiting them, or pricing like "100 MB a month for videos", would be weird, but they're bound to get pricey. Better storage might make it less bad. Find a sweet spot: be honest with a soft or hard limit? Charge credits for it? No website does that, but unlike those huge websites the owner doesn't want to lose money on this, and may not be able to make that kind of investment. Maybe for the first couple of months: a free trial, a limited package, priced as cheaply as possible, making no money until the site grows. Undecided.
- **Real numbers first.** By then prod will have a lot of data: analyse it together with Claude, then compare business strategies and pricing with the numbers in hand.
- **Like Obsidian:** open source, and whoever wants it set up hassle-free pays for it. Plus a community for learners: public playlists, leaderboards, groups. Open source to be fair to people, and it's vibe coded anyway; probably easier traction too. The owner never meant to monetize this at first, only to publish it; but self-hosting will be hard for many, hence the hosted option, now heavily considering monetizing, or at least making it monetizable without making money at first and maybe later. Undecided until the actual numbers.
- **Open source vs the paid service.** Nobody can host Obsidian's Sync themselves; community alternatives exist, but Sync's own code isn't open, it's a separate service. Publishing the code as it is now, with the business parts built in, would be odd: a "business version" with all of this, and the "consumer version" that exists today. It would also let people copy it, use the charging system, run their own servers where people pay them, and undercut the owner (they could do that anyway, with Claude adding it to the lite version, but still). Keeping two separate versions sounds like hell. Maybe make it a module: accounts and credits behind an interface, plugging in either the open-source one or the one that charges and does everything. But then what about the models and transcription? The owner wants to be true and user-facing and doesn't mind open-sourcing all of it, but maybe there's a line. What the options are and what's right here is open.

### The models and transcription
- **"Happens like magic":** Panki provides the best transcription; users, and probably even admins, can't change it. Same for models, maybe admins can (see the business model). It's awkward to let people customize models; maybe a centralized setup that's already optimized is better, so users don't have to worry. Or let them choose the provider (OpenAI / Anthropic)? Presets, or Panki's own "effort" levels? Or let them customize it after all? Weigh the pros and cons and reach the best business decision, the one ultimately best for the user.
- **A transcription "waterfall"** in case one service fails: chosen by the user, or done behind the scenes after heavy testing and optimization.
- **Model switching and cost**: the word pop-up could run on Haiku (short prompt, unlikely to fail), but the bulk is the card drawer (Touch up and the rest). A coworker's idea, as an example of how such a system could work:
  - Haiku summarizes the surrounding context (around 60 words), and Sonnet gets only the summary in its big prompt.
  - Or Haiku does most of the work and Sonnet supervises it, or the other way round: reduce what Sonnet reads, let Haiku take most of it. Maybe Haiku runs the entire prompt and Sonnet only checks it didn't break the expected format or do something irrational (which Haiku usually does; that's why the drawer switched to Sonnet).
  - Then test it with Claude: Claude runs many experiments with different variations, and doesn't stop there: from the results it adjusts the options, lets the worst die, changes the variations to make better ones. It needs a lot of tokens, but only once until it's perfected. Claude (a high Opus model) could supervise it, fed with tons of data (350+ cards now). How to do it is open: a new project in simple Python, a sandbox, this project. Claude may have ideas or research how to do it better. It's just a story a coworker told.
- **Token caching** in general, and other optimizations possible with Claude and the other AI providers, if any are kept.

### Transcripts, storage and data
- **Transcripts per user, with a global cache:** each user can re-make a transcript, re-run it on their end or change it without affecting anyone else. One version of a transcript might be shared in the global cache, deleted after some time if nobody has used it.
- **Storing anything heavy** (cards, videos, transcripts…) that hasn't been used in a long time: maybe zip it. User data is never deleted unless they ask.

### Languages
- Support several languages, but only ones defined from the start: the developer chooses which, after testing them and making sure there are dictionaries for all, a Forvo-like alternative, and transcription that works.
- Alternatives to Forvo and the like that aren't language-specific. Maybe AI features (ElevenLabs) reading words out loud.
- Caching Forvo might be a legal problem if they notice (they forbid caching). Maybe not; cross that bridge if it comes.

### Anki
- Import and export to Anki, as well as possible.

### Platforms
- Figure out a way to be on YouTube mobile. Probably a must.

### Engineering and operations
- A better CI/CD workflow.
- Better AI and CLAUDE.md conventions and workflow.
- Understand the services' architecture, or separate it if needed.
- Host on a separate, dedicated VPS.
- Re-create the GitHub repo after cleaning it of sensitive information: every page must be cleaned and sterilized, down to the smallest things, this document included.

### And the rest
- Anything else missed here; it's brainstormed and talked through when this document and epic are reached.

## Settled

Nothing yet.

## The order

Not planned yet: this epic is brainstormed first, when the owner decides to publish.

## Open

Everything above.
