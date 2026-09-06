# 30 Nights — Art Style Guide (v0.1)

Working title. This document is the single source of truth for every sprite,
tile and icon in the game. Its purpose is **cohesion**: assets will be produced
over months, by different tools (ChatGPT image tools first, then Retro
Diffusion / PixelLab), and they must all look like one hand drew them. That
only happens if every generation obeys the same hard constraints below.

**How to use it:** paste the *Master Prompt* (section 6) plus one *asset line*
(section 7) into the generator. One asset per image. Never change the master
prompt between assets. Judge the result with the checklist (section 8).

---

## 1. The game in one breath

A miner missed the last evacuation flight out of a remote arctic mining village.
He has two weeks of dwindling daylight to chop wood, saw planks, board up the
fences and windows, loot the abandoned houses for food — and then survive
thirty nights of polar darkness while wolves and something worse circle the
firelight.

**Mood words:** cold, quiet, grounded, hand-made, lonely, warm-only-by-the-fire.
**Not:** cute, cartoon, chibi, gore, neon, sci-fi, fantasy-medieval.

**Era:** mid-20th-century remote mining settlement. The generator is dead and
there is no electricity: wood stoves, oil lamps, torches, hand tools, plank
fences, log and plank cabins, tin-and-tar roofs under snow. Nothing glows
unless it burns.

**Readability references (games, for perspective and clarity only):**
Stardew Valley, Prison Architect, Graveyard Keeper. We borrow their *view and
readability*, not their palette or characters. Never reference a specific
artist's asset pack.

---

## 2. Hard technical constants

These never change. Every asset, every tool, every month.

| Constant | Value |
|---|---|
| Tile size | **32 × 32 px**. Everything snaps to a 32-px grid. |
| View | **3/4 top-down**: floor seen from straight above (flat square tiles), objects show their **front face + a sliver of top**. |
| Not | **Not isometric** (no diamond tiles), not side-view, not perspective/3D. |
| Human character | **32 wide × 48 tall** (1 × 1.5 tiles), feet on the bottom edge, footprint 1 tile. |
| Proportions | Chunky game-sprite: head ≈ 1/3 of total height, short legs, broad body (Stardew / Prison Architect scale). Adults, not toddlers. Bulky winter clothing. **Not** realistic 1/6 illustration proportions. |
| Detail budget | ~5 readable features per character, ~3 per prop. No buttons, buckles, laces, stitching, fur texture. Big simple shapes. |
| Outline | **1-px outline in blue-black `#1B1D2E`** on the outer contour of every object and character. No pure black. Few or no inner lines. |
| Shading | Hard-edged pixel shading, **max 3 tones per material** (light / base / shade). |
| Forbidden | Gradients, anti-aliasing, blur, dithering, glow/bloom, baked cast shadows, baked lighting, text, watermarks. |
| Light | Author every sprite in **neutral flat daylight**, key light slightly top-left. Night, torch glow and shadows are drawn **by the engine**, never in the sprite. |
| Snow cap | Every **outdoor** object has 2–3 px of snow highlight on its top surfaces. This is the unifying motif. Interior furniture has none. |
| Symmetry | Characters are **left–right symmetric** (no single-shoulder bag, no asymmetric badge) so the *right* view is a mirror of *left*. |
| Background | Generate on a **flat solid magenta `#FF00FF`** (or transparent). No scene, no ground under props. |

Why "no baked light/shadow": the engine draws a soft blob shadow under every
standing object and a light radius around every fire. If a sprite bakes its own
shadow or glow, it breaks the moment it is rotated, reused indoors, or placed at
night.

---

## 3. Palette — "Polar Night" (36 colours)

The palette is the strongest cohesion tool we have. **Every asset uses only
these colours.** Warm saturated hues are reserved for fire; the only other
saturated colour in the whole game is the vampire's eye.

Also saved as `palette-polar-night.hex` (importable into Aseprite).

**Outline & dark**
- `#1B1D2E` outline / darkest
- `#2A2F4A` deep night, cast interior dark

**Snow** (light → shade)
- `#F4F7FB` highlight
- `#DFE7F2` base
- `#B9C7DD` shade
- `#8FA2C2` deep shade / snow in shadow

**Ice & sky accents**
- `#7FB3D5` ice light
- `#4F86B0` ice deep

**Stone & metal**
- `#AEB4C2` light
- `#9AA0AD` base
- `#6E7482` shade
- `#474B58` dark

**Wood, raw** (logs, trunks)
- `#B07D4B` light
- `#8A5A32` base
- `#5D3B20` shade
- `#3A2415` dark

