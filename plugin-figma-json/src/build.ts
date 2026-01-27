import type { BuildHookOptions, Resolver } from '@terrazzo/parser';
import wcmatch from 'wildcard-match';
import {
  buildDefaultInput,
  type FigmaJsonPluginOptions,
  FORMAT_ID,
  hasValidResolverConfig,
  removeInternalMetadata,
} from './lib.js';

export interface BuildOptions {
  exclude: FigmaJsonPluginOptions['exclude'];
  tokenName?: FigmaJsonPluginOptions['tokenName'];
  getTransforms: BuildHookOptions['getTransforms'];
  preserveReferences?: FigmaJsonPluginOptions['preserveReferences'];
  resolver?: Resolver;
}

/**
 * Set a nested property on an object using dot-notation path.
 * Creates intermediate objects as needed.
 *
 * @param obj - The object to modify
 * @param path - Dot-notation path (e.g., "color.primary.base")
 * @param value - The value to set at the path
 *
 * @example
 * const obj = {};
 * setNestedProperty(obj, "color.primary", { $value: "#ff0000" });
 * // obj = { color: { primary: { $value: "#ff0000" } } }
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
 *
 * @param tokenId - Token ID in dot notation
 * @returns Token ID in slash notation for Figma
 *
 * @example
 * toFigmaVariableName("dimension.200") // "dimension/200"
 * toFigmaVariableName("color.primary.base") // "color/primary/base"
 */
function toFigmaVariableName(tokenId: string): string {
  return tokenId.replace(/\./g, '/');
}

/**
 * Convert $root in a token ID to root for Figma compatibility.
 * DTCG uses $root for default values, but Figma doesn't support $ in names.
 *
 * @param path - Token path that may contain $root
 * @returns Path with $root replaced by root
 *
 * @example
 * normalizeRootInPath("color.border.warning.$root") // "color.border.warning.root"
 * normalizeRootInPath("color.primary") // "color.primary" (unchanged)
 */
function normalizeRootInPath(path: string): string {
  return path.replace(/\.\$root\b/g, '.root');
}

/**
 * Token source tracking info.
 */
type SourceInfo = { source: string; isModifier: boolean; modifierName?: string; contextName?: string };

interface HandleAliasReferenceOptions {
  parsedValue: Record<string, unknown>;
  aliasOf: string;
  sourceName: string;
  tokenSources: Map<string, SourceInfo[]>;
  tokenOutputPaths: Map<string, string>;
  preserveReferences: boolean;
}

/**
 * Handle alias references by setting the appropriate $value or $extensions.
 * Mutates parsedValue in place.
 *
 * - Same-file references: Sets $value to curly brace syntax (e.g., "{color.primary}")
 * - Cross-file references: Keeps resolved $value and adds com.figma.aliasData extension
 *
 * The function checks for target token in this order:
 * 1. Current context (same-file reference)
 * 2. Set sources only (cross-file reference to primitive/semantic sets)
 * 3. Never references other modifier contexts (e.g., dark won't reference light)
 *
 * @param options - Configuration for alias handling
 * @param options.parsedValue - Token value object to modify (mutated)
 * @param options.aliasOf - Target token ID this token references
 * @param options.sourceName - Name of the current output file/collection
 * @param options.tokenSources - Map of token IDs to their source info
 * @param options.tokenOutputPaths - Map of token IDs to their output paths
 * @param options.preserveReferences - Whether to preserve references (false = no-op)
 */
function handleAliasReference({
  parsedValue,
  aliasOf,
  sourceName,
  tokenSources,
  tokenOutputPaths,
  preserveReferences,
}: HandleAliasReferenceOptions): void {
  if (!preserveReferences || !aliasOf) {
    return;
  }

  // Normalize aliasOf to remove $root for lookups (terrazzo uses normalized IDs)
  const normalizedAliasOf = aliasOf.replace(/\.\$root\b/g, '');
  // Get target's output path, or normalize $root -> root in the original aliasOf
  const targetOutputPath = tokenOutputPaths.get(normalizedAliasOf) ?? normalizeRootInPath(aliasOf);

  // Find the target token's sources, handling split sub-tokens by looking up parent
  let targetSources = tokenSources.get(normalizedAliasOf);
  if (!targetSources) {
    // Try parent tokens for split sub-tokens (e.g., "typography.heading.fontFamily")
    const parts = normalizedAliasOf.split('.');
    while (parts.length > 1 && !targetSources) {
      parts.pop();
      targetSources = tokenSources.get(parts.join('.'));
    }
  }

  if (!targetSources?.length) {
    // Target token not found in any source - leave value as-is
    return;
  }

  // Check if target exists in current source (same-file reference)
  const inCurrentSource = targetSources.some((s) => s.source === sourceName);
  if (inCurrentSource) {
    // Same file reference: use curly brace syntax
    parsedValue.$value = `{${targetOutputPath}}`;
    return;
  }

  // Check for SET sources only (not modifier contexts)
  // We never want to reference other modifier contexts (e.g., dark shouldn't reference light)
  const setSource = targetSources.find((s) => !s.isModifier);
  if (setSource) {
    // Cross-file reference to a set: use resolved value + aliasData
    const extensions = (parsedValue.$extensions ?? {}) as Record<string, unknown>;
    extensions['com.figma.aliasData'] = {
      targetVariableSetName: setSource.source,
      targetVariableName: toFigmaVariableName(targetOutputPath),
    };
    parsedValue.$extensions = extensions;
  }
}

