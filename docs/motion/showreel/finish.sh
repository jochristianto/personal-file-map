#!/bin/sh
# Encodes the renders: out/showreel/reel.mp4 (1920×1080, 60 fps, H.264 + AAC) from reel.mkv + reel.wav, and the README's
# docs/reel.gif (960 wide, 15 fps, one 128-colour palette, Bayer dithering) from reel-gif.mkv (render.mjs --gif).
set -e
cd "$(dirname "$0")/../../../out/showreel"
ffmpeg -y -v error -i reel.mkv -i reel.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 256k -movflags +faststart reel.mp4
vf="setpts=N/15/TB,hqdn3d=1:1:2:2,scale=960:-1:flags=lanczos"
ffmpeg -y -v error -i reel-gif.mkv -vf "$vf,palettegen=max_colors=128:stats_mode=diff" palette.png
ffmpeg -y -v error -i reel-gif.mkv -i palette.png -lavfi "$vf[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 ../../docs/reel.gif
ls -lh reel.mp4 ../../docs/reel.gif
