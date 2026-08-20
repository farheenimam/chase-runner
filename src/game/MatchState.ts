import type { TileColour } from "./TileManager";

export type Phase =
  | "LOBBY"
  | "BLIND_SCATTER"
  | "REVEAL"
  | "SETTLE"
  | "OPEN_HUNT"
  | "MATCH_END";

export interface RoomConfig {
  numChasers: number;
  numRunners: number;
  maxPlayersPerTile: number;
  blindScatterDuration: number;
  settleDuration: number;
  openHuntDuration: number;
  chaserSpeed: number;
  runnerSpeed: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  numChasers: 1,
  numRunners: 3,
  maxPlayersPerTile: 2,
  blindScatterDuration: 10,
  settleDuration: 3,
  openHuntDuration: 20,
  chaserSpeed: 4.2,
  runnerSpeed: 4.2,
};

export type MatchResult = "CHASER_WIN" | "RUNNER_WIN" | null;

export interface MatchEvents {
  onPhase?(phase: Phase, previous: Phase): void;
  /** Fired when the phase timer starts, so the HUD can show a countdown. */
  onTimer?(remaining: number, phase: Phase): void;
  onEnd?(result: MatchResult): void;
}

/**
 * The match flow from game-logic-and-build-plan.md, as a plain timer-driven
 * state machine with no rendering or networking in it. The server runs this
 * one; the client runs a copy so the HUD can count down between snapshots.
 */
export class MatchState {
  phase: Phase = "LOBBY";
  result: MatchResult = null;
  chaserColour: TileColour | null = null;
  /** Seconds left in the current phase; Infinity in LOBBY and MATCH_END. */
  remaining = Infinity;

  constructor(
    public config: RoomConfig = { ...DEFAULT_CONFIG },
    private events: MatchEvents = {},
  ) {}

  start() {
    this.result = null;
    this.chaserColour = null;
    this.enter("BLIND_SCATTER", this.config.blindScatterDuration);
  }

  /** The chaser calls a colour during the blind scatter. */
  pickColour(colour: TileColour) {
    if (this.phase !== "BLIND_SCATTER") return false;
    this.chaserColour = colour;
    return true;
  }

  update(dt: number) {
    if (this.remaining === Infinity) return;
    this.remaining -= dt;
    this.events.onTimer?.(Math.max(0, this.remaining), this.phase);
    if (this.remaining > 0) return;

    switch (this.phase) {
      case "BLIND_SCATTER":
        // REVEAL is instantaneous — it exists so the colour switch and the
        // start of SETTLE are one observable event.
        this.enter("REVEAL", 0);
        this.enter("SETTLE", this.config.settleDuration);
        break;
      case "SETTLE":
        this.enter("OPEN_HUNT", this.config.openHuntDuration);
        break;
      case "OPEN_HUNT":
        this.end("RUNNER_WIN"); // timer expired with runners left
        break;
      default:
        break;
    }
  }

  /** Called when the last untagged runner is tagged. */
  allRunnersTagged() {
    if (this.phase === "OPEN_HUNT") this.end("CHASER_WIN");
  }

  /** Valid tiles are only safe up to the end of SETTLE. */
  get tilesAreSafe() {
    return this.phase === "REVEAL" || this.phase === "SETTLE";
  }

  get chaserCanMove() {
    return this.phase === "OPEN_HUNT";
  }

  get mapIsGreyscale() {
    return this.phase === "BLIND_SCATTER";
  }

  private end(result: MatchResult) {
    this.result = result;
    this.enter("MATCH_END", Infinity);
    this.events.onEnd?.(result);
  }

  private enter(phase: Phase, duration: number) {
    const previous = this.phase;
    this.phase = phase;
    this.remaining = duration === Infinity ? Infinity : duration;
    this.events.onPhase?.(phase, previous);
  }
}
