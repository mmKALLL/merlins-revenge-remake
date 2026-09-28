# Title screen and in-game menu (design, 2026-09-28)

Goal: make the game usable on small screens and phones by moving every control that sat below the
canvas into menus, so the canvas can fill the screen.

## The original

`movieMaster.start` opens on `#titleScreen`; Escape in game (`gameMaster.escapePressed`, called by
objAIPlayer) pauses the game (`pauseGame`) and shows `#ingameMenu`. `gameMaster.menuOptionSelected`
handles its options: `#resumeGame`, `#instructions`, `#chooseKeys`, `#saveGame` / `#loadGame`,
`#soundOn` / `#soundOff`, `#quitToTitle`, `#showArmy`. The title lettering is one GIF per letter in
`gfx/title/output/` (silver bevelled capitals with a blue gradient, white background).

## Remake screens

- **Title screen** (the page opens on it): the original's title letters, then Play (starts the last
  played map, else the default `works/mriiidemoiv`), Maps, Settings, How to play, and a credits line
  (Merlin's Revenge and the Merlin Open engine by Steve Riddett, The Metal Box; GPL).
- **Playing**: the canvas fills the window (default zoom 'scale'); nothing below it. The debug line
  stays in the HUD. A small ☰ button in the top right corner and Esc open the in-game menu.
- **Paused** (in-game menu): the simulation stops (no ticks, the end sequence also waits) and the
  audio context is suspended. Resume, Maps, Settings, How to play, Restart map, Quit to title.
  Choose keys, save/load and show army are not ported (no rebinding, saves or armies yet).
- **Maps**: the existing folder browser and favourites. Picking a map reloads the page with
  `?map=<id>`, which starts it straight away (a `?map=` link skips the title screen, so deep links
  and the dev workflow keep working).
- **Settings**: pixel size, camera (room / follow), Space mode (nearest enemy / push-back shot),
  music, effects, volume. Same storage as before: `mr-remake.zoom`, `mr-remake.audio`,
  `mr-remake.favourites`, and the camera in the `camera` URL parameter.
- **How to play**: keyboard and touch controls.

Menus are HTML overlays: real buttons, Tab and the arrow keys move between them, Enter/Space
activate, Esc goes back (a sub-panel to its menu; the in-game menu resumes). They scroll normally on
phones in both orientations.

## State machine (`src/ui/app-state.ts`, pure, tested)

`{ screen: 'title' | 'playing' | 'paused', panel: 'main' | 'maps' | 'settings' | 'help' }`.
Actions: `play` (title -> playing), `pause` (playing -> paused, main panel), `resume`
(paused -> playing), `quit` (paused -> title), `open <panel>`, `back` (Esc: sub-panel -> main;
paused main -> playing; title main stays). The simulation runs only in `playing`.

`src/ui/tick-clock.ts` (pure, tested) turns frame times into ticks and does not accumulate time
while stopped, so resuming never catches up on the pause.

## Game lifecycle

Assets load when a game starts (Play, or a `?map=` URL), not on the title screen. Quit to title
keeps the loaded map in memory and hides it; Play afterwards restarts that map (a new run) when it
is the one to play, and otherwise loads the chosen map. The last started map is kept under
`mr-remake.lastMap`.

The map list comes from `loadMapList()` (`src/data/map-list.ts`): the converted index plus any
entries registered with `addMapEntries()`, so generated maps (e.g. a random map generator's
`random/...` ids) can appear in the Maps menu without a converted file.

## Touch

Gesture blocking applies only while playing with no menu open: `touch-action: none` on the canvas
and the touch controls, `user-select: none`, and the portrait band's page padding. The touch
controls are hidden while a menu is open; they drop a finger whose pointer capture was lost (the
controls hid under it). Menus and the title screen scroll and select as a normal page.

## Modules

- `src/ui/app-state.ts`, `src/ui/tick-clock.ts`: pure.
- `src/ui/overlay.ts`: the overlay element, panel switching, focus and arrow-key navigation.
- `src/ui/title-screen.ts`, `src/ui/pause-menu.ts`, `src/ui/settings-panel.ts`,
  `src/ui/help-panel.ts`, `src/ui/maps-panel.ts` (+ `src/ui/map-browser.ts`, moved from `src/`),
  `src/ui/title-art.ts`, `src/ui/menu-button.ts`.
- `src/main.ts`: loads a game and wires the screens.
