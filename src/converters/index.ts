import type { TokenNormalized } from '@terrazzo/parser';
import { PLUGIN_NAME, SUPPORTED_TYPES, type SupportedType, UNSUPPORTED_TYPES } from '../constants.js';
import type { ConverterContext, ConverterResult } from '../types.js';
import { convertBorder } from './border.js';
import { convertColor } from './color.js';
import { convertDimension } from './dimension.js';
import { convertDuration } from './duration.js';
import { convertFontFamily } from './font-family.js';
import { convertFontWeight } from './font-weight.js';
import { convertGradient } from './gradient.js';
import { convertNumber } from './number.js';
import { convertShadow } from './shadow.js';
import { convertTypography } from './typography.js';

/**
 * Converter function signature.
 */
export type Converter = (value: unknown, context: ConverterContext) => ConverterResult;

/**
 * Registry of converters by token type.
 */
const converters: Record<SupportedType, Converter> = {
  color: convertColor,
  dimension: convertDimension,
  duration: convertDuration,
  fontFamily: convertFontFamily,
  fontWeight: convertFontWeight,
  number: convertNumber,
  typography: convertTypography,
  shadow: convertShadow,
  border: convertBorder,
  gradient: convertGradient,
};

/**
 * Check if a token type is supported by Figma.
 */
export function isSupportedType(type: string): type is SupportedType {
  return SUPPORTED_TYPES.includes(type as SupportedType);
}

/**
 * Check if a value is an alias reference (curly brace syntax).
 */
export function isAlias(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

/**
 * Extract the token ID from an alias reference.
 * @param alias - The alias string, e.g., "{color.primary}"
 * @returns The token ID, e.g., "color.primary"
 */
function extractAliasTarget(alias: string): string {
  return alias.slice(1, -1);
}

/**
 * Validate an alias reference and return any warnings.
 */
function validateAlias(alias: string, context: ConverterContext): { valid: boolean; warning?: string } {
  const targetId = extractAliasTarget(alias);

  // Check if target exists
  if (!context.allTokens) {
    // Can't validate without token map
    return { valid: true };
  }

  const targetToken = context.allTokens[targetId];
  if (!targetToken) {
    return {
      valid: false,
      warning: `Token "${context.tokenId}" references non-existent token "${targetId}". Check the token path for typos or ensure the referenced token is defined.`,
    };
  }

  // Check if target is a Figma-compatible type
  if (!isSupportedType(targetToken.$type)) {
    const isKnownUnsupported = UNSUPPORTED_TYPES.includes(targetToken.$type as (typeof UNSUPPORTED_TYPES)[number]);
    return {
      valid: false,
      warning: isKnownUnsupported
        ? `Token "${context.tokenId}" aliases unsupported type "${targetToken.$type}" (from "${targetId}"). This alias will be preserved but may not work in Figma. Consider referencing a supported token type instead.`
        : `Token "${context.tokenId}" aliases unknown type "${targetToken.$type}" (from "${targetId}"). This alias will be preserved but may not work in Figma. Verify the target token has a supported type.`,
    };
  }

  return { valid: true };
}

/**
 * Convert a token value to Figma-compatible format.
 *
 * @param token - The normalized token
 * @param value - The token value to convert
 * @param context - Converter context with logger and options
 * @returns Converted value or skip indicator
 */
export function convertToken(token: TokenNormalized, value: unknown, context: ConverterContext): ConverterResult {
  const { $type } = token;

  // Handle missing $type
  if (!$type) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" is missing $type. Ensure all tokens have a valid $type defined either directly or inherited from a parent group.`,
    });
    return { value: undefined, skip: true };
  }

  // Handle undefined or null values
  if (value === undefined || value === null) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has no value (${value}). Ensure $value is defined for this token.`,
    });
    return { value: undefined, skip: true };
  }

  // Handle alias references - validate and pass through
  if (isAlias(value)) {
    const validation = validateAlias(value, context);

    if (validation.warning) {
      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: validation.warning,
      });
    }

    // Always pass through the alias - Figma uses the same syntax
    // Even invalid aliases are preserved to avoid breaking references
    return { value };
  }

  // Check if type is supported
  if (!isSupportedType($type)) {
    const isKnownUnsupported = UNSUPPORTED_TYPES.includes($type as (typeof UNSUPPORTED_TYPES)[number]);

    if (context.options.warnOnUnsupported !== false) {
      const suggestion = isKnownUnsupported
        ? ` Consider excluding this token with the 'exclude' option, or use a supported type (color, dimension, duration, fontFamily, fontWeight, number).`
        : ` If this is a custom type, consider using the 'transform' option to convert it to a supported format.`;

      context.logger.warn({
        group: 'plugin',
        label: PLUGIN_NAME,
        message: isKnownUnsupported
          ? `Token "${context.tokenId}" has unsupported type "${$type}" and will be skipped.${suggestion}`
          : `Token "${context.tokenId}" has unknown type "${$type}" and will be skipped.${suggestion}`,
      });
    }

    return { value: undefined, skip: true };
  }

  // Get the converter for this type
  const converter = converters[$type];
  return converter(value, context);
}
