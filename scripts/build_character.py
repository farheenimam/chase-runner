"""
Merge Mixamo FBX clips onto one shared skeleton and export a game-ready .glb.

    blender -b -P scripts/build_character.py -- <fbx_dir> <out.glb> [target_height]

Takes the FBX in <fbx_dir> named by BASE_CLIP as the skinned mesh, strips the
skin off every other FBX and keeps only its action, then writes one .glb with
every clip as an NLA track (the glTF exporter turns each track into one
animation).
"""

import sys
import os
import math
import bpy
from mathutils import Vector

# Mixamo file name -> clip name used by the game
CLIPS = {
    "Standing Idle": "Idle",
    "Walking": "Walk",
    "Run": "Run",
    "Jumping": "Jump",
    "Jumping Up": "JumpUp",
    "Happy Walk Backward": "WalkBack",
}
BASE_CLIP = "Standing Idle"  # this one is imported With Skin
TARGET_H = 1.20


def argv():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    src = a[0] if a else "characters/mixamo_out"
    out = a[1] if len(a) > 1 else "public/models/character.glb"
    h = float(a[2]) if len(a) > 2 else TARGET_H
    return os.path.abspath(src), os.path.abspath(out), h


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    return [o for o in bpy.data.objects if o not in before]


def armature_of(objs):
    for o in objs:
        if o.type == "ARMATURE":
            return o
    return None


def action_of(arm):
    ad = arm.animation_data
    return ad.action if ad else None


def retarget_action(arm, action, name):
    """Push `action` onto `arm` as its own muted NLA track called `name`."""
    action.name = name
    action.use_fake_user = True
    if not arm.animation_data:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = None
    track = ad.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, int(action.frame_range[0]), action)
    strip.name = name
    # Blender 4.4+ slotted actions: a strip has to be told which slot to play
    slots = getattr(action, "slots", None)
    if slots and hasattr(strip, "action_slot"):
        strip.action_slot = slots[0]
    track.mute = True
    return track


def fit(arm, mesh_objs, target_h):
    """Uniform-scale the rig so the character is target_h tall, feet at z=0,
    centred on x/y. Applied to the armature; the meshes are its children."""
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in mesh_objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    size = hi - lo
    if size.z <= 0:
        return
    s = target_h / size.z
    arm.scale = (arm.scale.x * s, arm.scale.y * s, arm.scale.z * s)
    bpy.context.view_layer.update()
    lo2 = lo * s
    hi2 = hi * s
    arm.location = (
        arm.location.x * s - (lo2.x + hi2.x) / 2,
        arm.location.y * s - (lo2.y + hi2.y) / 2,
        arm.location.z * s - lo2.z,
    )
    bpy.context.view_layer.update()
    print(f"[fit] raw height {size.z:.3f} -> {target_h:.3f} (scale {s:.5f})")


def repair_materials():
    """Give every material the character's diffuse atlas.

    The Mixamo upload package has a single material with `map_Kd` pointing at
    one atlas, but Mixamo returns the FBX split into two materials and only one
    of them keeps the texture — the other ('..._Body_White') comes back plain
    white, which is why the body renders colourless. The UV layout survives the
    round trip, so pointing the untextured materials at the same image restores
    the colour.
    """
    image = None
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                image = image or node.image
    if image is None:
        print("[mat] no diffuse texture found — nothing to repair")
        return

    for mat in bpy.data.materials:
        if not mat.use_nodes:
            mat.use_nodes = True
        nodes = mat.node_tree.nodes
        if any(n.type == "TEX_IMAGE" and n.image for n in nodes):
            continue
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.location = (bsdf.location.x - 400, bsdf.location.y)
        mat.node_tree.links.new(bsdf.inputs["Base Color"], tex.outputs["Color"])
        # A tinted base colour would multiply against the atlas — reset it.
        bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
        print(f"[mat] {mat.name} -> {image.name}")


def shrink_textures(size=512):
    """Mixamo bakes 2048² PNGs; the brief is flat/unlit and lightweight, so drop
    normal maps and re-encode base colour as a small JPEG.

    Done here rather than with gltf-transform: its --texture-size path goes
    through sharp/libvips, which fails on Windows ('colourspace: parameter space
    not set'). See README-MAP §9b.
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type == "NORMAL_MAP":
                mat.node_tree.nodes.remove(node)
    for img in bpy.data.images:
        if not img.has_data or img.users == 0:
            continue
        if max(img.size) > size:
            img.scale(size, size)
        img.file_format = "JPEG"
        print(f"[tex] {img.name} -> {img.size[0]}x{img.size[1]} jpeg")


def main():
    src, out, target_h = argv()
    wipe()

    base_path = os.path.join(src, BASE_CLIP + ".fbx")
    if not os.path.exists(base_path):
        raise SystemExit(f"missing base clip: {base_path}")

    print(f"[base] {BASE_CLIP}")
    objs = import_fbx(base_path)
    arm = armature_of(objs)
    if arm is None:
        raise SystemExit("base FBX has no armature")
    arm.name = "Armature"
    meshes = [o for o in objs if o.type == "MESH"]
    if not meshes:
        raise SystemExit("base FBX has no mesh — it was exported Without Skin")

    tracks = []
    act = action_of(arm)
    if act:
        tracks.append(retarget_action(arm, act, CLIPS[BASE_CLIP]))

    for fname, clip in CLIPS.items():
        if fname == BASE_CLIP:
            continue
        path = os.path.join(src, fname + ".fbx")
        if not os.path.exists(path):
            print(f"[skip] {fname} — not found")
            continue
        imported = import_fbx(path)
        other = armature_of(imported)
        a = action_of(other) if other else None
        if a is None:
            print(f"[skip] {fname} — no action")
        else:
            tracks.append(retarget_action(arm, a, clip))
            print(f"[clip] {fname} -> {clip}  frames {a.frame_range[0]:.0f}-{a.frame_range[1]:.0f}")
        # drop everything the clip file brought with it
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)

    fit(arm, meshes, target_h)
    repair_materials()
    shrink_textures()

    for o in bpy.data.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm

    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animation_mode="NLA_TRACKS",
        export_animations=True,
        export_bake_animation=True,
        export_optimize_animation_size=True,
        export_yup=True,
        export_skins=True,
        export_draco_mesh_compression_enable=True,
    )
    print(f"[out] {out}  ({os.path.getsize(out)/1e6:.2f} MB, {len(tracks)} clips)")


main()
