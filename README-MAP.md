# Rang Chase — Blender Map Handover

Everything needed to pick this build up mid-stream. Written after the amphitheatre pass;
updated 2026-08-09 after the export / naming / valid-tile pass (§6b is the entry point for
anything to do with getting the map into Three.js).

---

## 1. What this is

A 3D city map built in Blender for **Rang Chase**, a real-time multiplayer browser chase game.
A central park, the road network around it, a commercial block, two large east-side buildings, and an amphitheatre.

**Game context** (drives most design decisions):
- Chaser picks a colour each round; runners must stand on objects matching that colour to be safe
- Fixed **top-down / angled-overhead camera** — detail that only reads at eye level is wasted
- Buildings are **sealed solid masses**, no interiors — pure collision blockers
- Must stay **lightweight** for the browser

---

## 2. Connecting to Blender

MCP server `blender` (stdio, `uvx blender-mcp`), user scope. Blender must be open with the
BlenderMCP addon panel running on **port 9876**.

```bash
claude mcp get blender          # check config
```

### ⚠ The recurring drop
The MCP disconnects periodically. The config keeps reporting `✔ Connected` but **the session
loses its tool handles** and `ToolSearch` returns no `mcp__blender__*` matches.

**Fix:** fully close and reopen the Claude Code session (the process must restart — a new chat
is not enough). Then re-load tools via ToolSearch.

This has happened ~6 times. It is not a Blender problem and not a scene problem.

---

## 3. Scale & coordinates

**1 Blender Unit = 1 metre.** Z-up. Park is centred on the world origin.

| Axis | Meaning |
|---|---|
| +X | east (right in top view) |
| +Y | north (up in top view) |
| +Z | up |

---

## 4. Map structure

### 4.1 Overall layout (top-down, north up, east right)

```
                                 NORTH — map edge, y = +65
   x=-120      x=-63       x=0        x=+63  x=84                  x=175
      |          |           |          |      |                     |
      |          |    +------+------+   |      |   .---------------.  |
      |          |    |   P A R K   |   |      |   | AMPHITHEATRE  |  |
      |          |    |  90 x 120 m |   |      |   | ctr (125,-44) |  |
      |          |    |  x -45..45  |   |      |   | 16 tiers      |  |
      |          |    |  y -60..60  |   |      |   | r 11..43      |  |
      |          |    |             |   |      |   | 220 deg arc,  |  |
      |        W |    | # playground|   |      | E | opens SOUTH   |  |
      |        E |    |   (-22, 30) |   |      | A | x 76..174     |  |
      |        S |    |   * fountain|   |      | S | y -70..5      |  |
      |        T |    |     (0, 0)  |   |      | T '---------------'  |
      |          |    |   # gazebo  |   |      |                      |
      |        R |    |    (22, 30) |   |      | R                    |
      |        O |    | == jog track|   |      | O                    |
      |        A |    +------++-----+   |      | A                    |
      |        D |      GATE (0,-60)    |      | D                    |
  ====+==========+==========++==========+======+======================|  y = -80
      |          (X)        |          (O)     |            SOUTH ROAD
      |      CROSSROAD      |       ROUNDABOUT |            runs to x=175
      |      (-63,-80)      |        (63,-80)  |
      |          |          |           |      |   +------------------+
      |          |  +---+---+---+---+   |      |   |   BUILDING A     | y -120
      |          |  | P | C | P |   |   |      |   | courtyard ring   |
      |          |  | A | E | A |   |   |      |   | x 84..175        |
      |          |  | R | N | R |   |   |      |   | 3 storeys, 11.7m | y -172
      |        W |  | K | T | K |   |   |      | E +------------------+
      |        E |  | I | R | I |   |   |      | A        <- alley x 24..48
      |        S |  | N | A | N |   |   |      | S           y -176..-168
      |        T |  | G | L | G |   |   |      | T +----------------+
      |          |  |   |   |   |   |   |      |   |   BUILDING B   |   y -200
      |        R |  |   | S |   |   |   |      | R | stepped L +    |
      |        O |  |   | T |   |   |   |      | O | pergola wing   |
      |        A |  |   |   |   |   |   |      | A | x 84..142      |   y -252
      |        D |  +---+---+---+---+   |      | D +----------------+
      |          |   strip blocks       |      |
      |          |   x +/-25..48        |      |
      +----------+----------+-----------+------+----------------------  y = -285

   LEGEND   * fountain   # playground / gazebo   == jogging track
            (O) roundabout (63,-80)   (X) signalised crossroad (-63,-80)
```

