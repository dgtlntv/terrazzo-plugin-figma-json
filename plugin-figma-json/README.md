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

The plugin will generate a `tokens.figma.json` file that can be imported directly into Figma.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filename` | `string` | `"tokens.figma.json"` | Output filename for the Figma-compatible JSON (used as suffix when `splitBySource` is enabled) |
| `exclude` | `string[]` | `[]` | Glob patterns to exclude tokens from output |
| `transform` | `(token) => unknown` | `undefined` | Custom transform function to override token values |
| `tokenName` | `(token) => string` | `undefined` | Custom function to control token names in output |
| `skipBuild` | `boolean` | `false` | Skip generating the output file |
| `remBasePx` | `number` | `16` | Base pixel value for rem to px conversion |
| `warnOnUnsupported` | `boolean` | `true` | Log warnings for unsupported token types |
| `splitBySource` | `boolean` | `false` | Split output into multiple files matching input file structure |

### Example with Options

```typescript
import { defineConfig } from "@terrazzo/cli";
import figmaJson from "terrazzo-plugin-figma-json";

export default defineConfig({
  outDir: "./tokens/",
  plugins: [
    figmaJson({
      filename: "design-tokens.figma.json",
      exclude: ["internal.*", "deprecated.*"],
      remBasePx: 16,
      warnOnUnsupported: true,
      tokenName: (token) => token.id.replace("color.", "brand."),
    }),
  ],
});
```

## Supported Token Types

| DTCG Type | Figma Variable Type | Transformation |
|-----------|---------------------|----------------|
| `color` | Color | sRGB and HSL pass through; other color spaces converted to sRGB |
| `dimension` | Number | `px` values pass through; `rem` converted to `px` |
| `duration` | Number | `s` values pass through; `ms` converted to `s` |
| `fontFamily` | String | Strings pass through; arrays truncated to first element |
| `fontWeight` | Number or String | Values pass through with validation |
| `number` | Number or Boolean | Numbers pass through; use `com.figma.type: "boolean"` extension for booleans |

## Unsupported Token Types

The following DTCG token types are **not supported** by Figma and will be skipped:

- `shadow`
- `border`
- `gradient`
- `typography`
- `transition`
- `strokeStyle`
- `cubicBezier`

When a token with an unsupported type is encountered, it will be excluded from the output and a warning will be logged (unless `warnOnUnsupported: false`).

## Color Space Conversion

Figma only supports **sRGB** and **HSL** color spaces. This plugin automatically converts colors from other color spaces to sRGB:

- sRGB, HSL: Pass through unchanged
- Display P3, Rec2020, A98 RGB, ProPhoto RGB: Converted to sRGB
- OKLCH, OkLab, Lab, LCH: Converted to sRGB
- XYZ-D65, XYZ-D50: Converted to sRGB
- HWB, sRGB-linear: Converted to sRGB

Colors that fall outside the sRGB gamut will be clipped, and a warning will be logged.

## Boolean Tokens

Figma supports boolean variables. To create a boolean token, use the `number` type with the `com.figma.type` extension:

```json
{
  "feature-flags": {
    "$type": "number",
    "dark-mode-enabled": {
      "$value": 1,
      "$extensions": {
        "com.figma.type": "boolean"
      }
    }
  }
}
```

This will output as a boolean value:
- `0` becomes `false`
- Any non-zero number becomes `true`

## Examples

### Basic Color Tokens

**Input (DTCG):**
```json
{
  "color": {
    "$type": "color",
    "primary": {
      "$value": {
        "colorSpace": "srgb",
        "components": [0.2, 0.4, 0.8]
      },
      "$description": "Primary brand color"
    }
  }
}
```

**Output (Figma JSON):**
```json
{
  "color": {
    "primary": {
      "$type": "color",
      "$value": {
        "colorSpace": "srgb",
        "components": [0.2, 0.4, 0.8],
        "alpha": 1
      },
      "$description": "Primary brand color"
    }
  }
}
```

### Dimension Tokens with rem Conversion

**Input (DTCG):**
```json
{
  "spacing": {
    "$type": "dimension",
    "small": { "$value": { "value": 8, "unit": "px" } },
    "large": { "$value": { "value": 1.5, "unit": "rem" } }
  }
}
```

**Output (Figma JSON):**
```json
{
  "spacing": {
    "small": {
      "$type": "dimension",
      "$value": { "value": 8, "unit": "px" }
    },
    "large": {
      "$type": "dimension",
      "$value": { "value": 24, "unit": "px" }
    }
  }
}
```

### Excluding Tokens

Use the `exclude` option to filter out specific tokens:

```typescript
figmaJson({
  exclude: [
    "internal.*",      // Exclude all tokens under "internal" group
    "*.deprecated.*",  // Exclude tokens with "deprecated" in the path
    "color.*.dark",    // Exclude dark mode color variants
  ],
})
```

### Custom Token Names

Use the `tokenName` option to transform token names in the output:

```typescript
figmaJson({
  tokenName: (token) => {
    // Add prefix to color tokens
    if (token.id.startsWith("color.")) {
      return token.id.replace("color.", "brand.color.");
    }
    return token.id;
  },
})
```

### Split Output by Source File

Use the `splitBySource` option to generate separate output files for each input token file:

```typescript
import { defineConfig } from "@terrazzo/cli";
import figmaJson from "terrazzo-plugin-figma-json";

export default defineConfig({
  tokens: [
    "./tokens/color.tokens.json",
    "./tokens/dimension.tokens.json",
    "./tokens/typography.tokens.json",
  ],
  outDir: "./dist/",
  plugins: [
    figmaJson({
      filename: "figma.json",  // Used as suffix
      splitBySource: true,
    }),
  ],
});
```

This generates:
- `dist/color.figma.json` (from `color.tokens.json`)
- `dist/dimension.figma.json` (from `dimension.tokens.json`)
- `dist/typography.figma.json` (from `typography.tokens.json`)

### Custom Transform

Use the `transform` option to override specific token values:

```typescript
figmaJson({
  transform: (token) => {
    // Override a specific token
    if (token.id === "color.special") {
      return {
        colorSpace: "srgb",
        components: [1, 0, 0],
        alpha: 1,
      };
    }
    // Return undefined to use default transformation
    return undefined;
  },
})
```

## License

MIT
