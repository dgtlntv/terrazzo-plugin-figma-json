import type { BuildHookOptions, Resolver } from '@terrazzo/parser';
import wcmatch from 'wildcard-match';
import { type FigmaJsonPluginOptions, FORMAT_ID } from './lib.js';

export interface BuildOptions {
  exclude: FigmaJsonPluginOptions['exclude'];
  tokenName?: FigmaJsonPluginOptions['tokenName'];
  getTransforms: BuildHookOptions['getTransforms'];
  splitByResolver?: FigmaJsonPluginOptions['splitByResolver'];
  resolver?: Resolver;
}

export interface BuildResult {
  /** Single output when splitting is disabled */
  single?: string;
  /** Multiple outputs when splitting is enabled, keyed by output name */
  split?: Map<string, string>;
}

/**
 * Set a nested property on an object using dot-notation path.
 */
function setNestedProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

/**
 * Convert a dot-notation token ID to Figma's slash notation.
 * E.g., "dimension.200" -> "dimension/200"
 */
function toFigmaVariableName(tokenId: string): string {
  return tokenId.replace(/\./g, '/');
}

/**
 * Extract token IDs from a resolver group (token definitions).
 * Recursively walks the group structure to find all token IDs.
 */
function extractTokenIds(group: Record<string, unknown>, prefix = ''): string[] {
  const ids: string[] = [];

  for (const [key, value] of Object.entries(group)) {
    // Skip $ properties (like $type, $description, $schema, etc.)
    if (key.startsWith('$')) {
      continue;
    }

    const currentPath = prefix ? `${prefix}.${key}` : key;

    // Check if this is a token (has $value)
    if (value && typeof value === 'object' && '$value' in value) {
      ids.push(currentPath);
    } else if (value && typeof value === 'object') {
      // Recurse into nested groups
      ids.push(...extractTokenIds(value as Record<string, unknown>, currentPath));
    }
  }

  return ids;
}

/**
 * Build default input from resolver's modifiers.
 */
function buildDefaultInput(resolverSource: NonNullable<Resolver['source']>): Record<string, string> {
  const input: Record<string, string> = {};
  if (resolverSource.modifiers) {
    for (const [modifierName, modifier] of Object.entries(resolverSource.modifiers)) {
      if (modifier.default) {
        input[modifierName] = modifier.default;
      }
    }
  }
  return input;
}

/**
 * Build the Figma-compatible JSON output from transformed tokens.
 * Requires a resolver file - legacy mode is not supported.
 */
