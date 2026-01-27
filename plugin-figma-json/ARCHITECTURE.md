# Architecture

Terrazzo plugin that converts W3C DTCG design tokens to Figma-compatible JSON.

## Structure

```
src/
├── index.ts           # Plugin entry, registers transform + build hooks
├── lib.ts             # Types, constants, utilities
├── transform.ts       # Transform hook (DTCG → Figma conversion)
├── build.ts           # Build hook (output JSON, handle resolvers)
└── converters/
    ├── index.ts       # Converter registry & dispatcher
    ├── color.ts       # Color space conversion (→ sRGB)
    ├── dimension.ts   # Unit conversion (rem → px)
    ├── duration.ts    # Unit conversion (ms → s)
    ├── typography.ts  # Splits composite into sub-tokens
    ├── font-family.ts # Array → first string
    ├── font-weight.ts # Numeric (1-1000) or string alias
    └── number.ts      # Number + boolean extension support
```

## Data Flow

```
DTCG JSON → Terrazzo Parser → Transform Hook → Build Hook → Figma JSON
```

### Transform Phase (`transform.ts`)

1. Iterates token permutations (resolver sets + modifier contexts)
2. Applies custom transform if provided
3. Routes to type-specific converter
4. Handles split tokens (typography → sub-tokens)
5. Tracks alias info via internal metadata (`_aliasOf`, `_splitFrom`, `_tokenId`)
6. Registers transforms with Terrazzo

### Build Phase (`build.ts`)

1. Groups tokens by resolver source (set or modifier context)
2. Generates separate files per source:
   - `{set}.tokens.figma.json`
   - `{modifier}-{context}.tokens.figma.json`
3. Resolves aliases:
   - Same-file: `"{token.path}"` syntax
   - Cross-file: `$value` + `com.figma.aliasData` extension
4. Removes internal metadata, outputs JSON

## Converters

| Type | Input | Output | Notes |
|------|-------|--------|-------|
| color | Any color space | sRGB/HSL object | Gamut clips if needed |
| dimension | px/rem | px | rem × remBasePx |
| duration | s/ms | s | ms ÷ 1000 |
| typography | Composite | Split sub-tokens | fontFamily, fontSize, fontWeight, lineHeight, letterSpacing |
| fontFamily | String/array | String | Takes first, warns on fallbacks |
| fontWeight | Number/string | Number/string | 1-1000 or known alias |
| number | Number | Number/boolean | Boolean via `com.figma.type` extension |

Unsupported: shadow, border, gradient, transition, strokeStyle, cubicBezier

## Resolver Modes

**Resolver-based** (sets/modifiers defined):
- Multiple output files per source
- Cross-file alias handling via `com.figma.aliasData`

**Flat mode** (no resolver):
- Single output file
- Simple alias references

## Options

```typescript
{
  filename?: string;           // Default: "tokens.figma.json"
  exclude?: string[];          // Glob patterns to exclude
  transform?: (token) => any;  // Custom transform per token
  tokenName?: (token) => string; // Custom naming
  remBasePx?: number;          // Default: 16
  warnOnUnsupported?: boolean; // Default: true
  preserveReferences?: boolean; // Default: true
  skipBuild?: boolean;         // Skip file generation
}
```

## Key Utilities (`lib.ts`)

- `hasValidResolverConfig()` - Checks for user-defined sets/modifiers
- `buildDefaultInput()` - Creates input with default modifier values
- `removeInternalMetadata()` - Strips `_aliasOf`, `_splitFrom`, `_tokenId`
- `getPartialAliasOf()` - Extracts partial alias data from composite tokens
- Type guards: `isDTCGColorValue()`, `isDTCGDimensionValue()`, etc.

## Figma Extensions

- `com.figma.type` - Override variable type (e.g., "boolean")
- `com.figma.aliasData` - Cross-collection alias reference:
  - `targetVariableSetName` - Target set
  - `targetVariableName` - Path in slash notation

## Internal Metadata

Tracked during processing, removed before output:
- `_aliasOf` - Alias target token ID
- `_splitFrom` - Parent token for split sub-tokens
- `_tokenId` - Full ID of split sub-token
