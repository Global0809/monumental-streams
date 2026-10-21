#!/usr/bin/env bash
# Transcodes the studio motion loops (sources/previews/*.mp4) into web-weight assets:
#   media/public/previews/<id>-720.mp4  (hero/featured, ~1.5 Mbps)
#   media/public/previews/<id>-480.mp4  (cards / mobile, ~0.7 Mbps)
#   media/public/posters/<id>-1280.webp, <id>-640.webp, <id>-lqip.txt (tiny base64 blur)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=media/public
mkdir -p "$OUT/previews" "$OUT/posters"
for f in sources/previews/*.mp4; do
  base=$(basename "$f" .mp4)
  id=$(echo "$base" | sed -E 's/^MS_preview_([0-9]+)_(.*)_1920x1080.*$/\1-\2/' | tr '_' '-')
  [ -f "$OUT/previews/$id-720.mp4" ] || ffmpeg -loglevel error -y -i "$f" -an -vf "scale=1280:-2:flags=lanczos" -c:v libx264 -preset slow -crf 26 -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p -movflags +faststart "$OUT/previews/$id-720.mp4"
  [ -f "$OUT/previews/$id-480.mp4" ] || ffmpeg -loglevel error -y -i "$f" -an -vf "scale=854:-2:flags=lanczos" -c:v libx264 -preset slow -crf 28 -maxrate 800k -bufsize 1600k -pix_fmt yuv420p -movflags +faststart "$OUT/previews/$id-480.mp4"
  [ -f "$OUT/posters/$id-1280.webp" ] || ffmpeg -loglevel error -y -ss 3.2 -i "$f" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -c:v libwebp -quality 82 "$OUT/posters/$id-1280.webp"
  [ -f "$OUT/posters/$id-640.webp" ] || ffmpeg -loglevel error -y -ss 3.2 -i "$f" -frames:v 1 -vf "scale=640:-2:flags=lanczos" -c:v libwebp -quality 78 "$OUT/posters/$id-640.webp"
  if [ ! -f "$OUT/posters/$id-lqip.txt" ]; then
    ffmpeg -loglevel error -y -ss 3.2 -i "$f" -frames:v 1 -vf "scale=24:-2" -c:v libwebp -quality 40 "$OUT/posters/$id-lqip.webp"
    printf 'data:image/webp;base64,%s' "$(base64 -w0 "$OUT/posters/$id-lqip.webp")" > "$OUT/posters/$id-lqip.txt"
    rm "$OUT/posters/$id-lqip.webp"
  fi
  echo "ok $id"
done
