import type { TokenNormalized, TransformHookOptions } from '@terrazzo/parser';
import { FORMAT_ID, PLUGIN_NAME } from './constants.js';
import { convertToken } from './converters/index.js';
import type { FigmaJsonPluginOptions } from './types.js';
import { createExcludeMatcher, getDefaultInput, toFigmaLocalID } from './utils.js';

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
 * Collect the minimal set of resolver inputs that the build step will query.
 *
 * The build step requests transforms for:
 *   1. The default input (first permutation — all modifier defaults)
 *   2. One input per individual modifier context (default + one override)
 *
 * This avoids the cartesian-product explosion from listPermutations().
 * For example, 8 modifiers with ~4 contexts each produce ~40k full
 * permutations but only ~30 targeted inputs.
 */
function collectBuildInputs(resolver: TransformHookOptions['resolver']): Record<string, string>[] {
  const defaultInput: Record<string, string> = getDefaultInput(resolver);
  const inputs: Record<string, string>[] = [defaultInput];

  const resolverSource = resolver.source;
  if (!resolverSource?.modifiers) {
    return inputs;
  }

  for (const [modifierName, modifier] of Object.entries(resolverSource.modifiers)) {
    if (!modifier.contexts) {
      continue;
    }
    // Skip the auto-generated tzMode modifier with only "." context
    if (modifierName === 'tzMode') {
      const contextNames = Object.keys(modifier.contexts);
      if (contextNames.length === 1 && contextNames[0] === '.') {
        continue;
      }
    }
    for (const contextName of Object.keys(modifier.contexts)) {
      // Skip if this is already the default value for this modifier
      if ( contextName === modifier.default) {
        continue;
      }
      inputs.push({ ...defaultInput, [modifierName]: contextName });
    }
  }

  return inputs;
}

/**
 * Transform DTCG tokens into Figma-compatible format.
 *
 * Only iterates the minimal set of resolver inputs that the build step
 * will actually query (default + one per modifier context), avoiding
 * the combinatorial explosion of the full permutation set.
 *
 * @param options - Transform options containing the transform hook context and plugin options
 */
export default function transformFigmaJson({ transform, options }: TransformOptions): void {
  const { setTransform, context, resolver, tokens: rawTokens } = transform;

  const shouldExclude = createExcludeMatcher(options.exclude);

  const inputs = collectBuildInputs(resolver);

  for (const input of inputs) {
    if (Object.keys(input).length === 0) {
      continue;
    }

    const contextTokens = resolver.apply(input);

    for (const token of Object.values(contextTokens)) {
      if (shouldExclude(token.id)) {
        continue;
      }

      // Skip tokens that only exist in this modifier context but not in the
      // base token set.  Terrazzo's setTransform() validates against the base
      // set and throws a fatal error for unknown IDs.
      if (!(token.id in rawTokens)) {
        context.logger.warn({
          group: 'plugin',
          label: PLUGIN_NAME,
          message: `Token "${token.id}" exists only in a non-default modifier context and is not present in the base token set. Skipping — Terrazzo does not support setTransform() for context-only tokens.`,
        });
        continue;
      }

      transformToken(token, token.$value, options, context, contextTokens, rawTokens, setTransform, input);
    }
  }
}
