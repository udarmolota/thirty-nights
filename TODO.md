# 30 Nights — where we stand

Written 2026-09-28, after the phone playtest of the expedition build. The
design lives in `design/GDD_RU.md` (v0.6, Russian); this file is the state of
the work and the order of what comes next.

## State

Playable on the phone as an APK, and in the browser. Fourteen days of
preparation and the first nights can be played end to end; the full arc to
dawn cannot, because the village runs out and nothing replaces the losses.
Twelve test files, 48 tests, TypeScript clean.

**Done**

- Fixed base: map 64x44, fenced compound, one irregular building (hall,
  office, storeroom), four stoves mid-room, forest ring.
- Time: 10-minute steps, speeds and pause, daylight 8 h shrinking to 1 h,
  polar night from day 15, dawn pauses the game, morning report and
  checkpoint, auto run-to-morning when everyone is spent.
- Work: chop and saw with a plan-and-confirm panel that estimates walk,
  work time and yield per person; section operations (repair, reinforce,
  build, board a window) with progress living on the section; a 12 h daily
  budget; walking is free of work hours.
- Economy: firewood and boards only (6 firewood = 1 board, boards burn 1:1
  when the firewood is gone), food eaten every morning, medicine.
- Heat per room with area and leaks, a small room gets up to x1.5 from a
  stove, cold bites the sleeping at 1 hp per degree-day.
- Wounds: three days, one with medicine, the wounded work at half pace.
- Siege: the night director walks fence -> yard -> weakest wall or window ->
  the people behind the breach; breaches count the step they happen; eyes in
  the dark; every event pauses the game.
- Expeditions: the village map (hand-drawn plan, seventeen houses with sketch
  icons), sending a runner with a full estimate, loot by carry weight, houses
  that empty, wounds for coming back after dusk or a bad roll.
- Saves: one slot, written every morning, start screen with Continue.
- Phone: landscape APK, fullscreen, screen kept awake, roster column on the
  left, one-row top bar with icons and tap-for-detail popovers.

**Not built yet**

- Survivors: three homes and the clinic already hide one in the data, but
  there is no event, no choice to take them in, and no new colonist.
- Build mode: player-made partitions and moving beds. Without partitions the
  workshop cannot be heated at all (235 tiles, -21 C with a stove lit), so
  half of the heat design is unreachable.
- The full 44-day arc has never been played to dawn.
- Sound, portraits, the dawn screen.

## Next

1. **Survivors.** The find event on a looted house, "take them or not", the
   new colonist with their own food stash, the wounded one in the clinic.
   This is what makes the middle of the game move.
2. **Build mode.** Partitions and beds from boards, with a penalty for
   working in the cold once there is a way to answer it. This is what makes
   heat a decision.
3. **A full run to dawn**, then tune the numbers from what breaks.

## Debts

- `design/balance-model.xlsx` still counts logs and splitting; the game has
  used firewood and boards since 2026-09-06. It also ignores per-person
  health, room heat, the second line of defence and expeditions.
- `design/STYLE_GUIDE.md` was written for a three-quarter view; the game is
  top-down.
- Hints about heat are deliberately absent: the player should learn from
  consequences, not from numbers in the HUD (the author's call).
- Food starts at 100 instead of 12 while expeditions cannot feed a colony.
- The map button at the bottom right overlaps a long panel.

## Running it

    cd game
    npm install
    npm run dev      # browser; ?day=14&wood=300 &boards= &food= &meds= &seed= &lang=
    npm test

APK, from `game/`:

    npm run build
    npx cap sync android
    cd android && gradlew.bat assembleDebug   # JAVA_HOME = Android Studio's jbr

The debug APK lands in `game/android/app/build/outputs/apk/debug/`.
