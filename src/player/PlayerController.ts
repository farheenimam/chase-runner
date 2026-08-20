import {
  Box3,
  Line3,
  Matrix4,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import type { Character } from "../characters/Character";
import type { Input } from "../core/Input";

/** Tuning, in metres/second. The character is 1.20 m tall (README-MAP §9b). */
export const MOVE = {
  walkSpeed: 4.0,
  runSpeed: 8.5,
  backSpeed: 1.6,
  accel: 38,
  decel: 56,
  reverseAccel: 70,
  gravity: -14,
  jumpSpeed: 5.8,
  doubleJumpSpeed: 9.8,
  turnRate: 12,
  /** Capsule fitted to the character; radius keeps it clear of kerbs. */
  radius: 0.22,
  height: 1.2,
  /** Slopes flatter than this are ground, anything steeper is a wall. */
  maxGroundNormalY: 0.55,
  /** Kerbs are 0.15 m; step over anything up to this without jumping. */
  stepHeight: 0.22,
} as const;

const _box = new Box3();
const _seg = new Line3();
const _tri = new Vector3();
const _cap = new Vector3();
const _delta = new Vector3();
const _mat = new Matrix4();
const _v = new Vector3();
const _corr = new Vector3();
const _stepPos = new Vector3();
const _stepCorr = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Local, client-side movement: capsule-vs-BVH collision plus a camera-relative
 * input basis. Server authority (build plan §Server Authority) replaces the
 * position it produces later — this is the prediction half of that split.
 */
export class PlayerController {
  readonly object = new Object3D();
  readonly velocity = new Vector3();
  grounded = false;

  /** Capsule in local space: a vertical segment plus MOVE.radius. */
  private capsule = new Line3(
    new Vector3(0, MOVE.radius, 0),
    new Vector3(0, MOVE.height - MOVE.radius, 0),
  );
  private facing = 0;
  private wasGrounded = true;
  private jumpsUsed = 0;
  private jumpAnimationActive = false;

  constructor(
    private character: Character,
    private collider: Mesh,
  ) {
    this.object.add(character.root);
  }

  spawn(position: Vector3, facing = 0) {
    this.object.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.jumpsUsed = 0;
    this.jumpAnimationActive = false;
    this.object.rotation.y = facing;
  }

  update(dt: number, input: Input, cameraYaw: number) {
    const move = input.update();
    const wantsMove = move.lengthSq() > 1e-4;

    // FollowCamera orbits at target + offset and looks back at target, so the
    // camera facing is the negative of that horizontal orbit offset.
    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);
    const dirX = move.x * rightX + move.y * forwardX;
    const dirZ = move.x * rightZ + move.y * forwardZ;

    const backing = wantsMove && move.y < -0.3;
    const target = backing
      ? MOVE.backSpeed
      : input.sprint
        ? MOVE.runSpeed
        : MOVE.walkSpeed;

    const desiredX = wantsMove ? dirX * target : 0;
    const desiredZ = wantsMove ? dirZ * target : 0;
    const rateX =
      desiredX === 0
        ? MOVE.decel
        : Math.sign(desiredX) !== Math.sign(this.velocity.x)
          ? MOVE.reverseAccel
          : MOVE.accel;
    const rateZ =
      desiredZ === 0
        ? MOVE.decel
        : Math.sign(desiredZ) !== Math.sign(this.velocity.z)
          ? MOVE.reverseAccel
          : MOVE.accel;
    this.velocity.x += (desiredX - this.velocity.x) * (1 - Math.exp(-rateX * dt));
    this.velocity.z += (desiredZ - this.velocity.z) * (1 - Math.exp(-rateZ * dt));

    if (this.grounded) this.jumpsUsed = 0;

    if (input.jump && (this.grounded || this.jumpsUsed < 2)) {
      const firstJump = this.jumpsUsed === 0;
      this.velocity.y = firstJump ? MOVE.jumpSpeed : MOVE.doubleJumpSpeed;
      this.jumpsUsed += 1;
      this.grounded = false;
      this.jumpAnimationActive = true;
      this.character.play("Jump", 0.05);
    }
    // Gravity every frame, even when grounded: the capsule has to keep pressing
    // into the floor for the push-out to report contact. Zeroing it while
    // standing makes `grounded` flicker on and off.
    this.velocity.y += MOVE.gravity * dt;

    this.object.position.addScaledVector(this.velocity, dt);
    this.resolveCollisions(dt);
    if (this.grounded) this.jumpAnimationActive = false;

    // Face the direction of travel; backing up keeps the body forward.
    if (wantsMove) {
      const heading = backing
        ? Math.atan2(-dirX, -dirZ)
        : Math.atan2(dirX, dirZ);
      this.facing = dampAngle(this.facing, heading, MOVE.turnRate, dt);
      this.object.quaternion.setFromAxisAngle(_up, this.facing);
    }

    this.updateAnimation(wantsMove, backing, input.sprint);
    this.wasGrounded = this.grounded;
  }

  private updateAnimation(moving: boolean, backing: boolean, sprint: boolean) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.jumpAnimationActive) {
      if (this.character.state !== "Jump") this.character.play("JumpUp", 0.1);
      return;
    }

    if (!moving) {
      this.character.play("Idle");
      this.character.setLocomotionSpeed(1);
      return;
    }
    if (backing) {
      this.character.play("WalkBack");
      this.character.setLocomotionSpeed(speed / MOVE.backSpeed);
      return;
    }
    if (sprint) {
      this.character.play("Run");
      this.character.setLocomotionSpeed(Math.max(speed / MOVE.runSpeed, 0.1));
    } else {
      this.character.play("Walk");
      this.character.setLocomotionSpeed(Math.max(speed / MOVE.walkSpeed, 0.1));
    }
  }

  /**
   * Push the capsule out of the merged map geometry. One pass is enough at
   * these speeds; the accumulated correction tells us whether we landed.
   */
  private resolveCollisions(dt: number) {
    const geom = this.collider.geometry;
    if (!geom.boundsTree) return;

    this.solveCapsulePenetration(this.object.position, _corr);

    // Step-up: when horizontal motion is blocked, try lifting by a small fixed
    // amount and solving again. This handles stair risers and kerbs without a
    // dedicated stair collider path.
    const horizontalPush = Math.hypot(_corr.x, _corr.z);
    const movingForward = Math.hypot(this.velocity.x, this.velocity.z) > 0.2;
    const fallingOrGrounded = this.velocity.y <= 0.25;
    if (this.wasGrounded && movingForward && fallingOrGrounded && horizontalPush > 0.03) {
      _stepPos.copy(this.object.position).addScaledVector(_up, MOVE.stepHeight);
      this.solveCapsulePenetration(_stepPos, _stepCorr);
      _stepPos.add(_stepCorr);

      const stepPush = Math.hypot(_stepCorr.x, _stepCorr.z);
      const steppedUp = _stepPos.y - this.object.position.y;
      const acceptableStep = steppedUp > 0 && steppedUp <= MOVE.stepHeight + 0.06;
      if (acceptableStep && stepPush + 0.01 < horizontalPush) {
        _corr.copy(_stepPos).sub(this.object.position);
      }
    }

    this.object.position.add(_corr);

    // Standing on something: the push-out undid most of this frame's fall, and
    // it pushed up rather than sideways.
    const lift = _corr.y;
    const len = _corr.length();
    this.grounded =
      lift > Math.abs(dt * this.velocity.y * 0.25) &&
      lift / Math.max(len, 1e-6) > MOVE.maxGroundNormalY;

    if (this.grounded) this.velocity.y = 0;
    else if (lift < -1e-5) this.velocity.y = Math.min(this.velocity.y, 0); // bonked a ceiling

    // Fell through the world (there is no floor outside the map edge).
    if (this.object.position.y < -25) {
      this.object.position.y = 25;
      this.velocity.set(0, 0, 0);
    }
  }

  private solveCapsulePenetration(position: Vector3, out: Vector3) {
    // Work in the collider's local space (it is at the origin, but stay honest).
    _mat.copy(this.collider.matrixWorld).invert();
    _seg.copy(this.capsule);
    _seg.start.add(position).applyMatrix4(_mat);
    _seg.end.add(position).applyMatrix4(_mat);

    _box.makeEmpty();
    _box.expandByPoint(_seg.start);
    _box.expandByPoint(_seg.end);
    _box.expandByScalar(MOVE.radius);

    const before = _v.copy(_seg.start);

    this.collider.geometry.boundsTree!.shapecast({
      intersectsBounds: (box) => box.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const dist = tri.closestPointToSegment(_seg, _tri, _cap);
        if (dist < MOVE.radius) {
          const depth = MOVE.radius - dist;
          _delta.copy(_cap).sub(_tri).normalize();
          _seg.start.addScaledVector(_delta, depth);
          _seg.end.addScaledVector(_delta, depth);
        }
        return false;
      },
    });

    out.copy(_seg.start).sub(before);
  }
}

function dampAngle(current: number, target: number, rate: number, dt: number) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-rate * dt));
}
