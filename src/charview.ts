import {
  AmbientLight,
  Box3,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  CHASER_COLOURS,
  Character,
  RUNNER_COLOURS,
  loadCharacterAsset,
} from "./characters/Character";

/**
 * Isolated character rig viewer — `char.html?char=…&clip=Run&t=0.4&bones=1`.
 * Used to tell a bad export apart from a bad rig without the map in the way.
 */
const q = new URLSearchParams(location.search);
const url = q.get("char") ?? "/models/character_a.glb";
const clip = q.get("clip") ?? "Idle";
const t = Number(q.get("t") ?? "0");
const showBones = q.get("bones") === "1";

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 2));
const key = new DirectionalLight(0xffffff, 2);
key.position.set(2, 4, 3);
scene.add(key);
scene.add(new GridHelper(4, 8, 0x666666, 0x3a3f45));

const camera = new PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 50);

const asset = await loadCharacterAsset(url);
const character = new Character(asset);
character.setColours(
  q.get("role") === "chaser" ? CHASER_COLOURS : RUNNER_COLOURS[Number(q.get("i") ?? 0)],
);
scene.add(character.root);
if (showBones) scene.add(new SkeletonHelper(character.root));

character.play(clip, 0);
character.update(t);
character.root.updateMatrixWorld(true);

const box = new Box3().setFromObject(character.root);
const size = box.getSize(new Vector3());
const centre = box.getCenter(new Vector3());
const dist = Math.max(size.x, size.y, size.z) * 2.2;
camera.position.set(centre.x, centre.y, centre.z + dist);
camera.lookAt(centre);

renderer.render(scene, camera);
document.getElementById("hud")!.textContent =
  `${url}\nclip ${clip} @ ${t}s\n` +
  `clips: ${asset.clips.map((c) => c.name).join(", ")}\n` +
  `bbox size ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}\n` +
  `centre ${centre.x.toFixed(2)} ${centre.y.toFixed(2)} ${centre.z.toFixed(2)}`;

(window as any).__ready = true;