/**
 * Token ID info including whether it came from a $root key.
 */
interface TokenIdInfo {
  /** The normalized token ID (without $root, as terrazzo uses) */
  id: string;
  /** The output path (with $root preserved for proper JSON structure) */
  outputPath: string;
}

/**
 * Extract token IDs from a resolver group (token definitions).
 * Recursively walks the group structure to find all token IDs.
 *
 * Handles $root tokens specially per DTCG spec:
 * - Token ID uses parent path (e.g., "color.primary" for "color.primary.$root")
 * - Output path uses "root" without $ for Figma compatibility
 *
 * @param group - Object containing token definitions or nested groups
 * @param prefix - Current path prefix for recursion
 * @returns Array of token ID info with both normalized ID and output path
 *
 * @example
 * extractTokenIds({ color: { primary: { $value: "#ff0000" } } })
 * // [{ id: "color.primary", outputPath: "color.primary" }]
 */
function extractTokenIds(group: Record<string, unknown>, prefix = ''): TokenIdInfo[] {
  const ids: TokenIdInfo[] = [];

  for (const [key, value] of Object.entries(group)) {
    // Skip $ properties (like $type, $description, $schema, etc.)
    // But handle $root specially
    if (key.startsWith('$') && key !== '$root') {
      continue;
    }

    // Build paths:
    // - normalizedPath: what terrazzo uses as the token ID (no $root)
    // - outputPath: what we output to JSON (uses "root" without $ for Figma compatibility)
    const outputKey = key === '$root' ? 'root' : key;
    const outputPath = prefix ? `${prefix}.${outputKey}` : outputKey;
    const normalizedPath = key === '$root' ? prefix : outputPath;

    // Check if this is a token (has $value)
    if (value && typeof value === 'object' && '$value' in value) {
      // Only add if we have a valid normalized path
      if (normalizedPath) {
        ids.push({ id: normalizedPath, outputPath });
      }
      // $root is always a leaf token, don't recurse
      // Regular tokens with $value are also leaves
    } else if (value && typeof value === 'object') {
      // Recurse into nested groups (only for non-token objects)
      ids.push(...extractTokenIds(value as Record<string, unknown>, outputPath));
    }
  }

  return ids;
}


/**
 * Build the Figma-compatible JSON output from transformed tokens.
 * Requires a resolver file - legacy mode is not supported.
 * Always returns output split by resolver structure (sets and modifier contexts).
 *
 * @returns Map of output name to JSON string (e.g., "primitive" -> "{...}")
 */
