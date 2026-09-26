# Design: sound slice

Date: 2026-09-27
Status: approved

Sound effects and music from the original, extracted into `assets/sounds/` and `assets/music/`
(see `docs/notes/sound-extraction.md`). Engine behaviour: `docs/notes/engine-mechanics-sound.md`.

## Decisions

- Follow the engine: one music bus (one track at a time, same track not restarted, switching is an
  stop-and-start, later changed by the user to a 1 s fade-out and 0.5 s pause before the new track), music started by room activation when the room has a music tile, the
  music-off tile stops it; a 7-voice effects pool that drops new sounds when all voices are busy;
  default volume 150/255, per-event volumes passed through as vol/255; spell release and explode
  volume mapped from charge (chargeVolumeMap 1-100 -> 10-255).
- Deviations chosen by the user: music loops; separate music and effects toggles plus a master
  volume slider below the game, remembered in localStorage; turning effects off also stops the
  ones playing.
- Browsers require a user gesture before audio: the audio context resumes on the first key or click.

## Architecture

- The simulation stays pure and silent: it emits `SimEvent`s (`sound` with a name and volume,
  `music` with a track name or null). The sim decides *what* is heard, faithful to the Lingo
  triggers; `src/audio/` decides *how* (Web Audio, voices, buses, toggles).
- The converter copies sounds and music into `public/generated/audio/` with an index; loaders
  resolve against `BASE_URL`.
- Music tiles: objects-layer symbols `musicBaroqueRock`, `musicBaroqueRockTechno`,
  `musicElectronicMerlin`, `musicLastStand`, `musicWoodsOfEvil`, `musicOff`, mapped to tracks via
  their actor data files.

## Out of scope

Title, credits and ending music (no such screens yet); sounds for enemies not yet ported.
