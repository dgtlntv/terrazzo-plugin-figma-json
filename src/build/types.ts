import type { BuildHookOptions, Resolver } from '@terrazzo/parser';
import type { FigmaJsonPluginOptions } from '../types.js';

/**
 * Options for the build function.
 */
export interface BuildOptions {
  exclude: FigmaJsonPluginOptions['exclude'];
  tokenName?: FigmaJsonPluginOptions['tokenName'];
  getTransforms: BuildHookOptions['getTransforms'];
  preserveReferences?: FigmaJsonPluginOptions['preserveReferences'];
  resolver: Resolver;
}

/**
 * Token source tracking info — records which resolver set or modifier context
 * a token belongs to.
 */
export interface SourceInfo {
  source: string;
  isModifier: boolean;
  modifierName?: string;
  contextName?: string;
}

/**
 * Token ID info including the output path (which may differ from the
 * normalized ID due to $root renaming).
 */
export interface TokenIdInfo {
  id: string;
  outputPath: string;
}

/**
 * Options for alias reference resolution.
 */
export interface AliasReferenceOptions {
  aliasOf: string;
  sourceName: string;
  tokenSources: Map<string, SourceInfo[]>;
  tokenOutputPaths: Map<string, string>;
  preserveReferences: boolean;
}

/**
 * Figma extensions object shape for build output.
 */
export interface FigmaOutputExtensions {
  'com.figma.type'?: string;
  'com.figma.aliasData'?: {
    targetVariableSetName: string;
    targetVariableName: string;
  };
  [key: string]: unknown;
}

/**
 * Shape of a parsed transform value after JSON.parse.
 */
export interface ParsedTokenValue {
  $type: string;
  $value: unknown;
  $description?: string;
  $extensions?: FigmaOutputExtensions;
}

/**
 * Result of building token source maps from a resolver.
 */
export interface TokenSourceMaps {
  tokenSources: Map<string, SourceInfo[]>;
  tokenOutputPaths: Map<string, string>;
  allContexts: Set<string>;
}
