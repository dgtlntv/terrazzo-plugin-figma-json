import type { Resolver } from '@terrazzo/parser';
import type { SourceInfo, TokenIdInfo, TokenSourceMaps } from './types.js';

/**
 * Extract token IDs from a resolver group (token definitions).
 * Recursively walks the group structure to find all token IDs.
 *
 * @param group - The resolver group object containing nested token definitions
 * @param prefix - Dot-notation prefix for building full token paths (used in recursion)
 * @returns Array of token ID info objects with normalized IDs and output paths
 */
export function extractTokenIds(group: Record<string, unknown>, prefix = ''): TokenIdInfo[] {
  const ids: TokenIdInfo[] = [];

  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$') && key !== '$root') {
      continue;
    }

    const outputKey = key === '$root' ? 'root' : key;
    const outputPath = prefix ? `${prefix}.${outputKey}` : outputKey;
    const normalizedPath = key === '$root' ? prefix : outputPath;

    if (value && typeof value === 'object' && '$value' in value) {
      if (normalizedPath) {
        ids.push({ id: normalizedPath, outputPath });
      }
    } else if (value && typeof value === 'object') {
      ids.push(...extractTokenIds(value as Record<string, unknown>, outputPath));
    }
  }

  return ids;
}

/**
 * Build maps tracking which tokens belong to which sources.
 * Processes both sets and modifier contexts from the resolver source.
 *
 * @param resolverSource - The resolver source configuration containing sets and modifiers
 * @returns Token source maps with tokenSources, tokenOutputPaths, and allContexts
 */
export function buildTokenSourceMaps(resolverSource: NonNullable<Resolver['source']>): TokenSourceMaps {
  const tokenSources = new Map<string, SourceInfo[]>();
  const tokenOutputPaths = new Map<string, string>();
  const allContexts = new Set<string>();

  function addTokenSource(tokenId: string, outputPath: string, info: SourceInfo) {
    const existing = tokenSources.get(tokenId);
    if (existing) {
      existing.push(info);
    } else {
      tokenSources.set(tokenId, [info]);
    }
    if (!tokenOutputPaths.has(tokenId)) {
      tokenOutputPaths.set(tokenId, outputPath);
    }
  }

  // Process sets
  if (resolverSource.sets) {
    for (const [setName, set] of Object.entries(resolverSource.sets)) {
      if (set.sources) {
        for (const source of set.sources) {
          const tokenInfos = extractTokenIds(source as Record<string, unknown>);
          for (const { id, outputPath } of tokenInfos) {
            addTokenSource(id, outputPath, {
              source: setName,
              isModifier: false,
            });
          }
        }
      }
    }
  }

  // Process modifiers (skip auto-generated tzMode with "." context)
  if (resolverSource.modifiers) {
    for (const [modifierName, modifier] of Object.entries(resolverSource.modifiers)) {
      if (modifier.contexts) {
        // Skip the auto-generated tzMode modifier
        if (modifierName === 'tzMode') {
          const contextNames = Object.keys(modifier.contexts);
          if (contextNames.length === 1 && contextNames[0] === '.') {
            continue;
          }
        }

        for (const [contextName, contextSources] of Object.entries(modifier.contexts)) {
          const contextKey = `${modifierName}-${contextName}`;
          allContexts.add(contextKey);

          if (Array.isArray(contextSources)) {
            for (const source of contextSources) {
              const tokenInfos = extractTokenIds(source as Record<string, unknown>);
              for (const { id, outputPath } of tokenInfos) {
                addTokenSource(id, outputPath, {
                  source: contextKey,
                  isModifier: true,
                  modifierName,
                  contextName,
                });
              }
            }
          }
        }
      }
    }
  }

  return { tokenSources, tokenOutputPaths, allContexts };
}
