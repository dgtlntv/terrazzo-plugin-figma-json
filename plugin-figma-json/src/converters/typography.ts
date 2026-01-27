import type { ConverterContext, ConverterResult, SubToken } from "../lib.js"
import { isDTCGTypographyValue, PLUGIN_NAME } from "../lib.js"
import { convertDimension } from "./dimension.js"
import { convertFontFamily } from "./font-family.js"
import { convertFontWeight } from "./font-weight.js"
import { convertNumber } from "./number.js"

/**
 * Get the correct alias reference for a typography sub-property.
 * When a typography property references another typography token,
 * the alias needs to point to the corresponding sub-token.
 *
 * @param aliasOf - The referenced token ID, or undefined if not an alias
 * @param propertyName - The sub-property name (fontFamily, fontSize, etc.)
 * @param allTokens - Map of all tokens for type lookup
 * @returns Adjusted alias target, or undefined if not an alias
 *
 * @example
 * // If typography.base is a typography token:
 * getSubTokenAlias("typography.base", "fontFamily", tokens)
 * // "typography.base.fontFamily"
 *
 * // If dimension.100 is a primitive:
 * getSubTokenAlias("dimension.100", "fontSize", tokens)
 * // "dimension.100" (unchanged)
 */
function getSubTokenAlias(
  aliasOf: string | undefined,
  propertyName: string,
  allTokens: Record<string, { $type?: string }> | undefined,
): string | undefined {
  if (!aliasOf) return undefined

  // Check if the referenced token is a typography token
  const referencedToken = allTokens?.[aliasOf]
  if (referencedToken?.$type === "typography") {
    // The target is also a typography token that will be split
    // Append the property name to reference the correct sub-token
    return `${aliasOf}.${propertyName}`
  }

  // Otherwise, return the alias as-is (it's a primitive token)
  return aliasOf
}

/**
 * Convert a DTCG typography value to Figma-compatible format.
 * Typography tokens are split into individual sub-tokens since Figma
 * doesn't support the composite typography type.
 *
 * @example
 * // Input typography token
 * convertTypography({
 *   fontFamily: "Inter",
 *   fontSize: { value: 16, unit: "px" },
 *   fontWeight: 400,
 *   lineHeight: 1.5,
 *   letterSpacing: { value: 0, unit: "px" }
 * }, context);
 * // => { value: undefined, split: true, subTokens: [...] }
 */
export function convertTypography(
  value: unknown,
  context: ConverterContext,
): ConverterResult {
  if (!isDTCGTypographyValue(value)) {
    context.logger.warn({
      group: "plugin",
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" has invalid typography value: expected object, got ${typeof value}`,
    })
    return { value: undefined, skip: true }
  }
  const typography = value

  // Get partial alias information from the token (populated by terrazzo parser)
  // Note: partialAliasOf contains the FINAL alias targets after full resolution.
  // Intermediate references (like JSON pointer $refs to other tokens in the same file)
  // are resolved by the parser before we receive them. This is because:
  // 1. processTokens() resolves $ref and stores in refMap
  // 2. replaceNode() replaces $ref with the resolved curly-brace alias
  // 3. resolveAliases() processes the curly-brace alias and OVERWRITES the refMap entry
  // So we only see the final target, not intermediate JSON pointer targets.
  const partialAliasOf = context.partialAliasOf

  const subTokens: SubToken[] = []

  // Convert fontFamily
  if (typography.fontFamily !== undefined) {
    const aliasOf = getSubTokenAlias(
      partialAliasOf?.fontFamily,
      "fontFamily",
      context.allTokens,
    )

    const result = convertFontFamily(typography.fontFamily, {
      ...context,
      tokenId: `${context.tokenId}.fontFamily`,
    })
    if (!result.skip) {
      subTokens.push({
        idSuffix: "fontFamily",
        $type: "fontFamily",
        value: result.value,
        aliasOf,
      })
    }
  }

  // Convert fontSize (dimension)
  if (typography.fontSize !== undefined) {
    const aliasOf = getSubTokenAlias(
      partialAliasOf?.fontSize,
      "fontSize",
      context.allTokens,
    )

    const result = convertDimension(typography.fontSize, {
      ...context,
      tokenId: `${context.tokenId}.fontSize`,
    })
    if (!result.skip) {
      subTokens.push({
        idSuffix: "fontSize",
        $type: "dimension",
        value: result.value,
        aliasOf,
      })
    }
  }

  // Convert fontWeight
  if (typography.fontWeight !== undefined) {
    const aliasOf = getSubTokenAlias(
      partialAliasOf?.fontWeight,
      "fontWeight",
      context.allTokens,
    )

    const result = convertFontWeight(typography.fontWeight, {
      ...context,
      tokenId: `${context.tokenId}.fontWeight`,
    })
    if (!result.skip) {
      subTokens.push({
        idSuffix: "fontWeight",
        $type: result.outputType ?? "fontWeight",
        value: result.value,
        aliasOf,
      })
    }
  }

  // Convert lineHeight (number)
  if (typography.lineHeight !== undefined) {
    const aliasOf = getSubTokenAlias(
      partialAliasOf?.lineHeight,
      "lineHeight",
      context.allTokens,
    )

    // lineHeight can be a number or a dimension
    const lineHeightValue = typography.lineHeight
    if (typeof lineHeightValue === "number") {
      const result = convertNumber(lineHeightValue, {
        ...context,
        tokenId: `${context.tokenId}.lineHeight`,
      })
      if (!result.skip) {
        subTokens.push({
          idSuffix: "lineHeight",
          $type: "number",
          value: result.value,
          aliasOf,
        })
      }
    } else {
      // Treat as dimension
      const result = convertDimension(lineHeightValue, {
        ...context,
        tokenId: `${context.tokenId}.lineHeight`,
      })
      if (!result.skip) {
        subTokens.push({
          idSuffix: "lineHeight",
          $type: "dimension",
          value: result.value,
          aliasOf,
        })
      }
    }
  }

  // Convert letterSpacing (dimension)
  if (typography.letterSpacing !== undefined) {
    const aliasOf = getSubTokenAlias(
      partialAliasOf?.letterSpacing,
      "letterSpacing",
      context.allTokens,
    )

    const result = convertDimension(typography.letterSpacing, {
      ...context,
      tokenId: `${context.tokenId}.letterSpacing`,
    })
    if (!result.skip) {
      subTokens.push({
        idSuffix: "letterSpacing",
        $type: "dimension",
        value: result.value,
        aliasOf,
      })
    }
  }

  // If no sub-tokens were created, skip the token
  if (subTokens.length === 0) {
    context.logger.warn({
      group: "plugin",
      label: PLUGIN_NAME,
      message: `Token "${context.tokenId}" typography value has no valid sub-properties`,
    })
    return { value: undefined, skip: true }
  }

  return { value: undefined, split: true, subTokens }
}
