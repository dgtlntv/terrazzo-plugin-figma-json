import type { TransformHookOptions, TokenNormalized } from '@terrazzo/parser';
import wcmatch from 'wildcard-match';
import { convertToken } from './converters/index.js';
import { type FigmaJsonPluginOptions, FORMAT_ID, type TokenExtensions } from './lib.js';

export interface TransformOptions {
  transform: TransformHookOptions;
  options: FigmaJsonPluginOptions;
}

/**
 * Filter extensions to only include Figma-specific ones (com.figma.*).
 * Returns undefined if no Figma extensions exist.
 */
function filterFigmaExtensions(extensions: TokenExtensions | undefined): TokenExtensions | undefined {
  if (!extensions) return undefined;

  const figmaExtensions: TokenExtensions = {};
  let hasFigmaExtensions = false;

  for (const [key, value] of Object.entries(extensions)) {
    if (key.startsWith('com.figma')) {
      figmaExtensions[key] = value;
      hasFigmaExtensions = true;
    }
  }

  return hasFigmaExtensions ? figmaExtensions : undefined;
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

  const partialAliasOf = (token as { partialAliasOf?: Record<string, string | undefined> }).partialAliasOf;

  // Convert the token value (always resolve to final value)
  const result = convertToken(token, rawValue, {
    logger: context.logger,
    options,
    tokenId: token.id,
    extensions: token.$extensions,
    allTokens,
    originalValue: token.originalValue?.$value,
    partialAliasOf,
  });

  // Skip if converter indicates to skip
  if (result.skip) {
    return;
  }

  // Handle split tokens (e.g., typography)
  if (result.split && result.subTokens) {
    for (const subToken of result.subTokens) {
      const subId = `${token.id}.${subToken.idSuffix}`;
      const transformedValue: Record<string, unknown> = {
        $type: subToken.$type,
        $value: subToken.value,
        // Include metadata for build phase to identify split sub-tokens
        _splitFrom: token.id, // Parent token ID for source lookup
        _tokenId: subId, // This sub-token's ID
      };
      // Preserve alias reference for sub-token if it was a reference
      if (subToken.aliasOf) {
        transformedValue._aliasOf = subToken.aliasOf;
      }
      if (token.$description) {
        transformedValue.$description = token.$description;
      }
      const subTokenFigmaExtensions = filterFigmaExtensions(token.$extensions);
      if (subTokenFigmaExtensions) {
        transformedValue.$extensions = subTokenFigmaExtensions;
      }
      setTransform(subId, {
        format: FORMAT_ID,
        value: JSON.stringify(transformedValue),
        input,
      });
    }
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
  const figmaExtensions = filterFigmaExtensions(token.$extensions);
  if (figmaExtensions) {
    transformedValue.$extensions = figmaExtensions;
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
  } else if (token.$type === 'color' && partialAliasOf) {
    // For colors without a direct alias, check if all components reference the same token
    // This handles JSON pointer references like { "$ref": "#/color/palette/white/$value/colorSpace" }
    const colorPartialAlias = partialAliasOf as {
      colorSpace?: string;
      components?: (string | undefined)[];
      alpha?: string;
    };

    // Collect all non-undefined references
    const refs: string[] = [];
    if (colorPartialAlias.colorSpace) refs.push(colorPartialAlias.colorSpace);
    if (colorPartialAlias.components) {
      for (const comp of colorPartialAlias.components) {
        if (comp) refs.push(comp);
      }
    }
    // Note: we don't include alpha in the "same token" check since it often references
    // a different token (like number.opacity.backdrop)

    // If all color references (colorSpace + components) point to the same token, use it as aliasOf
    if (refs.length > 0) {
      const uniqueRefs = [...new Set(refs)];
      if (uniqueRefs.length === 1) {
        transformedValue._aliasOf = uniqueRefs[0];
      }
    }
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
