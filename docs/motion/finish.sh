#!/bin/sh
# Encodes the rendered loop: out/motion/loop.mp4 (1440², 60 fps, H.264 + AAC) and out/motion/demo.gif (1200 wide).
set -e
cd "$(dirname "$0")/../../out/motion"
ffmpeg -y -v error -i loop.mkv -i loop.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart loop.mp4
# GIF: 15 fps, one 96-colour palette for the whole loop, no dithering on the flat UI. Still ~50 MB at 1200 wide:
# the camera moves on every frame, which GIF compresses badly.
ffmpeg -y -v error -i loop.mkv -vf "fps=15,scale=1200:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff" palette.png
ffmpeg -y -v error -i loop.mkv -i palette.png -lavfi "fps=15,scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" -loop 0 demo.gif
ls -lh loop.mp4 demo.gif
