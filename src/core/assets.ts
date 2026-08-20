import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

// Both the map and the characters are Draco-compressed, so every load goes
// through the same loader with the decoder served from /public/draco.
const draco = new DRACOLoader().setDecoderPath("/draco/");
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);

export function loadGLTF(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      resolve,
      (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
      reject,
    );
  });
}
