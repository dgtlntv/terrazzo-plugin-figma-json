import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult } from '../types.js';

/**
 * Convert a DTCG fontFamily value to Figma-compatible format.
 * Figma requires a single string, not an array.
 *
 * @example
 * // String values pass through unchanged
 * convertFontFamily("Inter", context);
 * // => { value: "Inter" }
 *
 * @example
 * // Arrays are truncated to the first element
 * convertFontFamily(["Inter", "Helvetica", "sans-serif"], context);
 * // => { value: "Inter" } (with warning about dropped fallbacks)
 *
 * @param value - The DTCG fontFamily value (string or string array)
 * @param context - Converter context with logger and plugin options
 * @returns Single font family string, or skip indicator for invalid values
 */
export function convertFontFamily(value: unknown, context: ConverterContext): ConverterResult {
  // String passthrough
  if (typeof value === 'string') {
    return { value };
  }

  // Array - take first element
  if (Array.isArray(value)) {
    if (value.length === 0) {
      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: `Token "${context.tokenId}" has empty fontFamily array`,
      });
      return { value: undefined, skip: true };
    }

    const firstFont = value[0];

    if (value.length > 1) {
      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: `Token "${context.tokenId}" fontFamily array truncated to first element "${firstFont}" (dropped: ${value.slice(1).join(', ')})`,
      });
    }

    return { value: firstFont };
  }

  // Invalid value
  context.logger.warn({
    group: 'plugin',
    label: PLUGIN_NAME,
    message: `Token "${context.tokenId}" has invalid fontFamily value: ${typeof value}`,
  });
  return { value: undefined, skip: true };
}