### 4.2 Standard road cross-section (all main roads)

```
   |<-3m->|<--------- 14 m carriageway (4 x 3.5 m lanes) --------->|<-3m->|
   +------+------------+------------+------------+------------+------+
   |footway|   lane    |   lane     |   lane     |   lane     |footway|
   +------+------------+------------+------------+------------+------+
    0.15 m raised          asphalt at z = 0.02          0.15 m raised
```

### 4.3 Commercial block cross-section (any y between -110 and -278)

```
   x=-48    -25       -10  -7    0    +7  +10        +25      +48
     |       |          |   |    |    |    |          |        |
     +-------+----------+---+---------+---+----------+---------+
     | strip | parking  | f | carriage| f | parking  |  strip  |
     | block | 2 rows   | o |   way   | o | 2 rows   |  block  |
     | 3-6   | + aisle  | o |  14 m   | o | + aisle  |  3-6    |
     |storeys| ~185 cars| t |         | t |          | storeys |
     +-------+----------+---+---------+---+----------+---------+
                          CENTRAL STREET, x = 0
```

### Park — the origin block
| Element | Extent |
|---|---|
| Terrain slab | x −45…45, y −60…60 (90 × 120 m), 0.4 m thick |
| Wrought-iron fence | x ±45.1, y ±60.1, 2.42 m tall, **gap at south for the gate** |
| Main gate | south edge, centred **x = 0, y = −60**, 9.6 m clear opening, pillars at x = ±5.5 |
| Gate banner | curved green steel arch, "RANG CHASE" in gold on a black backing panel |
| Jogging track | rounded rect x ±43.8, y ±58.8, terracotta, white lane lines |
| Fountain plaza | 20 m circle at origin, 3-tier fountain. **Paving is plain** — `Fountain_RadialJoints` (24 radial lines, r 4.7…9.9) and `Fountain_Promenade_Ring` (r 7) were removed on request; only `Fountain_Plaza` + `Fountain_Plaza_Border` (rim at r 10) remain |
| Cross paths | 5 m wide, N/S/E/W from the fountain, grey, stone kerbs, bush-lined |
| Playground | NW quadrant, centre ≈ (−22, 30), 26 × 22 m, patchwork safety floor |
| Gazebo | NE quadrant, centre ≈ (22, 30), octagon, entrance gap facing the fountain |
| Perimeter footpath | 4.5 m ring outside the fence + verge fill out to the road footways |

### Road network
| Road | Line | Notes |
|---|---|---|
| South road | y = −80 | park gate frontage; runs x −120 … **175** |
| East road | x = +63 | runs y −285 … 65.2 |
| West road | x = −63 | runs y −285 … 65.2 |
| Carriageway | 14 m (4 × 3.5 m lanes) | 3 m raised footways (0.15 m) each side |
| **Roundabout** | **(63, −80)** | 36 m outer / 16 m island, fountain, 3 m circular footway ring |
| **Crossroad** | **(−63, −80)** | 20 × 20 m pad, 4 zebra crossings, 4 signal poles |

*There is no north road* — it was deliberately removed; the map ends at the park's north
footpath edge, **y = 65.2**.

### Commercial block (between the vertical roads, south of the park)
| Element | Extent |
|---|---|
| Central street | x = 0, carriageway ±7, footways to ±10, y −87 … −282 |
| Parking | x ±10…±25 each side, two nose-in bay rows + aisle, ~185 cars |
| Strip blocks | x ±25…±48, 3 blocks per side, 3–6 storeys, 2 with courtyards |
| Alley | x 24…48.5, y −176…−168, walkable, props hug the walls |
| School bus + shelter | central street, y ≈ −128 |

### East precinct (east of the east road)
| Element | Extent |
|---|---|
| **Building A** | x 84 … **175**, y −172…−120. 3-storey stone **courtyard ring**, 11.7 m |
| **Building B** | x 84 … 142, y −252…−200. Stepped **L-block**, 5 storeys + 2-storey pergola wing |
| **Amphitheatre** | x 75.8…174.1, y −70.6…5.4. Centre **(125, −43.5)**, plaza meets the south footway |
| Service roads | spur x = 78, rear service road x = 146, cross links y = −105 / −186 / −268 |
| **Footpaths** | `Ground_Footpath` — added 2026-08-09, see below |

