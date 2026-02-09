import { PLUGIN_NAME } from '../constants.js';
import type { ConverterContext, ConverterResult, DTCGShadowValue, SubToken } from '../types.js';
import { getSubTokenAlias, isDTCGShadowValue } from '../utils.js';
import { convertColor } from './color.js';
import { convertDimension } from './dimension.js';

/**
 * Convert a single shadow object's properties into sub-tokens.
 *
 * @param shadow - The shadow value object
 * @param prefix - Prefix for sub-token IDs (empty for single, "0." for arrays)
 * @param context - Converter context
 * @param partialAliasOf - Alias information for sub-properties
 * @returns Array of sub-tokens
 */
function convertShadowLayer(
  shadow: DTCGShadowValue,
  prefix: string,
  context: ConverterContext,
  partialAliasOf: Record<string, string | undefined> | undefined,
): SubToken[] {
  const subTokens: SubToken[] = [];

  // Convert color
  if (shadow.color !== undefined) {
    const aliasKey = `${prefix}color`;
    const aliasOf = getSubTokenAlias(partialAliasOf?.[aliasKey], aliasKey, context.allTokens, 'shadow');

    const result = convertColor(shadow.color, {
      ...context,
      tokenId: `${context.tokenId}.${aliasKey}`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: aliasKey,
        $type: 'color',
        value: result.value,
        aliasOf,
      });
    }
  }

  // Convert offsetX
  if (shadow.offsetX !== undefined) {
    const aliasKey = `${prefix}offsetX`;
    const aliasOf = getSubTokenAlias(partialAliasOf?.[aliasKey], aliasKey, context.allTokens, 'shadow');

    const result = convertDimension(shadow.offsetX, {
      ...context,
      tokenId: `${context.tokenId}.${aliasKey}`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: aliasKey,
        $type: 'dimension',
        value: result.value,
        aliasOf,
      });
    }
  }

  // Convert offsetY
  if (shadow.offsetY !== undefined) {
    const aliasKey = `${prefix}offsetY`;
    const aliasOf = getSubTokenAlias(partialAliasOf?.[aliasKey], aliasKey, context.allTokens, 'shadow');

    const result = convertDimension(shadow.offsetY, {
      ...context,
      tokenId: `${context.tokenId}.${aliasKey}`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: aliasKey,
        $type: 'dimension',
        value: result.value,
        aliasOf,
      });
    }
  }

  // Convert blur
  if (shadow.blur !== undefined) {
    const aliasKey = `${prefix}blur`;
    const aliasOf = getSubTokenAlias(partialAliasOf?.[aliasKey], aliasKey, context.allTokens, 'shadow');

    const result = convertDimension(shadow.blur, {
      ...context,
      tokenId: `${context.tokenId}.${aliasKey}`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: aliasKey,
        $type: 'dimension',
        value: result.value,
        aliasOf,
      });
    }
  }

  // Convert spread
  if (shadow.spread !== undefined) {
    const aliasKey = `${prefix}spread`;
    const aliasOf = getSubTokenAlias(partialAliasOf?.[aliasKey], aliasKey, context.allTokens, 'shadow');

    const result = convertDimension(shadow.spread, {
      ...context,
      tokenId: `${context.tokenId}.${aliasKey}`,
    });
    if (!result.skip) {
      subTokens.push({
        idSuffix: aliasKey,
        $type: 'dimension',
        value: result.value,
        aliasOf,
      });
    }
  }

  // Drop inset (can't be applied in Figma)
  if (shadow.inset !== undefined) {
    context.logger.info({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" shadow "inset" property dropped (variables cannot be applied to inset shadows in Figma)`,
    });
  }

  return subTokens;
}

/**
 * Convert a DTCG shadow value to Figma-compatible format.
 * Shadow tokens are split into individual sub-tokens since Figma
 * doesn't support the composite shadow type.
 *
 * Single shadows produce: color, offsetX, offsetY, blur, spread
 * Multiple shadow layers produce indexed sub-tokens: 0.color, 0.offsetX, ..., 1.color, etc.
 */
export function convertShadow(value: unknown, context: ConverterContext): ConverterResult {
  if (!isDTCGShadowValue(value)) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid shadow value: expected object or array, got ${typeof value}`,
    });
    return { value: undefined, skip: true };
  }

  const partialAliasOf = context.partialAliasOf;
  const subTokens: SubToken[] = [];

  if (Array.isArray(value)) {
    if (value.length === 1) {
      // Single-element array: treat as a single shadow (no index prefix)
      const layerTokens = convertShadowLayer(value[0] as DTCGShadowValue, '', context, partialAliasOf);
      subTokens.push(...layerTokens);
    } else {
      // Multiple shadow layers: use indexed prefixes
      for (let i = 0; i < value.length; i++) {
        const layer = value[i] as DTCGShadowValue;
        const layerTokens = convertShadowLayer(layer, `${i}.`, context, partialAliasOf);
        subTokens.push(...layerTokens);
      }
    }
  } else {
    // Single shadow object
    const layerTokens = convertShadowLayer(value, '', context, partialAliasOf);
    subTokens.push(...layerTokens);
  }

  if (subTokens.length === 0) {
    context.logger.warn({
      group: 'plugin',
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" shadow value has no valid sub-properties`,
    });
    return { value: undefined, skip: true };
  }

  return { value: undefined, split: true, subTokens };
}
