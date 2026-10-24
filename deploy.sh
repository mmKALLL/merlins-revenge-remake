#!/bin/bash
set -euo pipefail

# Copy the built game into the sibling homepage repo and publish it.
# Serves at studioesagames.com/merlins-revenge-remake. --delete drops files of older builds
# (hashed bundles, regenerated data) from that folder only. Uses plain `git` so it works under
# `pnpm run deploy` (plain `pnpm deploy` is a pnpm built-in) / non-interactive shells too.
rsync -av --delete ./dist/ ../studio-esagames-homepage/merlins-revenge-remake/

( cd ../studio-esagames-homepage/ &&
git add merlins-revenge-remake &&
git commit -m "chore: update merlins-revenge-remake deployment to latest version" &&
git push
)
