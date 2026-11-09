# Security

- **Validate every input at the trust boundary** with the shared Zod schema. Don't trust request bodies.
- **No hard-coded secrets.** Never log credentials, tokens or key material; log presence or type only.
- **No outbound network calls:** no CDN links, remote fonts, telemetry, error reporting; nothing that phones home. A feature that needs a remote service is the owner's decision, scoped to that one host, called by the API alone. The hosts chosen: Forvo (`*.forvo.com`, word audio, the owner's key), YouTube's image servers (a video's thumbnail and its channel's picture, kept once per video), and each outside engine (the speech engine, a language model, the owner's key).
- **What a model writes is text, and nothing but text, everywhere it goes.** The API reads a provider's answer through a Zod shape and keeps one string of it, bounded by the call's max tokens. That string is a bound parameter in every SQL it touches, a value in a Zod-shaped message to the extension, and React text on screen (`<p>{text}</p>`): never `dangerouslySetInnerHTML`, never a Markdown or HTML renderer, never an `<a>` made of it, never fed to `eval`, a shell, a template engine or another prompt as an instruction.
- **What's sent to a model is data.** A page's words, a video's description and an admin's template are filled into the prompt as data; nothing in the stack runs any of it. A model talked into writing wrong content is what the AI's mark and the owner's accept-per-card are for, and why an automatic rule never writes over true data, only beside it, marked (`data.md`).
- **User-defined filters or queries are structured data compiled to parameterised SQL.** Never string interpolation, never `eval`.
- **HTTPS** for anything over the wire.
