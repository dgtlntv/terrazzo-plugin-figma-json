# terrazzo-plugin-figma-json

A [Terrazzo](https://terrazzo.app) plugin that converts W3C DTCG design tokens into Figma-compatible JSON format for import into Figma Variables.

## Installation

```bash
npm install terrazzo-plugin-figma-json
# or
pnpm add terrazzo-plugin-figma-json
```

## Basic Usage

Add the plugin to your `terrazzo.config.ts`:

```typescript
import { defineConfig } from "@terrazzo/cli";
import figmaJson from "terrazzo-plugin-figma-json";

export default defineConfig({
  outDir: "./tokens/",
  plugins: [
    figmaJson({
      filename: "tokens.figma.json",
    }),
  ],
});
```

Run the Terrazzo build:

```bash
npx tz build
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filename` | `string` | `"tokens.figma.json"` | Output filename (used as suffix when using resolver) |
| `exclude` | `string[]` | `[]` | Glob patterns to exclude tokens from output |
| `transform` | `(token) => unknown` | `undefined` | Custom transform function to override token values |
| `tokenName` | `(token) => string` | `undefined` | Custom function to control token names in output |
| `skipBuild` | `boolean` | `false` | Skip generating the output file |
| `remBasePx` | `number` | `16` | Base pixel value for rem to px conversion |
| `warnOnUnsupported` | `boolean` | `true` | Log warnings for unsupported token types |
| `preserveReferences` | `boolean` | `true` | Preserve token aliases in output (see [Alias Handling](#alias-handling)) |

## Output Structure

When using a resolver file (recommended), the plugin automatically splits output by resolver sets and modifier contexts:

```
dist/
├── primitive.figma.json       # From "primitive" set
├── semantic.figma.json        # From "semantic" set
├── colorScheme-light.figma.json
├── colorScheme-dark.figma.json
└── breakpoint-small.figma.json
```

Without a resolver, all tokens are output to a single file.

## Supported Token Types

| DTCG Type | Figma Variable Type | Transformation |
|-----------|---------------------|----------------|
| `color` | Color | sRGB and HSL pass through; other color spaces converted to sRGB |
| `dimension` | Number | `px` values pass through; `rem` converted to `px` |
| `duration` | Number | `s` values pass through; `ms` converted to `s` |
| `fontFamily` | String | Strings pass through; arrays truncated to first element |
| `fontWeight` | Number or String | Values pass through with validation |
| `number` | Number or Boolean | Numbers pass through; use `com.figma.type: "boolean"` for booleans |
| `typography` | Split tokens | Split into fontFamily, fontSize, fontWeight, lineHeight, letterSpacing |

### Typography Token Splitting

Figma doesn't support composite typography tokens, so they're automatically split into individual sub-tokens:

**Input:**
```json
{
  "typography": {
    "$type": "typography",
    "heading": {
      "$value": {
        "fontFamily": "Inter",
        "fontSize": { "value": 24, "unit": "px" },
        "fontWeight": 700,
        "lineHeight": 1.2,
        "letterSpacing": { "value": 0, "unit": "px" }
      }
    }
  }
}
```

**Output:**
```json
{
  "typography": {
    "heading": {
      "fontFamily": { "$type": "fontFamily", "$value": "Inter" },
      "fontSize": { "$type": "dimension", "$value": { "value": 24, "unit": "px" } },
      "fontWeight": { "$type": "fontWeight", "$value": 700 },
      "lineHeight": { "$type": "number", "$value": 1.2 },
      "letterSpacing": { "$type": "dimension", "$value": { "value": 0, "unit": "px" } }
    }
  }
}
```

## Unsupported Token Types

The following DTCG token types are **not supported** by Figma and will be skipped:

- `shadow`, `border`, `gradient`, `transition`, `strokeStyle`, `cubicBezier`

## Alias Handling

When `preserveReferences: true` (default):

- **Same-file references**: Use curly brace syntax in `$value` (e.g., `"{color.primary}"`)
- **Cross-file references**: Use resolved `$value` + `com.figma.aliasData` extension

```json
{
  "color": {
    "brand": {
      "$type": "color",
      "$value": "{color.palette.blue.500}"
    }
  }
}
```

For cross-collection aliases (referencing tokens in a different output file):

```json
{
  "color": {
    "text": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.2, 0.4, 0.8], "alpha": 1 },
      "$extensions": {
        "com.figma.aliasData": {
          "targetVariableSetName": "primitive",
          "targetVariableName": "color/palette/blue/500"
        }
      }
    }
  }
}
```

## Color Space Conversion

Figma only supports **sRGB** and **HSL** color spaces. Other color spaces are converted to sRGB:

- Display P3, Rec2020, A98 RGB, ProPhoto RGB → sRGB
- OKLCH, OkLab, Lab, LCH → sRGB
- XYZ-D65, XYZ-D50, HWB, sRGB-linear → sRGB

Colors outside the sRGB gamut will be clipped with a warning.

## Boolean Tokens

Use the `number` type with the `com.figma.type` extension:

```json
{
  "feature-flags": {
    "$type": "number",
    "dark-mode-enabled": {
      "$value": 1,
      "$extensions": { "com.figma.type": "boolean" }
    }
  }
}
```

- `0` → `false`
- Non-zero → `true`

## Examples

### Excluding Tokens

```typescript
figmaJson({
  exclude: [
    "internal.*",      // Exclude "internal" group
    "*.deprecated.*",  // Exclude "deprecated" tokens
  ],
})
```

### Custom Token Names

```typescript
figmaJson({
  tokenName: (token) => token.id.replace("color.", "brand.color."),
})
```

### Custom Transform

```typescript
figmaJson({
  transform: (token) => {
    if (token.id === "color.special") {
      return { colorSpace: "srgb", components: [1, 0, 0], alpha: 1 };
    }
    return undefined; // Use default transformation
  },
})
```

## License

MIT