**East precinct footpath network** (`Footpath_EastPrecinct`, 13 slabs, one object).
The verge between the south road and the service road was a 12 m green void with no pedestrian
link at all. All slabs are 3 m wide, top **z 0.15**, material `Road_Sidewalk` — identical to
every other footway.

| Run | Extent |
|---|---|
| Frontage spine | x **75.35**…174, y −99.5…−96.5 (west end found by probing, meets the existing paving) |
| North connectors | x 88 / 112 / 136 / 160, y −96.5…**−90.0** (exact south edge of the road footway) |
| South connectors | x 88 / 112 / 136, y **−101.25**…−99.5 (exact north edge of the service road) |
| East pocket walk | x 150…174, y −119.5…−116.5 — extends Building A's frontage walk over the bare x 150…174 pocket |
| East pocket link | x 157…160, y −116.5…−99.5 |
| South strip | x **73.0**…174, y −277.5…−274.5, plus connectors at x 88 / 136 up to **−272.25** |

Measured edges these fit against, all at x ≈ 88–136:

```
-90.00   south edge, south-road footway (z 0.15)
-101.25  north edge, service road       (z 0.02)
-109.25  south edge, service road
-116.25  Building A frontage walk starts (z 0.15), ragged - tree ring + props sit on it
-119.50  Building A face
```

⚠ **Two traps here.** A 4 m sample grid made the service road look like y −104…−108; it is
really **−101.25…−109.25**, and the first attempt laid footpath slabs straight over the
asphalt. Probe at 0.25 m before fitting anything to a road edge. And the gap between the
service road and the building frontage (y −109.25…−116.25) is **deliberately left green** — it
holds the east tree ring, so it is planted, not empty.

⚠ **Order matters: pave before you scatter.** The footpaths went in after the 505 scatter props,
so props inside the new footprint ended up buried 0.16 m under the paving (they sit on
`Ground_Base` at z −0.01, the new slab tops at 0.15). Only 2 were affected and both were
re-seated, but a bigger paving pass would need every prop re-dropped:

```python
for o in scatter_props: o.hide_viewport = True     # so the ray misses the prop itself
...  hit, loc, *_ = sc.ray_cast(dg, (x, y, 80.0), (0, 0, -1)); o.location = (x, y, loc.z)
```

**Amphitheatre spec** (rebuilt from the front-elevation reference, 2026-08-06/07):
centre **(125, −43.5)**, datum z = 0.06, 16 tiers, riser 0.45 / tread 2.0, radius 11 → 43 m,
top of seating z = 7.26. **220° arc (−20°…200°) opening south** toward the road.
The plaza meets the road footways on **two** sides: south at y = −70, west at x = 73.
Both edges are modelled 0.10 m **under** the kerb (slab top z 0.06 vs footway top z 0.15) so
the faces are not coplanar — it reads as touching without z-fighting.

| Part | Detail |
|---|---|
| Plaza | x **72.9**…173, y **−70.1**…1.5, slab top z 0.06, 6 m paving-joint grid. **SW corner trimmed** to an arc of **r 21.5** about the roundabout centre (63, −80) — the square corner otherwise cut into the roundabout footway ring. Trim runs from (82.09, −70.1) round to (72.9, −60.91) |
| Stage | dais r 8.0 (z +0.44) on an apron r 9.3 (z +0.17), rim band r 7.82…8.06 |
| Tiers | 16 concrete steps + a lighter 0.26 m nosing line on each tread |
| Aisles | 3 radial, at 35° / 90° / 145°, **3.5 m wide** (constant metric width), two half-risers per tier |
| Benches | **190 teak segments** ≈6.5 m long with 1.2 m gaps, r offset +0.55…+1.22, seat z +0.11…+0.46, on steel supports |
| Planters | **40**, on tiers 2/5/8/11/14 at the aisle-adjacent block ends — concrete box (0.72 m) + soil + shrub |
| Terrace palms | 13, in every 3rd planter |
| Side walls | 0.9 m stepped retaining walls closing both arc ends, 0.55 m above each tread |
| Side stairs | 3.5 m flights just outside each side wall, plaza → top |
| Top ring | planter r 43…45 (+0.85), soil, hedge, parapet r 45…45.5 |
| Palms | 24 in the rear ring at r 46.9, evenly from −32° to 212° |
| **Stadium masts** | **12 at r 46.0, 16 m tall** (7.1 m clear of the top hedge). Base plinth + tapered shaft, 2.9 m arm cantilevered **inward**, 3-lamp bank tilted **34° below horizontal** aiming at the bowl. Sited on the **midpoints between palms** (4.39 m clear) |
| Forecourt poles | 4 at **11 m** on the plaza — plinth + tapered column, **twin lamp heads** on short arms ±1.2 m. At (86, −61.5) (164, −61.5) (96, −67.5) (154, −67.5) |
| Bollards | 28 — 14 arc in front of the stage (r 10.35), 14 along the plaza south frontage |

