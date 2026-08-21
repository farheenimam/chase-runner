"""
Rang Chase - map rename / reorganise / export pass.
Run inside Blender (Scripting tab) or via blender-mcp execute_blender_code.

Order: rename -> collections -> spawns -> apply transforms -> export .glb (Draco).
Set DRY_RUN = True first to print the rename plan without touching anything.
"""
import bpy, re, math, os
from mathutils import Vector

DRY_RUN      = False
# Split merged prop meshes and scatter new ground furniture before renaming.
# Only meaningful on a scene that has not had it done already - run it once,
# from the pre-rename .blend.
BUILD_TILES  = False
EXPORT_PATH  = r"D:\chaser-runner\rang_chase_map.glb"
PLAYER_COLOURS = ["Red","Blue","Green","Yellow","Orange","Purple","Cyan","Magenta"]

# ---------------------------------------------------------------- classify
# first match wins; tested against the CURRENT object name
RULES = [
    # ---- ground / walkable base -------------------------------------------
    (r"^Terrain$",                                   "Ground_Park"),
    (r"^GrassSurface$",                              "Ground_ParkLawn"),
    (r"^Ground_Base$",                               "Ground_Base"),
    (r"^Playground_SafetyFloor$",                    "Ground_PlaygroundSand"),
    (r"^Playground_ParentPlaza$",                    "Ground_PicnicPad"),
    (r"^Fountain_Plaza",                             "Ground_FountainPlaza"),
    (r"^Amph_Plaza",                                 "Ground_AmphitheatrePlaza"),
    (r"^RB_(Island|FootwayRing|FootwayKerb)",        "Ground_Roundabout"),
    (r"^XR_",                                        "Ground_CrossroadPlaza"),
    (r"^Footpath_",                                  "Ground_Footpath"),
    (r"^(Walkway_|Promenade|PathCurb_)",             "Ground_ParkPath"),
    (r"^Bldg_(East|West)_\d_Court$",                 "Ground_Courtyard"),

    # ---- roads -------------------------------------------------------------
    (r"^Road_Carriageways$",                         "Road_Main"),
    (r"^Road_(Sidewalks|Curbs|LaneMarkings)$",       "Road_Straight"),
    (r"^RB_",                                        "Road_Roundabout"),
    (r"^CS_",                                        "Road_CentralStreet"),
    (r"^Grid_",                                      "Road_SouthGrid"),
    (r"^EastBlock_Roads$",                           "Road_EastService"),
    (r"^JoggingTrack",                               "Road_JoggingTrack"),

    # ---- buildings ---------------------------------------------------------
    (r"^Bldg_East_\d_",                              "Building_A"),
    (r"^Bldg_West_\d_",                              "Building_B"),
    (r"^Bldg_(East|West)_",                          "Building_Strip"),
    (r"^BldgA_",                                     "Building_CourtyardRing"),
    (r"^BldgB_",                                     "Building_LBlock"),
    (r"^BldgE_",                                     "Building_East"),
    (r"^PlayTower_",                                 "Building_PlayTower"),
    (r"^(Gazebo_|GazeboPicnic_)",                    "Building_Gazebo"),
    (r"^Amph_(Tier|Stage|SideWall|BackWall|BackRest|AisleStairs|SideStairs)",
                                                     "Building_Amphitheatre"),

    # ---- colliders ---------------------------------------------------------
    (r"^Fence_",                                     "Collider_Fence"),
    (r"^Entrance_(Pillar|Banner|Finial)",            "Collider_Gate"),
    (r"^ClimbingWall",                               "Collider_Wall"),
    (r"^(SwingSet_Post|MonkeyBars_Post|SeeSaw_Fulcrum)", "Collider_Frame"),
    (r"^Bldg_(East|West)_Railings$",                 "Collider_Railing"),
    (r"^Amph_(Bollards|BollardCaps)$",               "Collider_Bollard"),

    # ---- props (decorative, instancing candidates) -------------------------
    (r"^(Tree_|TreeE_|StreetTree_|Prop_Tree)",       "Prop_Tree"),
    (r"^Amph_Palm",                                  "Prop_Palm"),
    (r"^(ColumnLantern|Entrance_Lantern|Amph_LightPole|Amph_MastShaft|Amph_Floodlight|Amph_PlazaPole)",
                                                     "Prop_Streetlight"),
    (r"^(Bench_|Gazebo_Seating|PicnicTable_)",       "Prop_Bench"),
    (r"^(WasteBin|Playground_WasteBin|Gazebo_WasteBin)", "Prop_Bin"),
    (r"^(Sail_|ShadeSail_)",                         "Prop_ShadeSail"),
    (r"^Car_",                                       "Prop_Car"),
    (r"^Bus_",                                       "Prop_Bus"),
    # Runner_* objects are static map decorations, not the movable player.
    (r"^(Bush|LandscapeBed|PathBush|FountainBorderBush|Hedge)", "Prop_Shrub"),
    (r"^(Amph_Planter|Amph_TopPlanter|Bldg_.*Planter)", "Prop_Planter"),

    # ---- gap-fill pass (added after the first dry run: 170 unmatched) --------
    # ground / roads
    (r"^Alley_(Surface|Joints|Drain)$",               "Ground_Alley"),
    (r"^Road_GateForecourt",                          "Ground_GateForecourt"),
    (r"^Road_GateZebra$",                             "Road_Straight"),
    (r"^EastBlock_(ParkingApron|ParkingLines|Footways)$", "Road_EastService"),
    (r"^Playground_SandEdge$",                        "Ground_PlaygroundSand"),
    # buildings / solid masses
    (r"^Fountain_",                                   "Building_Fountain"),
    (r"^Amph_(Plaza|PlazaJoints)$",                   "Ground_AmphitheatrePlaza"),
    (r"^Amph_(TopPlanter|TopSoil|TopHedge)$",         "Prop_Planter"),
    (r"^Amph_(StageApron|StageRim|TierSteps|TierNosing)$", "Building_Amphitheatre"),
    # colliders
    (r"^BollardB_",                                   "Collider_Bollard"),
    (r"^Entrance_(Arch|Sign_Path)$",                  "Collider_Gate"),
    (r"^(MonkeyBars_|SwingSet_|SeeSaw_|Slide_|ClimbingArch|ClimbingHold_)",
                                                      "Collider_PlayEquipment"),
    # props
    (r"^Entrance_(Sign_Text|Emblem_)",                "Prop_Sign"),
    (r"^CanopyShadow_",                               "Prop_TreeShadow"),
    (r"^(LampPost_|LampHead_)",                       "Prop_Streetlight"),
    (r"^Amph_(LightPole|MastShafts|MastBases|MastArms|Floodlights|PlazaPoles|PlazaPoleHeads)$",
                                                      "Prop_Streetlight"),
    (r"^Amph_Bench",                                  "Prop_Bench"),
    (r"^Amph_TerracePalm",                            "Prop_Palm"),
    (r"^Alley_(Dumpsters|DumpsterLids|Crates|Pipes)$", "Prop_AlleyClutter"),
    (r"^Alley_(LampArms|LampHeads)$",                 "Prop_Streetlight"),
    (r"^BusStop_",                                    "Prop_BusShelter"),
    (r"^PlanterB_",                                   "Prop_Planter"),
]

