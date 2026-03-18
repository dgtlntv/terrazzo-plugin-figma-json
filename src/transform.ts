import type { TokenNormalized, TransformHookOptions } from '@terrazzo/parser';
import { FORMAT_ID } from './constants.js';
import { convertToken } from './converters/index.js';
import type { FigmaJsonPluginOptions } from './types.js';
import { createExcludeMatcher, toFigmaLocalID } from './utils.js';

export interface TransformOptions {
  transform: TransformHookOptions;
  options: FigmaJsonPluginOptions;
}

/**
 * Transform a single token and register it via setTransform.
 * Handles custom transforms and composite tokens (via Record<string, string>).
 *
 * Alias resolution is deferred entirely to the build step, which has access to
 * the full TokenNormalized (including aliasOf, originalValue, partialAliasOf)
 * via the transform.token property on getTransforms() results.
 *
 * @param token - The normalized token from terrazzo parser
 * @param rawValue - The resolved token value
 * @param options - Plugin configuration options
 * @param context - Plugin hook context with logger
 * @param allTokens - Map of all tokens for validation
 * @param rawTokens - Original token map (from transform.tokens) — needed because
 *   resolver.apply() strips $extensions from tokens
 * @param setTransform - Terrazzo callback to register transformed value
 * @param input - Resolver input for this permutation
 * @returns void - Registers the transformed token via setTransform callback
 */
function transformToken(
  token: TokenNormalized,
  rawValue: unknown,
  options: FigmaJsonPluginOptions,
  context: TransformHookOptions['context'],
  allTokens: Record<string, TokenNormalized>,
  rawTokens: Record<string, TokenNormalized>,
  setTransform: TransformHookOptions['setTransform'],
  input: Record<string, string>,
): void {
  const localID = toFigmaLocalID(token.id);

  // Allow custom transform to override
  const customValue = options.transform?.(token);
  if (customValue !== undefined) {
    setTransform(token.id, { format: FORMAT_ID, localID, value: JSON.stringify(customValue), input });
    return;
  }

  // Look up $extensions from the raw token map — resolver.apply() strips extensions
  const rawToken = rawTokens[token.id];
  const extensions = rawToken?.$extensions ?? token.$extensions;

  // Convert the token value (always resolve to final value)
  const result = convertToken(token, rawValue, {
    logger: context.logger,
    options,
    tokenId: token.id,
    extensions,
    allTokens,
    originalValue: token.originalValue?.$value,
  });

  // Skip if converter indicates to skip
  if (result.skip) {
    return;
  }

  // Handle composite tokens (typography, shadow, border, gradient)
  // Pack sub-tokens into a Record<string, string> — Terrazzo's built-in mechanism
  // for tokens that store multiple values.
  if (result.split && result.subTokens) {
    const record: Record<string, string> = {};
    for (const subToken of result.subTokens) {
      record[subToken.idSuffix] = JSON.stringify({
        $type: subToken.$type,
        $value: subToken.value,
      });
    }
    setTransform(token.id, { format: FORMAT_ID, localID, value: record, input });
    return;
  }

  // Build the transformed token structure with resolved value
  const transformedValue = {
    $type: result.outputType ?? token.$type,
    $value: result.value,
  };

  setTransform(token.id, { format: FORMAT_ID, localID, value: JSON.stringify(transformedValue), input });
}

/**
 * Transform DTCG tokens into Figma-compatible format.
 * Uses the resolver to iterate all permutations and convert token values.
 *
 * @param options - Transform options containing the transform hook context and plugin options
 */
export default function transformFigmaJson({ transform, options }: TransformOptions): void {
  const { setTransform, context, resolver, tokens: rawTokens } = transform;

  const shouldExclude = createExcludeMatcher(options.exclude);

  const permutations = resolver.listPermutations();

  // Process each permutation (context combination)
  for (const input of permutations) {
    // Skip empty permutations — when there are no tokens, the resolver may
    // have an empty permutation that fails on apply()
    if (Object.keys(input).length === 0) {
      continue;
    }
    const contextTokens = resolver.apply(input);

    for (const token of Object.values(contextTokens)) {
      if (shouldExclude(token.id)) {
        continue;
      }

      transformToken(token, token.$value, options, context, contextTokens, rawTokens, setTransform, input);
    }
  }
}
