import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { acceleratedRaycast } from "three-mesh-bvh";
import { loadMap, type GameMap } from "../map/MapLoader";
import {
  CHASER_COLOURS,
  Character,
  RUNNER_COLOURS,
  loadCharacterAsset,
} from "../characters/Character";
import { PlayerController } from "../player/PlayerController";
import { FollowCamera } from "../player/FollowCamera";
import { Input } from "./Input";
import { TileManager, type TileState } from "../game/TileManager";
import {
  DEFAULT_CONFIG,
  MatchState,
  type Phase,
  type RoomConfig,
} from "../game/MatchState";

/** Placeholder identity until the Colyseus room hands out real session ids. */
const LOCAL_PLAYER = "local";

// Route every raycast through the BVH — the map collider is a single merged
// mesh with ~1.2 M triangles and the naive path is unusable on it.
Mesh.prototype.raycast = acceleratedRaycast;

export class Game {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private clock = new Clock();
  private input = new Input();
  private cam: FollowCamera;
  private player?: PlayerController;
  private map?: GameMap;
  private hud: HTMLElement;
  private accumulator = 0;
  private readonly fixedStep = 1 / 60;

  constructor(
    private container: HTMLElement,
    hud: HTMLElement,
  ) {
    this.hud = hud;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.cam = new FollowCamera(this.renderer.domElement);
    this.scene.background = new Color(0x9fc6e8);
    this.scene.fog = new Fog(0x9fc6e8, 120, 340);
    this.addLights();

    addEventListener("resize", () => this.resize());
    this.resize();
  }

  private addLights() {
    this.scene.add(new HemisphereLight(0xdfefff, 0x50593f, 2.1));
    const sun = new DirectionalLight(0xfff3e0, 1.5);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // Shadows only need to cover what the camera can see around the player.
    const s = 30;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 250;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  private sun!: DirectionalLight;

  async load(onProgress?: (label: string, f: number) => void) {
    onProgress?.("map", 0);
    this.map = await loadMap("/models/map.glb", (f) => onProgress?.("map", f));
    this.scene.add(this.map.scene, this.map.collision);
    this.map.scene.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    onProgress?.("character", 0);
    // ?char=… swaps the model without a rebuild, for comparing export settings.
    const charUrl =
      new URLSearchParams(location.search).get("char") ?? "/models/character_a.glb";
    const asset = await loadCharacterAsset(charUrl);
    const character = new Character(asset);
    // ?role=chaser previews the chaser look; roles are server-assigned later.
    this.role =
      new URLSearchParams(location.search).get("role") === "chaser"
        ? "chaser"
        : "runner";
    character.setColours(
      this.role === "chaser" ? CHASER_COLOURS : RUNNER_COLOURS[0],
    );
    this.player = new PlayerController(character, this.map.collision);
    this.character = character;
    this.scene.add(this.player.object);

    const spawn =
      this.map.spawns.find((s) => s.role === "runner") ?? this.map.spawns[0];
    // Spawn a little high and let gravity settle the capsule onto the ground —
    // the spawn empties are placeholders (README-MAP §9 item 6).
    this.player.spawn(
      spawn ? spawn.position.clone().setY(spawn.position.y + 0.5) : new Vector3(0, 2, 20),
    );
    this.tiles = new TileManager(this.map);
    // Phase lengths are admin config; until the lobby UI exists they can be
    // overridden per-load (?scatter=2&settle=1&hunt=10) for testing.
    const q = new URLSearchParams(location.search);
    const secs = (key: string, fallback: number) =>
      q.has(key) ? Number(q.get(key)) : fallback;
    const config: RoomConfig = {
      ...DEFAULT_CONFIG,
      blindScatterDuration: secs("scatter", DEFAULT_CONFIG.blindScatterDuration),
      settleDuration: secs("settle", DEFAULT_CONFIG.settleDuration),
      openHuntDuration: secs("hunt", DEFAULT_CONFIG.openHuntDuration),
    };
    this.match = new MatchState(config, {
      onPhase: (phase) => this.onPhase(phase),
      onEnd: (result) => console.info("[match] result", result),
    });
    this.match.start();
    onProgress?.("ready", 1);
  }

  private character?: Character;
  private tiles?: TileManager;
  private match?: MatchState;
  private holding: TileState | null = null;
  private role: "runner" | "chaser" = "runner";
  private safe = false;

  /**
   * Phase transitions the client is allowed to act on. Tile selection is server
   * work — running it here is a stand-in until the Colyseus room exists, and it
   * deliberately happens at REVEAL, not before.
   */
  private onPhase(phase: Phase) {
    if (!this.tiles || !this.match) return;
    this.tiles.setGreyscale(this.match.mapIsGreyscale);

    if (phase === "BLIND_SCATTER") {
      const colours = this.tiles.availableColours();
      this.match.pickColour(colours[Math.floor(Math.random() * colours.length)]);
    }
    if (phase === "REVEAL" && this.match.chaserColour) {
      const cfg = this.match.config;
      this.tiles.selectValidTiles(
        this.match.chaserColour,
        cfg.numRunners + cfg.numChasers,
        cfg.maxPlayersPerTile,
      );
    }
    if (phase === "MATCH_END") this.tiles.clearValid();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);

    // Fixed-step simulation: the server will run the same step, so prediction
    // and authority stay comparable.
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 5) {
      const yaw = (this.input.held("KeyE") ? -1 : 0) + (this.input.held("KeyQ") ? 1 : 0);
      this.cam.yaw += yaw * this.fixedStep * 1.8;
      this.player?.update(this.fixedStep, this.input, this.cam.yaw);
      this.accumulator -= this.fixedStep;
      steps++;
    }
    this.input.endFrame();

