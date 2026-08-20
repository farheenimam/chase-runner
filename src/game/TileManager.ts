import { Box3, Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import type { GameMap, TileRef } from "../map/MapLoader";

/** The eight colours a chaser can call. Matches the `Tile_<Colour>_NNN` tokens. */
export const TILE_COLOURS = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Cyan",
  "Blue",
  "Purple",
  "Magenta",
] as const;
export type TileColour = (typeof TILE_COLOURS)[number];

export interface TileState extends TileRef {
  isValid: boolean;
  occupants: Set<string>;
  maxOccupants: number;
  /** World-space box, grown a little so "on it" is forgiving at the edges. */
  bounds: Box3;
}

/**
 * Owns tile colour, the black-and-white blind-scatter look, and which tiles are
 * safe. The selection here mirrors what the server will run — during the blind
 * scatter the result must never reach the client, so this stays behind the same
 * interface the network layer will implement.
 */
export class TileManager {
  readonly tiles: TileState[];
  private valid = new Set<TileState>();
  private greyscale = false;
  /** Original colour per material, so the greyscale pass is reversible. */
  private originalColours = new Map<MeshStandardMaterial, Color>();
  private mapMaterials: MeshStandardMaterial[] = [];

  constructor(private map: GameMap) {
    const box = new Box3();
    this.tiles = map.tiles.map((t) => ({
      ...t,
      isValid: false,
      occupants: new Set<string>(),
      maxOccupants: 1,
      bounds: box.setFromObject(t.object).clone().expandByScalar(0.15),
    }));
    this.collectMaterials();
  }

  private collectMaterials() {
    const seen = new Set<MeshStandardMaterial>();
    this.map.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as MeshStandardMaterial[]) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        this.originalColours.set(m, m.color.clone());
        this.mapMaterials.push(m);
      }
    });
  }

  /** Blind scatter renders the whole map black and white (build plan §BLIND_SCATTER). */
  setGreyscale(on: boolean) {
    if (on === this.greyscale) return;
    this.greyscale = on;
    for (const m of this.mapMaterials) {
      const original = this.originalColours.get(m)!;
      if (on) {
        // Rec. 709 luma, so the value structure of the map survives.
        const l = 0.2126 * original.r + 0.7152 * original.g + 0.0722 * original.b;
        m.color.setRGB(l, l, l);
      } else {
        m.color.copy(original);
      }
    }
  }

  /**
   * `valid_tile_count = ceil(active_players / max_players_per_tile)` — the tiles
   * are drawn from the chaser's colour only, and stay ordinary-looking: nothing
   * about a valid tile is highlighted (build plan §REVEAL).
   */
  selectValidTiles(
    colour: TileColour,
    activePlayers: number,
    maxPerTile: number,
    rng: () => number = Math.random,
  ): TileState[] {
    this.clearValid();
    const pool = this.tiles.filter((t) => t.colour === colour);
    const want = Math.min(pool.length, Math.ceil(activePlayers / maxPerTile));

    // Partial Fisher-Yates: only `want` draws, and the pool is left untouched.
    const idx = [...pool.keys()];
    const picked: TileState[] = [];
    for (let i = 0; i < want; i++) {
      const j = i + Math.floor(rng() * (idx.length - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
      const tile = pool[idx[i]];
      tile.isValid = true;
      tile.maxOccupants = maxPerTile;
      this.valid.add(tile);
      picked.push(tile);
    }
    return picked;
  }

  clearValid() {
    for (const t of this.valid) {
      t.isValid = false;
      t.occupants.clear();
    }
    this.valid.clear();
  }

  get validTiles(): ReadonlySet<TileState> {
    return this.valid;
  }

  /**
   * The tile a player is standing on, or null. Safety needs *continuous*
   * contact, so this is asked every tick rather than latched on touch.
   */
  tileAt(position: Vector3, feetTolerance = 0.35): TileState | null {
    for (const t of this.valid) {
      if (
        position.x >= t.bounds.min.x &&
        position.x <= t.bounds.max.x &&
        position.z >= t.bounds.min.z &&
        position.z <= t.bounds.max.z &&
        position.y >= t.bounds.min.y - feetTolerance &&
        position.y <= t.bounds.max.y + feetTolerance
      ) {
        return t;
      }
    }
    return null;
  }

  /**
   * Claim a place on `tile`. Overflow past `maxOccupants` is refused, which is
   * what leaves late runners exposed.
   */
  claim(tile: TileState, playerId: string): boolean {
    if (tile.occupants.has(playerId)) return true;
    if (tile.occupants.size >= tile.maxOccupants) return false;
    tile.occupants.add(playerId);
    return true;
  }

  release(playerId: string) {
    for (const t of this.valid) t.occupants.delete(playerId);
  }

  /** Debug only — the real game must never mark valid tiles for the client. */
  debugHighlight(on: boolean) {
    for (const t of this.tiles) {
      const mesh = t.object as Mesh & { material?: MeshStandardMaterial };
      const m = mesh.material;
      if (!m || !("emissive" in m)) continue;
      m.emissive.setHex(on && t.isValid ? 0x333300 : 0x000000);
    }
  }

  /** Colours actually present on the map, in a stable order. */
  availableColours(): TileColour[] {
    return TILE_COLOURS.filter((c) => (this.map.tilesByColour.get(c)?.length ?? 0) > 0);
  }

  static isTile(o: Object3D) {
    return o.name.startsWith("Tile_");
  }
}