# Non-rendering helper geometry: bevel profile curves that only shape other
# objects. They must never reach the .glb.
EXCLUDE = (
    r"^(ArchProfile|BannerBackingProfile)$",
    r"^Runner_",  # static runner figure near the park fountain path
    r"^Chaser_",
)

def is_excluded(name):
    return any(re.match(p, name) for p in EXCLUDE)

# A name this pass already produced, e.g. "Prop_Car_017" -> base "Prop_Car".
# Without this the pass is not re-entrant: a second run would fail to match its
# own output, skip those objects, and let the numbering drift.
_CONFORMING = re.compile(r"^(Ground|Road|Building|Collider|Prop)_(.+?)_\d+$")

def classify(name):
    if is_excluded(name):
        return None
    m = _CONFORMING.match(name)
    if m:
        return "%s_%s" % (m.group(1), m.group(2))
    # objects the scatter pass created, and tiles that no longer qualify
    if name.startswith("ScatterProp_"):
        return "Prop_Scatter"
    if name.startswith("Tile_"):
        return "Prop_Misc"
    for pat, new in RULES:
        if re.match(pat, name):
            return new
    return None

# ---------------------------------------------------------------- tiles
# Objects eligible to become gameplay tiles: small, separate, ground-level.
# TUNE THIS - it decides what the engine can recolour.
# Surfaces a runner can actually stand on. A prop resting on one of these is
# reachable; a prop resting on another prop (a lamp head on its pole) is not.
_WALKABLE_SUPPORT = ("Ground_", "Road_", "Building_Amphitheatre")