export default function buildFigmaJson({
  getTransforms,
  exclude,
  tokenName,
  splitByResolver,
  resolver,
}: BuildOptions): BuildResult {
  // Create exclude matcher
  const shouldExclude = exclude?.length ? wcmatch(exclude) : () => false;

  // Require resolver
  if (!resolver?.source || !resolver.listPermutations) {
    return splitByResolver ? { split: new Map() } : { single: JSON.stringify({}, null, 2) };
  }

  const resolverSource = resolver.source;

  // Track which tokens belong to which sources (a token can appear in multiple contexts)
  type SourceInfo = { source: string; isModifier: boolean; modifierName?: string; contextName?: string };
  const tokenSources = new Map<string, SourceInfo[]>();

  // Helper to add a source for a token
  function addTokenSource(tokenId: string, info: SourceInfo) {
    if (!tokenSources.has(tokenId)) {
      tokenSources.set(tokenId, []);
    }
    tokenSources.get(tokenId)!.push(info);
  }

  // Helper to get the primary collection name for a token (prefers set over modifier)
  function getTokenCollection(tokenId: string): string | undefined {
    const sources = tokenSources.get(tokenId);
    if (!sources?.length) return undefined;
    // Prefer set source over modifier source
    const setSource = sources.find((s) => !s.isModifier);
    return setSource?.source ?? sources[0]?.source;
  }

  // Process sets - these tokens always appear in their set file
  if (resolverSource.sets) {
    for (const [setName, set] of Object.entries(resolverSource.sets)) {
      if (set.sources) {
        for (const source of set.sources) {
          const ids = extractTokenIds(source as Record<string, unknown>);
          for (const id of ids) {
            addTokenSource(id, { source: setName, isModifier: false });
          }
        }
      }
    }
  }

  // Process modifiers - these tokens go into context-specific files
  const allContexts = new Set<string>();

  if (resolverSource.modifiers) {
    for (const [modifierName, modifier] of Object.entries(resolverSource.modifiers)) {
      if (modifier.contexts) {
        for (const [contextName, contextSources] of Object.entries(modifier.contexts)) {
          const contextKey = `${modifierName}-${contextName}`;
          allContexts.add(contextKey);

          if (Array.isArray(contextSources)) {
            for (const source of contextSources) {
              const ids = extractTokenIds(source as Record<string, unknown>);
              for (const id of ids) {
                addTokenSource(id, {
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

  // Group outputs by source
  const outputBySource = new Map<string, Record<string, unknown>>();

  // Initialize empty outputs for all contexts (so empty files are created)
  for (const contextKey of allContexts) {
    outputBySource.set(contextKey, {});
  }

  // Get transforms using default input (for set tokens)
  const defaultInput = buildDefaultInput(resolverSource);
  const defaultTransforms = getTransforms({ format: FORMAT_ID, input: defaultInput });

  // Process set tokens using default transforms
  for (const transform of defaultTransforms) {
    const tokenId = transform.token.id;
    if (shouldExclude(tokenId)) continue;

    const sources = tokenSources.get(tokenId) ?? [];
    const setSource = sources.find((s) => !s.isModifier);
    if (!setSource) continue; // Skip tokens that aren't in a set

    const sourceName = setSource.source;
    if (!outputBySource.has(sourceName)) {
      outputBySource.set(sourceName, {});
    }

    const outputName = tokenName?.(transform.token) ?? tokenId;
    const parsedValue = typeof transform.value === 'string' ? JSON.parse(transform.value) : transform.value;
    setNestedProperty(outputBySource.get(sourceName)!, outputName, parsedValue);
  }

  // Process modifier context tokens
  // Group modifier tokens by their context
  const modifierTokensByContext = new Map<string, Set<string>>();

  for (const [tokenId, sources] of tokenSources) {
    for (const sourceInfo of sources) {
      if (!sourceInfo.isModifier) continue;

      const contextKey = sourceInfo.source;
      if (!modifierTokensByContext.has(contextKey)) {
        modifierTokensByContext.set(contextKey, new Set());
      }
      modifierTokensByContext.get(contextKey)!.add(tokenId);
    }
  }

  // For each context, get transforms with the appropriate input
  for (const [contextKey, tokenIds] of modifierTokensByContext) {
    // Find the source info for this context
    let contextInfo: SourceInfo | undefined;
    for (const tokenId of tokenIds) {
      const sources = tokenSources.get(tokenId);
      contextInfo = sources?.find((s) => s.source === contextKey);
      if (contextInfo) break;
    }

    if (!contextInfo?.modifierName || !contextInfo?.contextName) continue;

    // Build input for this context (start with defaults, override specific modifier)
    const input: Record<string, string> = { ...defaultInput };
    input[contextInfo.modifierName] = contextInfo.contextName;

    // Get transforms for this context
    const contextTransforms = getTransforms({ format: FORMAT_ID, input });

    if (!outputBySource.has(contextKey)) {
      outputBySource.set(contextKey, {});
    }

    // Add tokens for this context
    for (const tokenId of tokenIds) {
      if (shouldExclude(tokenId)) continue;

      // Find the transform for this token
      const transform = contextTransforms.find((t) => t.token.id === tokenId);
      if (!transform) continue;

      const outputName = tokenName?.(transform.token) ?? tokenId;
      const parsedValue = typeof transform.value === 'string' ? JSON.parse(transform.value) : transform.value;

      // Get aliasOf from the transformed value (set during transform step) or fall back to token
      const aliasOf = parsedValue._aliasOf ?? transform.token.aliasOf;

      // Add aliasData for cross-collection references if this is an alias
      if (aliasOf) {
        const targetCollection = getTokenCollection(aliasOf);
        if (targetCollection) {
          const extensions = parsedValue.$extensions ?? {};
          extensions['com.figma.aliasData'] = {
            targetVariableSetName: targetCollection,
            targetVariableName: toFigmaVariableName(aliasOf),
          };
          parsedValue.$extensions = extensions;
        }
      }

      // Remove internal _aliasOf before output
      delete parsedValue._aliasOf;

      setNestedProperty(outputBySource.get(contextKey)!, outputName, parsedValue);
    }
  }

  // Return split or single output
  if (splitByResolver) {
    const result = new Map<string, string>();
    for (const [sourceName, output] of outputBySource) {
      result.set(sourceName, JSON.stringify(output, null, 2));
    }
    return { split: result };
  }

  // Single file: merge all outputs
  const merged: Record<string, unknown> = {};
  for (const output of outputBySource.values()) {
    Object.assign(merged, output);
  }
  return { single: JSON.stringify(merged, null, 2) };
}
