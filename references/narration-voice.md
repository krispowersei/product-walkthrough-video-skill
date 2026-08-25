# Narration: voice, tone, and pronunciation

## Getting a real voiceover

There's no built-in TTS available here, and the major paid APIs (ElevenLabs, OpenAI, Speechify) need a key you likely don't have on hand. Use **`edge-tts`** instead — a free, keyless open-source client for Microsoft Edge's neural "Read Aloud" voices (`pip3 install --user edge-tts`). A platform "say"-style command-line voice is not a substitute — it reads as robotic next to an edge-tts neural voice.

## Picking a voice

Run `edge-tts --list-voices` and read the **content category and personality tags** it prints for each voice before picking — this is the actual signal, not the voice's name. Voices tagged **"News, Novel"** read in a newsreader register and sound wrong for a product demo, however good they sound in isolation. Voices tagged **"Conversation, Copilot"** (personalities like *Warm, Confident, Authentic, Honest* or *Approachable, Casual, Sincere*) are built for exactly this. Pick from the Conversation category — a specific voice within it (`en-US-AndrewMultilingualNeural` was a good pick for this reason; find the current equivalent if it's been retired) matters less than getting the category right.

## Setting the rate

Don't trust the `--rate` flag's number at face value — measure it. Generate one representative sentence, `ffprobe` its duration, divide word count by minutes. Then generate the *whole script* at a candidate rate and re-measure across all of it — the single-sentence number always reads faster than the full-script average, because natural inter-sentence pauses pull the average down. Generate directly at the chosen rate rather than post-speeding a normal-rate recording with `atempo` — it's audibly different.

**The default target is ~195 words per minute** measured across the full script. `gen_audio.py` reports the measured average against that target and says which way to move. Rate strings are voice-specific, so aim at the measured number rather than a percentage — for `en-US-AndrewMultilingualNeural` that landed at `+13%`.

That's brisker than a lone narrator reading to camera would be comfortable at, and **it only works because of what surrounds it**: actions play *under* the narration rather than before or after it (`recording-technique.md`), and a repeated pattern is explained once instead of every time (`narrative-arc.md`). Take the number without those two and it reads as rushed. For a script with little repetition and mostly static screens, measure toward something slower and set `pace` accordingly rather than forcing 195.

**When the user asks for a different tempo** ("a bit faster", "1.2x"), set `pace` in `script.json` rather than hand-picking a rate string. It scales the wpm target (`195 × pace`), and `record.template.js` reads it back out of `durations.json` to scale the inter-cue gaps and typing delays by the same factor. Scaling all three together is the point: speeding only the voice leaves every pause intact, and the pauses are most of what makes a demo drag.

Slide holds deliberately do **not** scale with `pace` — a viewer doesn't read a bulleted list faster because the demo is faster.

If a requested factor would push the target past roughly 210 wpm, say so rather than silently complying: past that the narration starts outrunning the actions it describes, which is the one thing this pacing model depends on.

## Pronunciation gotchas

TTS engines mis-read domain jargon and acronyms that don't follow normal spelling rules — a mixed-case abbreviation, an internal product codename, an uncommon plural. **Before generating the full script, spot-check every piece of app-specific jargon the narration uses** by generating just that word/phrase and listening to (or at least reading a description of) the result. If something reads wrong, respell it phonetically in the text fed to TTS only — never touch how it's spelled anywhere the video's own UI or the on-screen slides show it. Keep a scratch note of every respelling you land on for a given app, in case the script needs regenerating later.

One documented example of the failure mode (specific to one now-superseded voice, but the *pattern* generalizes to any acronym-shaped product term): a doubled letter meant to represent one long vowel sound (e.g. writing "ee" to mean the vowel in "see") got read as two separate letter names spelled out, because a bare repeated letter looks like spelling-out notation to the model. The fix was a single hyphenated letter instead of a doubled one. Don't assume any given respelling generalizes to a different voice or a different word — verify it for the actual voice and word in front of you.

## Tone

Write like a real person walking a colleague through something they built, not like a feature-list narrator and not like an over-caffeinated pitch. Two opposite failure modes to avoid, both worse than they sound in isolation:
- **Stacking a verbal filler onto nearly every line** ("Alright," "Okay," "So," "Now,") reads as chattier than intended once it's constant, even though any single instance sounds natural. A couple of cues can open with a connector; most should start on the content.
- **Cutting the script down to clipped fragments** naming UI operations ("Placed.", "Push.", "Close it.") reads as robotic independent of the voice itself — a string of noun-phrases isn't a sentence a person would actually say.

Aim for the middle: whole sentences that carry a point of view. State the situation a real person doing this task is in. Say what you'd rather not do, if there's a natural alternative being avoided. Let an occasional opinion land. Vary sentence length on purpose — a longer flowing sentence, then a short one. Prefer describing intent over naming widgets ("let's see what it's complaining about" beats "click the alerts tab").

**Every click gets a spoken mention, even a quick one.** No silent clicks — opening a menu, clicking a nav item, anything a viewer sees happen should have at least a brief line of narration alongside it. A one-clause mention is enough; it doesn't need a full sentence, but it can't be nothing.

**Never narrate a value that varies between runs.** Mock/seed data that looks deterministic often isn't for every field — re-run the app once and check whether the exact value the script is about to quote actually stayed the same. If it might not, narrate the *shape* of the thing instead of the value ("already-assigned states and numbers" instead of naming three specific states). Check any figure the script quotes against a frame from the actual recording you're about to use, not an earlier exploratory run.

## Timing discipline

Every wait in the recording script is driven by a cue's **measured** audio duration (from `durations.json`, produced by `ffprobe`-ing the real generated clip) — never a guessed `waitForTimeout`, never a sum of assumed durations. See `compositing-pipeline.md` for how this composes with slide timing and the final mix.

### Size the narration to the action, not only the action to the narration

The rule above runs one way: the recording waits as long as the audio takes. The other direction matters just as much and is easy to miss. A cue whose `during` action takes longer than its narration produces silent clicking — the voice stops and the viewer watches the mouse work on its own.

So before generating audio, **estimate each `during` action's real wall-clock cost** (per-character typing delay × length, plus ~0.5s per cursor glide, plus each click's settle) and write a line long enough to cover it. In practice this means some cues get a deliberately longer sentence than they'd otherwise need. One cue that filled three rows of a form — two dropdowns and a number each — took about nine seconds of interaction; its first draft read "Add another row and keep going", about four seconds, and had to be rewritten to roughly thirty words.

Lengthening the narration is almost always the right fix. Speeding the action up to match makes it unreadable, and letting the silence stand is the exact failure the `during` phase exists to prevent.
