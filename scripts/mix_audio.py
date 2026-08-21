#!/usr/bin/env python3
"""
Mix every narration clip into one audio track, each delayed to its absolute
start time in the final video (from global_offsets.json, produced by
compute_offsets.js), then pad the mix out to the final video's exact total
duration so the audio track never comes up short of the picture.

Usage:
  python3 mix_audio.py <global_offsets.json> <audio_dir> <total_duration_sec> <out.mp3>

audio_dir must contain "<id>.mp3" for every id in global_offsets.json, with
":" replaced by "_" in filenames (matching gen_audio.py's own convention,
e.g. the id "part:part1" -> "part_part1.mp3").
"""
import json
import os
import subprocess
import sys

global_offsets_path, audio_dir, total_duration_arg, out_path = sys.argv[1:5]
offsets = json.load(open(global_offsets_path))
total_video_duration = float(total_duration_arg)

# Stable, deterministic input order (doesn't affect the mix, just makes the
# ffmpeg command reproducible/diffable between runs).
ids = sorted(offsets.keys())

inputs = []
filters = []
mix_inputs = []
for i, cid in enumerate(ids):
    mp3 = os.path.join(audio_dir, f"{cid.replace(':', '_')}.mp3")
    inputs += ["-i", mp3]
    delay_ms = int(round(offsets[cid] * 1000))
    filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms}[a{i}]")
    mix_inputs.append(f"[a{i}]")

n = len(ids)
# normalize=0 is required here, not optional: amix's default loudness
# normalization divides every input's volume by the input count, which is
# correct for genuinely simultaneous sources but makes a track of N
# sequential, non-overlapping narration cues nearly inaudible as N grows.
filter_complex = (
    ";".join(filters) + ";" + "".join(mix_inputs)
    + f"amix=inputs={n}:duration=longest:dropout_transition=0:normalize=0[mixed];"
    + f"[mixed]apad=whole_dur={total_video_duration}[aout]"
)

cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[aout]", out_path]
print(f"mixing {n} narration clips -> {out_path} (padded to {total_video_duration}s)")
subprocess.run(cmd, check=True)
print("done")