    this.match?.update(dt);
    this.updateSafety();
    this.character?.update(dt);

    if (this.player) {
      this.cam.update(dt, this.player.object, this.map?.collision);
      // Keep the shadow frustum with the player.
      this.sun.target.position.copy(this.player.object.position);
      this.sun.position.copy(this.player.object.position).add(new Vector3(60, 90, 40));
    }

    this.renderer.render(this.scene, this.cam.camera);
    this.drawHud(dt);
  }

  /**
   * Safety is continuous contact, re-tested every frame: stepping off a valid
   * tile drops it immediately, even before the open hunt (build plan §Core Rules).
   */
  private updateSafety() {
    if (!this.tiles || !this.match || !this.player) return;
    const tile = this.tiles.tileAt(this.player.object.position);

    if (this.holding && this.holding !== tile) {
      this.tiles.release(LOCAL_PLAYER);
      this.holding = null;
    }
    if (tile && tile !== this.holding) {
      this.holding = this.tiles.claim(tile, LOCAL_PLAYER) ? tile : null;
    }
    this.safe = this.match.tilesAreSafe && this.holding !== null;
  }

  private hudTimer = 0;
  private drawHud(dt: number) {
    this.hudTimer += dt;
    if (this.hudTimer < 0.15 || !this.player) return;
    this.hudTimer = 0;
    const p = this.player.object.position;
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const m = this.match;
    const clock = m && m.remaining !== Infinity ? `${m.remaining.toFixed(1)}s` : "--";
    this.hud.textContent =
      `${(1 / Math.max(dt, 1e-6)).toFixed(0)} fps\n` +
      `role  ${this.role}\n` +
      `phase ${m?.phase ?? "-"}  ${clock}  colour ${m?.chaserColour ?? "-"}\n` +
      `tile  ${this.holding?.id ?? "none"}  ${this.safe ? "SAFE" : "exposed"}` +
      `  (${this.tiles?.validTiles.size ?? 0} valid)\n` +
      `pos  ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
      `spd  ${speed.toFixed(2)} m/s   ${this.player.grounded ? "ground" : "air"}\n` +
      `anim ${this.character?.state ?? "-"}\n` +
      `WASD move · Shift run · Space jump · wheel zoom\n` +
      (this.cam.pointerLocked
        ? `mouse look active · Esc to release`
        : `drag to orbit · click to capture mouse · Q/E turn`);
  }

  private resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w, h);
  }
}
