import type { TokenNormalized, TransformHookOptions } from "@terrazzo/parser"
import { FORMAT_ID, INTERNAL_KEYS } from "./constants.js"
import { convertToken } from "./converters/index.js"
import type { FigmaJsonPluginOptions, TokenExtensions } from "./types.js"
import {
  createExcludeMatcher,
  getPartialAliasOf,
  hasValidResolverConfig,
} from "./utils.js"

/**
 * Register a transform with optional resolver input.
 * Encapsulates the conditional logic for input presence.
 */
function registerTransform(
  setTransform: TransformHookOptions["setTransform"],
  id: string,
  value: string,
  input?: Record<string, string>,
): void {
  if (input) {
    setTransform(id, { format: FORMAT_ID, value, input })
  } else {
    setTransform(id, { format: FORMAT_ID, value })
  }
}

export interface TransformOptions {
  transform: TransformHookOptions
  options: FigmaJsonPluginOptions
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
function filterFigmaExtensions(
  extensions: TokenExtensions | undefined,
): TokenExtensions | undefined {
  if (!extensions) return undefined

  const figmaExtensions: TokenExtensions = {}
  let hasFigmaExtensions = false

  for (const [key, value] of Object.entries(extensions)) {
    if (key.startsWith("com.figma")) {
      figmaExtensions[key] = value
      hasFigmaExtensions = true
    }
  }

  return hasFigmaExtensions ? figmaExtensions : undefined
}

/**
 * Transform a single token and register it via setTransform.
 * Handles custom transforms, split tokens (typography), and alias references.
 *
 * @param token - The normalized token from terrazzo parser
 * @param rawValue - The resolved token value
 * @param aliasOf - Target token ID if this is an alias, undefined otherwise
 * @param options - Plugin configuration options
 * @param context - Plugin hook context with logger
 * @param allTokens - Map of all tokens for alias validation
 * @param setTransform - Terrazzo callback to register transformed value
 * @param input - Optional resolver input. When omitted, uses legacy mode without resolver.
 */
function transformToken(
  token: TokenNormalized,
  rawValue: unknown,
  aliasOf: string | undefined,
  options: FigmaJsonPluginOptions,
  context: TransformHookOptions["context"],
  allTokens: Record<string, TokenNormalized>,
  setTransform: TransformHookOptions["setTransform"],
  input?: Record<string, string>,
): void {
  // Allow custom transform to override
  const customValue = options.transform?.(token)
  if (customValue !== undefined) {
    registerTransform(
      setTransform,
      token.id,
      JSON.stringify(customValue),
      input,
    )
    return
  }

  const partialAliasOf = getPartialAliasOf(token)

  // Convert the token value (always resolve to final value)
  const result = convertToken(token, rawValue, {
    logger: context.logger,
    options,
    tokenId: token.id,
    extensions: token.$extensions,
    allTokens,
    originalValue: token.originalValue?.$value,
    partialAliasOf,
  })

  // Skip if converter indicates to skip
  if (result.skip) {
    return
  }

  // Handle split tokens (e.g., typography)
  if (result.split && result.subTokens) {
    for (const subToken of result.subTokens) {
      const subId = `${token.id}.${subToken.idSuffix}`
      const transformedValue: Record<string, unknown> = {
        $type: subToken.$type,
        $value: subToken.value,
        // Include metadata for build phase to identify split sub-tokens
        [INTERNAL_KEYS.SPLIT_FROM]: token.id, // Parent token ID for source lookup
        [INTERNAL_KEYS.TOKEN_ID]: subId, // This sub-token's ID
      }
      // Preserve alias reference for sub-token if it was a reference
      if (subToken.aliasOf) {
        transformedValue[INTERNAL_KEYS.ALIAS_OF] = subToken.aliasOf
      }
      if (token.$description) {
        transformedValue.$description = token.$description
      }
      const subTokenFigmaExtensions = filterFigmaExtensions(token.$extensions)
      if (subTokenFigmaExtensions) {
        transformedValue.$extensions = subTokenFigmaExtensions
      }
      registerTransform(
        setTransform,
        subId,
        JSON.stringify(transformedValue),
        input,
      )
    }
    return
  }

  // Build the transformed token structure with resolved value
  const transformedValue: Record<string, unknown> = {
    $type: result.outputType ?? token.$type,
    $value: result.value,
  }
  if (token.$description) {
    transformedValue.$description = token.$description
  }
  const figmaExtensions = filterFigmaExtensions(token.$extensions)
  if (figmaExtensions) {
    transformedValue.$extensions = figmaExtensions
  }

  // Store aliasOf for build step to create Figma aliasData extension
  // Figma wants resolved $value + aliasData extension for cross-collection references
  if (aliasOf) {
    // Use originalValue.$value to get the direct reference (not fully resolved chain)
    // e.g., "{dimension.size.height.baseline}" instead of "dimension.100"
    const originalValueStr = token.originalValue?.$value
    let directAliasOf = aliasOf
    if (
      typeof originalValueStr === "string" &&
      originalValueStr.startsWith("{") &&
      originalValueStr.endsWith("}")
    ) {
      directAliasOf = originalValueStr.slice(1, -1)
    }
    transformedValue[INTERNAL_KEYS.ALIAS_OF] = directAliasOf
  } else if (token.$type === "color" && partialAliasOf) {
    // For colors without a direct alias, check if all components reference the same token
    // This handles JSON pointer references like { "$ref": "#/color/palette/white/$value/colorSpace" }
    const colorPartialAlias = partialAliasOf as {
      colorSpace?: string
      components?: (string | undefined)[]
      alpha?: string
    }

    // Collect all non-undefined references
    const refs: string[] = []
    if (colorPartialAlias.colorSpace) refs.push(colorPartialAlias.colorSpace)
    if (colorPartialAlias.components) {
      for (const comp of colorPartialAlias.components) {
        if (comp) refs.push(comp)
      }
    }

    // If all color references (colorSpace + components) point to the same token, use it as aliasOf
    if (refs.length > 0) {
      const uniqueRefs = [...new Set(refs)]
      if (uniqueRefs.length === 1) {
        transformedValue[INTERNAL_KEYS.ALIAS_OF] = uniqueRefs[0]
      }
    }
  }

  registerTransform(
    setTransform,
    token.id,
    JSON.stringify(transformedValue),
    input,
  )
}

/**
 * Transform DTCG tokens into Figma-compatible format.
 * Supports both resolver-based and non-resolver workflows.
 */
export default function transformFigmaJson({
  transform,
  options,
}: TransformOptions): void {
  const { setTransform, context, resolver, tokens } = transform

  const shouldExclude = createExcludeMatcher(options.exclude)

  // If no valid resolver config, use flat token map (fallback mode - no input)
  if (!hasValidResolverConfig(resolver)) {
    for (const token of Object.values(tokens)) {
      if (shouldExclude(token.id)) {
        continue
      }

      transformToken(
        token,
        token.$value,
        token.aliasOf,
        options,
        context,
        tokens,
        setTransform,
        // No input - uses legacy mode without resolver
      )
    }
    return
  }

  const permutations = resolver.listPermutations()

  // Process each permutation (context combination)
  for (const input of permutations) {
    const contextTokens = resolver.apply(input)

    for (const token of Object.values(contextTokens)) {
      if (shouldExclude(token.id)) {
        continue
      }

      transformToken(
        token,
        token.$value,
        token.aliasOf,
        options,
        context,
        contextTokens,
        setTransform,
        input,
      )
    }
  }
}
