# `script.json` schema

One file is the single source of truth for every piece of narration text and the video's structure. Nothing downstream (slide HTML, the recording script, the closing summary) duplicates text from it — everything reads `script.json`, so there's exactly one place to edit a line.

```json
{
  "voice": "en-US-AndrewMultilingualNeural",
  "rate": "-6%",

  "title": {
    "kicker": "Prototype Demo",
    "text": "Product Name",
    "subtitle": "One sentence saying plainly what this video covers."
  },
  "titleNarration": "A conversational paraphrase of the title and subtitle — not a word-for-word reading of them.",

  "parts": [
    {
      "id": "part1",
      "kicker": "Part 1 of 2",
      "title": "Doing the first thing",
      "narrationIntro": "A short, conversational line introducing what's about to happen — doesn't need to match the on-screen title word for word."
    },
    {
      "id": "part2",
      "kicker": "Part 2 of 2",
      "title": "Doing the second thing",
      "narrationIntro": "Same idea, for part 2."
    }
  ],
  "contentsNarration": "A brief line that says the video has more than one part, without listing them out loud — e.g. \"This one's got two parts.\"",

  "cues": [
    { "id": "c01", "part": "part1", "text": "First narrated action in part 1." },
    { "id": "c02", "part": "part1", "text": "Second narrated action in part 1." },
    { "id": "c03", "part": "part2", "text": "First narrated action in part 2." }
  ],

  "closingBullets": [
    "Short feature phrase, 5-6 words",
    "Another one"
  ]
}
```

## Field notes

- **`voice`/`rate`** — an `edge-tts` voice id and rate string (e.g. `"-6%"`). See `narration-voice.md` for how to pick both.
- **`title`** — what's shown on screen on the opening slide. Kept separate from `titleNarration` on purpose: the narration paraphrases this conversationally, it never reads it verbatim.
- **`titleNarration`** — spoken ~1 second into the video, while the opening slide is showing. See `slide-design.md` for the exact timing model this drives.
- **`parts`** — omit this array (or leave it empty) for a single-flow video: no contents slide, no section slides, the recording runs straight from the opening slide's end into the one continuous flow, and then into the closing slide. When there's more than one part, every part needs an `id` (used as the join key from `cues[].part`), a `kicker` (the "Part N of M" on-screen label), a `title`, and a `narrationIntro`.
- **`contentsNarration`** — required when `parts.length > 1`, ignored otherwise. Keep it short and non-enumerating; the on-screen contents slide (built from `parts[].kicker`/`title`) is what actually lists them, the narration just flags that there's more than one.
- **`cues`** — the ordered list of narrated actions during the live recording. Each cue's `id` is the join key used everywhere downstream (audio filenames, `durations.json`, `offsets.json`) — keep it a stable, sortable string (`c01`, `c02`, ...). Each cue's **`part`** field is what the post-processing split step reads to find part boundaries — always set it explicitly; don't make the split script infer boundaries from comments or ordering. For a single-flow video (no `parts`), omit `part` on every cue or set them all to the same placeholder id.
- **`closingBullets`** — feeds the closing slide directly (see `slide-design.md`). Never more than 10, each no more than 5-6 words, naming an actual feature/scenario shown in the video (not a marketing phrase).

## A cue's text vs. what it drives

A cue's `text` is narration, not a stage direction — it's what gets spoken while the recording script performs the matching action. The mapping from cue id to "what Playwright actually does" lives in the recording script (`record.template.js`), not in `script.json` — keep the two separated: `script.json` is what's said, the recording script is what's clicked. This split is what makes it possible to regenerate audio/timing without touching the recording logic, and vice versa.
