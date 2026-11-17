# Neon Void — best-game-neon-void

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/hessaminanloo/best-game-neon-void/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/hessaminanloo/best-game-neon-void/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Neon Void** is an original twin-stick arena-survival shooter that runs entirely offline in a
desktop browser from static files — no build step, no network requests, no assets: every ship,
swarm and sound is drawn and synthesised in code.

One pilot against ten waves of the swarm. Drifters weave in, Darts lunge, Spitters shell you
from range, Brutes soak your fire — and on waves 5 and 10 the Void Sentinels come, radial-burst
bosses that summon minions and enrage at half hull. Kill, collect the XP they drop, and level
up into a build: split cannons, piercing lance rounds, overclocked fire, tractor fields, nano
repair. Clear wave 10 and the arena is yours; hit 0 hull and it's over.

## Play it

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Open the page, click (or press Enter) to launch.

| Input | Action |
| --- | --- |
| WASD / arrow keys | Fly |
| Mouse | Aim |
| Hold mouse button / Space | Fire |
| Click a card, or 1 · 2 · 3 | Choose a level-up upgrade |
| P / Esc | Pause |
| M | Sound on/off |
| Enter / click | Start, restart |

The HUD tracks hull, level and XP, wave, hostiles remaining and score; the best score is kept
in `localStorage`. Boss fights get their own hull bar. Sound is WebAudio synthesis — lasers,
explosions, pickups and jingles, no audio files.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory
  and writes `dossier.json` with the vendored library.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `game/index.html` — the page; a fixed 1280×720 canvas, CSS-scaled.
- `game/src/config.js` — tuning: field, pilot, waves, enemy kinds, the upgrade shelf.
- `game/src/world.js` — the simulation: pilot, bullets, five enemy kinds with their own AI,
  boss patterns, XP gems, particles, the wave director. Fixed 1/60 s steps, no rendering.
- `game/src/render.js` — all drawing: starfield arena, glow ships, HUD, and the title, pause,
  level-up, game-over and victory screens.
- `game/src/input.js` — keyboard and mouse, as held state plus queued actions and clicks.
- `game/src/audio.js` — WebAudio-synthesised sound effects and mute.
- `game/src/random.js` — a seeded generator, so `?seed=N` replays a run exactly.
- `game/src/shots.js` — the deterministic screenshot scenes behind `?shot=menu|combat|boss|victory`:
  the real game played forward by an autopilot under the real rules.
- `game/src/main.js` — boot and the game loop: screens, fixed-step updates, event sounds.
- `screenshots/` — real renders of the game (1280×720): menu, combat, the wave-5 boss, victory.
- `serve.ts` — a tiny static server for local play.
- `shots.json` — the screenshot scenes and file names.

## Screenshots

```sh
node serve.ts --port 8123
# then, per shots.json, open each ?shot=<scene>&seed=7 URL in headless Chrome at 1280×720
# and capture the frame once window.__shotReady is set.
```

## License

MIT — see `LICENSE`.
