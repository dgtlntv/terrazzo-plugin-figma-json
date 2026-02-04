import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult, DTCGDimensionValue } from '../types.js';

/**
 * Context for lineHeight conversion, extending the base converter context
 * with the fontSize value needed for calculating absolute lineHeight.
 */
export interface LineHeightConverterContext extends ConverterContext {
  /**
   * The resolved fontSize dimension value from the typography token.
   * Required to calculate absolute lineHeight from the multiplier.
   * Should already be converted to px units.
   */
  fontSize?: DTCGDimensionValue;
}

/**
 * Convert a W3C DTCG lineHeight value to Figma-compatible format.
 *
 * ## W3C DTCG vs Figma Incompatibility
 *
 * The W3C DTCG specification defines lineHeight as a **number** type -
 * a unitless multiplier relative to fontSize (e.g., `1.5` means 1.5× the
 * font size). This matches CSS behavior where `line-height: 1.5` is unitless.
 *
 * However, Figma Variables require lineHeight to be a **dimension** type
 * with explicit px units. There is no way to represent a unitless multiplier
 * in Figma's variable system.
 *
 * ## Conversion Strategy
 *
 * This converter calculates the absolute lineHeight by multiplying the
 * unitless multiplier with the fontSize:
 *
 *   `absoluteLineHeight = lineHeight × fontSize`
 *
 * For example: `lineHeight: 1.5` with `fontSize: 16px` → `24px`
 *
 * ## Trade-off: Loss of Token Reference
 *
 * When converting a multiplier to an absolute dimension, any reference to
 * a primitive number token is lost. This is unavoidable because:
 *
 * 1. Figma does not support unitless multipliers for lineHeight
 * 2. We must compute a concrete px value at build time
 * 3. The computed value cannot maintain an alias to the original number token
 *
 * This approach is the most token-setup-agnostic solution, as it works
 * regardless of how the source tokens are structured.
 *
 * @example
 * // Input: W3C DTCG typography with number lineHeight
 * // lineHeight: 1.5, fontSize: { value: 16, unit: "px" }
 * convertLineHeight(1.5, { ...context, fontSize: { value: 16, unit: "px" } });
 * // Output: { value: { value: 24, unit: "px" } }
 */
export function convertLineHeight(value: unknown, context: LineHeightConverterContext): ConverterResult {
  // W3C DTCG specifies lineHeight as a number (unitless multiplier)
  if (typeof value !== 'number') {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid lineHeight value: expected number (per W3C DTCG spec), got ${typeof value}`,
    });
    return { value: undefined, skip: true };
  }

  // Validate the multiplier value
  if (!Number.isFinite(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has non-finite lineHeight value: ${value}`,
    });
    return { value: undefined, skip: true };
  }

  // fontSize is required to calculate the absolute lineHeight
  if (!context.fontSize) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has lineHeight multiplier (${value}) but no fontSize is defined. Cannot calculate absolute lineHeight for Figma. Provide a fontSize in the typography token.`,
    });
    return { value: undefined, skip: true };
  }

  // Calculate absolute lineHeight: multiplier × fontSize
  const rawLineHeight = value * context.fontSize.value;

  // Round by default (roundLineHeight defaults to true)
  const shouldRound = context.options.roundLineHeight !== false;
  const absoluteLineHeight = shouldRound ? Math.round(rawLineHeight) : rawLineHeight;

  const roundingNote = shouldRound && rawLineHeight !== absoluteLineHeight ? ` (rounded from ${rawLineHeight})` : '';

  context.logger.info({
    group: 'plugin',
    label: PLUGIN_NAME,
    message: `Token "${context.tokenId}" lineHeight: ${value} × ${context.fontSize.value}px = ${absoluteLineHeight}px${roundingNote} (converted from W3C multiplier to Figma dimension)`,
  });

  return {
    value: {
      value: absoluteLineHeight,
      unit: 'px',
    },
  };
}
