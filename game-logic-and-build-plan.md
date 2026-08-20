# Color Chase — Game Logic & Build Plan

Companion to `game-design.md` (mechanics) and `map-design.md` (map). This document is for starting implementation — the match flow as a state machine, data needed, and the tech plan.

## Match State Machine

```
LOBBY
  → players join room, admin sets config (chasers count, runners count,
    max per tile, blind scatter duration, hunt duration, player speed)
  → admin starts match

BLIND_SCATTER (default 10s)
  → map renders black & white
  → chaser(s) selected, frozen at spawn, visible to all
  → chaser(s) pick a color
  → runners move freely (positions synced), no valid tiles known yet
  → server runs tile-selection algorithm in background (hidden from clients)
  → on timer end → REVEAL

REVEAL
  → map switches to full natural color, all at once
  → valid tiles are just normal-looking objects (no highlight)
  → transitions immediately into SETTLE

SETTLE (short buffer, e.g. 2-3s)
  → runners rush to a valid tile and must hold it (continuous contact, not one-time touch)
  → max occupants per tile enforced server-side; overflow runners are exposed
  → on timer end → OPEN_HUNT

OPEN_HUNT (default 20s, admin-configurable)
  → valid tiles lose safe status entirely
  → chaser(s) can move; tag = collision with an unsafe runner
  → runner becomes taggable instantly if not actively holding a valid tile
    (includes runners who let go/step off during this phase)
  → ends when: all runners tagged (CHASER_WIN) OR timer expires (RUNNER_WIN)

MATCH_END
  → show result (chasers win / runners win), per-chaser tag counts
  → return to LOBBY for a new match
```

## Win Conditions
- **Chasers win**: all runners tagged before the open hunt timer ends.
- **Runners win**: timer ends with at least one runner still untagged / holding a valid tile.
- Single round per match (no lives, no best-of-rounds).

## Core Rules Reference (from game-design.md)
- Tile capacity: `valid_tile_count = ceil(active_players / max_players_per_tile)`
- Tile conflict resolution: any object whose default color matches the chaser's picked color gets reassigned to a different color (never one already reserved for terrain/buildings) before tile selection runs.
- Holding mechanic: safety requires continuous contact with a valid tile. Letting go = immediately taggable, even before the open hunt phase.
- Players cannot substitute for tiles — proximity to another runner grants no safety.
- Jump is available to both roles equally — no one-sided elevation escape.
- Disconnects: 30-60s grace period. Reconnect in time → rejoin same match, no penalty. Grace expires → auto-eliminated for that match (excluded from win-condition math while in grace window), does NOT count as a chaser tag. Player can rejoin fresh at the next match.

## Data Model (draft)

### Player
```
{
  id, name, role: "chaser" | "runner",
  position: {x, y, z}, rotation,
  isFrozen: bool,          // true only during blind scatter, chaser only
  isHoldingTile: bool,
  currentTileId: string | null,
  isTagged: bool,
  connectionStatus: "connected" | "grace_period" | "disconnected",
  graceExpiresAt: timestamp | null
}
```

### Map Object / Tile
```
{
  id, type,                // e.g. "bench", "tree_block", "fountain_block"
  position: {x, y, z},
  defaultColor: string,
  isValidTile: bool,
  occupants: [playerId],   // capped by max_players_per_tile
  maxOccupants: number
}
```

### Room Config (admin-set)
```
{
  numChasers, numRunners, maxPlayersPerTile,
  blindScatterDuration, openHuntDuration,
  chaserSpeed, runnerSpeed
}
```

## Server Authority (non-negotiable for fairness)
- All position updates, collisions, tile occupancy, and tag events are resolved server-side.
- Clients send input (movement intent) only; server validates and broadcasts authoritative state.
- Tile-selection algorithm runs server-side and stays hidden from clients until REVEAL.
- Reason: without this, a modified client could reveal valid tiles early or fake tag immunity.

## Tech Stack Plan
- **Rendering**: Three.js (loads the `.glb` map + character exports from Blender).
- **Networking**: Colyseus (room-based multiplayer, built for exactly this kind of real-time synced game — handles room state, join/leave, and tick-based sync out of the box) over WebSockets.
- **Client-side prediction/interpolation**: needed so movement feels smooth despite network latency, while server stays authoritative.
- **Backend runtime**: Node.js (Colyseus is a Node framework).

## Build Order (suggested)
1. Map asset pipeline: Blender → `.glb` export → load and render statically in Three.js (no networking yet).
2. Character asset pipeline: same, 4 characters, shared scale.
3. Single-player movement + camera (no server yet) — validate controls, jump, collision against map geometry feel right.
4. Colyseus room setup: player join/leave, position sync between 2 local clients.
5. Match state machine (server-side): implement phases above with timers.
6. Tile-selection algorithm (server-side): color conflict resolution + valid tile assignment.
7. Holding/tagging logic: collision detection, occupancy caps, tag events.
8. Admin config UI: room settings before match start.
9. Disconnect/reconnect handling: grace period logic.
10. Polish: score display, match end screen, sound/UI feedback (optional for v1).

## Open Items to Resolve Before Coding Starts
- Exact camera behavior (fixed top-down/angled, or does it follow each player individually with a shared overhead feel?).
- Minimum/maximum room size beyond the confirmed 4-player minimum.
- Whether chaser role assignment each match is fully random or has any weighting (e.g. avoid same player being chaser twice in a row in a multi-match session, if sessions become a feature later).