def _supported(cx, cy, z0, limit=0.6):
    """True if the object is seated on a walkable surface within `limit` below.

    The original test used absolute world Z, which disqualified every prop on
    the amphitheatre terraces (they climb to z 7.26) even though a runner on a
    tread stands right beside them. What matters is height above the LOCAL
    walking surface. The support must itself be walkable and near-flat, or a
    lamp head 4 m up counts as "supported" by its own pole.
    """
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, nrm, idx, ob, mw = sc.ray_cast(dg, (cx, cy, z0 - 0.02), (0, 0, -1),
                                             distance=limit)
    if not hit or ob is None or nrm.z < 0.9:
        return False
    base = classify(ob.name)
    return bool(base) and base.startswith(_WALKABLE_SUPPORT)

def is_tile_candidate(o):
    if o.type != 'MESH' or not o.data.vertices:
        return False
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    dx = max(b.x for b in bb) - min(b.x for b in bb)
    dy = max(b.y for b in bb) - min(b.y for b in bb)
    z0 = min(b.z for b in bb); z1 = max(b.z for b in bb)
    h = z1 - z0
    if h >= 2.0:
        return False
    compact = dx < 3.0 and dy < 3.0
    # a bench or low wall: long in one axis, narrow in the other. The height
    # floor keeps painted lane markings and paving joints out.
    elongated = min(dx, dy) < 1.5 and max(dx, dy) < 7.0 and h > 0.15
    if not (compact or elongated):
        return False
    if z0 < 1.2:                       # already at world ground level
        return True
    cx = (max(b.x for b in bb) + min(b.x for b in bb)) / 2
    cy = (max(b.y for b in bb) + min(b.y for b in bb)) / 2
    return _supported(cx, cy, z0)      # or standing on a raised terrace

def rename_pass():
    """Build [(old, new)]. Tiles are numbered per colour with no gaps; everything
    else is numbered per classified base name."""
    plan, counters = [], {}
    objs = [o for o in sorted(bpy.context.scene.objects, key=lambda x: x.name)
            if o.type != 'LIGHT' and not is_excluded(o.name)]
    tileset = set(o.name for o in objs if is_tile_candidate(o))

    # round-robin colour over the TILE ordinal (not the plan index), so the
    # eight colours stay balanced and interleave spatially within each cluster
    tile_i = 0
    for o in objs:
        if o.name in tileset:
            colour = PLAYER_COLOURS[tile_i % len(PLAYER_COLOURS)]
            tile_i += 1
            base = "Tile_" + colour
            counters[base] = counters.get(base, 0) + 1
            new = "%s_%03d" % (base, counters[base])
        else:
            base = classify(o.name)
            if base is None:
                continue
            counters[base] = counters.get(base, 0) + 1
            new = "%s_%02d" % (base, counters[base])
        plan.append((o.name, new))
    return plan, counters

