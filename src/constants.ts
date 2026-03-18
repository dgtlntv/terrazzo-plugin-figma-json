export const PLUGIN_NAME = 'terrazzo-plugin-figma-json';

export const FORMAT_ID = 'figma-json';

/**
 * Token types supported by Figma.
 */
export const SUPPORTED_TYPES = [
  'color',
  'dimension',
  'duration',
  'fontFamily',
  'fontWeight',
  'number',
  'typography',
  'shadow',
  'border',
  'gradient',
] as const;

export type SupportedType = (typeof SUPPORTED_TYPES)[number];

/**
 * Token types that are not supported by Figma and will be dropped with a warning.
 */
export const UNSUPPORTED_TYPES = ['transition', 'strokeStyle', 'cubicBezier'] as const;

export type UnsupportedType = (typeof UNSUPPORTED_TYPES)[number];

/**
 * Color spaces that Figma natively supports.
 */
export const FIGMA_COLOR_SPACES = ['srgb', 'hsl'] as const;

export type FigmaColorSpace = (typeof FIGMA_COLOR_SPACES)[number];
