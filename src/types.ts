import type { Logger, TokenNormalized } from '@terrazzo/parser';

/**
 * Extension keys used by Figma in the $extensions object.
 * Figma uses flat namespaced keys like "com.figma.type", not nested objects.
 */
export interface FigmaExtensionKeys {
  /**
   * Overrides the inferred Figma variable type.
   * Use "boolean" to treat a number token as a boolean (0 = false, non-zero = true).
   * Key: "com.figma.type"
   */
  'com.figma.type'?: 'boolean';
  /**
   * Cross-collection alias data for Figma.
   * Key: "com.figma.aliasData"
   */
  'com.figma.aliasData'?: {
    collection: string;
    mode: string;
  };
}

/**
 * Token extensions object that may include Figma-specific keys.
 */
export type TokenExtensions = FigmaExtensionKeys & {
  [key: string]: unknown;
};

/**
 * Output token structure for Figma-compatible JSON.
 */
export interface FigmaTokenValue {
  $type: string;
  $value: unknown;
  $description?: string;
  $extensions?: TokenExtensions;
}

/**
 * Partial alias information for composite types.
 * This is an internal property from terrazzo parser that tracks
 * which sub-properties of a composite token reference other tokens.
 */
export type PartialAliasOf = Record<string, string | undefined>;

/**
 * Extended token interface for internal properties not in public types.
 * Terrazzo parser adds these properties but they're not exported in the type definitions.
 */
export interface TokenWithPartialAlias {
  partialAliasOf?: PartialAliasOf;
}

/**
 * Options for the Figma JSON plugin.
 */
export interface FigmaJsonPluginOptions {
  /**
   * Output filename for the Figma-compatible JSON.
   * @default "tokens.figma.json"
   */
  filename?: string;

  /**
   * Glob patterns to exclude tokens from output.
   * @example ["internal.*", "deprecated.*"]
   */
  exclude?: string[];

  /**
   * Custom transform function to override token values before output.
   * Return undefined to use the default transformation.
   */
  transform?: (token: TokenNormalized) => unknown | undefined;

  /**
   * Custom function to control the token name in the output.
   */
  tokenName?: (token: TokenNormalized) => string;

  /**
   * Skip generating the output file.
   * Useful if consuming transforms in another plugin.
   * @default false
   */
  skipBuild?: boolean;

  /**
   * Base pixel value for rem to px conversion.
   * @default 16
   */
  remBasePx?: number;

  /**
   * Whether to log warnings for unsupported token types.
   * @default true
   */
  warnOnUnsupported?: boolean;

  /**
   * Preserve token references (aliases) in the output.
   * When true:
   * - Same-file references use curly brace syntax in $value (e.g., "{dimension.100}")
   * - Cross-file references use resolved $value + com.figma.aliasData extension
   * When false:
   * - All values are fully resolved, no references preserved
   * @default true
   */
  preserveReferences?: boolean;

  /**
   * Round computed lineHeight values to whole pixels.
   * When true (default): lineHeight values are rounded to integers (e.g., 24px)
   * When false: lineHeight values keep full precision (e.g., 23.999999px)
   *
   * This only affects typography tokens where lineHeight is a unitless multiplier
   * that gets computed to an absolute px value (multiplier × fontSize).
   * @default true
   */
  roundLineHeight?: boolean;
}

/**
 * Context passed to converters.
 */
export interface ConverterContext {
  logger: Logger;
  options: FigmaJsonPluginOptions;
  tokenId: string;
  extensions?: TokenExtensions;
  allTokens?: Record<string, TokenNormalized>;
  originalValue?: unknown;
  partialAliasOf?: Record<string, string | undefined>;
}

/**
 * Sub-token information for split composite tokens (e.g., typography).
 */
export interface SubToken {
  idSuffix: string;
  $type: string;
  value: unknown;
  aliasOf?: string;
}

/**
 * Result returned by a converter.
 */
export interface ConverterResult {
  value: unknown;
  skip?: boolean;
  outputType?: string;
  split?: boolean;
  subTokens?: SubToken[];
}

/**
 * Color value structure in DTCG format.
 */
export interface DTCGColorValue {
  colorSpace: string;
  components: [number | 'none', number | 'none', number | 'none'];
  alpha?: number | 'none';
}

/**
 * Dimension value structure in DTCG format.
 */
export interface DTCGDimensionValue {
  value: number;
  unit: string;
}

/**
 * Duration value structure in DTCG format.
 */
export interface DTCGDurationValue {
  value: number;
  unit: string;
}

/**
 * Typography value structure in DTCG format.
 *
 * Note: Per W3C DTCG spec, lineHeight is a number (unitless multiplier).
 * Figma requires dimension tokens for lineHeight, so the plugin converts
 * the multiplier to an absolute px value by multiplying with fontSize.
 */
export interface DTCGTypographyValue {
  fontFamily?: string | string[];
  fontSize?: DTCGDimensionValue;
  fontWeight?: number | string;
  /** Unitless multiplier (e.g., 1.5 means 1.5× fontSize). Converted to dimension for Figma. */
  lineHeight?: number;
  letterSpacing?: DTCGDimensionValue;
}

/**
 * Shadow value structure in DTCG format.
 * Can be a single shadow object or an array of shadow layers.
 */
export interface DTCGShadowValue {
  color?: DTCGColorValue;
  offsetX?: DTCGDimensionValue;
  offsetY?: DTCGDimensionValue;
  blur?: DTCGDimensionValue;
  spread?: DTCGDimensionValue;
  inset?: boolean;
}

/**
 * Border value structure in DTCG format.
 */
export interface DTCGBorderValue {
  color?: DTCGColorValue;
  width?: DTCGDimensionValue;
  style?: string;
}

/**
 * Gradient stop structure in DTCG format.
 */
export interface DTCGGradientStop {
  color?: DTCGColorValue;
  position?: number;
}

/**
 * Figma variable types.
 */
export type FigmaVariableType = 'Color' | 'Number' | 'String' | 'Boolean';