Originally **32 objects, 51 886 faces**. After the 2026-08-09 tile pass it is
**327 objects / 54 862 faces / 265 unique meshes** — the bollard, bench and mast-base arcs were
split into individual props (137 of them now classify as tiles) and 70 props were scattered on
the plaza. Materials are all `AM_*` flat-emission (see §6).

Clearances: **0 m** to the south-road footway (y = −70) and **0 m** to the east-road footway
(x = 73) — both deliberate, the plaza meets them. **0.15 m** from the roundabout footway ring
(true outer radius **21.0**) at the trimmed SW corner. 0.87 m inside the x = 175 map limit. Palm crowns overhang the south
footway line by 0.55 m at z ≈ 8 m, which is intentional.

⚠ The east-road footway only exists **north of y = −60** — south of that the roundabout takes
over. That is why the plaza's west edge stops at y = −61.93 and turns onto the trim arc.

---

## 5. Blender collections

The build-by-zone collections below were **replaced by function-based collections** in the
2026-08-09 export pass, since Three.js filters by role, not by build order:

```
Tiles (2128)      — every object the engine may recolour as a valid tile
Props (1000)      — decorative / instancing candidates
Buildings (189)   — sealed solid masses
Ground (51)       — walkable base surfaces
Roads (33)        — carriageways, footways, kerbs, markings
Colliders (30)    — blocking, non-gameplay
Spawns (9)        — EMPTY position markers
Helpers (2)       — bevel profile curves, hide_render, never exported
```

**3,443 objects · 191 materials.** (`Collection` also still holds the default `Light`, which the
exporter drops.) The old zone collections (`Park`, `Roundabout`, `Crossroad`, `Vehicles`,
`Amphitheatre`, …) were emptied and removed. Zone is still recoverable from the object name and
from position.

### ⚠ Thin dark lines that are NOT in the model
Solid-mode **Object Outline** was on in this file's viewport. It draws a hairline silhouette
around *every* object, so any object's edge shows as a dark line even where the surfaces on
both sides are the same material at the same height. It cost a full investigation at the
roundabout mouths — the arc there was `RB_RingRoad`'s silhouette, not geometry.
```python
area.spaces.active.shading.show_object_outline = False   # now off
```
It is an editor overlay only — it never appears in an export. **Before treating a thin line
as a modelling bug, turn this off and look again.** Real seams survive the toggle.

---

## 6. Art style — non-negotiable

- **Flat / unlit only.** No shading, gradients, AO, shadows, or outlines.
- Materials use an **Emission shader** *and* a matching `diffuse_color`, so they read
  correctly in both Solid viewport and rendered view:

```python
def flat_mat(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em  = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*rgb, 1.0)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    m.diffuse_color = (*rgb, 1.0); m.roughness = 1.0
    return m
```

- Low-poly boxes / cylinders / simple arcs. **No PBR, no image textures, no Cycles setup.**
- Reuse shared mesh datablocks for repeated assets.
- Muted, desaturated palette — nothing photoreal.
- **Never** build irrigation, drainage, wildlife, or render/camera rigs. They were in the
  original spec files but are invisible in-engine and were deliberately skipped.

### Colour rule for the game
Terrain/road/building colours are **reserved** and must stay clearly distinct from the eight
pickable player colours (red, blue, green, yellow, orange, purple, cyan, magenta). Small props
(planters, bins, signs) are the intended "valid tiles" — keep them as **separate objects**.

### Valid-tile coverage — was the map's biggest gap, now closed

There is **no per-colour quota** to build. Per `map-design.md`, the engine picks valid tiles at
runtime and recolours them:

```
valid_tile_count = ceil(active_players / max_players_per_tile)
selected_objects = pick_random(objects, valid_tile_count, min_distance = X)
```

So colour coverage is handled game-side. What the *map* must supply is a **large, well-spread
pool of eligible prop objects** — enough that `min_distance` can actually be satisfied in any
region a runner might be in.

**RESOLVED 2026-08-09.** Distribution before and after the tile pass in `export_map.py`:

