import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, defineConfig, parse } from '@terrazzo/parser';
import { describe, expect, it } from 'vitest';
import figmaJson from '../src/index.js';

async function runPlugin(fixturePath: string, options?: Parameters<typeof figmaJson>[0]) {
  const output = 'actual.json';
  const cwd = new URL(fixturePath, import.meta.url);
  const config = defineConfig(
    {
      plugins: [figmaJson({ filename: output, ...options })],
    },
    { cwd },
  );

  const tokensJSON = new URL('./tokens.json', cwd);
  const { tokens, resolver, sources } = await parse(
    [{ filename: tokensJSON, src: await fs.readFile(tokensJSON, 'utf8') }],
    { config },
  );

  const result = await build(tokens, { resolver, sources, config });
  return result.outputFiles.find((f) => f.filename === output)?.contents;
}

describe('figma-json plugin', () => {
  it('basic tokens', async () => {
    const contents = await runPlugin('./fixtures/basic/');
    await expect(contents).toMatchFileSnapshot(fileURLToPath(new URL('./fixtures/basic/want.json', import.meta.url)));
  });

  it('color space conversions', async () => {
    const contents = await runPlugin('./fixtures/colors/');
    await expect(contents).toMatchFileSnapshot(fileURLToPath(new URL('./fixtures/colors/want.json', import.meta.url)));
  });

  it('unsupported types are dropped', async () => {
    const contents = await runPlugin('./fixtures/unsupported/');
    await expect(contents).toMatchFileSnapshot(
      fileURLToPath(new URL('./fixtures/unsupported/want.json', import.meta.url)),
    );
  });

  it('dimension conversion (px and rem)', async () => {
    const contents = await runPlugin('./fixtures/dimensions/');
    await expect(contents).toMatchFileSnapshot(
      fileURLToPath(new URL('./fixtures/dimensions/want.json', import.meta.url)),
    );
  });

  it('font family handling (string and array)', async () => {
    const contents = await runPlugin('./fixtures/font-family/');
    await expect(contents).toMatchFileSnapshot(
      fileURLToPath(new URL('./fixtures/font-family/want.json', import.meta.url)),
    );
  });

  it('alias preservation', async () => {
    const contents = await runPlugin('./fixtures/aliases/');
    await expect(contents).toMatchFileSnapshot(fileURLToPath(new URL('./fixtures/aliases/want.json', import.meta.url)));
  });

  it('typography token splitting', async () => {
    const contents = await runPlugin('./fixtures/typography/');
    await expect(contents).toMatchFileSnapshot(
      fileURLToPath(new URL('./fixtures/typography/want.json', import.meta.url)),
    );
  });

  it('shadow token splitting', async () => {
    const contents = await runPlugin('./fixtures/shadow/');
    await expect(contents).toMatchFileSnapshot(fileURLToPath(new URL('./fixtures/shadow/want.json', import.meta.url)));
  });

  it('border token splitting', async () => {
    const contents = await runPlugin('./fixtures/border/');
    await expect(contents).toMatchFileSnapshot(fileURLToPath(new URL('./fixtures/border/want.json', import.meta.url)));
  });

  it('gradient token splitting', async () => {
    const contents = await runPlugin('./fixtures/gradient/');
    await expect(contents).toMatchFileSnapshot(
      fileURLToPath(new URL('./fixtures/gradient/want.json', import.meta.url)),
    );
  });

  it('respects exclude option', async () => {
    const output = 'actual.json';
    const cwd = new URL('./fixtures/basic/', import.meta.url);
    const config = defineConfig(
      {
        plugins: [
          figmaJson({
            filename: output,
            exclude: ['spacing.*', 'animation.*'],
          }),
        ],
      },
      { cwd },
    );

    const tokensJSON = new URL('./tokens.json', cwd);
    const { tokens, resolver, sources } = await parse(
      [{ filename: tokensJSON, src: await fs.readFile(tokensJSON, 'utf8') }],
      { config },
    );

    const result = await build(tokens, { resolver, sources, config });
    const contents = result.outputFiles.find((f) => f.filename === output)?.contents;
    const parsed = JSON.parse(String(contents ?? '{}'));

    expect(parsed.spacing).toBeUndefined();
    expect(parsed.animation).toBeUndefined();
    expect(parsed.color).toBeDefined();
    expect(parsed.font).toBeDefined();
  });

  it('respects skipBuild option', async () => {
    const output = 'actual.json';
    const cwd = new URL('./fixtures/basic/', import.meta.url);
    const config = defineConfig(
      {
        plugins: [figmaJson({ filename: output, skipBuild: true })],
      },
      { cwd },
    );

    const tokensJSON = new URL('./tokens.json', cwd);
    const { tokens, resolver, sources } = await parse(
      [{ filename: tokensJSON, src: await fs.readFile(tokensJSON, 'utf8') }],
      { config },
    );

    const result = await build(tokens, { resolver, sources, config });
    const file = result.outputFiles.find((f) => f.filename === output);
    expect(file).toBeUndefined();
  });

  it('respects custom remBasePx option', async () => {
    const output = 'actual.json';
    const cwd = new URL('./fixtures/basic/', import.meta.url);
    const config = defineConfig(
      {
        plugins: [figmaJson({ filename: output, remBasePx: 10 })],
      },
      { cwd },
    );

    const tokensJSON = new URL('./tokens.json', cwd);
    const { tokens, resolver, sources } = await parse(
      [{ filename: tokensJSON, src: await fs.readFile(tokensJSON, 'utf8') }],
      { config },
    );

    const result = await build(tokens, { resolver, sources, config });
    const contents = result.outputFiles.find((f) => f.filename === output)?.contents;
    const parsed = JSON.parse(String(contents ?? '{}'));

    // 1.5rem with base 10 = 15px
    expect(parsed.spacing.large.$value.value).toBe(15);
  });

  it('supports custom transform function', async () => {
    const output = 'actual.json';
    const cwd = new URL('./fixtures/basic/', import.meta.url);
    const config = defineConfig(
      {
        plugins: [
          figmaJson({
            filename: output,
            transform: (token) => {
              if (token.id === 'lineHeight.tight') {
                return { custom: true, value: 999 };
              }
              return undefined;
            },
          }),
        ],
      },
      { cwd },
    );

    const tokensJSON = new URL('./tokens.json', cwd);
    const { tokens, resolver, sources } = await parse(
      [{ filename: tokensJSON, src: await fs.readFile(tokensJSON, 'utf8') }],
      { config },
    );

    const result = await build(tokens, { resolver, sources, config });
    const contents = result.outputFiles.find((f) => f.filename === output)?.contents;
    const parsed = JSON.parse(String(contents ?? '{}'));

    expect(parsed.lineHeight.tight).toEqual({ custom: true, value: 999 });
    // Other tokens should be normal
    expect(parsed.lineHeight.normal.$value).toBe(1.5);
  });

  it('supports custom tokenName function', async () => {
    const output = 'actual.json';
    const cwd = new URL('./fixtures/basic/', import.meta.url);
    const config = defineConfig(
      {
        plugins: [
          figmaJson({
            filename: output,
            tokenName: (token) => token.id.replace('color.', 'brand.color.'),
          }),
        ],
      },
      { cwd },
    );

    const tokensJSON = new URL('./tokens.json', cwd);
    const { tokens, resolver, sources } = await parse(
      [{ filename: tokensJSON, src: await fs.readFile(tokensJSON, 'utf8') }],
      { config },
    );

    const result = await build(tokens, { resolver, sources, config });
    const contents = result.outputFiles.find((f) => f.filename === output)?.contents;
    const parsed = JSON.parse(String(contents ?? '{}'));

    expect(parsed.brand?.color?.primary).toBeDefined();
  });
});
