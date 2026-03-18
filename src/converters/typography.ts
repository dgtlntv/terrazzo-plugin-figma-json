import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult, SubToken } from '../types.js';
import { isDTCGTypographyValue } from '../utils.js';
import { convertDimension } from './dimension.js';
import { convertFontFamily } from './font-family.js';
import { convertFontWeight } from './font-weight.js';
import { convertLineHeight } from './line-height.js';

/**
 * Convert a DTCG typography value to Figma-compatible format.
 * Typography tokens are split into individual sub-tokens since Figma
 * doesn't support the composite typography type.
 *
 * @example
 * // Input typography token
 * convertTypography({
 *   fontFamily: "Inter",
 *   fontSize: { value: 16, unit: "px" },
 *   fontWeight: 400,
 *   lineHeight: 1.5,
 *   letterSpacing: { value: 0, unit: "px" }
 * }, context);
 * // => { value: undefined, split: true, subTokens: [...] }
 *
 * @param value - The DTCG typography value (object with fontFamily, fontSize, fontWeight, lineHeight, letterSpacing)
 * @param context - Converter context with logger and plugin options
 * @returns Split result with sub-tokens for each typography property, or skip indicator for invalid values
 */
export function convertTypography(value: unknown, context: ConverterContext): ConverterResult {
  if (!isDTCGTypographyValue(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid typography value: expected object, got ${typeof value}`,
    });
    return { value: undefined, skip: true };
  }
  const typography = value;

  const subTokens: SubToken[] = [];

  // Convert fontFamily
  if (typography.fontFamily !== undefined) {
    const result = convertFontFamily(typography.fontFamily, {
      ...context,
      tokenId: `${context.tokenId}.fontFamily`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: 'fontFamily',
        $type: 'fontFamily',
        value: result.value,
      });
    }
  }

  // Convert fontSize (dimension)
  // We also store the resolved fontSize for lineHeight calculation
  let resolvedFontSize: { value: number; unit: string } | undefined;
  if (typography.fontSize !== undefined) {
    const result = convertDimension(typography.fontSize, {
      ...context,
      tokenId: `${context.tokenId}.fontSize`,
    });
    if (!result.skip) {
      resolvedFontSize = result.value as { value: number; unit: string };
      subTokens.push({
        idSuffix: 'fontSize',
        $type: 'dimension',
        value: result.value,
      });
    }
  }

  // Convert fontWeight
  if (typography.fontWeight !== undefined) {
    const result = convertFontWeight(typography.fontWeight, {
      ...context,
      tokenId: `${context.tokenId}.fontWeight`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: 'fontWeight',
        $type: result.outputType ?? 'fontWeight',
        value: result.value,
      });
    }
  }

  // Convert lineHeight (W3C number → Figma dimension)
  // Per W3C DTCG spec, lineHeight is a unitless number (multiplier).
  // Figma requires a dimension, so we compute: lineHeight × fontSize.
  // Note: This loses the reference to any primitive number token - see line-height.ts for details.
  if (typography.lineHeight !== undefined) {
    const result = convertLineHeight(typography.lineHeight, {
      ...context,
      tokenId: `${context.tokenId}.lineHeight`,
      fontSize: resolvedFontSize,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: 'lineHeight',
        $type: 'dimension',
        value: result.value,
      });
    }
  }

  // Convert letterSpacing (dimension)
  if (typography.letterSpacing !== undefined) {
    const result = convertDimension(typography.letterSpacing, {
      ...context,
      tokenId: `${context.tokenId}.letterSpacing`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: 'letterSpacing',
        $type: 'dimension',
        value: result.value,
      });
    }
  }

  // If no sub-tokens were created, skip the token
  if (subTokens.length === 0) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" typography value has no valid sub-properties`,
    });
    return { value: undefined, skip: true };
  }

  return { value: undefined, split: true, subTokens };
}
