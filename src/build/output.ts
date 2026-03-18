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
 * Alias resolution is computed here from the token metadata (transform.token)
 * rather than from embedded internal metadata in the value.
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
 * @param allTokens - Map of all tokens for composite alias resolution
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

    // Compute alias from the token itself
    const aliasOf = computeAliasTarget(token);

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

    // Compute alias targets for all sub-properties from the token metadata
    const subTokenSuffixes = Object.keys(transform.value);
    const subTokenAliases = computeSubTokenAliases(token, subTokenSuffixes, allTokens);

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
