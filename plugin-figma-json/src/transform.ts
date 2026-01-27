import type { TransformHookOptions, TokenNormalized } from '@terrazzo/parser';
import wcmatch from 'wildcard-match';
import { convertToken } from './converters/index.js';
import { type FigmaJsonPluginOptions, FORMAT_ID } from './lib.js';

export interface TransformOptions {
  transform: TransformHookOptions;
  options: FigmaJsonPluginOptions;
}

/**
 * Transform a single token and call setTransform.
 */
function transformToken(
  token: TokenNormalized,
  rawValue: unknown,
  aliasOf: string | undefined,
  options: FigmaJsonPluginOptions,
  context: TransformHookOptions['context'],
  allTokens: Record<string, TokenNormalized>,
  setTransform: TransformHookOptions['setTransform'],
  input: Record<string, string>
): void {
  // Allow custom transform to override
  const customValue = options.transform?.(token);
  if (customValue !== undefined) {
    setTransform(token.id, {
      format: FORMAT_ID,
      value: JSON.stringify(customValue),
      input,
    });
    return;
  }

  // Convert the token value (always resolve to final value)
  const result = convertToken(token, rawValue, {
    logger: context.logger,
    options,
    tokenId: token.id,
    extensions: token.$extensions,
    allTokens,
  });

  // Skip if converter indicates to skip
  if (result.skip) {
    return;
  }

  // Build the transformed token structure with resolved value
  const transformedValue: Record<string, unknown> = {
    $type: result.outputType ?? token.$type,
    $value: result.value,
  };
  if (token.$description) {
    transformedValue.$description = token.$description;
  }
  if (token.$extensions) {
    transformedValue.$extensions = token.$extensions;
  }

  // Store aliasOf for build step to create Figma aliasData extension
  // Figma wants resolved $value + aliasData extension for cross-collection references
  if (aliasOf) {
    // Use originalValue.$value to get the direct reference (not fully resolved chain)
    // e.g., "{dimension.size.height.baseline}" instead of "dimension.100"
    const originalValueStr = token.originalValue?.$value;
    let directAliasOf = aliasOf;
    if (typeof originalValueStr === 'string' && originalValueStr.startsWith('{') && originalValueStr.endsWith('}')) {
      directAliasOf = originalValueStr.slice(1, -1);
    }
    transformedValue._aliasOf = directAliasOf;
  }

  setTransform(token.id, {
    format: FORMAT_ID,
    value: JSON.stringify(transformedValue),
    input,
  });
}

/**
 * Transform DTCG tokens into Figma-compatible format.
 * Requires a resolver file - legacy mode is not supported.
 */
export default function transformFigmaJson({ transform, options }: TransformOptions): void {
  const { setTransform, context, resolver } = transform;

  // Require resolver
  if (!resolver?.source || !resolver.listPermutations) {
    return;
  }

  const permutations = resolver.listPermutations();

  // Create exclude matcher
  const shouldExclude = options.exclude?.length ? wcmatch(options.exclude) : () => false;

  // Process each permutation (context combination)
  for (const input of permutations) {
    const contextTokens = resolver.apply(input);

    for (const token of Object.values(contextTokens)) {
      if (shouldExclude(token.id)) {
        continue;
      }

      transformToken(
        token,
        token.$value,
        token.aliasOf,
        options,
        context,
        contextTokens,
        setTransform,
        input
      );
    }
  }
}
