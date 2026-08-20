# Rang Chase — client

Three.js client for the game described in `game-logic-and-build-plan.md`. The map
handover is `README-MAP.md`; this file covers the code.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit + vite build
```

## Layout

```
src/core/Game.ts             scene, lights, fixed-step loop, HUD
src/core/assets.ts           shared Draco-enabled GLTFLoader
src/core/Input.ts            keyboard state -> movement intent
src/map/MapLoader.ts         .glb -> tiles, spawns, merged BVH collider
src/map/palette.ts           material name -> colour (see "The map has no colour")
src/characters/Character.ts  clip playback, root-motion strip, instancing
src/player/PlayerController.ts  capsule-vs-BVH movement, jump, animation states
src/player/FollowCamera.ts   angled-overhead follow camera
src/game/TileManager.ts      tile colours, greyscale, valid-tile selection, holding
src/game/MatchState.ts       LOBBY -> BLIND_SCATTER -> ... -> MATCH_END
```

Everything gameplay-shaped (`TileManager`, `MatchState`) is deliberately free of
rendering and networking so the same logic can move server-side under Colyseus,
per the build plan's server-authority rule. The client copy stays for prediction
and for the HUD countdown.

## Character pipeline

`characters/mixamo_out/*.fbx` (Mixamo downloads, first one **With Skin**) are
merged onto one skeleton and exported as a single `.glb`:

```bash
npm run build:char       # -> public/models/character_a.glb (1.2 MB, 6 clips)
```

`scripts/build_character.py` runs in Blender headless. It imports the base clip
for the mesh, keeps only the action from every other file, pushes each action
onto its own muted NLA track (the glTF exporter turns one track into one
animation), fits the rig to 1.20 m with the origin at the feet, shrinks textures
to 512² JPEG and drops normal maps, then exports with Draco.

Two things worth knowing:

- **Blender 4.4+ slotted actions.** An NLA strip has to be told which slot to
  play (`strip.action_slot = action.slots[0]`) or the clip exports empty.
- **Textures are resized in Blender, not gltf-transform.** Its `--texture-size`
  path fails on Windows (`colourspace: parameter space not set`) — same trap as
  README-MAP §9b.

Clips are renamed on the way in: `Standing Idle → Idle`, `Walking → Walk`,
`Run → Run`, `Jumping → Jump`, `Jumping Up → JumpUp`, `Happy Walk Backward →
WalkBack`.

Mixamo clips downloaded without "In Place" travel across the ground. Rather than
flattening the hips track (which kills the walk bob), `Character.ts` subtracts
the linear first-to-last drift, so net displacement is zero and the oscillation
survives.

### Still missing

- Only **Girl_Smirk** is rigged. The other three characters
  (`characters/mixamo_upload/*.zip`) still need the same Mixamo pass; the script
  takes the source folder as an argument, so each one is a re-run.
- No **tag / hit reaction** clip — the moment a runner is caught currently has no
  animation. Worth grabbing `Hit Reaction` or `Stumble Backwards`.
- No **strafe** clips. Movement is camera-relative, so sidestepping plays the
  forward walk turned sideways. Fine for now, visibly wrong up close.
- No **landing** clip; `JumpUp` is held until the capsule touches down.

## The characters have no colour either

The diffuse atlas is white skin, white clothing, black hair and black linework —
there is no colour in the source to recover. (Mixamo also returns the mesh split
into two materials and only textures one of them; `repair_materials()` in the
build script points the untextured one back at the same atlas, which fixes the
missing shading but not the missing colour.)

Colour is authored in `Character.setColours()` and multiplied over the atlas, so
black stays black and the painted shading survives. The head material takes a
skin tone, the body material takes the outfit colour. Chaser is reserved red;
runners take `RUNNER_COLOURS` by index. Materials are cloned per instance, so
players can differ.

Players keep their colour during the blind scatter while the map goes grey —
that is deliberate, it is what keeps everyone readable from overhead.

## The map has no colour

`rang_chase_map.glb` has 185 materials, **all** with
`baseColorFactor = [0,0,0,1]`, and no textures — the Blender shading did not
survive the export, and the source `.blend` is not in the repo. Material names
did survive and are descriptive (`Bldg_Wall_Tan`, `Road_Asphalt`,
`Grass_Shade_3`), so `src/map/palette.ts` rebuilds the palette from the names.
Rules are ordered, first match wins. Gameplay tiles are coloured from the
`Tile_<Colour>_NNN` token instead, which is what makes the colour mechanic work.

If the map is ever re-exported with real materials, delete the `applyPalette`
call in `MapLoader.ts`.

## Collision

Every `Tile_`, `Building_`, `Ground_`, `Road_` and `Collider_` mesh is merged
into one geometry (~330 k triangles) with a `MeshBVH` on it; `Prop_` is left out
so the map does not play as an obstacle course. Movement is a capsule pushed out
of that geometry per fixed step. `grounded` comes from the push-out being mostly
upward — gravity is applied *every* frame, including while standing, because the
capsule has to keep pressing into the floor for the contact to register.

Multi-primitive glTF nodes arrive as a `Group` named after the node with children
named after the mesh data (`Car_E0_000_Mesh`), so role lookup walks up to the
nearest conforming ancestor. Without that, 365 tiles and ~1000 collision meshes
go missing.

## Debugging

```bash
node scripts/shot.mjs "http://localhost:5173/?scatter=1&settle=30" shot.png KeyW:2000
```

Headless Chrome over raw CDP (no Puppeteer): loads the page, waits for
`window.__ready`, optionally holds keys (`KeyW:2000`), then prints the HUD and
the console and writes a screenshot. It is the only way to see a runtime error
in this project without a browser open.

`char.html?char=…&clip=Run&t=0.4&bones=1` renders one character alone with a
skeleton helper — use it to tell a bad export apart from a bad rig.

URL parameters: `?char=` model path, `?role=chaser|runner`, `?scatter=`
`?settle=` `?hunt=` phase lengths in seconds. In the viewer: `?i=` runner colour
index, `?clip=` `?t=` clip and time, `?bones=1` skeleton helper.

### Manual test pass

```bash
npm run dev
```

1. `http://localhost:5173/` — walk with WASD, hold Shift to run, Space to jump,
   Q/E or right-drag to turn, wheel to zoom. Check the HUD says `ground` while
   walking and the animation matches the speed.
2. Walk into a building and a kerb: the capsule should stop, not pass through,
   and should ride up the 0.15 m kerb without a jump.
3. Watch the phase line. The first 10 s are `BLIND_SCATTER` and the map is black
   and white; it snaps to full colour at `SETTLE` and the HUD shows how many
   valid tiles were picked.
4. `?scatter=1&settle=60` to skip straight to the coloured phase, then walk onto
   an object of the called colour — the HUD `tile` line should show the tile id
   and `SAFE`, and go back to `exposed` the moment you step off.
5. `?role=chaser` for the red chaser, `char.html?i=3` for another runner colour.

## Not done yet

Build plan steps 4-9: Colyseus room, server-side match state, server tile
selection, tagging, admin config UI, disconnect grace. Roles are not implemented
either — the local player is always a runner, and the chaser's colour is picked
at random by the client as a stand-in.
