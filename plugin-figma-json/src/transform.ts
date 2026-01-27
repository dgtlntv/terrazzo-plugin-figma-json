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
  transformParams: { mode?: string; input?: Record<string, string> }
): void {
  // Check if this token is an alias and we want to preserve references
  if (options.preserveReferences && aliasOf) {
    // Preserve the alias reference instead of the resolved value
    const aliasValue = `{${aliasOf}}`;
    const transformedValue: Record<string, unknown> = {
      $type: token.$type,
      $value: aliasValue,
    };
    if (token.$description) {
      transformedValue.$description = token.$description;
    }
    if (token.$extensions) {
      transformedValue.$extensions = token.$extensions;
    }

    setTransform(token.id, {
      format: FORMAT_ID,
      value: JSON.stringify(transformedValue),
      ...transformParams,
    });
    return;
  }

  // Allow custom transform to override
  const customValue = options.transform?.(token);
  if (customValue !== undefined) {
    setTransform(token.id, {
      format: FORMAT_ID,
      value: JSON.stringify(customValue),
      ...transformParams,
    });
    return;
  }

  // Convert the token value
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

  // Build the transformed token structure
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

  console.log(`[DEBUG transform] setTransform ${token.id}, params=${JSON.stringify(transformParams)}`);
  setTransform(token.id, {
    format: FORMAT_ID,
    value: JSON.stringify(transformedValue),
    ...transformParams,
  });
}

/**
 * Transform DTCG tokens into Figma-compatible format.
 */
export default function transformFigmaJson({ transform, options }: TransformOptions): void {
  const { tokens, setTransform, context, resolver } = transform;

  console.log(`[DEBUG transform] tokens count=${Object.keys(tokens).length}, resolver=${!!resolver}, resolver.source=${!!resolver?.source}, listPermutations=${!!resolver?.listPermutations}`);

  // Create exclude matcher
  const shouldExclude = options.exclude?.length ? wcmatch(options.exclude) : () => false;

  // Check if we're using a resolver with permutations
  if (resolver?.source && resolver.listPermutations) {
    const permutations = resolver.listPermutations();
    console.log(`[DEBUG transform] permutations count=${permutations.length}`);

    // Process each permutation (context combination)
    for (const input of permutations) {
      const contextTokens = resolver.apply(input);
      console.log(`[DEBUG transform] input=${JSON.stringify(input)}, contextTokens count=${Object.keys(contextTokens).length}`);

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
          { input }
        );
      }
    }
  } else {
    // Legacy mode-based processing
    for (const token of Object.values(tokens)) {
      if (shouldExclude(token.id)) {
        continue;
      }

      // Process each mode
      for (const [modeName, modeValue] of Object.entries(token.mode)) {
        const aliasOf = modeValue.aliasOf ?? token.aliasOf;

        transformToken(
          token,
          modeValue.$value,
          aliasOf,
          options,
          context,
          tokens,
          setTransform,
          { mode: modeName }
        );
      }
    }
  }
}
