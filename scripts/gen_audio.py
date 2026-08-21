#!/usr/bin/env python3
"""
Generate one narration clip per piece of narration text in script.json, via
edge-tts, and measure each clip's real duration via ffprobe.

Usage: python3 gen_audio.py [path/to/script.json] [output_dir]
Defaults: ./script.json, ./ (writes audio/ and durations.json alongside it)

Requires: pip3 install --user edge-tts

Every narration-bearing field in script.json becomes exactly one clip:
  - title.titleNarration          -> id "title"
  - contentsNarration              -> id "contents"        (only if parts.length > 1)
  - parts[i].narrationIntro        -> id "part:<parts[i].id>"
  - cues[i].text                   -> id cues[i].id

durations.json ends up keyed by these same ids, and every downstream script
(record.template.js, render_slides.js, compute_offsets.js, mix_audio.py)
reads durations by id — never by re-deriving or guessing them.
"""
import asyncio
import json
import os
import subprocess
import sys

import edge_tts

BASE = os.path.dirname(os.path.abspath(sys.argv[1])) if len(sys.argv) > 1 else os.getcwd()
SCRIPT_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "script.json")
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else BASE
AUDIO_DIR = os.path.join(OUT_DIR, "audio")

with open(SCRIPT_PATH) as f:
    data = json.load(f)

os.makedirs(AUDIO_DIR, exist_ok=True)


def collect_narration_items():
    items = []
    if data.get("titleNarration"):
        items.append({"id": "title", "text": data["titleNarration"]})
    parts = data.get("parts") or []
    if len(parts) > 1 and data.get("contentsNarration"):
        items.append({"id": "contents", "text": data["contentsNarration"]})
    for part in parts:
        if part.get("narrationIntro"):
            items.append({"id": f"part:{part['id']}", "text": part["narrationIntro"]})
    for cue in data.get("cues", []):
        items.append({"id": cue["id"], "text": cue["text"]})
    return items


async def gen_one(text, out_path):
    communicate = edge_tts.Communicate(text, data["voice"], rate=data["rate"])
    await communicate.save(out_path)


async def main():
    items = collect_narration_items()
    durations = {}
    total_words = 0
    total_seconds = 0.0

    for item in items:
        out_path = os.path.join(AUDIO_DIR, f"{item['id'].replace(':', '_')}.mp3")
        await gen_one(item["text"], out_path)
        probe = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                out_path,
            ],
            capture_output=True, text=True,
        )
        dur = float(probe.stdout.strip())
        durations[item["id"]] = dur

        words = len(item["text"].split())
        wpm = words / (dur / 60) if dur > 0 else 0
        total_words += words
        total_seconds += dur
        print(f"{item['id']}: {dur:.2f}s, {words} words, {wpm:.0f} wpm")

    if total_seconds > 0:
        print(f"\noverall: {total_seconds:.1f}s, {total_words} words, "
              f"{total_words / (total_seconds / 60):.0f} wpm average "
              "(aim for 165-190; adjust `rate` in script.json if this is outside that band)")

    with open(os.path.join(OUT_DIR, "durations.json"), "w") as f:
        json.dump(durations, f, indent=2)


asyncio.run(main())
