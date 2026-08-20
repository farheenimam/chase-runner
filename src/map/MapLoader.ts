import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshBVH } from "three-mesh-bvh";
import { loadGLTF } from "../core/assets";
import { applyPalette } from "./palette";

/**
 * Every node in rang_chase_map.glb is named `Role_Kind_Index` (README-MAP §7),
 * so the whole map reads as gameplay data off the name prefix alone.
 */
export type MapRole =
  | "Tile"
  | "Prop"
  | "Building"
  | "Ground"
  | "Road"
  | "Collider"
  | "Spawn";

export interface TileRef {
  id: string;
  /** Colour token from the name. An ID, not the rendered colour — §6b. */
  colour: string;
  object: Object3D;
  centre: Vector3;
}

export interface SpawnRef {
  id: string;
  role: "runner" | "chaser";
  position: Vector3;
}

export interface GameMap {
  scene: Group;
  tiles: TileRef[];
  tilesByColour: Map<string, TileRef[]>;
  spawns: SpawnRef[];
  /** Merged static geometry for character collision. */
  collision: Mesh;
  counts: Record<string, number>;
}

const NAME = /^(Tile|Prop|Building|Ground|Road|Collider|Spawn)_(.+?)(?:_(\d+))?$/;

/** Blender adds `.001`-style suffixes when names collide on import. */
function baseName(name: string) {
  return name.replace(/\.\d+$/, "");
}

function parse(name: string) {
  const m = NAME.exec(baseName(name));
  if (!m) return null;
  return { role: m[1] as MapRole, kind: m[2], index: m[3] ?? "" };
}

/**
 * A glTF node whose mesh has several primitives arrives as a Group carrying the
 * node name, with children named after the mesh data (`Car_E0_000_Mesh`). Those
 * children are still part of the same map object, so walk up to the nearest
 * ancestor that does carry a conforming name.
 */
function resolve(obj: Object3D) {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    const info = parse(o.name);
    if (info) return info;
  }
  return null;
}

/**
 * Solid, non-walk-through geometry. Tiles are included because runners stand
 * on them; props are not, so the map does not feel like an obstacle course.
 */
const COLLIDES: ReadonlySet<MapRole> = new Set<MapRole>([
  "Tile",
  "Building",
  "Ground",
  "Road",
  "Collider",
]);

export async function loadMap(
  url = "/models/map.glb",
  onProgress?: (f: number) => void,
): Promise<GameMap> {
  const gltf = await loadGLTF(url, onProgress);
  const scene = gltf.scene as Group;

  const tiles: TileRef[] = [];
  const spawns: SpawnRef[] = [];
  const counts: Record<string, number> = {};
  const collisionGeoms: BufferGeometry[] = [];
  const unmatched: string[] = [];

  const centre = new Vector3();
  scene.updateMatrixWorld(true);

  const bounds = new Box3();

  scene.traverse((obj) => {
    // Pass 1: gameplay objects, keyed off the object's own name.
    const own = parse(obj.name);
    if (own) {
      counts[own.role] = (counts[own.role] ?? 0) + 1;
      if (own.role === "Spawn") {
        spawns.push({
          id: obj.name,
          role: own.kind.toLowerCase().startsWith("chaser") ? "chaser" : "runner",
          position: obj.getWorldPosition(new Vector3()),
        });
        return;
      }
      if (own.role === "Tile") {
        bounds.setFromObject(obj);
        tiles.push({
          id: baseName(obj.name),
          colour: own.kind,
          object: obj,
          centre: bounds.getCenter(centre.clone()),
        });
      }
    } else if (obj !== scene && obj.name && !resolve(obj)) {
      unmatched.push(obj.name);
    }

    // Pass 2: collision, which has to reach the primitive children too.
    if (!(obj as Mesh).isMesh) return;
    const mesh = obj as Mesh;
    const info = resolve(mesh);
    if (info && COLLIDES.has(info.role)) {
      // Bake the world transform in — the merged mesh sits at the origin.
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      for (const attr of Object.keys(g.attributes)) {
        if (attr !== "position") g.deleteAttribute(attr);
      }
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      collisionGeoms.push(g);
    }
  });

  if (unmatched.length) {
    console.warn(
      `[map] ${unmatched.length} nodes do not match the naming convention:`,
      unmatched.slice(0, 20).join(", "),
    );
  }

  const t0 = performance.now();
  const merged = BufferGeometryUtils.mergeGeometries(collisionGeoms, false);
  if (!merged) throw new Error("collision merge failed — mismatched attributes");
  collisionGeoms.forEach((g) => g.dispose());
  merged.boundsTree = new MeshBVH(merged);
  console.info(
    `[map] collision: ${collisionGeoms.length} meshes, ` +
      `${merged.index!.count / 3} tris, BVH in ${(performance.now() - t0).toFixed(0)} ms`,
  );
  const collision = new Mesh(merged, new MeshStandardMaterial({ wireframe: true }));
  collision.visible = false;
  collision.name = "MapCollision";

  // The .glb has no colour data at all — rebuild it from the material names.
  applyPalette(scene, (obj) => {
    const info = resolve(obj);
    return info?.role === "Tile" ? info.kind.replace(/_\d+$/, "") : null;
  });

  const tilesByColour = new Map<string, TileRef[]>();
  for (const t of tiles) {
    const list = tilesByColour.get(t.colour);
    if (list) list.push(t);
    else tilesByColour.set(t.colour, [t]);
  }

  return { scene, tiles, tilesByColour, spawns, collision, counts };
}
