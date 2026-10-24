#!/bin/bash
set -euo pipefail

# Copy the built game into the sibling homepage repo's beta folder and publish it.
# Serves at studioesagames.com/merlins-revenge-remake-beta. --delete drops files of older builds
# (hashed bundles, regenerated data) from that folder only. Uses plain `git` so it works under
# `pnpm run deploy:beta` / non-interactive shells too.
rsync -av --delete ./dist/ ../studio-esagames-homepage/merlins-revenge-remake-beta/

( cd ../studio-esagames-homepage/ &&
git add merlins-revenge-remake-beta &&
git commit -m "chore: update merlins-revenge-remake-beta deployment to latest version" &&
git push
)
