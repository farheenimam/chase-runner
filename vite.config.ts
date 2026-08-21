import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          "three-mesh-bvh": ["three-mesh-bvh"],
        },
      },
    },
  },
});