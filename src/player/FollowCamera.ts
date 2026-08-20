import { Mesh, Object3D, PerspectiveCamera, Raycaster, Vector3 } from "three";

/** Pitch stays inside this band so the view never leaves the overhead brief. */
const PITCH_MIN = 0.25;
const PITCH_MAX = 1.35;
/** Closest the occlusion test may put the camera to the player, in metres. */
const MIN_PULL_IN = 2.0;

/**
 * Angled-overhead follow camera (README-MAP §1) with mouse control:
 *
 * - **drag** with either button to orbit (yaw + pitch)
 * - **click** to capture the pointer and look around freely; Esc releases
 * - **wheel** to zoom
 * - **Q/E** still turn without touching the mouse
 *
 * Pitch is clamped, so however the player pulls it around the map is still read
 * from above rather than over the shoulder.
 */
export class FollowCamera {
  readonly camera: PerspectiveCamera;
  yaw = 0;
  distance = 7.5;
  /** Radians below horizontal. Larger = more top-down. */
  pitch = 0.72;
  /** Mouse look sensitivity, radians per pixel. */
  sensitivity = 0.005;
  invertY = false;
  private readonly target = new Vector3();
  private readonly desired = new Vector3();
  private readonly ray = new Raycaster();
  /** Eye level is ~0.75 m on a 1.20 m character — frame that, not the hair. */
  private readonly eyeHeight = 0.75;
  private dragging = false;
  private locked = false;
  /** A drag must not also count as the click that grabs the pointer. */
  private movedWhileDown = 0;

  constructor(private dom: HTMLElement) {
    this.camera = new PerspectiveCamera(48, 1, 0.1, 600);
    this.camera.position.set(0, 6, 8);

    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    dom.addEventListener("pointerdown", (e) => {
      if (this.locked) return;
      this.dragging = true;
      this.movedWhileDown = 0;
      dom.setPointerCapture(e.pointerId);
    });
    const stop = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      // A click that barely moved is a request to capture the pointer.
      if (this.movedWhileDown < 4 && e.button === 0) this.requestLock();
    };
    dom.addEventListener("pointerup", stop);
    dom.addEventListener("pointercancel", stop);

    dom.addEventListener("pointermove", (e) => {
      if (!this.dragging && !this.locked) return;
      this.movedWhileDown += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.look(e.movementX, e.movementY);
    });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === dom;
    });

    dom.addEventListener(
      "wheel",
      (e) => {
        this.distance = clamp(this.distance + e.deltaY * 0.01, 3, 22);
      },
      { passive: true },
    );
  }

  private look(dx: number, dy: number) {
    this.yaw -= dx * this.sensitivity;
    const sign = this.invertY ? -1 : 1;
    this.pitch = clamp(this.pitch + sign * dy * this.sensitivity * 0.6, PITCH_MIN, PITCH_MAX);
  }

  private requestLock() {
    // Chrome rejects the request if it is not inside a user gesture, and throws
    // if the element is already locked — neither is worth failing a frame over.
    const r = this.dom.requestPointerLock?.() as unknown;
    if (r instanceof Promise) r.catch(() => {});
  }

  /** True while the pointer is captured, for the HUD hint. */
  get pointerLocked() {
    return this.locked;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, follow: Object3D, collider?: Mesh, keyboardYaw = 0) {
    this.yaw += keyboardYaw * dt * 2;

    this.target.copy(follow.position);
    this.target.y += this.eyeHeight;

    const horiz = Math.cos(this.pitch) * this.distance;
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horiz,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horiz,
    );

    // Pull in if a building is in the way, so the player never gets occluded.
    if (collider) {
      const dir = this.desired.clone().sub(this.target);
      const len = dir.length();
      this.ray.set(this.target, dir.divideScalar(len));
      this.ray.far = len;
      const hit = this.ray.intersectObject(collider, false)[0];
      // Never pull in closer than MIN_PULL_IN: a canopy directly overhead would
      // otherwise put the camera inside the player's own head, which reads as a
      // broken frame. Clipping through a thin object is the better failure.
      if (hit && hit.distance > MIN_PULL_IN) {
        this.desired
          .copy(hit.point)
          .addScaledVector(this.ray.ray.direction, -0.35);
      }
    }

    const k = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(this.desired, k);
    this.camera.lookAt(this.target);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