**Wood, planks** (sawn, bleached by cold)
- `#C9A97A` light
- `#A3865C` base

**Spruce foliage**
- `#2F5D45` light
- `#1F4030` base
- `#142A20` dark

**Skin (humans)**
- `#F1C9A5` light
- `#C8956C` base
- `#8F5A3C` shade

**Worn cloth** (coats, hats, gloves)
- `#7A6A55` light
- `#55483A` base
- `#545A70` cold cloth light
- `#3B3F52` cold cloth base

**Fire** — the only warm hues in the game
- `#FFE08A` core
- `#FFB03A` mid
- `#E85D2A` edge
- `#9C2A1E` ember

**Vampire**
- `#B8C4D6` pale skin light
- `#7C8AA3` pale skin shade
- `#FF2F4F` eye (the only saturated red besides fire)
- `#7A1225` blood

Rules of thumb: snow shade is *blue*, never grey. Wood is *warm brown*, but
never as warm as fire. Metal shares the stone ramp. If an asset needs a colour
that is not here, the asset is wrong, not the palette.

---

## 4. Scale table (footprints)

Generators have no sense of relative size. Every asset is generated at a stated
pixel size and lives on a stated tile footprint.

| Asset | Sprite size (px) | Footprint (tiles) | Notes |
|---|---|---|---|
| Ground tile (snow, trodden snow, ice, plank floor, dirt floor) | 32 × 32 | 1 × 1 | seamless / tileable |
| Fence segment, plank (horizontal / vertical) | 32 × 32 | 1 × 1 | fence ~24 px tall inside the frame |
| Fence segment, reinforced (boards nailed over) | 32 × 32 | 1 × 1 | visibly thicker, extra boards, nails |
| Cabin wall face (log) | 32 × 32 | 1 × 1 | plus corner and window variants |
| Window / boarded window | 32 × 32 | 1 × 1 | wall tile variants |
| Door (closed / open) | 32 × 48 | 1 × 1 | door taller than the tile, like a character |
| Roof tile (snow-covered) | 32 × 32 | 1 × 1 | plus edge/ridge variants |
| Spruce tree, snowy | 64 × 96 | 2 × 3 | trunk footprint 1 tile at bottom centre |
| Dead birch | 32 × 96 | 1 × 3 | |
| Tree stump | 32 × 32 | 1 × 1 | |
| Campfire | 32 × 32 | 1 × 1 | 3-frame flicker |
| Standing torch / lamp post | 32 × 48 | 1 × 1 | 2-frame flicker |
| Log pile / plank stack / crate / barrel / sack | 32 × 32 | 1 × 1 | props and loot containers |
| Wood stove / hearth | 32 × 48 | 1 × 1 | interior, warm light source |
| Bed | 32 × 64 | 1 × 2 | rotatable |
| Table | 64 × 32 | 2 × 1 | |
| Chair / stool | 32 × 32 | 1 × 1 | 4 rotations |
| Workbench / sawhorse | 64 × 32 | 2 × 1 | |
| Shelf / cupboard | 32 × 48 | 1 × 1 | against a wall |
| Human (miner, villagers) | 32 × 48 | 1 × 1 | |
| Wolf | 32 × 32 | 1 × 1 | low, long silhouette |
| Vampire | 32 × 56 | 1 × 1 | deliberately taller and thinner than humans |
| Item icon (inventory / HUD) | 16 × 16 | — | same palette, no outline variant allowed |

**Silhouette rule:** miner = short and bulky; villager = medium; vampire = tall
and thin; wolf = low and long. A player must tell them apart by silhouette
alone, at a glance, at night.

---

## 5. Animation (minimum set)

Frames are laid out as **horizontal strips**, fixed frame size, left → right.
File name carries the action and direction.

| Subject | Idle | Walk | Work | Other |
|---|---|---|---|---|
| Human | 2 | 4 | chop 4, saw 4, hammer 4 | hurt 2, down 1 |
| Wolf | 2 | 4 | bite 3 | flee (reuse walk) |
| Vampire | 2 | 4 (unnatural, gliding) | claw 3 | recoil-from-light 2 |
| Campfire | 3 | — | — | dying 2, out 1 |
| Torch | 2 | — | — | out 1 |

Directions for characters: **down, up, left** (right = mirrored left).
For the *style kit* (section 7) only idle + walk-down are required.

---

## 6. Master Prompt (copy exactly, every time)

