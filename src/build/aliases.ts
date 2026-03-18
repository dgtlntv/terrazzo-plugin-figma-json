import type { TokenNormalized } from '@terrazzo/parser';
import type { SupportedType } from '../constants.js';
import type { PartialAliasOf, TokenWithPartialAlias } from '../types.js';
import { toFigmaLocalID } from '../utils.js';
import { normalizeRootInPath } from './helpers.js';
import type { AliasReferenceOptions, ParsedTokenValue, SourceInfo } from './types.js';

/**
 * Extract partialAliasOf from a token if present.
 * This property is added by terrazzo parser for composite tokens but not in public types.
 *
 * @param token - The token object to inspect
 * @returns The partialAliasOf record mapping sub-properties to alias targets, or undefined
 */
export function getPartialAliasOf(token: unknown): PartialAliasOf | undefined {
  if (token && typeof token === 'object' && 'partialAliasOf' in token) {
    const value = (token as TokenWithPartialAlias).partialAliasOf;
    if (value && typeof value === 'object') {
      return value;
    }
  }
  return undefined;
}

/**
 * Get the correct alias reference for a composite sub-property.
 * When a composite property references another composite token of the same type,
 * the alias needs to point to the corresponding sub-token.
 *
 * @param aliasOf - The raw alias target token ID, or undefined if not an alias
 * @param propertyName - The sub-property name (e.g., "color", "width")
 * @param allTokens - Map of all tokens for type checking
 * @param parentType - The parent composite token's type (e.g., "border", "shadow")
 * @returns The resolved alias target (with sub-property suffix if needed), or undefined
 */
export function getSubTokenAlias(
  aliasOf: string | undefined,
  propertyName: string,
  allTokens: Record<string, { $type?: string }> | undefined,
  parentType: SupportedType,
): string | undefined {
  if (!aliasOf) {
    return undefined;
  }
  const referencedToken = allTokens?.[aliasOf];
  if (referencedToken?.$type === parentType) {
    return `${aliasOf}.${propertyName}`;
  }
  return aliasOf;
}

/**
 * Compute the direct alias target for a simple (non-composite) token.
 *
 * @param token - The normalized token to inspect
 * @returns The direct alias target token ID, or undefined if the token is not an alias
 */
export function getDirectAliasTarget(token: TokenNormalized): string | undefined {
  const aliasOf = token.aliasOf;
  if (!aliasOf) {
    return undefined;
  }

  // Use originalValue.$value to get the direct reference (not fully resolved chain)
  // e.g., "{dimension.size.height.baseline}" instead of "dimension.100"
  const originalValueStr = token.originalValue?.$value;
  if (typeof originalValueStr === 'string' && originalValueStr.startsWith('{') && originalValueStr.endsWith('}')) {
    return originalValueStr.slice(1, -1);
  }

  return typeof aliasOf === 'string' ? aliasOf : undefined;
}

/**
 * Collect all non-undefined string references from a partialAliasOf object,
 * recursively flattening any nested arrays or objects.
 *
 * @param value - The value to extract references from (string, array, or object)
 * @param refs - Mutable array to collect found string references into
 */
function collectRefs(value: unknown, refs: string[]): void {
  if (typeof value === 'string') {
    refs.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs);
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      collectRefs(v, refs);
    }
  }
}

/**
 * For tokens without a direct alias, check if all sub-property references
 * in partialAliasOf point to the same token. If so, the token can be treated
 * as a unified alias to that single target.
 *
 * This handles cases like JSON pointer references where individual sub-properties
 * (e.g., colorSpace, components[0], components[1], etc.) all reference the same
 * source token.
 *
 * Works for any token type with partialAliasOf — colors, borders, shadows, etc.
 *
 * @param token - The normalized token to inspect
 * @returns The unified alias target token ID, or undefined if refs are mixed or absent
 */
