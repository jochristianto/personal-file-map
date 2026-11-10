#!/bin/sh
# Encodes the rendered reel with its sound: out/showreel/reel.mp4 (1920×1080, 60 fps, H.264 + AAC, high quality),
# a poster frame, and the README's copy, docs/reel.mp4 (CRF 23, ~5 MB; looks the same at a fraction of the size).
set -e
cd "$(dirname "$0")/../../../out/showreel"
ffmpeg -y -v error -i reel.mkv -i reel.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 256k -movflags +faststart reel.mp4
ffmpeg -y -v error -i reel.mkv -i reel.wav -map 0:v -map 1:a -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart ../../docs/reel.mp4
ffmpeg -y -v error -sseof -0.05 -i reel.mkv -frames:v 1 poster.png
ls -lh reel.mp4 poster.png ../../docs/reel.mp4
