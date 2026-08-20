import { Vector2 } from "three";

/** Keyboard state. Movement is read as a normalised 2D intent vector. */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private seq = 0;
  private downSeq = new Map<string, number>();
  readonly move = new Vector2();

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).code;
      if (!this.down.has(k)) this.pressedThisFrame.add(k);
      this.down.add(k);
      this.downSeq.set(k, ++this.seq);
      if (k === "Space") e.preventDefault();
    });
    target.addEventListener("keyup", (e) => {
      const k = (e as KeyboardEvent).code;
      this.down.delete(k);
      this.downSeq.delete(k);
    });
    window.addEventListener("blur", () => {
      this.down.clear();
      this.downSeq.clear();
    });
  }

  held(code: string) {
    return this.down.has(code);
  }

  /** True only on the frame the key went down. */
  pressed(code: string) {
    return this.pressedThisFrame.has(code);
  }

  /** Call once per frame, after everything has read the input. */
  endFrame() {
    this.pressedThisFrame.clear();
  }

  update() {
    const y = this.axisIntent(["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"]);
    const x = this.axisIntent(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]);
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    return this.move;
  }

  /**
   * Opposite keys on one axis resolve to the most recently pressed key.
   * If both sides have no ordering information, they cancel to zero.
   */
  private axisIntent(positive: string[], negative: string[]) {
    const posHeld = positive.some((k) => this.down.has(k));
    const negHeld = negative.some((k) => this.down.has(k));
    if (posHeld && !negHeld) return 1;
    if (negHeld && !posHeld) return -1;
    if (!posHeld && !negHeld) return 0;

    const posSeq = Math.max(...positive.map((k) => this.downSeq.get(k) ?? -1));
    const negSeq = Math.max(...negative.map((k) => this.downSeq.get(k) ?? -1));
    if (posSeq === negSeq) return 0;
    return posSeq > negSeq ? 1 : -1;
  }

  get sprint() {
    return this.held("ShiftLeft") || this.held("ShiftRight");
  }
  get jump() {
    return this.pressed("Space");
  }
}