export default function buildFigmaJson({
  getTransforms,
  exclude,
  tokenName,
  preserveReferences = true,
  resolver,
}: BuildOptions): Map<string, string> {
  // Create exclude matcher
  const shouldExclude = exclude?.length ? wcmatch(exclude) : () => false;

  // When no valid resolver config, fall back to single output under "default" key
  if (!hasValidResolverConfig(resolver)) {
    // Get all transforms without resolver context
    const transforms = getTransforms({ format: FORMAT_ID });
    if (transforms.length === 0) {
      return new Map();
    }

    const output: Record<string, unknown> = {};
    for (const transform of transforms) {
      if (!transform.token) continue;

      const tokenId = transform.token.id;
      if (shouldExclude(tokenId)) continue;

      const outputName = tokenName?.(transform.token) ?? tokenId;
      const parsedValue = typeof transform.value === 'string' ? JSON.parse(transform.value) : transform.value;

      removeInternalMetadata(parsedValue);
      setNestedProperty(output, outputName, parsedValue);
    }

    const result = new Map<string, string>();
    result.set('default', JSON.stringify(output, null, 2));
    return result;
  }

  const resolverSource = resolver!.source!;

  // Track which tokens belong to which sources (a token can appear in multiple contexts)
  const tokenSources = new Map<string, SourceInfo[]>();

  // Track the output path for each token ID (to preserve $root in output)
  const tokenOutputPaths = new Map<string, string>();

  // Helper to add a source for a token
  function addTokenSource(tokenId: string, outputPath: string, info: SourceInfo) {
    if (!tokenSources.has(tokenId)) {
      tokenSources.set(tokenId, []);
    }
    tokenSources.get(tokenId)!.push(info);
    // Store output path (first one wins if there are duplicates)
    if (!tokenOutputPaths.has(tokenId)) {
      tokenOutputPaths.set(tokenId, outputPath);
    }
  }

  // Process sets - these tokens always appear in their set file
  if (resolverSource.sets) {
    for (const [setName, set] of Object.entries(resolverSource.sets)) {
      if (set.sources) {
        for (const source of set.sources) {
          const tokenInfos = extractTokenIds(source as Record<string, unknown>);
          for (const { id, outputPath } of tokenInfos) {
            addTokenSource(id, outputPath, { source: setName, isModifier: false });
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
    const parsedValue = typeof transform.value === 'string' ? JSON.parse(transform.value) : transform.value;

    // Handle split sub-tokens (e.g., typography.text.primary.fontFamily)
    // These don't have a token object but have _splitFrom metadata
    let tokenId: string;
    let outputName: string;
    let aliasOf: string | undefined;
    let sourceLookupId: string;

    if (transform.token) {
      tokenId = transform.token.id;
      // Use tracked output path (preserves $root) if no custom tokenName
      outputName = tokenName?.(transform.token) ?? tokenOutputPaths.get(tokenId) ?? tokenId;
      aliasOf = parsedValue._aliasOf ?? transform.token.aliasOf;
      sourceLookupId = tokenId;
    } else if (parsedValue._splitFrom && parsedValue._tokenId) {
      // Split sub-token: use parent's source
      tokenId = parsedValue._tokenId;
      // For split tokens, replace parent ID with parent's output path in the token ID
      const parentId = parsedValue._splitFrom;
      const parentOutputPath = tokenOutputPaths.get(parentId);
      if (parentOutputPath && parentOutputPath !== parentId) {
        // Replace parent ID prefix with parent output path (to preserve $root)
        outputName = parentOutputPath + tokenId.slice(parentId.length);
      } else {
        outputName = tokenId;
      }
      aliasOf = parsedValue._aliasOf;
      sourceLookupId = parentId; // Look up source using parent token ID
    } else {
      // Unknown transform without token - skip
      continue;
    }

    if (shouldExclude(tokenId)) continue;

    const sources = tokenSources.get(sourceLookupId) ?? [];
    const setSource = sources.find((s) => !s.isModifier);
    if (!setSource) continue; // Skip tokens that aren't in a set

    const sourceName = setSource.source;
    if (!outputBySource.has(sourceName)) {
      outputBySource.set(sourceName, {});
    }

    // Get aliasOf from the transformed value or token (already set above)

    // Handle alias references based on preserveReferences setting
    if (aliasOf) {
      handleAliasReference({
        parsedValue,
        aliasOf,
        sourceName,
        tokenSources,
        tokenOutputPaths,
        preserveReferences,
      });
    }

    removeInternalMetadata(parsedValue);
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

      // Find the transform for this token (skip transforms without tokens - synthetic sub-tokens)
      const transform = contextTransforms.find((t) => t.token?.id === tokenId);
      if (!transform) continue;

      // Use tracked output path (preserves $root) if no custom tokenName
      const outputName = tokenName?.(transform.token) ?? tokenOutputPaths.get(tokenId) ?? tokenId;
      const parsedValue = typeof transform.value === 'string' ? JSON.parse(transform.value) : transform.value;

      // Get aliasOf from the transformed value (set during transform step) or fall back to token
      const aliasOf = parsedValue._aliasOf ?? transform.token.aliasOf;

      // Handle alias references based on preserveReferences setting
      if (aliasOf) {
        handleAliasReference({
          parsedValue,
          aliasOf,
          sourceName: contextKey,
          tokenSources,
          tokenOutputPaths,
          preserveReferences,
        });
      }

      removeInternalMetadata(parsedValue);
      setNestedProperty(outputBySource.get(contextKey)!, outputName, parsedValue);
    }
  }

  // Return split output by source
  const result = new Map<string, string>();
  for (const [sourceName, output] of outputBySource) {
    result.set(sourceName, JSON.stringify(output, null, 2));
  }
  return result;
}
