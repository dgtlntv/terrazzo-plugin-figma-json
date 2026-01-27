import type { ConverterContext, ConverterResult, DTCGDimensionValue } from '../lib.js';
import { PLUGIN_NAME } from '../lib.js';

/**
 * Convert a DTCG dimension value to Figma-compatible format.
 * Figma only supports px units.
 *
 * @example
 * // px values pass through unchanged
 * convertDimension({ value: 16, unit: "px" }, context);
 * // => { value: { value: 16, unit: "px" } }
 *
 * @example
 * // rem values are converted to px (default base: 16px)
 * convertDimension({ value: 1.5, unit: "rem" }, context);
 * // => { value: { value: 24, unit: "px" } }
 */
export function convertDimension(value: unknown, context: ConverterContext): ConverterResult {
  const dimension = value as DTCGDimensionValue;

  // Validate numeric value
  if (!Number.isFinite(dimension.value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid dimension value: ${dimension.value}`,
    });
    return { value: undefined, skip: true };
  }

  // px passthrough
  if (dimension.unit === 'px') {
    return { value: dimension };
  }

  // rem to px conversion
  if (dimension.unit === 'rem') {
    const remBasePx = context.options.remBasePx ?? 16;
    const pxValue = dimension.value * remBasePx;

    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" converted from ${dimension.value}rem to ${pxValue}px (base: ${remBasePx}px)`,
    });

    return {
      value: {
        value: pxValue,
        unit: 'px',
      },
    };
  }

  // Unknown unit - warn and skip
  context.logger.warn({
    group: 'plugin',
    label: PLUGIN_NAME,
    message: `Token "${context.tokenId}" has unsupported dimension unit: "${dimension.unit}". Figma only supports px units. Convert the value to px or use the 'transform' option to handle this token.`,
  });
  return { value: undefined, skip: true };
}
