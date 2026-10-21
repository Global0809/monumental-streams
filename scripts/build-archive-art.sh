#!/usr/bin/env bash
# Real artwork for archive / open-cinema films: a poster still and a silent 8 s preview loop
# taken from a chosen moment of each film (fraction of its runtime), so demonstration films
# never borrow the studio's concept art. Outputs stems "still-<slug>" next to the studio art:
#   media/public/posters/still-<slug>-1280.webp, -640.webp, -lqip.txt
#   media/public/previews/still-<slug>-720.mp4, -480.mp4
# Usage: bash scripts/build-archive-art.sh [--force]
set -euo pipefail
cd "$(dirname "$0")/.."
FORCE=${1:-}
OUT=media/public
mkdir -p "$OUT/posters" "$OUT/previews"
# slug:fraction — chosen by eye from contact sheets (see docs/MEDIA.md)
PICKS="nyc-subway-1905:0.75 coney-island-1905:0.75 kingston-1920:0.75 newspaper-train-1942:0.55 rural-puerto-rico-1942:0.55 roads-to-romance:0.35 where-the-sun-reigns:0.55 apollo-11-1969:0.55 tears-of-steel:0.35 sintel:0.15 big-buck-bunny:0.40 caminandes-llama-drama:0.15 caminandes-llamigos:0.65 zero-ad-agni-trailer:0.15 minetest-first-minutes:0.15 senators-world-series-1924:0.52 veldloop-1922:0.40 world-series-1959:0.65 worlds-fair-1964:0.15 royal-tour-1939:0.15 courier-satellite-1960:0.65 fashions-rome-1964:0.40 fashion-week-1951:0.40 cotton-fashion-1958:0.40"
# square pixels first (some sources carry a non-square sample aspect ratio)
SQ="scale=trunc(iw*sar/2)*2:ih,setsar=1"
for pick in $PICKS; do
  slug=${pick%%:*}; frac=${pick##*:}
  src=$(ls sources/archive/$slug/source-silent.mp4 2>/dev/null || ls sources/archive/$slug/source.* 2>/dev/null | head -1 || true)
  [ -n "$src" ] || { echo "missing source for $slug"; continue; }
  stem="still-$slug"
  if [ -z "$FORCE" ] && [ -f "$OUT/previews/$stem-480.mp4" ]; then echo "skip $stem"; continue; fi
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  t=$(node -e "const d=$dur,f=$frac;console.log(Math.max(0,Math.min(d*f,d-9)).toFixed(2))")
  ffmpeg -v error -y -ss "$t" -i "$src" -frames:v 1 -vf "$SQ,scale=1280:-2:flags=lanczos" -c:v libwebp -quality 82 "$OUT/posters/$stem-1280.webp"
  ffmpeg -v error -y -ss "$t" -i "$src" -frames:v 1 -vf "$SQ,scale=640:-2:flags=lanczos" -c:v libwebp -quality 78 "$OUT/posters/$stem-640.webp"
  ffmpeg -v error -y -ss "$t" -i "$src" -frames:v 1 -vf "$SQ,scale=24:-2" -c:v libwebp -quality 40 "$OUT/posters/$stem-lqip.webp"
  printf 'data:image/webp;base64,%s' "$(base64 -w0 "$OUT/posters/$stem-lqip.webp")" > "$OUT/posters/$stem-lqip.txt"
  rm "$OUT/posters/$stem-lqip.webp"
  ffmpeg -v error -y -ss "$t" -t 8 -i "$src" -an -vf "$SQ,scale=1280:-2:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 26 -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -movflags +faststart "$OUT/previews/$stem-720.mp4"
  ffmpeg -v error -y -ss "$t" -t 8 -i "$src" -an -vf "$SQ,scale=854:-2:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 28 -maxrate 800k -bufsize 1600k -pix_fmt yuv420p -movflags +faststart "$OUT/previews/$stem-480.mp4"
  echo "ok $stem @ ${t}s"
done