| Region | Before | After | Share | Nearest-tile median / p95 |
|---|---|---|---|---|
| Park interior | 1493 | 1493 | 70.2 % | 0.2 m / 2.6 m |
| Park surround | 28 | 27 | 1.3 % | 0.2 m / 0.2 m |
| Commercial block | **3** | **223** | 10.5 % | 3.0 m / 4.5 m |
| Amphitheatre | **2** | **136** | 6.4 % | 4.2 m / 7.2 m |
| East precinct | **0** | **230** | 10.8 % | 3.5 m / 5.8 m |
| Outer / verge | 22 | 19 | 0.9 % | 11.0 m / 49.4 m |
| **Total** | **1522** | **2128** | | |

Park share fell from **98.1 % to 70.2 %**. Three fixes, all in `export_map.py`:

1. **`is_tile_candidate` used absolute world Z** (`z0 < 1.2`), which disqualified every prop on
   the amphitheatre terraces — they climb to z 7.26, so a planter sitting on a tread a runner is
   standing on scored as 7 m in the air. Now it raycasts down and asks whether the prop rests on
   a *walkable* surface within 0.6 m. The support must classify as `Ground_*`, `Road_*` or
   `Building_Amphitheatre` — without that check a lamp head 4 m up counts as "supported" by its
   own pole, which silently converted 46 streetlights into tiles.
   The size test also admits **elongated** props (min side < 1.5 m, max < 7 m, height > 0.15 m)
   so the 5.2 m amphitheatre bench segments qualify; the height floor keeps lane markings and
   paving joints out.
2. **`split_merged()`** separates merged prop meshes by loose part — 28 + 10 bollards, 190 bench
   segments, 5 planters, 11 alley crates, 12 mast bases. Post and cap are separate loose parts,
   so parts are re-joined by XY proximity: one object = one prop. The paving-joint grids are
   deliberately excluded (`Amph_PlazaJoints` alone has 2242 parts — flat decals, not props).
3. **`scatter_props()`** places 505 new props (bollard / planter / crate / bin) on raycast-verified
   surfaces with Poisson-disk spacing, reusing four centred donor meshes so instancing survives.
   **Carriageways are excluded** — the allow-test keys off layer height, since footways sit at
   z 0.15 and asphalt at z 0.02. Bare `Ground_Base` counts only within 12 m of something built,
   so nothing strands out on the open base plane.

**Rule for future work:** any zone a runner can reach needs its own scatter of small, separate,
ground-level props. Merge for scenery; keep separate for anything that could be a tile. Cars and
trees do not count — cars sit in drivable bays and tree canopies are not standable.

---

## 6b. Export pipeline — `export_map.py`

One script does rename → split → scatter → collections → spawns → apply transforms → `.glb`.
Run it inside Blender, or via `execute_blender_code`.

```python
DRY_RUN     = True    # print the rename plan, touch nothing. Always run this first.
BUILD_TILES = True    # split merged props + scatter new ones. ONCE, on a pre-rename scene.
```

**Run it from a clean pre-rename `.blend`.** `BUILD_TILES` sources objects by their original
names (`Amph_Bollards`, `BollardB_Posts`, …); on an already-renamed scene those lookups miss and
the split silently no-ops.

Output: **`rang_chase_map.glb`, 2.82 MB, Draco, 3440 nodes / 1247 meshes / 185 materials.**
Every node matches `^(Tile|Prop|Building|Ground|Road|Collider|Spawn)_`, so `MapLoader.ts` can
filter on prefix.

| Prefix | Nodes | |
|---|---|---|
| `Tile_<Colour>_NNN` | 2128 | 266 per colour, contiguous from 001 |
| `Prop_` | 1000 | |
| `Building_` | 189 | |
| `Ground_` | 51 | |
| `Road_` | 33 | |
| `Collider_` | 30 | |
| `Spawn_` | 9 | `EMPTY` nulls, 8 runner + 1 chaser |

### Things that will bite you

- **The rename is re-entrant, but only because of `_CONFORMING`.** It maps `Prop_Car_017` back to
  base `Prop_Car`. Without it a second run fails to match its own output, skips those objects,
  and the numbering drifts. If you add a prefix, add it to that regex too.
- **Never blanket-apply transforms.** 1723 objects share 36 mesh datablocks (`Icosphere.014`
  alone has 624 users). `Ctrl+A → All Transforms` on multi-user data multiplies the transform and
  forces a unique mesh copy per object — it breaks instancing and inflates the file.
  `apply_transforms()` skips anything with `data.users > 1`; glTF writes node TRS anyway.