# ---------------------------------------------------------------- split merged props
# Some zones were modelled with every bollard/bench/planter merged into ONE
# object for efficiency. The engine can only recolour a whole object, so a
# merged arc of 28 bollards is a single tile. These get separated by loose part.
# The paving-joint grids are deliberately NOT in this list: Amph_PlazaJoints has
# 2242 loose parts, but they are flat decals nobody stands on, and splitting
# them would add 2242 useless nodes.
SPLIT_JOBS = [
    # (source object names to join first, cluster radius, new base name)
    (["Amph_BollardCaps", "Amph_Bollards"],      0.6, "Prop_BollardAmph"),
    (["BollardB_Lamps",   "BollardB_Posts"],     0.6, "Prop_BollardEast"),
    (["PlanterB_Boxes",   "PlanterB_Green"],     2.0, "Prop_PlanterEast"),
    (["Amph_BenchSeats"],                        0.1, "Prop_BenchAmph"),
    (["Alley_Crates"],                           0.1, "Prop_AlleyBox"),
    (["Alley_Dumpsters"],                        0.1, "Prop_AlleyBin"),
    (["Amph_MastBases"],                         0.1, "Prop_MastBase"),
]

def _obj_mode():
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

def _xy_centre(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(((max(b.x for b in bb) + min(b.x for b in bb)) / 2,
                   (max(b.y for b in bb) + min(b.y for b in bb)) / 2, 0.0))

def split_merged():
    sc, vl = bpy.context.scene, bpy.context.view_layer
    coll = bpy.data.collections.get("Props") or bpy.data.collections.new("Props")
    if coll.name not in [c.name for c in sc.collection.children]:
        sc.collection.children.link(coll)
    made = 0
    for names, radius, base in SPLIT_JOBS:
        objs = [sc.objects[n] for n in names if n in sc.objects]
        if not objs:
            print("   split: %s - no source, skipped" % base)
            continue
        _obj_mode(); bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        vl.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        tgt = vl.objects.active
        if tgt.data.users > 1:
            tgt.data = tgt.data.copy()
        before = set(sc.objects)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='LOOSE')
        bpy.ops.object.mode_set(mode='OBJECT')
        parts = [o for o in sc.objects if o not in before] + [tgt]
        # a bollard is a post plus a cap: two loose parts at the same XY.
        # Re-join parts whose centres are within `radius` so one object = one prop.
        rest, groups = list(parts), []
        while rest:
            seed = rest.pop(); c = _xy_centre(seed); grp = [seed]
            for o in list(rest):
                if (_xy_centre(o) - c).length <= radius:
                    grp.append(o); rest.remove(o)
            groups.append(grp)
        out = []
        for grp in groups:
            _obj_mode(); bpy.ops.object.select_all(action='DESELECT')
            for o in grp:
                o.select_set(True)
            vl.objects.active = grp[0]
            if len(grp) > 1:
                bpy.ops.object.join()
            out.append(vl.objects.active)
        for i, o in enumerate(sorted(out, key=lambda x: (round(_xy_centre(x).x, 1),
                                                         round(_xy_centre(x).y, 1))), 1):
            o.name = "%s_%03d" % (base, i)
            for c in list(o.users_collection):
                c.objects.unlink(o)
            coll.objects.link(o)
        print("   split: %-20s %3d parts -> %3d props" % (base, len(parts), len(out)))
        made += len(out)
    _obj_mode()
    return made

# ---------------------------------------------------------------- scatter props
# Zones built with large elements only have no eligible tiles at all. Scatter
# small ground furniture across them, reusing existing meshes so instancing
# survives the export.
SCATTER_PLAN = [("Commercial",   -48,  48, -282,  -90, 210),
                ("Amphitheatre",  73, 175,  -70,    6,  70),
                ("EastPrecinct",  73, 180, -285, -100, 225)]
SCATTER_MIX  = [("Bollard", 0.40), ("Planter", 0.25), ("Crate", 0.20), ("Bin", 0.15)]
DONOR_SRC    = {"Bollard": "Prop_BollardAmph_001", "Crate": "Prop_AlleyBox_001",
                "Bin":     "Prop_AlleyBin_001",    "Planter": "Prop_PlanterEast_001"}
