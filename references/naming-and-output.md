# Output location, naming, and versioning

## Where it goes

Save the finished video into the target project's own `Demo-Videos/` folder at its repo root (create it if it doesn't exist). Keep every pipeline intermediate (raw recordings, audio clips, slide PNGs, ffmpeg working files) in a scratch/temp directory instead — none of that belongs in the project's git history, only the finished `.mp4` does.

## Naming

```
<project name> demo-v<n> - <ddmmyyyy>.mp4
```

- `<project name>` is the identity confirmed in step 1 of `SKILL.md` — prefer whatever the project calls itself in its own deployment config or `package.json` name over the local folder name, since those two can drift apart over a project's life (a folder name tends to stick even after a project is renamed or re-scoped). Ask if it's not obvious.
- `<n>` starts at 1 and increments by one for each re-record. Check the `Demo-Videos/` folder for existing files matching this project before picking the next number.
- Date is the record date, `ddmmyyyy`, no separators.

Example: `acme-dashboard demo-v2 - 20082026.mp4`.

## Versioning rule

**A re-record never overwrites the previous file in place.** Keep the old one alongside the new one so an earlier cut stays reviewable — the version number exists specifically so nobody can accidentally grab a stale file thinking it's current, not so every past attempt gets hoarded forever.

**A version found to be factually wrong should be deleted, not kept.** "Factually wrong" means it shows or says something untrue — a value that turned out to vary between runs and was narrated as if fixed, a described capability the current build doesn't actually have, a scene that doesn't match what the button actually does. Leaving a wrong file sitting in the folder just invites someone to grab it. This is a different bar than "could be paced better" or "the cursor wasn't visible" — a version that's merely rough but not wrong is still worth keeping alongside a better one, at the team's discretion; a version that's actively incorrect should go.

**When a version is removed, the numbering does not shift.** Later versions keep the numbers they were already known by; the sequence simply has a gap. Renumbering would silently repoint anything that already referenced a specific version number.
