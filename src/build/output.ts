import type { TokenNormalized } from '@terrazzo/parser';
import type { FigmaJsonPluginOptions } from '../types.js';
import { parseTransformValue } from '../utils.js';
import { computeAliasTarget, computeSubTokenAliases, withAliasReference } from './aliases.js';
import { setNestedProperty, withTokenMetadata } from './helpers.js';
import type { ParsedTokenValue, SourceInfo } from './types.js';

/**
 * Process a single transform and place it in the output object.
 * Handles both simple tokens (string value) and composite tokens (Record<string, string> value).
 *
 * Alias resolution is computed from the token in the active resolver context.
 * Terrazzo's transform result keeps the base token metadata even when its value
 * is context-specific, so transform.token cannot be used for modifier aliases.
 *
 * Note: this intentionally mutates `output` via setNestedProperty for efficient
 * output tree construction.
 *
 * @param transform - The transform result containing the token and its transformed value
 * @param output - The mutable output object to place the token into (mutated in place)
 * @param sourceName - The current source/context name for alias resolution
 * @param tokenName - Optional custom function to control the output token name
 * @param tokenOutputPaths - Map of token IDs to their output paths
 * @param tokenSources - Map of token IDs to their source info for cross-file alias resolution
 * @param preserveReferences - Whether to preserve alias references in output
 * @param shouldExclude - Function to check if a token ID should be excluded
 * @param allTokens - Map of tokens in the active resolver context for composite alias resolution
 * @param contextToken - Token metadata from the active modifier context, when applicable
 */
export function processTransform(
  transform: {
    token: TokenNormalized;
    value: string | Record<string, string>;
  },
  output: Record<string, unknown>,
  sourceName: string,
  tokenName: FigmaJsonPluginOptions['tokenName'],
  tokenOutputPaths: Map<string, string>,
  tokenSources: Map<string, SourceInfo[]>,
  preserveReferences: boolean,
  shouldExclude: (id: string) => boolean,
  allTokens: Record<string, TokenNormalized> | undefined,
  contextToken: TokenNormalized = transform.token,
): void {
  const token = transform.token;
  const tokenId = token.id;

  if (shouldExclude(tokenId)) {
    return;
  }

  const outputName = tokenName?.(token) ?? tokenOutputPaths.get(tokenId) ?? tokenId;

  if (typeof transform.value === 'string') {
    // Simple token: parse value, compute alias from token metadata, add metadata
    const rawParsed = parseTransformValue(transform.value) as ParsedTokenValue | null;
    if (!rawParsed) {
      return;
    }

    // Compute the alias from the active resolver context. The transform token
    // may carry metadata from the default context even when its value does not.
    const aliasOf = computeAliasTarget(contextToken);

    let parsedValue = withTokenMetadata(rawParsed, token);

    if (aliasOf) {
      parsedValue = withAliasReference(parsedValue, {
        aliasOf,
        sourceName,
        tokenSources,
        tokenOutputPaths,
        preserveReferences,
      });
    }

    setNestedProperty(output, outputName, parsedValue);
  } else {
    // Composite token (Record<string, string>): expand sub-tokens into output
    const parentOutputPath = tokenOutputPaths.get(tokenId);

    // Compute sub-property aliases from the active resolver context.
    const subTokenSuffixes = Object.keys(transform.value);
    const subTokenAliases = computeSubTokenAliases(contextToken, subTokenSuffixes, allTokens);

    for (const [suffix, subValueStr] of Object.entries(transform.value)) {
      const rawSubParsed = parseTransformValue(subValueStr) as ParsedTokenValue | null;
      if (!rawSubParsed) {
        continue;
      }

      // Get alias for this sub-property from computed aliases
      const aliasOf = subTokenAliases.get(suffix);

      let subParsed = withTokenMetadata(rawSubParsed, token);

      if (aliasOf) {
        subParsed = withAliasReference(subParsed, {
          aliasOf,
          sourceName,
          tokenSources,
          tokenOutputPaths,
          preserveReferences,
        });
      }

      // Build sub-token output path: use parent's output path (preserves $root) + suffix
      let subOutputName: string;
      if (tokenName) {
        subOutputName = `${tokenName(token)}.${suffix}`;
      } else if (parentOutputPath && parentOutputPath !== tokenId) {
        subOutputName = `${parentOutputPath}.${suffix}`;
      } else {
        subOutputName = `${outputName}.${suffix}`;
      }

      setNestedProperty(output, subOutputName, subParsed);
    }
  }
}
