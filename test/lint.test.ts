import { build, defineConfig, parse } from '@terrazzo/parser';
import { describe, expect, it } from 'vitest';
import figmaJson from '../src/index.js';

async function runWithLint(
  tokensContent: string,
  lintRules: Record<string, 'error' | 'warn' | 'off'>,
): Promise<{ errors: string[]; warnings: string[] }> {
  const cwd = new URL('./', import.meta.url);
  const config = defineConfig(
    {
      plugins: [figmaJson()],
      lint: { rules: lintRules },
    },
    { cwd },
  );

  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const { tokens, resolver, sources } = await parse(
      [{ filename: new URL('./test-tokens.json', cwd), src: tokensContent }],
      { config },
    );
    await build(tokens, { resolver, sources, config });
  } catch (err) {
    if (err instanceof Error) {
      errors.push(err.message);
    }
  }

  return { errors, warnings };
}

describe('lint rules', () => {
  describe('figma/unsupported-type', () => {
    it('reports unsupported token types when enabled', async () => {
      const tokens = {
        easing: {
          $type: 'cubicBezier',
          test: {
            $value: [0.42, 0, 0.58, 1],
          },
        },
        color: {
          $type: 'color',
          primary: {
            $value: { colorSpace: 'srgb', components: [1, 0, 0] },
          },
        },
      };

      const { errors } = await runWithLint(JSON.stringify(tokens), {
        'figma/unsupported-type': 'error',
      });

      // Should have an error for the cubicBezier type
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('cubicBezier') || e.includes('unsupported'))).toBe(true);
    });

    it('does not report supported token types', async () => {
      const tokens = {
        color: {
          $type: 'color',
          primary: {
            $value: { colorSpace: 'srgb', components: [1, 0, 0] },
          },
        },
        spacing: {
          $type: 'dimension',
          base: {
            $value: { value: 8, unit: 'px' },
          },
        },
      };

      const { errors } = await runWithLint(JSON.stringify(tokens), {
        'figma/unsupported-type': 'error',
      });

      expect(errors).toHaveLength(0);
    });
  });
});
