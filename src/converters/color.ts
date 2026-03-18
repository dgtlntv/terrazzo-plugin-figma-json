import Color from 'colorjs.io';
import { FIGMA_COLOR_SPACES, PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult, DTCGColorValue } from '../types.js';
import { isDTCGColorValue } from '../utils.js';

/**
 * Number of decimal places to round color components to.
 * 6 decimals provides sufficient precision while avoiding floating-point issues.
 */
const COLOR_PRECISION = 6;

/**
 * Round a number to COLOR_PRECISION decimal places and clamp to [0, 1] range.
 * Prevents floating-point precision issues (e.g., 1.0000000000000007 -> 1).
 *
 * @param value - Color component value (typically 0-1 for sRGB)
 * @returns Rounded and clamped value in [0, 1] range
 */
function roundAndClamp(value: number): number {
  const rounded = Math.round(value * 10 ** COLOR_PRECISION) / 10 ** COLOR_PRECISION;
  return Math.max(0, Math.min(1, rounded));
}

/**
 * Normalize color components: round to precision and clamp to valid range.
 * Applies roundAndClamp to each component in the RGB/HSL triplet.
 *
 * @param components - Array of 3 color component values
 * @returns Normalized triplet with values rounded and clamped
 */
function normalizeComponents(components: [number, number, number]): [number, number, number] {
  return components.map(roundAndClamp) as [number, number, number];
}

/**
 * Map DTCG color space names to colorjs.io color space IDs.
 */
const DTCG_TO_COLORJS_SPACE: Record<string, string> = {
  srgb: 'srgb',
  'srgb-linear': 'srgb-linear',
  hsl: 'hsl',
  hwb: 'hwb',
  lab: 'lab',
  lch: 'lch',
  oklab: 'oklab',
  oklch: 'oklch',
  'display-p3': 'p3',
  'a98-rgb': 'a98rgb',
  'prophoto-rgb': 'prophoto',
  rec2020: 'rec2020',
  'xyz-d65': 'xyz-d65',
  'xyz-d50': 'xyz-d50',
};

/**
 * Convert a DTCG color value to Figma-compatible format.
 * Figma only supports sRGB and HSL color spaces.
 *
 * @example
 * // sRGB colors pass through unchanged
 * convertColor({
 *   colorSpace: "srgb",
 *   components: [0.5, 0.5, 0.5],
 *   alpha: 1
 * }, context);
 * // => { value: { colorSpace: "srgb", components: [0.5, 0.5, 0.5], alpha: 1 } }
 *
 * @example
 * // OKLCH colors are converted to sRGB
 * convertColor({
 *   colorSpace: "oklch",
 *   components: [0.7, 0.15, 150]
 * }, context);
 * // => { value: { colorSpace: "srgb", components: [...], alpha: 1 } }
 *
 * @param value - The DTCG color value to convert (should match DTCGColorValue structure)
 * @param context - Converter context with logger and plugin options
 * @returns Converted color value in sRGB or HSL, or skip indicator for invalid values
 */
export function convertColor(value: unknown, context: ConverterContext): ConverterResult {
  if (!isDTCGColorValue(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid color value: expected object with colorSpace and components`,
    });
    return { value: undefined, skip: true };
  }
  const color = value;

  // If already in a Figma-compatible color space, pass through with alpha normalization
  if (FIGMA_COLOR_SPACES.includes(color.colorSpace as (typeof FIGMA_COLOR_SPACES)[number])) {
    // Handle 'none' values in components
    const components = color.components.map((c) => (c === 'none' ? 0 : c)) as [number, number, number];

    // Only normalize sRGB components (which are in 0-1 range), not HSL (which uses different ranges)
    const normalizedComponents = color.colorSpace === 'srgb' ? normalizeComponents(components) : components;

    return {
      value: {
        ...color,
        components: normalizedComponents,
        alpha: color.alpha === 'none' ? 1 : (color.alpha ?? 1),
      },
    };
  }

  // Handle 'none' values - treat as 0 for conversion purposes
  const components = color.components.map((c) => (c === 'none' ? 0 : c)) as [number, number, number];

  // Get the colorjs.io color space ID
  const colorjsSpace = DTCG_TO_COLORJS_SPACE[color.colorSpace];
  if (!colorjsSpace) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has unknown color space: ${color.colorSpace}`,
    });
    return { value: undefined, skip: true };
  }

  try {
    // Create color in the source color space
    const sourceColor = new Color(colorjsSpace, components);

    // Convert to sRGB
    const srgbColor = sourceColor.to('srgb');

    // Check if gamut clipping is needed
    if (!srgbColor.inGamut()) {
      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: `Token "${context.tokenId}" color was clipped to sRGB gamut (original color space: ${color.colorSpace})`,
      });
      srgbColor.toGamut({ method: 'css' });
    }

    // Get the sRGB coordinates and normalize them
    const srgbChannels = normalizeComponents(srgbColor.coords as [number, number, number]);

    // Log info about color space conversion (expected behavior for non-sRGB colors)
    context.logger.info({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" color converted from ${color.colorSpace} to sRGB`,
    });

    const result: DTCGColorValue = {
      colorSpace: 'srgb',
      components: srgbChannels,
      alpha: color.alpha === 'none' ? 1 : (color.alpha ?? 1),
    };

    return { value: result };
  } catch (err) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" color conversion failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { value: undefined, skip: true };
  }
}
