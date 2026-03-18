import type { Plugin } from '@terrazzo/parser';
import buildFigmaJson from './build/index.js';
import { FORMAT_ID, PLUGIN_NAME } from './constants.js';
import { figmaUnsupportedType } from './lint/index.js';
import transformFigmaJson from './transform.js';
import type { FigmaJsonPluginOptions } from './types.js';

export type { BuildOptions } from './build/types.js';
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

 *   preserveReferences: true,
 *   tokenName: (token) => token.id.replace("color.", "brand."),
 *   transform: (token) => {
 *     if (token.id === "special.token") return { custom: true };
 *     return undefined; // Use default transformation
 *   },
 * });
 *
 * @param options - Plugin configuration options
 * @returns A Terrazzo plugin instance
 */
export default function figmaJsonPlugin(options?: FigmaJsonPluginOptions): Plugin {
  const { skipBuild } = options ?? {};
  const filename = options?.filename ?? 'tokens.figma.json';
  return {
    name: PLUGIN_NAME,
    enforce: options?.enforce,

    config(_config) {
      // Validate options at config time for early failure
      if (options?.remBasePx !== undefined && options.remBasePx <= 0) {
        throw new Error(`[${PLUGIN_NAME}] remBasePx must be a positive number, got ${options.remBasePx}`);
      }
      if (options?.filename?.includes('..')) {
        throw new Error(`[${PLUGIN_NAME}] filename must not contain '..', got "${options.filename}"`);
      }
    },

    lint() {
      return {
        'figma/unsupported-type': figmaUnsupportedType,
      };
    },

    async transform(transformOptions) {
      // Skip if another figma-json plugin has already run
      const existingTransforms = transformOptions.getTransforms({
        format: FORMAT_ID,
        id: '*',
      });
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
        // sourceName is like "primitive" or "breakpoint-small" or "default" (when default resolver)
        const outputName = sourceName === 'default' ? filename : `${sourceName}.${filename}`;
        outputFile(outputName, contents);
      }
    },

    async buildEnd({ outputFiles, context }) {
      for (const file of outputFiles) {
        if (file.plugin !== PLUGIN_NAME) {
          continue;
        }

        // Validate JSON is parseable
        try {
          const parsed = JSON.parse(file.contents as string);

          // Validate it's a non-null object
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            context.logger.warn({
              group: 'plugin',
              label: PLUGIN_NAME,
              message: `Output file "${file.filename}" produced invalid structure (expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed})`,
            });
          }
        } catch (err) {
          context.logger.error({
            group: 'plugin',
            label: PLUGIN_NAME,
            message: `Output file "${file.filename}" contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    },
  };
}
