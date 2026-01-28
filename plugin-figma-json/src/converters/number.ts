import { PLUGIN_NAME } from "../constants.js"
import type { ConverterContext, ConverterResult } from "../types.js"

/**
 * Convert a DTCG number value to Figma-compatible format.
 * Can output as Boolean if token has com.figma.type extension set to "boolean".
 *
 * @example
 * // Regular number token
 * convertNumber(1.5, context) // => { value: 1.5 }
 *
 * @example
 * // Boolean extension: 0 becomes false, non-zero becomes true
 * // Token with $extensions: { "com.figma": { "type": "boolean" } }
 * convertNumber(0, contextWithBooleanExt) // => { value: false }
 * convertNumber(1, contextWithBooleanExt) // => { value: true }
 */
export function convertNumber(
  value: unknown,
  context: ConverterContext,
): ConverterResult {
  if (typeof value !== "number") {
    context.logger.warn({
      group: "plugin",
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid number value: ${typeof value}`,
    })
    return { value: undefined, skip: true }
  }

  if (!Number.isFinite(value)) {
    context.logger.warn({
      group: "plugin",
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has non-finite number value: ${value}`,
    })
    return { value: undefined, skip: true }
  }

  // Check for boolean type override via com.figma.type extension
  // Per Figma docs: $extensions: { "com.figma.type": "boolean" }
  const figmaType = context.extensions?.["com.figma.type"]
  if (figmaType === "boolean") {
    // Convert number to boolean: 0 = false, non-zero = true
    return { value: value !== 0 }
  }

  // Number passthrough
  return { value }
}
