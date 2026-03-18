import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult, SubToken } from '../types.js';
import { isDTCGGradientValue } from '../utils.js';
import { convertColor } from './color.js';

/**
 * Convert a DTCG gradient value to Figma-compatible format.
 * Gradient tokens are partially split: only stop colors are extracted.
 * Stop positions are dropped since they can't be represented as Figma variables.
 *
 * @param value - The DTCG gradient value (array of gradient stops with color and position)
 * @param context - Converter context with logger and plugin options
 * @returns Split result with color sub-tokens for each stop, or skip indicator for invalid values
 */
export function convertGradient(value: unknown, context: ConverterContext): ConverterResult {
  if (!isDTCGGradientValue(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid gradient value: expected array of gradient stops, got ${typeof value}`,
    });
    return { value: undefined, skip: true };
  }

  const subTokens: SubToken[] = [];
  let hasPosition = false;

  for (let i = 0; i < value.length; i++) {
    const stop = value[i]!;

    if (stop.color !== undefined) {
      const aliasKey = `${i}.color`;
      const result = convertColor(stop.color, {
        ...context,
        tokenId: `${context.tokenId}.${aliasKey}`,
      });
      if (!result.skip) {
        subTokens.push({ idSuffix: aliasKey, $type: 'color', value: result.value });
      }
    }

    if (stop.position !== undefined) {
      hasPosition = true;
    }
  }

  // Log once if any positions were dropped
  if (hasPosition) {
    context.logger.info({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" gradient "position" values dropped (variables cannot be applied to gradient stop positions in Figma)`,
    });
  }

  if (subTokens.length === 0) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" gradient value has no valid color stops`,
    });
    return { value: undefined, skip: true };
  }

  return { value: undefined, split: true, subTokens };
}
