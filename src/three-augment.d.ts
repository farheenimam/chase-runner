import "three";
import type { MeshBVH } from "three-mesh-bvh";

declare module "three" {
  interface BufferGeometry {
    boundsTree?: MeshBVH;
  }
}
