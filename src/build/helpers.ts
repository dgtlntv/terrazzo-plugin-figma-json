import type { Resolver } from '@terrazzo/parser';
import type { TokenExtensions } from '../types.js';
import { filterFigmaExtensions } from '../utils.js';
import type { FigmaOutputExtensions, ParsedTokenValue } from './types.js';

/**
 * Set a nested property on an object using dot-notation path.
 * Creates intermediate objects as needed.
 * Note: this intentionally mutates `obj` for efficient output tree construction.
 *
 * @param obj - The object to modify
 * @param path - Dot-notation path (e.g., "color.primary.base")
 * @param value - The value to set at the path
 *
 * @example
 * const obj = {};
 * setNestedProperty(obj, "color.primary", { $value: "#ff0000" });
 * // obj = { color: { primary: { $value: "#ff0000" } } }
 */
export function setNestedProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.length === 0) {
    return;
  }

  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

/**
 * Convert $root in a token ID to root for Figma compatibility.
 * DTCG uses $root for default values, but Figma doesn't support $ in names.
 *
 * @param path - The token path that may contain ".$root" segments
 * @returns The path with ".$root" replaced by ".root"
 */
export function normalizeRootInPath(path: string): string {
  return path.replace(/\.\$root\b/g, '.root');
}

/**
 * Check if this resolver is the auto-generated default (no user-defined resolver file).
 * The default resolver has only an "allTokens" set and a "tzMode" modifier with "." context.
 *
 * @param resolverSource - The resolver source configuration to inspect
 * @returns True if this is the auto-generated default resolver
 */
export function isDefaultResolver(resolverSource: NonNullable<Resolver['source']>): boolean {
  const sets = resolverSource.sets ?? {};
  const modifiers = resolverSource.modifiers ?? {};

  const setNames = Object.keys(sets);
  if (setNames.length !== 1 || setNames[0] !== 'allTokens') {
    return false;
  }

  const modifierNames = Object.keys(modifiers);
  if (modifierNames.length === 0) {
    return true;
  }
  if (modifierNames.length === 1 && modifierNames[0] === 'tzMode') {
    const tzMode = modifiers.tzMode;
    if (tzMode?.contexts) {
      const contextNames = Object.keys(tzMode.contexts);
      return contextNames.length === 1 && contextNames[0] === '.';
    }
  }

  return false;
}

/**
 * Return a new ParsedTokenValue with $description and filtered $extensions added.
 *
 * @param parsedValue - The parsed token value to augment
 * @param token - The source token containing $description and $extensions metadata
 * @returns A new ParsedTokenValue with description and Figma-specific extensions merged in
 */
export function withTokenMetadata(
  parsedValue: ParsedTokenValue,
  token: { $description?: string; $extensions?: Record<string, unknown> },
): ParsedTokenValue {
  let result = parsedValue;

  if (token.$description) {
    result = { ...result, $description: token.$description };
  }

  const figmaExtensions = filterFigmaExtensions(token.$extensions as TokenExtensions | undefined);
  if (figmaExtensions) {
    // Merge with any existing extensions (e.g., aliasData added later)
    const existing = result.$extensions ?? {};
    result = {
      ...result,
      $extensions: {
        ...(figmaExtensions as unknown as FigmaOutputExtensions),
        ...existing,
      },
    };
  }

  return result;
}
