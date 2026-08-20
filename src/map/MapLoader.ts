import {
  Box3,
  BufferGeometry,
  BoxGeometry,
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
 * Solid, non-walk-through geometry. Tiles and props are included so cars,
 * building edges, and other solid map objects block movement.
 */
const COLLIDES: ReadonlySet<MapRole> = new Set<MapRole>([
  "Tile",
  "Prop",
  "Building",
  "Ground",
  "Road",
  "Collider",
]);

const WATER_MATERIAL = /water|foam/i;
const TERRACE_MATERIAL = /roof|terrace|penthouse|pergola|louvre/i;
const MAP_BOUNDS = {
  minX: -190,
  maxX: 210,
  minZ: -180,
  maxZ: 300,
};

function isPassableMesh(mesh: Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const names = materials
    .filter((m): m is MeshStandardMaterial => !!m)
    .map((m) => m.name);
  return names.length > 0 && names.every((name) => WATER_MATERIAL.test(name));
}

function isTerraceMesh(mesh: Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => material && TERRACE_MATERIAL.test(material.name));
}

function addBoundaryWalls(geometries: BufferGeometry[]) {
  const wallHeight = 30;
  const wallThickness = 2;
  const width = MAP_BOUNDS.maxX - MAP_BOUNDS.minX + wallThickness * 2;
  const depth = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ + wallThickness * 2;
  const centreX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
  const centreZ = (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) / 2;
  const walls = [
    [new BoxGeometry(wallThickness, wallHeight, depth), MAP_BOUNDS.minX - wallThickness / 2, wallHeight / 2, centreZ],
    [new BoxGeometry(wallThickness, wallHeight, depth), MAP_BOUNDS.maxX + wallThickness / 2, wallHeight / 2, centreZ],
    [new BoxGeometry(width, wallHeight, wallThickness), centreX, wallHeight / 2, MAP_BOUNDS.minZ - wallThickness / 2],
    [new BoxGeometry(width, wallHeight, wallThickness), centreX, wallHeight / 2, MAP_BOUNDS.maxZ + wallThickness / 2],
  ] as const;
  for (const [geometry, x, y, z] of walls) {
    geometry.translate(x, y, z);
    for (const attr of Object.keys(geometry.attributes)) {
      if (attr !== "position") geometry.deleteAttribute(attr);
    }
    geometries.push(geometry);
  }
}

export async function loadMap(
  url = "/models/map.glb",
  onProgress?: (f: number) => void,
): Promise<GameMap> {
  const gltf = await loadGLTF(url, onProgress);
  const scene = gltf.scene as Group;

  // This is a decorative character prop baked into the map, not the player.
  // Remove every matching instance before gameplay data and collision are built.
  const runnerProps: Object3D[] = [];
  scene.traverse((obj) => {
    if (/^Prop_Runner(?:_|$)/i.test(obj.name)) runnerProps.push(obj);
  });
  for (const prop of runnerProps) prop.parent?.remove(prop);

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
    const terrace = isTerraceMesh(mesh);
    if (
      info &&
      (COLLIDES.has(info.role) || terrace) &&
      info.kind !== "TreeShadow" &&
      !isPassableMesh(mesh)
    ) {
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

  addBoundaryWalls(collisionGeoms);

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
