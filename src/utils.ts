import type { Resolver } from '@terrazzo/parser';
import wcmatch from 'wildcard-match';
import { INTERNAL_KEYS, type SupportedType } from './constants.js';
import type {
  DTCGBorderValue,
  DTCGColorValue,
  DTCGDimensionValue,
  DTCGDurationValue,
  DTCGGradientStop,
  DTCGShadowValue,
  DTCGTypographyValue,
  PartialAliasOf,
  TokenWithPartialAlias,
} from './types.js';

/**
 * Create an exclude matcher function from glob patterns.
 *
 * @param patterns - Array of glob patterns to match against token IDs
 * @returns A function that returns true if the token ID should be excluded
 */
export function createExcludeMatcher(patterns: string[] | undefined): (tokenId: string) => boolean {
  return patterns?.length ? wcmatch(patterns) : () => false;
}

/**
 * Type guard to check if the resolver has a usable configuration.
 * Terrazzo creates a default resolver even without a resolver file,
 * but it has empty contexts that cause errors when used.
 *
 * @param resolver - The resolver from terrazzo parser
 * @returns true if resolver has user-defined sets or modifiers with contexts
 */
export function hasValidResolverConfig(resolver: Resolver | undefined): resolver is Resolver {
  if (!resolver?.source || !resolver.listPermutations) {
    return false;
  }

  const source = resolver.source;
  const sets = source.sets ?? {};
  const modifiers = source.modifiers ?? {};

  const hasUserSets = Object.keys(sets).some((name) => name !== 'allTokens');
  const hasModifierContexts = Object.values(modifiers).some(
    (mod) => mod.contexts && Object.keys(mod.contexts).length > 0,
  );

  return hasUserSets || hasModifierContexts;
}

/**
 * Build default input from resolver's modifiers.
 * Creates an input object with each modifier set to its default value.
 *
 * @param resolverSource - The resolver source configuration
 * @returns Input object for resolver.apply() with default modifier values
 */
export function buildDefaultInput(resolverSource: NonNullable<Resolver['source']>): Record<string, string> {
  const input: Record<string, string> = {};
  if (resolverSource.modifiers) {
    for (const [modifierName, modifier] of Object.entries(resolverSource.modifiers)) {
      if (modifier.default) {
        input[modifierName] = modifier.default;
      }
    }
  }
  return input;
}

/**
 * Remove internal metadata properties from a parsed token value.
 * These properties are used for internal processing and should not appear in output.
 *
 * @param parsedValue - Token value object to clean (mutated in place)
 */
export function removeInternalMetadata(parsedValue: Record<string, unknown>): void {
  delete parsedValue[INTERNAL_KEYS.ALIAS_OF];
  delete parsedValue[INTERNAL_KEYS.SPLIT_FROM];
  delete parsedValue[INTERNAL_KEYS.TOKEN_ID];
}

/**
 * Safely parse a transform value that may be a JSON string or already an object.
 * Returns the parsed value or null if parsing fails.
 *
 * @param value - The transform value (string or object)
 * @returns Parsed value or null on error
 */
export function parseTransformValue(value: unknown): any {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Extract partialAliasOf from a token if present.
 * This property is added by terrazzo parser for composite tokens but not in public types.
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
 * Type guard to validate DTCGColorValue structure.
 */
export function isDTCGColorValue(value: unknown): value is DTCGColorValue {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.colorSpace !== 'string') {
    return false;
  }
  if (!Array.isArray(v.components) || v.components.length !== 3) {
    return false;
  }
  for (const c of v.components) {
    if (c !== 'none' && typeof c !== 'number') {
      return false;
    }
  }
  if (v.alpha !== undefined && v.alpha !== 'none' && typeof v.alpha !== 'number') {
    return false;
  }
  return true;
}

/**
 * Type guard to validate DTCGDimensionValue structure.
 */
export function isDTCGDimensionValue(value: unknown): value is DTCGDimensionValue {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.value === 'number' && typeof v.unit === 'string';
}

/**
 * Type guard to validate DTCGDurationValue structure.
 */
export function isDTCGDurationValue(value: unknown): value is DTCGDurationValue {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.value === 'number' && typeof v.unit === 'string';
}

/**
 * Type guard to validate DTCGTypographyValue structure.
 * Only checks that it's an object - individual properties are validated during conversion.
 */
export function isDTCGTypographyValue(value: unknown): value is DTCGTypographyValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to validate DTCGShadowValue structure.
 * Accepts a single shadow object or an array of shadow objects.
 */
export function isDTCGShadowValue(value: unknown): value is DTCGShadowValue | DTCGShadowValue[] {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => item !== null && typeof item === 'object');
  }
  return value !== null && typeof value === 'object';
}

/**
 * Type guard to validate DTCGBorderValue structure.
 * Only checks that it's an object - individual properties are validated during conversion.
 */
export function isDTCGBorderValue(value: unknown): value is DTCGBorderValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to validate DTCGGradientValue structure.
 * Checks that it's an array of gradient stops.
 */
export function isDTCGGradientValue(value: unknown): value is DTCGGradientStop[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => item !== null && typeof item === 'object');
}

/**
 * Get the correct alias reference for a composite sub-property.
 * When a composite property references another composite token of the same type,
 * the alias needs to point to the corresponding sub-token.
 *
 * @param aliasOf - The referenced token ID, or undefined if not an alias
 * @param propertyName - The sub-property name (e.g., fontFamily, color, offsetX)
 * @param allTokens - Map of all tokens for type lookup
 * @param parentType - The composite token type (e.g., 'typography', 'shadow', 'border', 'gradient')
 * @returns Adjusted alias target, or undefined if not an alias
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