```
Pixel art game sprite for a 2D top-down game.
VIEW: 3/4 top-down like Stardew Valley or Prison Architect — the camera looks at the object from IN FRONT AND ABOVE (about 60 degrees down). You must see the object's FRONT face AND its TOP surface at the same time: the top of a hat, the top tiers of a tree, the top edge of a wall or fence rail, the round cut ends of a log pile. The object stands on the ground at the bottom of its frame. NOT a flat side view, NOT a silhouette, NOT a clip-art icon, NOT isometric (no diamond tiles), NOT a 3D render.
SCALE: 32-pixel tile grid. Render the sprite large but keep true pixel-art blockiness (nearest-neighbour look).
LINE: clean 1-pixel outline in dark blue-black #1B1D2E on the outer contour only. No pure black. Almost no inner lines.
SHADING: flat, hard-edged pixel shading, maximum 3 tones per material. NO gradients, NO anti-aliasing, NO dithering, NO blur, NO glow, NO cast shadows, NO baked lighting. Neutral flat daylight, key light slightly top-left.
DETAIL: game-sprite level of detail, not an illustration. At 32-pixel scale a character has room for about FIVE readable features (hat, beard, coat, belt, boots) — no buttons, buckles, laces, stitching, fur texture, or facial detail beyond eyes and a beard mass. Big simple shapes that survive being shrunk to 32 pixels wide.
PALETTE: strictly limited cold palette — snow whites and BLUE-greys (#F4F7FB, #DFE7F2, #B9C7DD, #8FA2C2), dark navy (#2A2F4A), brown wood (#B07D4B, #8A5A32, #5D3B20), grey stone (#9AA0AD, #6E7482), spruce green (#2F5D45, #1F4030). Warm orange/yellow (#FFE08A, #FFB03A, #E85D2A) is used ONLY for fire.
SETTING: remote arctic mining village, mid-20th century, no electricity — log cabins, plank fences, wood stoves, torches, hand tools. Mood: cold, quiet, grounded, hand-made. Not cute, not cartoon, not gore, not fantasy.
SNOW: every outdoor object has 2-3 pixels of snow highlight on its top surfaces.
OUTPUT: a single object only, centred, isolated on a flat solid magenta #FF00FF background. No scene, no ground beneath it, no text, no watermark, no frame.
SUBJECT: {ASSET}
```

Replace `{ASSET}` with one line from section 7. For **ground tiles** replace the
OUTPUT line with:
`OUTPUT: a seamless, tileable 32x32 ground texture filling the entire frame edge to edge, top-down, no objects, no border.`

---

## 7. Style Kit — the first 12 assets

Generate these first, **before anything else**. If these twelve look like one
world, the style is locked and we mass-produce. If they drift, we fix the
constraints, not the sprites.

1. **Snow ground tile** — `seamless snow ground, soft undulating drifts, blue-grey shadows in the hollows, a few faint footprints`
2. **Trodden snow / path tile** — `seamless trodden snow path, packed grey-blue snow with boot prints, slightly darker than fresh snow`
3. **Spruce tree, snowy** — `a single snow-laden spruce seen from in front and above: the canopy is 3 or 4 tiers that overlap downward; the lower tiers are the widest and read as rounded masses because we see their TOP surfaces; the top is a small point; a short trunk base touches the ground at bottom centre; branches sag asymmetrically under heavy snow; dark green needles with snow on every top surface; 2 tiles wide, 3 tiles tall. NOT a symmetrical Christmas-tree cone, NOT a flat side-view silhouette`
4. **Log cabin wall segment** — `front face of a log cabin wall, horizontal stacked logs of raw brown wood, with a thin strip of the snow-covered TOP edge of the wall visible above the face, one tile square`
5. **Plank fence segment** — `a low plank fence segment seen from in front and slightly above: weathered bleached planks nailed to two posts, the top edge of the rail and the tops of the posts visible with snow on them, one tile wide, horizontal`
6. **Reinforced fence segment** — `the same plank fence reinforced with extra boards nailed across it, visibly thicker and sturdier, iron nails, snow on top`
7. **Boarded window** — `a cabin wall tile with a small window boarded over with crossed planks and nails`
8. **Campfire** — `a small campfire seen from above and in front: the ring of dark stones is a flattened ellipse on the ground, stacked logs inside it, bright flames rising upward, fire colours #FFE08A #FFB03A #E85D2A, no glow, no smoke`
9. **The miner** — `a stocky, chunky game-sprite miner — big head about one third of his total height, short legs, broad body, like a Stardew Valley or Prison Architect character, NOT a realistic illustration. Heavy dark worn coat, fur ushanka hat with ear flaps (the top of the hat is visible because we look slightly down at him), thick mitts, boots, short beard mass, two dot eyes. Facing the camera, full body, feet on the bottom edge of the frame. At most five readable features, no buttons or buckles. 32 by 48 pixel scale, left-right symmetric`
10. **Wolf** — `a lean grey arctic wolf, low and long silhouette, ribs faintly showing, side view walking left, 32 by 32 pixel scale`
11. **Vampire** — `a tall gaunt vampire, pale blue-grey skin, sunken face, long dark tattered coat, unnaturally long arms hanging low, glowing red eyes #FF2F4F as the only saturated red, no visible fangs, facing the camera, 32 by 56 pixel scale, taller and thinner than a human`
12. **Log pile** — `a neat pyramid of cut logs seen from in front and above, so the round pale cut ends face us and snow sits on the top logs, raw brown wood, one tile`

