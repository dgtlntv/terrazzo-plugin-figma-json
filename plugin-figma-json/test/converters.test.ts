import { describe, expect, it, vi } from 'vitest';
import { convertColor } from '../src/converters/color.js';
import { convertDimension } from '../src/converters/dimension.js';
import { convertDuration } from '../src/converters/duration.js';
import { convertFontFamily } from '../src/converters/font-family.js';
import { convertFontWeight } from '../src/converters/font-weight.js';
import { convertNumber } from '../src/converters/number.js';
import type { ConverterContext } from '../src/lib.js';

/**
 * Create a mock converter context for testing.
 */
function createContext(overrides?: Partial<ConverterContext>): ConverterContext {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      setLevel: vi.fn(),
      level: 'info',
      debugScope: '',
      errorCount: 0,
      warnCount: 0,
      hasErrors: false,
      hasWarnings: false,
      indent: vi.fn(),
    } as unknown as ConverterContext['logger'],
    options: {},
    tokenId: 'test.token',
    ...overrides,
  };
}

describe('convertColor', () => {
  it('passes through sRGB colors', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'srgb',
        components: [0.5, 0.5, 0.5],
        alpha: 1,
      },
      ctx,
    );

    expect(result.skip).toBeUndefined();
    expect(result.value).toEqual({
      colorSpace: 'srgb',
      components: [0.5, 0.5, 0.5],
      alpha: 1,
    });
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  it('passes through HSL colors', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'hsl',
        components: [180, 50, 50],
      },
      ctx,
    );

    expect(result.skip).toBeUndefined();
    expect(result.value).toEqual({
      colorSpace: 'hsl',
      components: [180, 50, 50],
      alpha: 1,
    });
  });

  it('converts OKLCH to sRGB', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'oklch',
        components: [0.7, 0.15, 150],
      },
      ctx,
    );

    expect(result.skip).toBeUndefined();
    expect(result.value).toHaveProperty('colorSpace', 'srgb');
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('converts Lab to sRGB', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'lab',
        components: [50, 0, 0],
      },
      ctx,
    );

    expect(result.skip).toBeUndefined();
    expect(result.value).toHaveProperty('colorSpace', 'srgb');
  });

  it('converts Display P3 to sRGB', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'display-p3',
        components: [1, 0, 0],
      },
      ctx,
    );

    expect(result.skip).toBeUndefined();
    expect(result.value).toHaveProperty('colorSpace', 'srgb');
  });

  it('handles "none" component values', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'oklch',
        components: [0.5, 'none', 'none'],
      },
      ctx,
    );

    expect(result.skip).toBeUndefined();
    expect(result.value).toHaveProperty('colorSpace', 'srgb');
  });

  it('preserves alpha channel', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'oklch',
        components: [0.5, 0.1, 180],
        alpha: 0.5,
      },
      ctx,
    );

    expect(result.value).toHaveProperty('alpha', 0.5);
  });

  it('warns and skips unknown color spaces', () => {
    const ctx = createContext();
    const result = convertColor(
      {
        colorSpace: 'unknown-space',
        components: [0.5, 0.5, 0.5],
      },
      ctx,
    );

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});

