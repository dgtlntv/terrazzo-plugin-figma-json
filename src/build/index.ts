import type { TokenNormalized } from '@terrazzo/parser';
import { FORMAT_ID } from '../constants.js';
import { createExcludeMatcher } from '../utils.js';
import { getDefaultInput, isDefaultResolver } from './helpers.js';
import { processTransform } from './output.js';
import { buildTokenSourceMaps } from './source-maps.js';
import type { BuildOptions, SourceInfo } from './types.js';

export type { BuildOptions } from './types.js';

/**
 * Build the Figma-compatible JSON output from transformed tokens.
 * Uses the resolver to determine output file structure.
 *
 * @param options - Build options including getTransforms, exclude patterns, tokenName, preserveReferences, and resolver
 * @returns Map of output name to JSON string (e.g., "primitive" → "{...}", "default" for single-file output)
 */
export default function buildFigmaJson({
  getTransforms,
  exclude,
  tokenName,
  preserveReferences = true,
  resolver,
}: BuildOptions): Map<string, string> {
  const shouldExclude = createExcludeMatcher(exclude);
  const resolverSource = resolver.source;

  if (!resolverSource) {
    return new Map();
  }

  // Build maps tracking token sources and output paths
  const { tokenSources, tokenOutputPaths, allContexts } = buildTokenSourceMaps(resolverSource);

  // Build a combined token map for alias resolution in composite tokens
  const defaultInput = getDefaultInput(resolver);
  const defaultTokens: Record<string, TokenNormalized> | undefined = (() => {
    try {
      return resolver.apply(defaultInput);
    } catch {
      return undefined;
    }
  })();

  // Group outputs by source
  const outputBySource = new Map<string, Record<string, unknown>>();

  // Initialize empty outputs for all contexts
  for (const contextKey of allContexts) {
    outputBySource.set(contextKey, {});
  }

  // Get transforms using default input (for set tokens)
  const defaultTransforms = getTransforms({
    format: FORMAT_ID,
    input: defaultInput,
  });

  // Process set tokens using default transforms
  for (const transform of defaultTransforms) {
    if (!transform.token) {
      continue;
    }

    const tokenId = transform.token.id;
    const sources = tokenSources.get(tokenId) ?? [];
    const setSource = sources.find((s) => !s.isModifier);
    if (!setSource) {
      continue;
    }

    const sourceName = setSource.source;
    let sourceOutput = outputBySource.get(sourceName);
    if (!sourceOutput) {
      sourceOutput = {};
      outputBySource.set(sourceName, sourceOutput);
    }

    processTransform(
      transform,
      sourceOutput,
      sourceName,
      tokenName,
      tokenOutputPaths,
      tokenSources,
      preserveReferences,
      shouldExclude,
      defaultTokens,
    );
  }

  // Process modifier context tokens
  const modifierTokensByContext = new Map<string, Set<string>>();

  for (const [tokenId, sources] of tokenSources) {
    for (const sourceInfo of sources) {
      if (!sourceInfo.isModifier) {
        continue;
      }

      const contextKey = sourceInfo.source;
      const existing = modifierTokensByContext.get(contextKey);
      if (existing) {
        existing.add(tokenId);
      } else {
        modifierTokensByContext.set(contextKey, new Set([tokenId]));
      }
    }
  }

  for (const [contextKey, tokenIds] of modifierTokensByContext) {
    let contextInfo: SourceInfo | undefined;
    for (const tokenId of tokenIds) {
      const sources = tokenSources.get(tokenId);
      contextInfo = sources?.find((s) => s.source === contextKey);
      if (contextInfo) {
        break;
      }
    }

    if (!contextInfo?.modifierName || !contextInfo?.contextName) {
      continue;
    }

    const input: Record<string, string> = { ...defaultInput };
    input[contextInfo.modifierName] = contextInfo.contextName;

    const contextTransforms = getTransforms({ format: FORMAT_ID, input });

    // Build context-specific token map for alias resolution
    const contextTokens: Record<string, TokenNormalized> | undefined = (() => {
      try {
        return resolver.apply(input);
      } catch {
        return undefined;
      }
    })();

    let contextOutput = outputBySource.get(contextKey);
    if (!contextOutput) {
      contextOutput = {};
      outputBySource.set(contextKey, contextOutput);
    }

    for (const tokenId of tokenIds) {
      if (shouldExclude(tokenId)) {
        continue;
      }

      const transform = contextTransforms.find((t) => t.token?.id === tokenId);
      if (!transform?.token) {
        continue;
      }

      processTransform(
        transform,
        contextOutput,
        contextKey,
        tokenName,
        tokenOutputPaths,
        tokenSources,
        preserveReferences,
        shouldExclude,
        contextTokens,
      );
    }
  }

  // For the default resolver (allTokens only), rename to "default" for index.ts mapping
  if (isDefaultResolver(resolverSource)) {
    const allTokensOutput = outputBySource.get('allTokens');
    if (allTokensOutput) {
      outputBySource.delete('allTokens');
      outputBySource.set('default', allTokensOutput);
    }
  }

  // Return split output by source
  const result = new Map<string, string>();
  for (const [sourceName, output] of outputBySource) {
    result.set(sourceName, JSON.stringify(output, null, 2));
  }
  return result;
}
