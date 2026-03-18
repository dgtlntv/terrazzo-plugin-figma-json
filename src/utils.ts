import wcmatch from 'wildcard-match';
import type {
  DTCGBorderValue,
  DTCGColorValue,
  DTCGDimensionValue,
  DTCGDurationValue,
  DTCGGradientStop,
  DTCGShadowValue,
  DTCGTypographyValue,
  TokenExtensions,
} from './types.js';

/**
 * Compute the localID for a token in Figma's slash-notation format.
 * This is used as the `localID` in `setTransform()` and represents
 * how the token is referenced within the Figma JSON format.
 *
 * @param tokenId - Dot-notation token ID (e.g., "color.primary.base")
 * @returns Slash-notation Figma variable name (e.g., "color/primary/base")
 *
 * @example
 * toFigmaLocalID("color.primary.base") // "color/primary/base"
 * toFigmaLocalID("spacing.200")        // "spacing/200"
 */
export function toFigmaLocalID(tokenId: string): string {
  return tokenId.replace(/\./g, '/');
}

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
 * Filter extensions to only include Figma-specific ones (com.figma.*).
 * Removes non-Figma extensions to keep output clean.
 *
 * @param extensions - Token extensions object that may include various namespaces
 * @returns Object with only com.figma.* keys, or undefined if none exist
 *
 * @example
 * filterFigmaExtensions({ "com.figma.type": "boolean", "custom.ext": "value" })
 * // { "com.figma.type": "boolean" }
 */
export function filterFigmaExtensions(extensions: TokenExtensions | undefined): TokenExtensions | undefined {
  if (!extensions) {
    return undefined;
  }

  const figmaExtensions: TokenExtensions = {};
  let hasFigmaExtensions = false;

  for (const [key, value] of Object.entries(extensions)) {
    if (key.startsWith('com.figma')) {
      figmaExtensions[key] = value;
      hasFigmaExtensions = true;
    }
  }

  return hasFigmaExtensions ? figmaExtensions : undefined;
}

/**
 * Safely parse a transform value that may be a JSON string or already an object.
 *
 * @param value - The transform value (JSON string or object)
 * @returns The parsed object, or null if parsing fails
 */
export function parseTransformValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') {
    return value as Record<string, unknown>;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Type guard to validate DTCGColorValue structure.
 *
 * @param value - The value to check
 * @returns True if value is a valid DTCGColorValue with colorSpace, components, and optional alpha
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
 *
 * @param value - The value to check
 * @returns True if value is a valid DTCGDimensionValue with numeric value and string unit
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
 *
 * @param value - The value to check
 * @returns True if value is a valid DTCGDurationValue with numeric value and string unit
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
 *
 * @param value - The value to check
 * @returns True if value is a non-null, non-array object
 */
export function isDTCGTypographyValue(value: unknown): value is DTCGTypographyValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to validate DTCGShadowValue structure.
 * Accepts a single shadow object or an array of shadow objects.
 *
 * @param value - The value to check
 * @returns True if value is a non-null object or a non-empty array of non-null objects
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
 *
 * @param value - The value to check
 * @returns True if value is a non-null, non-array object
 */
export function isDTCGBorderValue(value: unknown): value is DTCGBorderValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to validate DTCGGradientValue structure.
 * Checks that it's an array of gradient stops.
 *
 * @param value - The value to check
 * @returns True if value is a non-empty array of non-null objects
 */
export function isDTCGGradientValue(value: unknown): value is DTCGGradientStop[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => item !== null && typeof item === 'object');
}
