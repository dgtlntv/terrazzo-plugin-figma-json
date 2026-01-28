import type { Plugin } from '@terrazzo/parser';
import buildFigmaJson from './build.js';
import { FORMAT_ID, PLUGIN_NAME } from './constants.js';
import transformFigmaJson from './transform.js';
import type { FigmaJsonPluginOptions } from './types.js';

export * from './build.js';
export * from './constants.js';
export * from './transform.js';
export * from './types.js';
export * from './utils.js';

/**
 * Terrazzo plugin to convert DTCG design tokens to Figma-compatible JSON format.
 *
 * @example
 * // Basic usage
 * import { defineConfig } from "@terrazzo/cli";
 * import figmaJson from "terrazzo-plugin-figma-json";
 *
 * export default defineConfig({
 *   plugins: [
 *     figmaJson({ filename: "tokens.figma.json" }),
 *   ],
 * });
 *
 * @example
 * // With all options
 * figmaJson({
 *   filename: "design-tokens.figma.json",
 *   exclude: ["internal.*", "deprecated.*"],
 *   remBasePx: 16,
 *   warnOnUnsupported: true,
 *   preserveReferences: true,
 *   tokenName: (token) => token.id.replace("color.", "brand."),
 *   transform: (token) => {
 *     if (token.id === "special.token") return { custom: true };
 *     return undefined; // Use default transformation
 *   },
 * });
 *
 */
export default function figmaJsonPlugin(options?: FigmaJsonPluginOptions): Plugin {
  const { skipBuild } = options ?? {};
  const filename = options?.filename ?? 'tokens.figma.json';

  return {
    name: PLUGIN_NAME,

    async transform(transformOptions) {
      // Skip if another figma-json plugin has already run
      const existingTransforms = transformOptions.getTransforms({ format: FORMAT_ID, id: '*' });
      if (existingTransforms.length) {
        return;
      }

      transformFigmaJson({
        transform: transformOptions,
        options: options ?? {},
      });
    },

    async build({ getTransforms, outputFile, resolver }) {
      if (skipBuild === true) {
        return;
      }

      const result = buildFigmaJson({
        getTransforms,
        exclude: options?.exclude,
        tokenName: options?.tokenName,
        preserveReferences: options?.preserveReferences,
        resolver,
      });

      // Output multiple files based on resolver structure
      for (const [sourceName, contents] of result) {
        // sourceName is like "primitive" or "breakpoint-small" or "default" (when no resolver)
        const outputName = sourceName === 'default' ? filename : `${sourceName}.${filename}`;
        outputFile(outputName, contents);
      }
    },
  };
}
