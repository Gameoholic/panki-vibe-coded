# Dependencies

- Few and justified: supply chain is the realistic security risk, so every dependency is a liability.
- One library per job.
- Prefer the platform (CSS, `Intl`, `crypto.randomUUID`, `node:sqlite`, native drag and drop) and what's installed.
- A new dependency is a choice put to the owner.
- No code lifted from a userscript, a gist or an unvetted repo, however close it looks to the job. Other tools (asbplayer, a recorder script) are read only for how they do a thing; the code is written here, against the platform's documented APIs (MDN, the browsers' extension docs), and understood line by line.
