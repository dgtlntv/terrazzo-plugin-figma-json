export const PLUGIN_NAME = "terrazzo-plugin-figma-json"

export const FORMAT_ID = "figma-json"

/**
 * Internal metadata property keys used for token processing.
 * These are added during transform and removed during build.
 */
export const INTERNAL_KEYS = {
  /** Target token ID for alias references */
  ALIAS_OF: "_aliasOf",
  /** Parent token ID for split sub-tokens (e.g., typography) */
  SPLIT_FROM: "_splitFrom",
  /** Token ID for split sub-tokens */
  TOKEN_ID: "_tokenId",
} as const

/**
 * Token types supported by Figma.
 */
export const SUPPORTED_TYPES = [
  "color",
  "dimension",
  "duration",
  "fontFamily",
  "fontWeight",
  "number",
  "typography",
] as const

export type SupportedType = (typeof SUPPORTED_TYPES)[number]

/**
 * Token types that are not supported by Figma and will be dropped with a warning.
 */
export const UNSUPPORTED_TYPES = [
  "shadow",
  "border",
  "gradient",
  "transition",
  "strokeStyle",
  "cubicBezier",
] as const

export type UnsupportedType = (typeof UNSUPPORTED_TYPES)[number]

/**
 * Color spaces that Figma natively supports.
 */
export const FIGMA_COLOR_SPACES = ["srgb", "hsl"] as const

export type FigmaColorSpace = (typeof FIGMA_COLOR_SPACES)[number]
