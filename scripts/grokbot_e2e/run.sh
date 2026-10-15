#!/usr/bin/env bash
# Plain-shell end-to-end smoke of the full pipeline (audio -> slides -> record -> concat -> mix -> mux).
set -euo pipefail
S=$(cd "$(dirname "$0")/.." && pwd); E=$S/grokbot_e2e
W=${1:-/workspace/demo-studio/work/e2e-smoke}; PY=/workspace/demo-studio/tools/.venv/bin/python
export NODE_PATH=$S/../node_modules
rm -rf "$W"; mkdir -p "$W/clips"; cd "$W"; cp "$E/script.json" .
$PY "$S/gen_audio.py" script.json .
echo '[{"type":"slide","id":"opening"},{"type":"part","id":"main","file":"clips/composited_main.mp4"},{"type":"slide","id":"closing"}]' > pieces.json
echo '{}' > offsets.json
node "$S/compute_offsets.js" script.json durations.json offsets.json pieces.json . --slides-only
echo '{"canvasWidth":1280,"canvasHeight":720,"fps":25,"accentColor":"#5865F2","fontFamily":"system-ui","fontFaceCss":""}' > style.json
node "$S/render_slides.js" script.json style.json slide_durations.json "$S/../slides" clips
sed -e "s#http://localhost:PORT#file://$E/mock.html#" \
    -e "s#{ width: 1600, height: 1000 }#{ width: 1280, height: 720 }#" \
    -e "s#^  // await cue('c01'.*#  await cue('c01',{during:async()=>typeAt('\#title','TEST demo ticket')}); await cue('c02',{post:async()=>clickAt('\#go')});#" \
    -e "s#waitForLoadState('networkidle')#waitForLoadState('load')#" "$S/record.template.js" > record.js
node record.js | tee record.log
V=$(grep VIDEO_PATH record.log | cut -d' ' -f2); PRE=$(node -p "require('./preroll.json').preRollMs/1000")
ffmpeg -v error -y -ss "$PRE" -i "$V" -r 25 -c:v libx264 -pix_fmt yuv420p -an clips/composited_main.mp4
node "$S/compute_offsets.js" script.json durations.json offsets.json pieces.json .
ffmpeg -v error -y -f concat -safe 0 -i concat_list.txt -c:v libx264 -pix_fmt yuv420p -r 25 video.mp4
T=$(ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4)
$PY "$S/mix_audio.py" global_offsets.json audio "$T" narration.mp3
ffmpeg -v error -y -i video.mp4 -i narration.mp3 -c:v copy -c:a aac -shortest final.mp4
ffprobe -v error -show_entries format=duration:stream=codec_type -of compact final.mp4; echo "E2E_OK $W/final.mp4"
