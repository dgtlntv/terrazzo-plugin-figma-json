import { build, defineConfig, parse } from '@terrazzo/parser';
import { describe, expect, it } from 'vitest';
import figmaJson from '../src/index.js';

async function runPluginWithSource(
  tokensContent: string,
  options?: Parameters<typeof figmaJson>[0],
): Promise<string | undefined> {
  const output = 'actual.json';
  const cwd = new URL('./', import.meta.url);
  const config = defineConfig(
    {
      plugins: [figmaJson({ filename: output, ...options })],
    },
    { cwd },
  );

  const { tokens, resolver, sources } = await parse(
    [{ filename: new URL('./test-tokens.json', import.meta.url), src: tokensContent }],
    { config },
  );

  const result = await build(tokens, { resolver, sources, config });
  return result.outputFiles.find((f) => f.filename === output)?.contents as string | undefined;
}

describe('edge cases', () => {
  it('handles empty tokens object', async () => {
    const contents = await runPluginWithSource('{}');
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed).toEqual({});
  });

  it('handles all unsupported types', async () => {
    const tokens = {
      transition: {
        $type: 'transition',
        test: {
          $value: {
            duration: { value: 200, unit: 'ms' },
            delay: { value: 0, unit: 'ms' },
            timingFunction: [0.42, 0, 0.58, 1],
          },
        },
      },
      stroke: {
        $type: 'strokeStyle',
        test: {
          $value: 'dashed',
        },
      },
      easing: {
        $type: 'cubicBezier',
        test: {
          $value: [0.42, 0, 0.58, 1],
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens), { warnOnUnsupported: false });
    const parsed = JSON.parse(contents ?? '{}');

    // All unsupported types should be filtered out
    expect(parsed).toEqual({});
  });

  it('splits shadow tokens into sub-tokens', async () => {
    const tokens = {
      shadow: {
        $type: 'shadow',
        test: {
          $value: {
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 4, unit: 'px' },
            blur: { value: 8, unit: 'px' },
            spread: { value: 0, unit: 'px' },
            color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 },
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    // Single shadows have no index prefix for cleaner output
    expect(parsed.shadow.test.color.$type).toBe('color');
    expect(parsed.shadow.test.color.$value.colorSpace).toBe('srgb');
    expect(parsed.shadow.test.offsetX.$type).toBe('dimension');
    expect(parsed.shadow.test.offsetX.$value).toEqual({ value: 0, unit: 'px' });
    expect(parsed.shadow.test.offsetY.$value).toEqual({ value: 4, unit: 'px' });
    expect(parsed.shadow.test.blur.$value).toEqual({ value: 8, unit: 'px' });
    expect(parsed.shadow.test.spread.$value).toEqual({ value: 0, unit: 'px' });
  });

  it('splits border tokens into sub-tokens (color + width only)', async () => {
    const tokens = {
      border: {
        $type: 'border',
        test: {
          $value: {
            width: { value: 1, unit: 'px' },
            style: 'solid',
            color: { colorSpace: 'srgb', components: [0, 0, 0] },
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.border.test.color.$type).toBe('color');
    expect(parsed.border.test.width.$type).toBe('dimension');
    expect(parsed.border.test.width.$value).toEqual({ value: 1, unit: 'px' });
    // style should be dropped
    expect(parsed.border.test.style).toBeUndefined();
  });

  it('splits gradient tokens into color sub-tokens', async () => {
    const tokens = {
      gradient: {
        $type: 'gradient',
        test: {
          $value: [
            { position: 0, color: { colorSpace: 'srgb', components: [1, 0, 0] } },
            { position: 1, color: { colorSpace: 'srgb', components: [0, 0, 1] } },
          ],
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.gradient.test['0'].color.$type).toBe('color');
    expect(parsed.gradient.test['0'].color.$value.components).toEqual([1, 0, 0]);
    expect(parsed.gradient.test['1'].color.$type).toBe('color');
    expect(parsed.gradient.test['1'].color.$value.components).toEqual([0, 0, 1]);
  });

  it('handles deeply nested groups (3+ levels)', async () => {
    const tokens = {
      level1: {
        level2: {
          level3: {
            $type: 'color',
            deep: {
              $value: { colorSpace: 'srgb', components: [1, 0, 0] },
            },
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.level1?.level2?.level3?.deep?.$value).toBeDefined();
  });

  it('handles unicode in string values', async () => {
    const tokens = {
      font: {
        family: {
          $type: 'fontFamily',
          unicode: {
            $value: 'Noto Sans JP',
            $description: 'Japanese font \u65E5\u672C\u8A9E',
          },
          emoji: {
            $value: 'Noto Color Emoji',
            $description: 'Supports emojis like \uD83D\uDE00',
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.font.family.unicode.$value).toBe('Noto Sans JP');
    expect(parsed.font.family.unicode.$description).toContain('\u65E5\u672C\u8A9E');
    expect(parsed.font.family.emoji.$description).toContain('\uD83D\uDE00');
  });

  it('handles very large numbers', async () => {
    const tokens = {
      sizes: {
        $type: 'number',
        large: {
          $value: Number.MAX_SAFE_INTEGER,
        },
        verySmall: {
          $value: Number.MIN_VALUE,
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.sizes.large.$value).toBe(Number.MAX_SAFE_INTEGER);
    expect(parsed.sizes.verySmall.$value).toBe(Number.MIN_VALUE);
  });

  it('handles zero values for dimensions', async () => {
    const tokens = {
      spacing: {
        $type: 'dimension',
        none: {
          $value: { value: 0, unit: 'px' },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.spacing.none.$value).toEqual({ value: 0, unit: 'px' });
  });

  it('handles zero values for durations', async () => {
    const tokens = {
      animation: {
        $type: 'duration',
        instant: {
          $value: { value: 0, unit: 's' },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.animation.instant.$value).toEqual({ value: 0, unit: 's' });
  });

  it('handles negative numbers', async () => {
    const tokens = {
      offset: {
        $type: 'number',
        negative: {
          $value: -10,
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.offset.negative.$value).toBe(-10);
  });

  it('handles tokens with boolean extension', async () => {
    const tokens = {
      flags: {
        $type: 'number',
        enabled: {
          $value: 1,
          $extensions: {
            'com.figma.type': 'boolean',
          },
        },
        disabled: {
          $value: 0,
          $extensions: {
            'com.figma.type': 'boolean',
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.flags.enabled.$value).toBe(true);
    expect(parsed.flags.disabled.$value).toBe(false);
    // Extensions should be preserved
    expect(parsed.flags.enabled.$extensions?.['com.figma.type']).toBe('boolean');
  });

  it('handles mixed supported and unsupported types', async () => {
    const tokens = {
      supported: {
        color: {
          $type: 'color',
          primary: {
            $value: { colorSpace: 'srgb', components: [1, 0, 0] },
          },
        },
        number: {
          $type: 'number',
          ratio: {
            $value: 1.5,
          },
        },
      },
      unsupported: {
        transition: {
          $type: 'transition',
          test: {
            $value: {
              duration: { value: 200, unit: 'ms' },
              delay: { value: 0, unit: 'ms' },
              timingFunction: [0.42, 0, 0.58, 1],
            },
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens), { warnOnUnsupported: false });
    const parsed = JSON.parse(contents ?? '{}');

    // Supported types should be present
    expect(parsed.supported.color.primary).toBeDefined();
    expect(parsed.supported.number.ratio).toBeDefined();

    // Unsupported types should be absent
    expect(parsed.unsupported).toBeUndefined();
  });

  it('preserves $description on tokens', async () => {
    const tokens = {
      color: {
        $type: 'color',
        primary: {
          $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.8] },
          $description: 'Primary brand color used for main actions',
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    expect(parsed.color.primary.$description).toBe('Primary brand color used for main actions');
  });

  it('preserves alpha=1 on sRGB colors', async () => {
    const tokens = {
      color: {
        $type: 'color',
        solid: {
          $value: { colorSpace: 'srgb', components: [1, 0, 0] },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    // Terrazzo normalizes colors to include alpha=1
    expect(parsed.color.solid.$value.alpha).toBe(1);
  });

  it('resolves alias references in fallback mode (no resolver)', async () => {
    // Without a resolver file, references are always resolved since there's no
    // concept of "same-file" vs "cross-file" references
    const tokens = {
      color: {
        $type: 'color',
        primary: {
          $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.8] },
        },
        secondary: {
          $value: '{color.primary}',
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    // In fallback mode, references are resolved to their values
    expect(parsed.color.secondary.$value.colorSpace).toBe('srgb');
    expect(parsed.color.secondary.$value.components).toEqual([0.2, 0.4, 0.8]);
  });

  it('resolves dimension references in fallback mode', async () => {
    const tokens = {
      dimension: {
        $type: 'dimension',
        base: {
          $value: { value: 16, unit: 'px' },
        },
        large: {
          $value: '{dimension.base}',
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    // In fallback mode, references are resolved
    expect(parsed.dimension.large.$value).toEqual({ value: 16, unit: 'px' });
  });

  // Note: Typography token splitting is tested in test/index.test.ts with the typography fixture
  // which has proper letterSpacing values that pass validation

  it('handles fontWeight with named values', async () => {
    const tokens = {
      font: {
        weight: {
          $type: 'fontWeight',
          bold: {
            $value: 'bold',
          },
          light: {
            $value: 'light',
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    // Named font weights should be converted to numbers
    expect(parsed.font.weight.bold.$value).toBe(700);
    expect(parsed.font.weight.light.$value).toBe(300);
  });

  it('filters out non-Figma extensions', async () => {
    const tokens = {
      color: {
        $type: 'color',
        primary: {
          $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.8] },
          $extensions: {
            'com.figma.type': 'color',
            'com.custom.metadata': 'should be removed',
            'other.extension': 'also removed',
          },
        },
      },
    };

    const contents = await runPluginWithSource(JSON.stringify(tokens));
    const parsed = JSON.parse(contents ?? '{}');

    // Only com.figma.* extensions should be preserved
    expect(parsed.color.primary.$extensions?.['com.figma.type']).toBe('color');
    expect(parsed.color.primary.$extensions?.['com.custom.metadata']).toBeUndefined();
    expect(parsed.color.primary.$extensions?.['other.extension']).toBeUndefined();
  });
});
