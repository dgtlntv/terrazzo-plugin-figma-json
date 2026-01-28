import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult } from '../types.js';

/**
 * Valid string aliases for font weights as per W3C DTCG spec.
 */
const FONT_WEIGHT_ALIASES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  'ultra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  'semi-bold': 600,
  'demi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  black: 900,
  heavy: 900,
  'extra-black': 950,
  'ultra-black': 950,
};

/**
 * Convert a DTCG fontWeight value to Figma-compatible format.
 * Output type matches input type (string stays string, number stays number).
 *
 * @example
 * // Number values pass through with validation (1-1000)
 * convertFontWeight(400, context);
 * // => { value: 400 }
 *
 * @example
 * // String aliases pass through if valid
 * convertFontWeight("bold", context);
 * // => { value: "bold" }
 */
export function convertFontWeight(value: unknown, context: ConverterContext): ConverterResult {
  // Number passthrough - validate range, output as 'number' type
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 1000) {
      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: `Token "${context.tokenId}" has invalid fontWeight value: ${value} (must be 1-1000)`,
      });
      return { value: undefined, skip: true };
    }
    return { value, outputType: 'number' };
  }

  // String - validate against known aliases, output as 'string' type
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (!(normalized in FONT_WEIGHT_ALIASES)) {
      const validAliases = Object.keys(FONT_WEIGHT_ALIASES).slice(0, 5).join(', ');
      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: `Token "${context.tokenId}" has unknown fontWeight alias: "${value}". Valid aliases include: ${validAliases}, etc. Use a valid alias or a numeric weight (1-1000).`,
      });
      return { value: undefined, skip: true };
    }
    // Pass through the original string value - Figma accepts string font weights
    return { value, outputType: 'string' };
  }

  // Invalid type
  context.logger.warn({
    group: 'plugin',
    label: PLUGIN_NAME,
    message: `Token "${context.tokenId}" has invalid fontWeight type: ${typeof value}`,
  });
  return { value: undefined, skip: true };
}