- **Colour is baked into the tile name only as an ID.** Nothing about the mesh is red. If
  `TileManager.ts` recolours at runtime per `map-design.md`, treat the colour token as a
  partition key, not as the rendered colour.
- **`use_renderable=True`** on the exporter keeps the two bevel-profile helper curves
  (`ArchProfile`, `BannerBackingProfile`, in the `Helpers` collection, `hide_render`) out of the
  `.glb`. Without it they export as stray non-conforming nodes.
- The MCP call **times out on the full run** (~2 min of split + scatter + export) while Blender
  keeps working. Reconnect and inspect the scene rather than re-running — a second run on an
  already-built scene doubles the scatter.

---

## 7. Naming

**The scene now uses role-based names, not zone-based ones.** `export_map.py` rewrote every
object to `Role_Kind_Index`, because `MapLoader.ts` / `TileManager.ts` filter on prefix
(`name.startsWith('Tile_')`) rather than on where a thing was built.

```
Tile_<Colour>_NNN    Tile_Red_001        gameplay tiles, 3-digit, contiguous per colour
Ground_<Kind>_NN     Ground_Footpath_04  walkable base surfaces
Road_<Kind>_NN       Road_Roundabout_03  carriageways, footways, kerbs, markings
Building_<Kind>_NN   Building_A_17       sealed masses
Collider_<Kind>_NN   Collider_Fence_01   blocking, non-gameplay
Prop_<Kind>_NNN      Prop_Car_042        decorative / instancing candidates
Spawn_Runner_NN      Spawn_Chaser_01     EMPTY position markers
```

### The old zone names still matter
They are the **input** to the rename, and to `BUILD_TILES`. `RULES` in `export_map.py` maps them
to roles, and `split_merged()` looks its sources up by original name. So if you model something
new, name it in the old convention and add a rule — do not hand-author a `Tile_`/`Prop_` name.

`Zone_Element_Index` — e.g. `BldgA_WindowFrames`, `Amph_Seats`, `Car_E0_042`,
`Tree_Track_Trunk_017`, `RB_FootwayRing`.

Prefixes: `Park_` `Road_` `RB_` `XR_` `CS_` `Grid_` `Bldg_` `BldgA_` `BldgB_` `BldgE_`
`Amph_` `Car_` `TreeE_` `Alley_` `Footpath_`

Anything `RULES` does not match is reported as `UNMATCHED` by the dry run and **keeps its old
name**, which then fails the prefix filter in-engine. Always read that list.

---

## 8. Gotchas that cost real time

### Z-fighting
Two coplanar surfaces produce dark streaky patches. Give every layer its own height:
```
0.020  carriageways        0.028  roundabout ring road
0.030  island kerb         0.040-0.060  lane markings
0.150  footways            0.154  roundabout footway ring (4 mm lift)
```

### Stale `matrix_world`
After moving objects, `matrix_world` is **not** updated until the depsgraph runs.
Call `bpy.context.view_layer.update()` before measuring bounding boxes, or you get old numbers.

### Stale viewport screenshots
`get_viewport_screenshot` sometimes returns a cached frame. **The tell:**
`bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=2)` completing in ~0.02 ms means
nothing redrew; a real redraw takes 200–500 ms. Force it before every screenshot.

### Viewport framing
Setting `region_3d.view_rotation` from an Euler is unreliable — it often lands somewhere
random. What works:
```python
with bpy.context.temp_override(area=area, region=region):
    bpy.ops.view3d.view_axis(type='TOP')
    bpy.ops.view3d.view_all()      # or view_selected() after selecting
```

### Rounded shapes vs rectangles
A circle and a rectangle only touch at one point. Approach roads into the roundabout must
**overlap** it (extend to radius 12), and the footway ring's ends must follow the **corridor
edge lines**, not radial cuts — otherwise wedge-shaped gaps appear.

### Not every object sits at the origin — author in LOCAL space
Several road objects carry a non-identity object transform, so writing **world** coordinates
straight into `mesh.from_pydata` silently displaces the result:
```
RB_EdgeLine      location (-15, 0, 0.010)
RB_LaneMarking   location (-15, 0, 0.010)
RB_RingRoad      location (-15, 0, 0.008)
RB_FootwayKerb   location (  0, 0, 0.006)
RB_FootwayRing   location (  0, 0, 0.004)
```
Rebuilding `RB_EdgeLine` from world coords put it 15 m west and 10 mm high. Always convert:
```python
inv = obj.matrix_world.inverted()
verts = [tuple(inv @ Vector(world_pt)) for world_pt in pts]
```
Objects you create yourself are fine — they start at the origin.

