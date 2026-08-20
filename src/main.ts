import { Game } from "./core/Game";

const app = document.getElementById("app")!;
const hud = document.getElementById("hud")!;
const loading = document.getElementById("loading")!;

const game = new Game(app, hud);

game
  .load((label, f) => {
    loading.textContent = `loading ${label} ${Math.round(f * 100)}%`;
  })
  .then(() => {
    loading.classList.add("done");
    game.start();
    (window as any).__ready = true;
    // Handle for the headless smoke test (scripts/shot.mjs) and the console.
    (window as any).__game = game;
  })
  .catch((err) => {
    console.error(err);
    loading.textContent = `failed: ${err?.message ?? err}`;
    (window as any).__error = String(err?.stack ?? err);
  });
