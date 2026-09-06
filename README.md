# 30 Nights

A finite survival-strategy for Android (landscape) and the browser. Fourteen
days of shrinking daylight to fortify an abandoned arctic mining compound,
then thirty nights of siege. Dawn after the last night is the win; there is
nothing after it. Two workers, no hero, the player assigns every job.

Status: prototype v0, step 1 ("three nights") - the daily work loop, the
fence and wall sections, heat, food, wounds and the night director are in;
expeditions to the village, player-built partitions and saves are not yet.

## Layout

| Path | What |
|---|---|
| `game/` | The game: TypeScript strict + Vite + Canvas 2D + Capacitor 7 |
| `game/src/sim/` | Simulation: time, base layout, sections, jobs, heat, economy, siege |
| `game/src/render/` | Canvas renderer, sprites, camera |
| `game/src/ui/` | DOM HUD and touch input |
| `game/public/art/` | Processed sprites the game loads (PNG) |
| `game/tests/` | vitest suites |
| `design/GDD_RU.md` | Game design document (Russian, by request) |
| `design/ART_BRIEF.md`, `design/STYLE_GUIDE.md` | Briefs for external art generation |
| `design/balance-model.xlsx` | Balance model (formulas; a Python mirror lives outside the repo) |

Raw generator output (Meshy, ChatGPT) and references are kept next to the
repo but not in it; only the processed sprites are tracked.

## Run

    cd game
    npm install
    npm run dev      # http://localhost:5173, or -- --port 5174
    npm test         # vitest
    npm run build    # tsc --noEmit && vite build

## Playtest parameters (browser only)

Append to the URL, e.g. `?day=14&food=100&fuel=300`:

| Parameter | Effect |
|---|---|
| `day=N` | Start on day N at 08:00 (`hour=H` for another hour). Day 14 is the eve of night 1, day 16 of the first assault. |
| `food=N`, `fuel=N`, `boards=N`, `logs=N`, `meds=N` | Override the starting stocks. |
| `seed=N` | Forest and RNG seed. |
| `lang=en` | English UI (default Russian). |

In development the page also exposes `window.__game` (state, step, render,
loop, camera, select) for scripted checks.

## Conventions

Code, comments and documents are in English; the GDD is in Russian by the
author's choice. The simulation never touches the DOM: it appends events
that `main.ts` turns into pauses, toasts and modals.
