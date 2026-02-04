import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult } from '../types.js';
import { isDTCGDurationValue } from '../utils.js';

/**
 * Convert a DTCG duration value to Figma-compatible format.
 * Figma only supports seconds (s) unit.
 *
 * @example
 * // s values pass through unchanged
 * convertDuration({ value: 0.5, unit: "s" }, context);
 * // => { value: { value: 0.5, unit: "s" } }
 *
 * @example
 * // ms values are converted to s
 * convertDuration({ value: 500, unit: "ms" }, context);
 * // => { value: { value: 0.5, unit: "s" } }
 */
export function convertDuration(value: unknown, context: ConverterContext): ConverterResult {
  if (!isDTCGDurationValue(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid duration value: expected object with value (number) and unit (string)`,
    });
    return { value: undefined, skip: true };
  }
  const duration = value;

  // Validate numeric value
  if (!Number.isFinite(duration.value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid duration value: ${duration.value}`,
    });
    return { value: undefined, skip: true };
  }

  // s passthrough
  if (duration.unit === 's') {
    return { value: duration };
  }

  // ms to s conversion (lossless)
  if (duration.unit === 'ms') {
    const sValue = duration.value / 1000;

    // This is a lossless conversion, so just info level (not warning)
    context.logger.info({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" converted from ${duration.value}ms to ${sValue}s`,
    });

    return {
      value: {
        value: sValue,
        unit: 's',
      },
    };
  }

  // Unknown unit - warn and skip
  context.logger.warn({
    group: 'plugin',
    label: PLUGIN_NAME,
    message: `Token "${context.tokenId}" has unsupported duration unit: "${duration.unit}". Figma only supports seconds (s). Convert the value to seconds or use the 'transform' option to handle this token.`,
  });
  return { value: undefined, skip: true };
}