# plazas, courtyards, alleys and footpaths. Carriageways are excluded.
SCATTER_ON = ("Ground_AmphitheatrePlaza", "Ground_Courtyard", "Ground_Alley",
              "Ground_Footpath", "Ground_GateForecourt", "Ground_PicnicPad")

def _donor_meshes():
    """Centre each donor mesh on its own origin so instances place correctly.
    The split objects carry world-space vertex coords, so a raw reuse would
    double-offset every copy."""
    out = {}
    for key, src in DONOR_SRC.items():
        o = bpy.context.scene.objects.get(src)
        if not o:
            continue
        me = o.data.copy(); me.name = "TileProp_%s_Mesh" % key
        me.transform(o.matrix_world)
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
        zs = [v.co.z for v in me.vertices]
        off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
        for v in me.vertices:
            v.co -= off
        out[key] = me
    return out

def scatter_props(seed=20260809):
    import random
    random.seed(seed)
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    meshes = _donor_meshes()
    if not meshes:
        print("   scatter: no donor meshes, skipped"); return 0
    coll = bpy.data.collections["Props"]

    def probe(x, y):
        hit, loc, nrm, idx, ob, mw = sc.ray_cast(dg, (x, y, 60.0), (0, 0, -1))
        if not hit or ob is None or nrm.z < 0.9:
            return None
        base = classify(ob.name) or ""
        if base.startswith(SCATTER_ON):              return (loc.z, "paved")
        if base.startswith("Road_") and loc.z >= 0.10: return (loc.z, "footway")
        if base.startswith("Ground_Base"):           return (loc.z, "verge")
        return None                                  # carriageway, building, prop

    def pick():
        r = random.random(); a = 0.0
        for k, w in SCATTER_MIX:
            a += w
            if r <= a: return k
        return SCATTER_MIX[-1][0]

    total = 0
    for zone, x0, x1, y0, y1, target in SCATTER_PLAN:
        step, cands = 1.2, []
        x = x0
        while x <= x1:
            y = y0
            while y <= y1:
                p = probe(x, y)
                if p: cands.append((x, y, p[0], p[1]))
                y += step
            x += step
        # bare ground counts only next to something built, so props do not
        # appear stranded out on the open base plane
        built = [(c[0], c[1]) for c in cands if c[3] != "verge"]
        usable = [c for c in cands if c[3] != "verge" or
                  any((bx - c[0]) ** 2 + (by - c[1]) ** 2 <= 144.0 for bx, by in built)]
        area = len(usable) * step * step
        minsep = max(2.2, math.sqrt(area / max(target, 1)) * 0.78)
        random.shuffle(usable)
        placed = []
        for (x, y, z, kind) in usable:
            if len(placed) >= target:
                break
            jx = x + random.uniform(-0.4, 0.4); jy = y + random.uniform(-0.4, 0.4)
            if any((px - jx) ** 2 + (py - jy) ** 2 < minsep * minsep for px, py, _ in placed):
                continue
            p = probe(jx, jy)
            if not p:
                continue
            placed.append((jx, jy, p[0]))
        for i, (x, y, z) in enumerate(placed, 1):
            k = pick()
            ob = bpy.data.objects.new("ScatterProp_%s_%s_%03d" % (zone, k, i), meshes[k])
            ob.location = (x, y, z)
            ob.rotation_euler = (0, 0, random.uniform(0, math.tau))
            coll.objects.link(ob)
        print("   scatter: %-14s allowed %6.0f m2  sep %.1f m  placed %3d/%d"
              % (zone, area, minsep, len(placed), target))
        total += len(placed)
    bpy.context.view_layer.update()
    return total

# ---------------------------------------------------------------- collections
NEW_COLLECTIONS = ["Ground", "Roads", "Tiles", "Buildings", "Colliders", "Props", "Spawns"]

def collection_for(name):
    for pre, coll in (("Ground_", "Ground"), ("Road_", "Roads"), ("Tile_", "Tiles"),
                      ("Building_", "Buildings"), ("Collider_", "Colliders"),
                      ("Prop_", "Props"), ("Spawn_", "Spawns")):
        if name.startswith(pre):
            return coll
    return None

