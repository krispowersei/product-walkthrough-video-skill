# product-walkthrough-video

A [Claude Code](https://claude.com/claude-code) skill that produces a fully narrated, professionally paced **demo video** of a real web app — a synthetic cursor driving a headless browser, an AI voiceover, and a floating-window-on-gradient-background treatment with title/section/closing slides — entirely from a Playwright recording plus `edge-tts`.

It's brand-, framework-, and vertical-agnostic. It never assumes a specific product, font, color, or industry — everything (product name, accent color, font, business domain, target user) is either inferred from the target app's own code or confirmed with you before anything gets recorded.

## What it makes

Point it at any running web app and it produces one finished `.mp4`:

- A title slide, and (for multi-flow demos) a contents slide + one section slide per flow
- The app itself, recorded headlessly and driven through the flow(s) you specify, with a synthetic cursor so clicks are easy to follow on screen
- A real AI voiceover narrating what's happening and why, timed to match the recording exactly
- A closing slide summarizing what was covered

## Prerequisites

- [Playwright](https://playwright.dev/) (`npm i playwright && npx playwright install chromium`)
- [`edge-tts`](https://github.com/rany2/edge-tts) for narration (`pip3 install --user edge-tts`) — free, keyless, no API key required
- `ffmpeg` / `ffprobe` on your `PATH`

## Installing

Copy this repo's contents into your project's (or your global `~/.claude/`) skills directory so `SKILL.md` ends up at:

```
.claude/skills/product-walkthrough-video/SKILL.md
```

e.g.:

```bash
git clone https://github.com/gaurabhmathure/product-walkthrough-video-skill.git \
  .claude/skills/product-walkthrough-video
```

## Using it

Inside Claude Code, just ask for what you want — no special syntax:

> "Make a demo video of the checkout flow in this app"

> "Record a walkthrough video showing both the import and export flows"

Claude Code will read `SKILL.md`, infer what it can about your app (name, accent color, font, business domain), ask you to confirm the rest (which flows, the local dev URL, anything that needs hiding from the recording), and then walk through scripting the narration, recording, compositing, and verifying the final video.

See [`SKILL.md`](./SKILL.md) for the full procedure, and `references/` for the reasoning and gotchas behind each step (voice/pacing rules, recording technique, the compositing pipeline, slide design, output naming).

## License

MIT — see [LICENSE](./LICENSE).