export function getUnifiedPartialAlias(token: TokenNormalized): string | undefined {
  // Skip tokens that already have a direct alias
  if (token.aliasOf) {
    return undefined;
  }

  const partialAliasOf = getPartialAliasOf(token);
  if (!partialAliasOf) {
    return undefined;
  }

  const refs: string[] = [];
  collectRefs(partialAliasOf, refs);

  if (refs.length > 0) {
    const uniqueRefs = [...new Set(refs)];
    if (uniqueRefs.length === 1) {
      return uniqueRefs[0];
    }
  }

  return undefined;
}

/**
 * Compute the alias target for a token, considering direct aliases and
 * unified partial aliases (where all sub-property refs point to the same token).
 *
 * @param token - The normalized token to inspect
 * @returns The alias target token ID, or undefined if the token is not an alias
 */
export function computeAliasTarget(token: TokenNormalized): string | undefined {
  return getDirectAliasTarget(token) ?? getUnifiedPartialAlias(token);
}

/**
 * Compute alias targets for each sub-property of a composite token.
 *
 * @param token - The normalized composite token
 * @param subTokenSuffixes - Array of sub-property suffixes to resolve (e.g., ["color", "width"])
 * @param allTokens - Map of all tokens for type checking during alias resolution
 * @returns Map from sub-property suffix to alias target token ID (or undefined if not aliased)
 */
export function computeSubTokenAliases(
  token: TokenNormalized,
  subTokenSuffixes: string[],
  allTokens: Record<string, TokenNormalized> | undefined,
): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  const partialAliasOf = getPartialAliasOf(token);
  const parentType = token.$type as SupportedType;

  for (const suffix of subTokenSuffixes) {
    const raw = partialAliasOf?.[suffix];
    result.set(suffix, getSubTokenAlias(raw, suffix, allTokens, parentType));
  }

  return result;
}

/**
 * Resolve an alias reference and return a new ParsedTokenValue with the
 * appropriate $value or $extensions set.
 *
 * - Same-file references: Sets $value to curly brace syntax (e.g., "{color.primary}")
 * - Cross-file references: Keeps resolved $value and adds com.figma.aliasData extension
 *
 * Returns the original value unchanged if no alias handling applies.
 *
 * @param parsedValue - The parsed token value to potentially augment with alias info
 * @param options - Alias resolution options including target, source context, and reference maps
 * @returns A new ParsedTokenValue with alias reference syntax or extension, or the original value unchanged
 */
export function withAliasReference(
  parsedValue: ParsedTokenValue,
  { aliasOf, sourceName, tokenSources, tokenOutputPaths, preserveReferences }: AliasReferenceOptions,
): ParsedTokenValue {
  if (!preserveReferences || !aliasOf) {
    return parsedValue;
  }

  // Normalize aliasOf to remove $root for lookups (terrazzo uses normalized IDs)
  const normalizedAliasOf = aliasOf.replace(/\.\$root\b/g, '');
  // Get target's output path, or normalize $root -> root in the original aliasOf
  const targetOutputPath = tokenOutputPaths.get(normalizedAliasOf) ?? normalizeRootInPath(aliasOf);

  // Find the target token's sources, handling split sub-tokens by looking up parent
  let targetSources: SourceInfo[] | undefined = tokenSources.get(normalizedAliasOf);
  if (!targetSources) {
    // Try parent tokens for split sub-tokens (e.g., "typography.heading.fontFamily")
    const parts = normalizedAliasOf.split('.');
    while (parts.length > 1 && !targetSources) {
      parts.pop();
      targetSources = tokenSources.get(parts.join('.'));
    }
  }

  if (!targetSources?.length) {
    return parsedValue;
  }

  // Check if target exists in current source (same-file reference)
  const inCurrentSource = targetSources.some((s) => s.source === sourceName);
  if (inCurrentSource) {
    return { ...parsedValue, $value: `{${targetOutputPath}}` };
  }

  // Check for SET sources only (not modifier contexts)
  const setSource = targetSources.find((s) => !s.isModifier);
  if (setSource) {
    const existingExtensions = parsedValue.$extensions ?? {};
    return {
      ...parsedValue,
      $extensions: {
        ...existingExtensions,
        'com.figma.aliasData': {
          targetVariableSetName: setSource.source,
          targetVariableName: toFigmaLocalID(targetOutputPath),
        },
      },
    };
  }

  return parsedValue;
}
