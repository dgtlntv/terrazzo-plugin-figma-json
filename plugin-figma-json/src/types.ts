import type { Logger, TokenNormalized } from "@terrazzo/parser"

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
  "com.figma.type"?: "boolean"
  /**
   * Cross-collection alias data for Figma.
   * Key: "com.figma.aliasData"
   */
  "com.figma.aliasData"?: {
    collection: string
    mode: string
  }
}

/**
 * Token extensions object that may include Figma-specific keys.
 */
export type TokenExtensions = FigmaExtensionKeys & {
  [key: string]: unknown
}

/**
 * Output token structure for Figma-compatible JSON.
 */
export interface FigmaTokenValue {
  $type: string
  $value: unknown
  $description?: string
  $extensions?: TokenExtensions
}

/**
 * Partial alias information for composite types.
 * This is an internal property from terrazzo parser that tracks
 * which sub-properties of a composite token reference other tokens.
 */
export type PartialAliasOf = Record<string, string | undefined>

/**
 * Extended token interface for internal properties not in public types.
 * Terrazzo parser adds these properties but they're not exported in the type definitions.
 */
export interface TokenWithPartialAlias {
  partialAliasOf?: PartialAliasOf
}

/**
 * Options for the Figma JSON plugin.
 */
export interface FigmaJsonPluginOptions {
  /**
   * Output filename for the Figma-compatible JSON.
   * @default "tokens.figma.json"
   */
  filename?: string

  /**
   * Glob patterns to exclude tokens from output.
   * @example ["internal.*", "deprecated.*"]
   */
  exclude?: string[]

  /**
   * Custom transform function to override token values before output.
   * Return undefined to use the default transformation.
   */
  transform?: (token: TokenNormalized) => unknown | undefined

  /**
   * Custom function to control the token name in the output.
   */
  tokenName?: (token: TokenNormalized) => string

  /**
   * Skip generating the output file.
   * Useful if consuming transforms in another plugin.
   * @default false
   */
  skipBuild?: boolean

  /**
   * Base pixel value for rem to px conversion.
   * @default 16
   */
  remBasePx?: number

  /**
   * Whether to log warnings for unsupported token types.
   * @default true
   */
  warnOnUnsupported?: boolean

  /**
   * Preserve token references (aliases) in the output.
   * When true:
   * - Same-file references use curly brace syntax in $value (e.g., "{dimension.100}")
   * - Cross-file references use resolved $value + com.figma.aliasData extension
   * When false:
   * - All values are fully resolved, no references preserved
   * @default true
   */
  preserveReferences?: boolean
}

/**
 * Context passed to converters.
 */
export interface ConverterContext {
  logger: Logger
  options: FigmaJsonPluginOptions
  tokenId: string
  extensions?: TokenExtensions
  allTokens?: Record<string, TokenNormalized>
  originalValue?: unknown
  partialAliasOf?: Record<string, string | undefined>
}

/**
 * Sub-token information for split composite tokens (e.g., typography).
 */
export interface SubToken {
  idSuffix: string
  $type: string
  value: unknown
  aliasOf?: string
}

/**
 * Result returned by a converter.
 */
export interface ConverterResult {
  value: unknown
  skip?: boolean
  outputType?: string
  split?: boolean
  subTokens?: SubToken[]
}

/**
 * Color value structure in DTCG format.
 */
export interface DTCGColorValue {
  colorSpace: string
  components: [number | "none", number | "none", number | "none"]
  alpha?: number | "none"
}

/**
 * Dimension value structure in DTCG format.
 */
export interface DTCGDimensionValue {
  value: number
  unit: string
}

/**
 * Duration value structure in DTCG format.
 */
export interface DTCGDurationValue {
  value: number
  unit: string
}

/**
 * Typography value structure in DTCG format.
 */
export interface DTCGTypographyValue {
  fontFamily?: string | string[]
  fontSize?: DTCGDimensionValue
  fontWeight?: number | string
  lineHeight?: number | DTCGDimensionValue
  letterSpacing?: DTCGDimensionValue
}

/**
 * Figma variable types.
 */
export type FigmaVariableType = "Color" | "Number" | "String" | "Boolean"
