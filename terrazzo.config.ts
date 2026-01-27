import { defineConfig } from "@terrazzo/cli";
import figmaJson from "terrazzo-plugin-figma-json";

export default defineConfig({
  // Use resolver file for primitives (tests resolver support)
  tokens: ["./tokens/canonical/primitives.resolver.json"],
  outDir: "./dist/",
  lint: {
    // Disable linting rules that conflict with token structure
    rules: {
      "core/consistent-naming": "off",
    },
  },
  plugins: [
    figmaJson({
      filename: "figma.json",
      remBasePx: 16,
      warnOnUnsupported: true,
      splitByResolver: true,
      preserveReferences: true,
    }),
  ],
});
