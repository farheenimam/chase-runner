import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Color,
  Group,
  LoopOnce,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadGLTF } from "../core/assets";

export type CharacterState = "Idle" | "Walk" | "Run" | "Jump" | "WalkBack";

export interface CharacterColours {
  /** Multiplied over the head material. Black hair stays black. */
  skin: number;
  /** Multiplied over the body material — this is the outfit colour. */
  outfit: number;
}

/**
 * The supplied meshes are colourless: the diffuse atlas is white skin and white
 * clothing with black hair and linework, so there is nothing to recover from the
 * texture (see README-APP). Colour is authored here instead, multiplied over the
 * atlas so the black stays black and the shading survives.
 *
 * Roles have to be readable at a glance from an overhead camera, so the chaser
 * gets one reserved outfit and runners get the rest.
 */
export const CHASER_COLOURS: CharacterColours = { skin: 0xf0c9a6, outfit: 0xd6392f };

export const RUNNER_COLOURS: CharacterColours[] = [
  { skin: 0xf0c9a6, outfit: 0x3566c4 },
  { skin: 0xe0a878, outfit: 0x4aa657 },
  { skin: 0xc98c5f, outfit: 0xefc233 },
  { skin: 0xf0c9a6, outfit: 0x7a4bbd },
  { skin: 0xe0a878, outfit: 0x3fb8bf },
  { skin: 0xc98c5f, outfit: 0xe8802a },
  { skin: 0xf0c9a6, outfit: 0xc63f95 },
  { skin: 0xe0a878, outfit: 0xf2f2f2 },
];

/** Clips baked by scripts/build_character.py; `JumpUp` is the airborne pose. */
const CLIP_NAMES = ["Idle", "Walk", "Run", "Jump", "JumpUp", "WalkBack"] as const;

/** Gameplay visibility scale multiplier for all character instances. */
export const CHARACTER_SCALE = 1.2;

/**
 * Mixamo clips downloaded without "In Place" travel across the ground on the
 * hips track, which fights the controller for ownership of position.
 *
 * Rather than flattening the track (that would kill the walk bob), subtract the
 * linear drift from first to last keyframe: net displacement goes to zero,
 * oscillation survives. Which component carries the travel depends on the bone
 * orientation the FBX importer chose, so every component is treated the same.
 */
function stripRootMotion(clip: AnimationClip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position")) continue;
    if (!/Hips$/i.test(track.name.slice(0, -".position".length))) continue;
    const v = track.values;
    const t = track.times;
    const n = t.length;
    if (n < 2) continue;
    const span = t[n - 1] - t[0];
    if (span <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const drift = v[(n - 1) * 3 + c] - v[c];
      if (Math.abs(drift) < 0.02) continue; // bob, not travel
      for (let i = 0; i < n; i++) {
        v[i * 3 + c] -= (drift * (t[i] - t[0])) / span;
      }
    }
  }
}

export interface CharacterAsset {
  scene: Group;
  clips: AnimationClip[];
}

const cache = new Map<string, Promise<CharacterAsset>>();

export function loadCharacterAsset(url: string): Promise<CharacterAsset> {
  let p = cache.get(url);
  if (!p) {
    p = loadGLTF(url).then((gltf) => {
      for (const missing of CLIP_NAMES.filter(
        (n) => !gltf.animations.some((c) => c.name === n),
      )) {
        console.warn(`[character] ${url} has no "${missing}" clip`);
      }
      for (const clip of gltf.animations) stripRootMotion(clip);
      gltf.scene.traverse((o) => {
        o.frustumCulled = false; // skinned bounds are wrong while animating
        if ((o as SkinnedMesh).isSkinnedMesh) {
          (o as SkinnedMesh).castShadow = true;
        }
      });
      return { scene: gltf.scene as Group, clips: gltf.animations };
    });
    cache.set(url, p);
  }
  return p;
}

/**
 * One animated character instance. Several instances share the source asset —
 * SkeletonUtils.clone() gives each its own skeleton without a second download.
 */
export class Character {
  readonly root: Object3D;
  private mixer: AnimationMixer;
  private actions = new Map<string, AnimationAction>();
  private current?: AnimationAction;
  private currentName = "";

  constructor(asset: CharacterAsset) {
    this.root = cloneSkinned(asset.scene);
    this.root.scale.setScalar(CHARACTER_SCALE);
    this.mixer = new AnimationMixer(this.root);
    for (const clip of asset.clips) {
      const action = this.mixer.clipAction(clip);
      if (clip.name === "Jump" || clip.name === "JumpUp") {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    this.play("Idle", 0);
  }

  /**
   * Recolour this instance. Materials come off the shared asset, so they are
   * cloned first — otherwise every player on the map changes colour together.
   */
  setColours({ skin, outfit }: CharacterColours) {
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const mat = (m as MeshStandardMaterial).clone();
        const isHead = /head|face|hair/i.test(mat.name);
        mat.color = new Color(isHead ? skin : outfit);
        mat.roughness = 0.9;
        mat.metalness = 0;
        return mat;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
  }

  play(name: string, fade = 0.18) {
    if (this.currentName === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
    this.currentName = name;
  }

  /** Speed the Walk/Run cycles with actual ground speed so feet do not slide. */
  setLocomotionSpeed(scale: number) {
    for (const n of ["Walk", "Run", "WalkBack"]) {
      this.actions.get(n)?.setEffectiveTimeScale(scale);
    }
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  get state() {
    return this.currentName;
  }
}