Then, second wave (only after the kit passes): door, roof tile, torch, crate,
barrel, wood stove, bed, table, chair, workbench, villager (man, woman),
dead birch, stump, plank stack, sack of grain, tin can loot, oil lamp.

---

## 8. Consistency checklist (judge every asset)

An asset **passes** only if every line is true:

- [ ] Outline is `#1B1D2E`, 1 px, outer contour only, no pure black.
- [ ] Uses only palette colours (index it in Aseprite — no "almost" colours).
- [ ] Snow shade is blue-grey, not neutral grey.
- [ ] Flat shading, ≤ 3 tones per material, no gradients / AA / dither / glow.
- [ ] 3/4 top-down: front face AND top surface visible (hat top, tree tiers from above, fence rail top). Not a flat side view, not isometric.
- [ ] Detail budget respected: ~5 features per character, ~3 per prop; proportions chunky (head ≈ 1/3).
- [ ] Light from top-left; **no** cast shadow, **no** baked glow.
- [ ] Snow cap present (outdoor) / absent (interior).
- [ ] Correct pixel size and footprint from the scale table.
- [ ] Silhouette reads at 1× at night (squint test).
- [ ] Character is left-right symmetric.
- [ ] Nothing cute, cartoon, gory, neon, or fantasy about it.

If three or more assets fail the same line, the **constraint** is unclear —
rewrite that line in the master prompt and regenerate the whole kit.

---

## 9. Workflow per tool

**ChatGPT / general image tools (style exploration stage).**
They do not produce a true 32-px grid; they produce a *picture that looks like
pixel art*. Use them to find the look, then clean up:
1. Generate one asset per image with the master prompt.
   - ChatGPT's default for props is a **flat side view** (clip-art / platformer
     style) and for people a **realistic illustration**. Both are wrong for us.
     Always say what the camera *sees* (front face + top surface) and insist on
     chunky sprite proportions. If a result comes out as a side-view silhouette
     or a detailed illustration, **regenerate** — do not try to fix it in Aseprite.
2. In Aseprite: import → `Sprite > Sprite Size` with **Nearest Neighbour** to the
   exact target size (e.g. 32 × 48) → `Sprite > Color Mode > Indexed` using
   `palette-polar-night.hex` → fix the outline by hand → magenta to transparent.
3. Run the checklist. Keep the ones that pass as **reference images**.

**Retro Diffusion / PixelLab (production stage).**
Feed the passed kit as style references, load the `.hex` palette, set tile
size 32. Use PixelLab for 4-direction rotations and skeleton animation from a
single approved *down* pose. Never feed them purchased asset packs as
references.

---

## 10. Files and naming

```
art/
  palette-polar-night.hex
  tiles/    tile_snow_01.png  tile_path_01.png  tile_plankfloor_01.png
  walls/    wall_log_face.png  wall_log_window.png  wall_log_boarded.png  roof_snow_01.png
  props/    fence_plank_h.png  fence_plank_v.png  fence_reinforced_h.png  logpile.png  crate.png
  fx/       campfire_idle_3f.png  torch_idle_2f.png
  chars/    miner_idle_down_2f.png  miner_walk_down_4f.png  miner_walk_up_4f.png  miner_walk_left_4f.png
            wolf_walk_left_4f.png  vampire_idle_down_2f.png
  icons/    icon_wood.png  icon_plank.png  icon_food_can.png
```

`_Nf` = number of frames in the horizontal strip. All PNG, transparent
background, no padding between frames.

---

## 11. What to send back

The twelve kit PNGs (cleaned, indexed to the palette) and, if you changed any
colour, the updated `.hex`. From those I lock the engine's sprite loader, the
blob-shadow and light-radius renderer, and we swap the placeholder art.