describe('convertDimension', () => {
  it('passes through px values', () => {
    const ctx = createContext();
    const result = convertDimension({ value: 16, unit: 'px' }, ctx);

    expect(result.skip).toBeUndefined();
    expect(result.value).toEqual({ value: 16, unit: 'px' });
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  it('converts rem to px using default base', () => {
    const ctx = createContext();
    const result = convertDimension({ value: 1, unit: 'rem' }, ctx);

    expect(result.value).toEqual({ value: 16, unit: 'px' });
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('converts rem to px using custom base', () => {
    const ctx = createContext({ options: { remBasePx: 10 } });
    const result = convertDimension({ value: 2, unit: 'rem' }, ctx);

    expect(result.value).toEqual({ value: 20, unit: 'px' });
  });

  it('handles fractional rem values', () => {
    const ctx = createContext();
    const result = convertDimension({ value: 0.5, unit: 'rem' }, ctx);

    expect(result.value).toEqual({ value: 8, unit: 'px' });
  });

  it('handles zero values', () => {
    const ctx = createContext();
    const result = convertDimension({ value: 0, unit: 'px' }, ctx);

    expect(result.value).toEqual({ value: 0, unit: 'px' });
  });

  it('warns and skips non-finite values', () => {
    const ctx = createContext();
    const result = convertDimension({ value: Infinity, unit: 'px' }, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips unsupported units', () => {
    const ctx = createContext();
    const result = convertDimension({ value: 10, unit: 'em' }, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});

describe('convertDuration', () => {
  it('passes through s values', () => {
    const ctx = createContext();
    const result = convertDuration({ value: 0.5, unit: 's' }, ctx);

    expect(result.value).toEqual({ value: 0.5, unit: 's' });
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  it('converts ms to s', () => {
    const ctx = createContext();
    const result = convertDuration({ value: 500, unit: 'ms' }, ctx);

    expect(result.value).toEqual({ value: 0.5, unit: 's' });
    expect(ctx.logger.info).toHaveBeenCalled();
  });

  it('handles zero duration', () => {
    const ctx = createContext();
    const result = convertDuration({ value: 0, unit: 's' }, ctx);

    expect(result.value).toEqual({ value: 0, unit: 's' });
  });

  it('handles small ms values', () => {
    const ctx = createContext();
    const result = convertDuration({ value: 16, unit: 'ms' }, ctx);

    expect(result.value).toEqual({ value: 0.016, unit: 's' });
  });

  it('warns and skips non-finite values', () => {
    const ctx = createContext();
    const result = convertDuration({ value: NaN, unit: 's' }, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips unsupported units', () => {
    const ctx = createContext();
    const result = convertDuration({ value: 1, unit: 'min' }, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});

describe('convertFontFamily', () => {
  it('passes through string values', () => {
    const ctx = createContext();
    const result = convertFontFamily('Inter', ctx);

    expect(result.value).toBe('Inter');
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  it('converts single-element array to string', () => {
    const ctx = createContext();
    const result = convertFontFamily(['Inter'], ctx);

    expect(result.value).toBe('Inter');
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  it('takes first element of array and warns', () => {
    const ctx = createContext();
    const result = convertFontFamily(['Inter', 'Helvetica', 'sans-serif'], ctx);

    expect(result.value).toBe('Inter');
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips empty arrays', () => {
    const ctx = createContext();
    const result = convertFontFamily([], ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips invalid types', () => {
    const ctx = createContext();
    const result = convertFontFamily(123, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});

describe('convertFontWeight', () => {
  it('passes through number values with number outputType', () => {
    const ctx = createContext();
    const result = convertFontWeight(400, ctx);

    expect(result.value).toBe(400);
    expect(result.outputType).toBe('number');
  });

  it('passes through valid string aliases with string outputType', () => {
    const ctx = createContext();
    const result = convertFontWeight('bold', ctx);

    expect(result.value).toBe('bold');
    expect(result.outputType).toBe('string');
  });

  it('validates number range (1-1000)', () => {
    const ctx = createContext();

    expect(convertFontWeight(1, ctx).value).toBe(1);
    expect(convertFontWeight(1000, ctx).value).toBe(1000);
    expect(convertFontWeight(0, ctx).skip).toBe(true);
    expect(convertFontWeight(1001, ctx).skip).toBe(true);
  });

  it('warns and skips unknown string aliases', () => {
    const ctx = createContext();
    const result = convertFontWeight('super-bold', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips invalid types', () => {
    const ctx = createContext();
    const result = convertFontWeight({ weight: 400 }, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('handles case-insensitive string aliases', () => {
    const ctx = createContext();

    expect(convertFontWeight('BOLD', ctx).value).toBe('BOLD');
    expect(convertFontWeight('Bold', ctx).value).toBe('Bold');
    expect(convertFontWeight('NORMAL', ctx).value).toBe('NORMAL');
  });
});

describe('convertNumber', () => {
  it('passes through number values', () => {
    const ctx = createContext();
    const result = convertNumber(42, ctx);

    expect(result.value).toBe(42);
  });

  it('handles zero', () => {
    const ctx = createContext();
    const result = convertNumber(0, ctx);

    expect(result.value).toBe(0);
  });

  it('handles negative numbers', () => {
    const ctx = createContext();
    const result = convertNumber(-5, ctx);

    expect(result.value).toBe(-5);
  });

  it('handles floating point numbers', () => {
    const ctx = createContext();
    const result = convertNumber(1.234, ctx);

    expect(result.value).toBe(1.234);
  });

  it('converts to boolean when com.figma.type extension is set', () => {
    const ctx = createContext({
      extensions: { 'com.figma.type': 'boolean' },
    });

    expect(convertNumber(0, ctx).value).toBe(false);
    expect(convertNumber(1, ctx).value).toBe(true);
    expect(convertNumber(-1, ctx).value).toBe(true);
    expect(convertNumber(0.5, ctx).value).toBe(true);
  });

  it('warns and skips non-number values', () => {
    const ctx = createContext();
    const result = convertNumber('42', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips non-finite numbers', () => {
    const ctx = createContext();

    expect(convertNumber(Infinity, ctx).skip).toBe(true);
    expect(convertNumber(-Infinity, ctx).skip).toBe(true);
    expect(convertNumber(NaN, ctx).skip).toBe(true);
  });

  it('handles very large numbers', () => {
    const ctx = createContext();
    const result = convertNumber(Number.MAX_SAFE_INTEGER, ctx);

    expect(result.value).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handles very small numbers', () => {
    const ctx = createContext();
    const result = convertNumber(Number.MIN_VALUE, ctx);

    expect(result.value).toBe(Number.MIN_VALUE);
  });
});
