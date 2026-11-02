#!/bin/bash
# Downloads the pop-up images sized for the Seestar S30, S50 Pro and S30 Pro frames into heroes/<model>/ (never touches the S50 images in heroes/).
# Usage, from the Sky-Watch folder: bash tools/get-heroes-models.sh s30   (or s50pro, s30pro). Reads tools/hero-models.txt.
# Safe to re-run: files already downloaded are skipped. Eight downloads run at once.
cd "$(dirname "$0")/.." || exit 1
model="$1"; [ -n "$model" ] || { echo "usage: $0 s30|s50pro|s30pro"; exit 1; }
get() { [ -s "$1" ] && exit 0; mkdir -p "$(dirname "$1")"; for i in 1 2 3; do curl -fsSL --max-time 60 -o "$1.tmp" "$2" && [ -s "$1.tmp" ] && mv "$1.tmp" "$1" && echo "ok  $1" && exit 0; sleep 2; done; rm -f "$1.tmp"; echo "FAILED $1"; }
export -f get
awk -v m="$model" '$1==m {print $2, $3}' tools/hero-models.txt | xargs -P 8 -L 1 bash -c 'get "$0" "$1"'
