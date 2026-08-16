import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/serve.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@aws-demo-001\/.*/],
});