### Never read a radius off a bounding box
`RB_FootwayRing`'s bbox is x 43.27…82.73, which *looks* like radius 19.73 about (63, −80).
Its real outer radius is **21.0** — the bbox is short because the ring is interrupted by the
four approach corridors, so no vertex sits at the extreme x. This cost a rebuild of the
amphitheatre plaza's trimmed corner. **Measure radii from vertices, not bounds:**
```python
r = max(hypot(v.x-CX, v.y-CY) for v in verts)
```

### Roundabout radii (measured, use these)
```
 8.00  island          18.00  ring-road outer edge / inner edge of the ring kerb
17.55..17.75  white edge line (z 0.060)
18.25  ring kerb outer 21.00  footway ring outer
```
`RB_EdgeLine` was originally a **complete circle**, so the white line ran straight across all
four road mouths and the roundabout read as fenced off from the roads. It is now four arcs
that stop at the mouths — kept spans **23.4°…66.6°, 113.4°…156.6°, 203.4°…246.6°,
293.4°…336.6°** (mouths are centred on 0/90/180/270°, half-width `asin(7 / 17.65)` = 23.37°
for the 14 m carriageway). Approach carriageways already run in to r = 12 under the ring
plane, so the asphalt is continuous — same `Road_Asphalt` material on both.
The straight approach kerbs stop at r ≈ 19.3 (≈ 21.2 on the north leg), so they do **not**
reach the ring kerb — the kerb line reads as broken at all 8 junctions. `RB_KerbFillets`
(Roundabout collection) bridges each gap: a 0.2 m band along the corridor edge from the leg
end inward to r 18.0, tucked 0.05 m into the leg so the end caps are not coplanar.

The **north leg is cut back further than the other three** (footway starts at y = −60, i.e.
r 21.2, while the ring footway only reaches r 21.0). That left a genuine wedge of bare
`Ground_Base` on both sides — 0.31 m wide at the kerb, opening to 1.65 m at the outer edge.
`RB_FootwayFillets` closes it (x 53…56 and x 70…73, from r 20.9 out to y = −59.95).
South, west and east legs do **not** need this — their ring overlaps the leg already.

**How to find holes like this:** ray-cast straight down on a 0.5 m grid and look for cells
whose topmost hit is `Ground_Base`:
```python
hit, loc, nrm, idx, obj, mw = scene.ray_cast(depsgraph, (x, y, 8.0), (0, 0, -1))
```
Grass verges in the SW/SE quadrants are legitimately `Ground_Base` — only worry about cells
inside the paved envelope.

### Normalise coordinate pairs
A bug cost a rebuild: block bounds were passed north-edge-first, and wings were placed with
`y0 + WING/2` assuming ascending order. Always `ya, yb = min(a,b), max(a,b)` first.

### Scene rollbacks
The scene has rolled back at least once (Building A vanished, an older version reappeared).
**Verify objects exist before assuming earlier work survived.**

---

## 9. Outstanding work

1. **Building B is not yet extended east.** Building A now runs to x = 175; B still stops at
   x = 142. The user asked for both. Extending B means rebuilding its stepped massing
   (tall bar y −230…−200, SE wing y −252…−230, low pergola wing x 84…108) at the new depth.
2. **Rear service road + east tree ring** still sit at x = 146 / 148.5, which is now *inside*
   Building A's extended footprint. They need moving to ≈ x = 179 / 181.
3. Building A's cornice/quoins project to x = 176.4, ~1.4 m past the road's 175 limit. Trim if
   it matters.
4. West-side gaps between the strip blocks have no alley — only the east gap does.
5. Ground base plane extends well past the road network; may want trimming to the map edge.
6. **Spawn points are placeholders.** The 8 runner + 1 chaser positions in `SPAWN_RUNNERS` /
   `SPAWN_CHASER` were guessed, not designed. `map-design.md` is referenced by §10 but is **not
   in the repo**, so the real max-player count is unconfirmed.
7. Scatter props concentrate along footway strips, because that is where the allowed surface is
   once carriageways are excluded. Building A/B courtyard interiors are still thin.
