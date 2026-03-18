import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult, SubToken } from '../types.js';
import { isDTCGBorderValue } from '../utils.js';
import { convertColor } from './color.js';
import { convertDimension } from './dimension.js';

/**
 * Convert a DTCG border value to Figma-compatible format.
 * Border tokens are partially split into individual sub-tokens.
 * Only color and width are supported; style is dropped.
 *
 * @param value - The DTCG border value (object with color, width, and optional style)
 * @param context - Converter context with logger and plugin options
 * @returns Split result with color and width sub-tokens, or skip indicator for invalid values
 */
export function convertBorder(value: unknown, context: ConverterContext): ConverterResult {
  if (!isDTCGBorderValue(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid border value: expected object, got ${typeof value}`,
    });
    return { value: undefined, skip: true };
  }

  const border = value;
  const subTokens: SubToken[] = [];

  // Convert color
  if (border.color !== undefined) {
    const result = convertColor(border.color, {
      ...context,
      tokenId: `${context.tokenId}.color`,
    });
    if (!result.skip) {
      subTokens.push({ idSuffix: 'color', $type: 'color', value: result.value });
    }
  }

  // Convert width
  if (border.width !== undefined) {
    const result = convertDimension(border.width, {
      ...context,
      tokenId: `${context.tokenId}.width`,
    });
    if (!result.skip) {
      subTokens.push({ idSuffix: 'width', $type: 'dimension', value: result.value });
    }
  }

  // Drop style (can't be represented as a Figma variable)
  if (border.style !== undefined) {
    context.logger.info({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" border "style" property dropped (variables cannot be applied to border style in Figma)`,
    });
  }

  if (subTokens.length === 0) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" border value has no valid sub-properties`,
    });
    return { value: undefined, skip: true };
  }

  return { value: undefined, split: true, subTokens };
}