def reorganise():
    sc = bpy.context.scene
    for cn in NEW_COLLECTIONS:
        if cn not in bpy.data.collections:
            c = bpy.data.collections.new(cn)
            sc.collection.children.link(c)
    for o in list(sc.objects):
        target = collection_for(o.name)
        if not target:
            continue
        tc = bpy.data.collections[target]
        if o.name in tc.objects:
            continue
        for c in list(o.users_collection):
            c.objects.unlink(o)
        tc.objects.link(o)

# ---------------------------------------------------------------- spawns
SPAWN_RUNNERS = [(18, 0), (0, 25), (-18, 0), (-20, 25), (125, -55), (0, -150),
                 (30, -40), (-30, -40)]
SPAWN_CHASER  = [(0, -16)]

def make_spawns():
    sc = bpy.context.scene
    coll = bpy.data.collections["Spawns"]
    for o in [x for x in coll.objects if x.name.startswith("Spawn_")]:
        bpy.data.objects.remove(o, do_unlink=True)
    for i, (x, y) in enumerate(SPAWN_RUNNERS, 1):
        e = bpy.data.objects.new("Spawn_Runner_%02d" % i, None)
        e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 1.0
        e.location = (x, y, 0.05); coll.objects.link(e)
    for i, (x, y) in enumerate(SPAWN_CHASER, 1):
        e = bpy.data.objects.new("Spawn_Chaser_%02d" % i, None)
        e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 1.4
        e.location = (x, y, 0.05); coll.objects.link(e)

# ---------------------------------------------------------------- transforms
def apply_transforms():
    bpy.ops.object.select_all(action='DESELECT')
    n = 0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.library or o.data.users > 1:
            continue        # never apply on shared datablocks - it multiplies the transform
        o.select_set(True); n += 1
    if n:
        bpy.context.view_layer.objects.active = next(
            o for o in bpy.context.scene.objects if o.select_get())
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    return n

# ---------------------------------------------------------------- export
def export_glb():
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    draco = 'export_draco_mesh_compression_enable' in props
    kw = dict(filepath=EXPORT_PATH, export_format='GLB',
              use_selection=False, export_apply=True,
              # skips the bevel-profile helper curves, which are hide_render
              use_renderable=True,
              export_yup=True, export_cameras=False, export_lights=False)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True,
                  export_draco_mesh_compression_level=6,
                  export_draco_position_quantization=14,
                  export_draco_normal_quantization=10)
    bpy.ops.export_scene.gltf(**kw)
    return draco, os.path.getsize(EXPORT_PATH) / 1e6


if __name__ == "__main__":
    if not DRY_RUN and BUILD_TILES:
        # must run BEFORE the rename so the new objects get numbered with
        # everything else, and while the source names are still the originals
        print("splitting merged props...")
        print("   %d props recovered" % split_merged())
        print("scattering new props...")
        print("   %d props placed" % scatter_props())

    plan, counters = rename_pass()
    print("rename plan: %d objects" % len(plan))
    for k in sorted(counters):
        print("   %-28s %d" % (k, counters[k]))
    unmatched = [o.name for o in bpy.context.scene.objects
                 if classify(o.name) is None and not is_tile_candidate(o)]
    print("UNMATCHED (%d):" % len(unmatched), unmatched[:25])
    if not DRY_RUN:
        # two-pass: a new name may equal an old name that has not been renamed
        # yet, and Blender would silently append .001. Park everything on a
        # unique temp name first.
        tmp = []
        for i, (old, new) in enumerate(plan):
            ob = bpy.data.objects[old]
            ob.name = "__tmp%05d__" % i
            tmp.append((ob, new))
        for ob, new in tmp:
            ob.name = new
        reorganise()
        make_spawns()
        print("transforms applied on", apply_transforms(), "objects")
        d, mb = export_glb()
        print("exported %.1f MB, draco=%s -> %s" % (mb, d, EXPORT_PATH))