8. The **south-east pocket** (x 150…175, y −174…−270, ~25 × 96 m) is still bare grass with only
   the one new spine crossing it. It is the same area outstanding item 2 wants the rear service
   road and tree ring moved into, so finish that first and lay footpaths to suit.
9. Building B's frontages (y −174, −198, −254) already have footways, so they were left alone.
   The strip blocks west of the east road were not surveyed for green voids.

---

## 9b. Characters

Four supplied `.glb` files, two characters × two facial expressions. They are **not**
interchangeable body meshes — vertex counts differ (311k–379k), so all four need rigging
separately; you cannot rig one boy and swap the face texture.

### Folders

```
characters/                 originals as supplied - DO NOT EDIT, 24-28 MB each
characters/fitted/          height + origin corrected only, geometry untouched
characters/optimized/       game-ready meshes, 0.38-0.46 MB   <- use these
characters/mixamo_upload/   OBJ+MTL+texture zips for the auto-rigger
```

### What was wrong as supplied, and what was done

| Problem | Fix |
|---|---|
| 103.88 MB total | **1.66 MB** — simplify + 512² textures + Draco |
| 2,006,971 tris (6.5× the whole map) | **145,716** |
| 12 × 2048² JPEG, none shared | 12 × 512² |
| Normalised to a 2.0-unit box, not real scale | uniform scale to **1.20 m** |
| Origin at body centre — sank to the waist at y=0 | origin at the **feet**, centred X/Z |
| Root nodes and materials all named `None` | `Char_Boy_Shocked`, `Char_Girl_Smirk`, … |
| **No skeleton, no animations** | **still outstanding — see below** |

Height 1.20 m was chosen against the map's cars (`Prop_Car` median **0.981 m** tall, 3.9 m long),
a little over roof height so a character standing beside a car is not hidden by it. Change it by
editing `TARGET_H` and re-running the fit. Note **hair is ~40 % of total height** — eye level is
near 0.75 m, which is what the camera should frame, not 1.2.

⚠ **Do not run gltf-transform's texture resizer on Windows.** `--texture-size` / `--texture-compress`
route through sharp/libvips and fail with `colourspace: parameter space not set`, even though the
JPEGs are plain RGB (confirmed with Pillow). Do geometry with gltf-transform and textures with a
separate Pillow pass:

```bash
gltf-transform optimize in.glb out.glb --simplify-ratio 0.03 --simplify-error 0.01 \
                                       --texture-compress false --compress draco
py shrink_tex.py out.glb final.glb 512
```

### Rigging — the remaining blocker

`skins: 0`, `animations: none`. They are static props: they cannot walk, run, jump or be tagged.
Orthographic point renders of the raw meshes show clean stylised chibi characters standing in a
relaxed A-pose — riggable, with two caveats: **the arms hang against the torso**, so automatic
weights will bleed at the armpits and Mixamo's auto-rigger will likely need its wrist/elbow
markers placed by hand; and the hair is a large fraction of the silhouette.

Route chosen: **Mixamo**. Upload the zips in `characters/mixamo_upload/` — Mixamo accepts
`.fbx` / `.obj` / `.zip` but **not `.glb`**, which is why they are OBJ packages. Download
`Idle`, `Running`, `Jump` — first clip **With Skin**, the rest **Without Skin**, FBX Binary.
Drop the results in `characters/mixamo_out/` for merging onto one shared skeleton and re-fitting.

---

## 10. Reference material in this repo

| File | Contents |
|---|---|
| `map-design.md` | Original game spec — colour system, valid-tile rules, camera, match timing |
| `part1.txt` | Site layout, terrain, boundary, entrance, jogging track, main axis |
| `part2.txt` | Children's playground, full equipment breakdown |
| `part3.txt` | Fountain plaza, gazebo, lawns, secondary walkways |
| `part4.txt` | Landscaping, furniture, lighting, signage, collections, render setup |

**Read these as layout/geometry guidance only.** They call for photoreal PBR, Cycles at 4K,
irrigation and drainage — all of which conflict with the flat/unlit lightweight brief and were
intentionally not followed.

---

## 11. Working method that has worked

1. Ask before large deletions — annotated screenshots are ambiguous and mis-reading them
   destroys work.
2. Build in chunks; `execute_blender_code` is happier with several medium scripts than one huge one.
3. Screenshot after every meaningful change (force the redraw first).
4. Verify with geometry queries, not just visually — bounding boxes catch overlaps and gaps
   that a top-down render hides.
