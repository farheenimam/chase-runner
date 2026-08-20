/**
 * Headless smoke test: load the game in Chrome, wait for window.__ready, drive
 * the keyboard for a moment, screenshot.
 *
 *   node scripts/shot.mjs [url] [out.png] [keys...]
 *
 * Uses raw CDP over Node's built-in WebSocket — no Puppeteer dependency.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.argv[2] ?? "http://localhost:5173/";
const OUT = process.argv[3] ?? "shot.png";
const KEYS = process.argv.slice(4); // e.g. KeyW:2000 = hold W for 2 s
const PORT = 9223;
const CHROME =
  process.env.CHROME ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "rangchase-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1280,720",
    "--no-first-run",
    URL_,
  ],
  { stdio: "ignore" },
);

let ws;
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.result?.value;
}

async function key(type, code, windowsVirtualKeyCode) {
  await send("Input.dispatchKeyEvent", {
    type,
    code,
    key: code.replace("Key", "").toLowerCase(),
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) =>
        r.json(),
      );
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error("chrome never came up");
}

const wsUrl = await connect();
ws = new WebSocket(wsUrl);
const logs = [];
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled") {
    logs.push(
      `[${m.params.type}] ` +
        m.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
    );
  } else if (m.method === "Runtime.exceptionThrown") {
    logs.push(`[exception] ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`);
  }
};
await send("Runtime.enable");
await send("Page.enable");

// The page may already have loaded before we attached; reload to catch its logs.
await send("Page.reload");

let ready = false;
for (let i = 0; i < 300; i++) {
  const err = await evaluate("window.__error");
  if (err) {
    console.error("PAGE ERROR:", err);
    break;
  }
  if (await evaluate("window.__ready")) {
    ready = true;
    break;
  }
  await sleep(500);
}
console.log(ready ? "ready" : "NOT READY (timed out)");

const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, ShiftLeft: 16, Space: 32 };
for (const spec of KEYS) {
  // `drag:dx,dy` synthesises a mouse drag on the canvas. CDP's mouse events do
  // not carry movementX/movementY, which is what the camera reads, so the
  // events are built in the page instead.
  if (spec.startsWith("drag:")) {
    const [dx, dy] = spec.slice(5).split(",").map(Number);
    console.log(
      "drag ->",
      await evaluate(`(() => {
        const el = document.querySelector('canvas');
        const opts = { bubbles: true, pointerId: 1, button: 0, buttons: 1 };
        el.setPointerCapture = () => {};
        el.hasPointerCapture = () => false;
        el.releasePointerCapture = () => {};
        const before = window.__game.cam.yaw;
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        for (let i = 0; i < 10; i++) {
          el.dispatchEvent(new PointerEvent('pointermove',
            { ...opts, movementX: ${dx} / 10, movementY: ${dy} / 10 }));
        }
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        return \`yaw \${before.toFixed(3)} -> \${window.__game.cam.yaw.toFixed(3)}, \` +
               \`pitch \${window.__game.cam.pitch.toFixed(3)}\`;
      })()`),
    );
    continue;
  }
  const [code, ms] = spec.split(":");
  await key("keyDown", code, VK[code] ?? 0);
  await sleep(Number(ms ?? 500));
  await key("keyUp", code, VK[code] ?? 0);
  await sleep(200);
}
if (ready) await sleep(1000);

const hud = await evaluate("document.getElementById('hud').textContent");
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(OUT, Buffer.from(shot.data, "base64"));

console.log("--- HUD ---\n" + hud);
console.log("--- CONSOLE ---\n" + logs.slice(-25).join("\n"));
console.log("wrote " + OUT);

ws.close();
chrome.kill();
process.exit(0);
