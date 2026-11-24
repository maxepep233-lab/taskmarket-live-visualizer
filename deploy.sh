#!/bin/sh
# One-command deploy for Taskmarket Live.
# Pushes main to GitHub; GitHub Pages serves the site. The first run also
# enables Pages (source: main branch, root). Requires: git, gh (logged in).
set -e
cd "$(dirname "$0")"
git push origin main
if ! gh api repos/maxepep233-lab/taskmarket-live-visualizer/pages --silent 2>/dev/null; then
  gh api -X POST repos/maxepep233-lab/taskmarket-live-visualizer/pages \
    -f 'source[branch]=main' -f 'source[path]=/' --silent
fi
echo "Live at https://maxepep233-lab.github.io/taskmarket-live-visualizer/"
