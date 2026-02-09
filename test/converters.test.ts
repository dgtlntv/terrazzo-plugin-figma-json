import type { TokenNormalized } from '@terrazzo/parser';
import { describe, expect, it, vi } from 'vitest';
import { convertBorder } from '../src/converters/border.js';
import { convertColor } from '../src/converters/color.js';
import { convertDimension } from '../src/converters/dimension.js';
import { convertDuration } from '../src/converters/duration.js';
import { convertFontFamily } from '../src/converters/font-family.js';
import { convertFontWeight } from '../src/converters/font-weight.js';
import { convertGradient } from '../src/converters/gradient.js';
import type { LineHeightConverterContext } from '../src/converters/line-height.js';
import { convertLineHeight } from '../src/converters/line-height.js';
import { convertNumber } from '../src/converters/number.js';
import { convertShadow } from '../src/converters/shadow.js';
import { convertTypography } from '../src/converters/typography.js';
import type { ConverterContext } from '../src/types.js';

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
    // Color space conversion logs at info level (expected behavior)
    expect(ctx.logger.info).toHaveBeenCalled();
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
    expect(ctx.logger.info).toHaveBeenCalled();
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

describe('convertLineHeight', () => {
  /**
   * Create a lineHeight converter context with fontSize.
   */
  function createLineHeightContext(overrides?: Partial<LineHeightConverterContext>): LineHeightConverterContext {
    return {
      ...createContext(),
      fontSize: { value: 16, unit: 'px' },
      ...overrides,
    };
  }

  it('computes absolute lineHeight from multiplier and fontSize', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 16, unit: 'px' } });
    const result = convertLineHeight(1.5, ctx);

    // 1.5 × 16px = 24px
    expect(result.value).toEqual({ value: 24, unit: 'px' });
    expect(result.skip).toBeUndefined();
  });

  it('handles different fontSize values', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 20, unit: 'px' } });
    const result = convertLineHeight(1.4, ctx);

    // 1.4 × 20px = 28px
    expect(result.value).toEqual({ value: 28, unit: 'px' });
  });

  it('handles lineHeight of 1 (same as fontSize)', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 16, unit: 'px' } });
    const result = convertLineHeight(1, ctx);

    expect(result.value).toEqual({ value: 16, unit: 'px' });
  });

  it('handles fractional multipliers', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 16, unit: 'px' } });
    const result = convertLineHeight(1.25, ctx);

    // 1.25 × 16px = 20px
    expect(result.value).toEqual({ value: 20, unit: 'px' });
  });

  it('warns and skips when fontSize is missing', () => {
    const ctx = createLineHeightContext({ fontSize: undefined });
    const result = convertLineHeight(1.5, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips non-number values', () => {
    const ctx = createLineHeightContext();
    const result = convertLineHeight('1.5', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips non-finite values', () => {
    const ctx = createLineHeightContext();

    expect(convertLineHeight(Infinity, ctx).skip).toBe(true);
    expect(convertLineHeight(-Infinity, ctx).skip).toBe(true);
    expect(convertLineHeight(NaN, ctx).skip).toBe(true);
  });

  it('logs info message about the conversion', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 16, unit: 'px' } });
    convertLineHeight(1.5, ctx);

    expect(ctx.logger.info).toHaveBeenCalled();
  });

  it('rounds lineHeight by default', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 14, unit: 'px' } });
    const result = convertLineHeight(1.4, ctx);

    // 1.4 × 14px = 19.6px → rounded to 20px
    expect(result.value).toEqual({ value: 20, unit: 'px' });
  });

  it('rounds lineHeight when roundLineHeight is true', () => {
    const ctx = createLineHeightContext({
      fontSize: { value: 14, unit: 'px' },
      options: { roundLineHeight: true },
    });
    const result = convertLineHeight(1.4, ctx);

    // 1.4 × 14px = 19.6px → rounded to 20px
    expect(result.value).toEqual({ value: 20, unit: 'px' });
  });

  it('does not round lineHeight when roundLineHeight is false', () => {
    const ctx = createLineHeightContext({
      fontSize: { value: 14, unit: 'px' },
      options: { roundLineHeight: false },
    });
    const result = convertLineHeight(1.4, ctx);

    // 1.4 × 14px = 19.6px → not rounded
    expect(result.value).toEqual({ value: 19.599999999999998, unit: 'px' });
  });

  it('does not change value when already a whole number', () => {
    const ctx = createLineHeightContext({ fontSize: { value: 16, unit: 'px' } });
    const result = convertLineHeight(1.5, ctx);

    // 1.5 × 16px = 24px → no rounding needed
    expect(result.value).toEqual({ value: 24, unit: 'px' });
  });
});

describe('convertTypography', () => {
  it('splits typography into sub-tokens with all properties', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        fontSize: { value: 16, unit: 'px' },
        fontWeight: 400,
        lineHeight: 1.5,
        letterSpacing: { value: 0, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(5);

    // Check fontFamily
    const fontFamilyToken = result.subTokens?.find((t) => t.idSuffix === 'fontFamily');
    expect(fontFamilyToken?.$type).toBe('fontFamily');
    expect(fontFamilyToken?.value).toBe('Inter');

    // Check fontSize
    const fontSizeToken = result.subTokens?.find((t) => t.idSuffix === 'fontSize');
    expect(fontSizeToken?.$type).toBe('dimension');
    expect(fontSizeToken?.value).toEqual({ value: 16, unit: 'px' });

    // Check fontWeight
    const fontWeightToken = result.subTokens?.find((t) => t.idSuffix === 'fontWeight');
    expect(fontWeightToken?.$type).toBe('number');
    expect(fontWeightToken?.value).toBe(400);

    // Check lineHeight (W3C number multiplier → Figma dimension: 1.5 × 16px = 24px)
    const lineHeightToken = result.subTokens?.find((t) => t.idSuffix === 'lineHeight');
    expect(lineHeightToken?.$type).toBe('dimension');
    expect(lineHeightToken?.value).toEqual({ value: 24, unit: 'px' });
    // No aliasOf since computed value loses reference to primitive number token
    expect(lineHeightToken?.aliasOf).toBeUndefined();

    // Check letterSpacing
    const letterSpacingToken = result.subTokens?.find((t) => t.idSuffix === 'letterSpacing');
    expect(letterSpacingToken?.$type).toBe('dimension');
    expect(letterSpacingToken?.value).toEqual({ value: 0, unit: 'px' });
  });

  it('handles missing optional sub-properties', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        fontSize: { value: 16, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(2);
    expect(result.subTokens?.map((t) => t.idSuffix)).toEqual(['fontFamily', 'fontSize']);
  });

  it('handles fontFamily as array (takes first)', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontFamily: ['Inter', 'Helvetica', 'sans-serif'],
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const fontFamilyToken = result.subTokens?.find((t) => t.idSuffix === 'fontFamily');
    expect(fontFamilyToken?.value).toBe('Inter');
  });

  it('handles fontWeight as string alias', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontWeight: 'bold',
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const fontWeightToken = result.subTokens?.find((t) => t.idSuffix === 'fontWeight');
    expect(fontWeightToken?.$type).toBe('string');
    expect(fontWeightToken?.value).toBe('bold');
  });

  it('skips lineHeight when fontSize is missing (cannot compute absolute value)', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        lineHeight: 1.5, // No fontSize to multiply with
      },
      ctx,
    );

    expect(result.split).toBe(true);
    // lineHeight should be skipped, only fontFamily included
    expect(result.subTokens).toHaveLength(1);
    expect(result.subTokens?.find((t) => t.idSuffix === 'lineHeight')).toBeUndefined();
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('computes lineHeight from multiplier and fontSize (rounded by default)', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontSize: { value: 14, unit: 'px' },
        lineHeight: 1.4, // 1.4 × 14px = 19.6px → rounded to 20px
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const lineHeightToken = result.subTokens?.find((t) => t.idSuffix === 'lineHeight');
    expect(lineHeightToken?.$type).toBe('dimension');
    expect(lineHeightToken?.value).toEqual({ value: 20, unit: 'px' });
  });

  it('converts rem to px for fontSize', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontSize: { value: 1, unit: 'rem' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const fontSizeToken = result.subTokens?.find((t) => t.idSuffix === 'fontSize');
    expect(fontSizeToken?.value).toEqual({ value: 16, unit: 'px' });
  });

  it('warns and skips invalid typography value', () => {
    const ctx = createContext();
    const result = convertTypography('not an object', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips typography with no valid sub-properties', () => {
    const ctx = createContext();
    const result = convertTypography({}, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('skips invalid sub-properties but includes valid ones', () => {
    const ctx = createContext();
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        fontSize: { value: Infinity, unit: 'px' }, // Invalid - should be skipped
        fontWeight: 400,
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(2);
    expect(result.subTokens?.map((t) => t.idSuffix)).toEqual(['fontFamily', 'fontWeight']);
  });

  it('preserves aliasOf for primitive token references', () => {
    const ctx = createContext({
      partialAliasOf: {
        fontFamily: 'typography.fontFamily.sansSerif',
        fontSize: 'dimension.size.100',
      },
      allTokens: {
        'typography.fontFamily.sansSerif': { $type: 'fontFamily' } as TokenNormalized,
        'dimension.size.100': { $type: 'dimension' } as TokenNormalized,
      },
    });
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        fontSize: { value: 16, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const fontFamilyToken = result.subTokens?.find((t) => t.idSuffix === 'fontFamily');
    const fontSizeToken = result.subTokens?.find((t) => t.idSuffix === 'fontSize');
    // Primitive references are kept as-is
    expect(fontFamilyToken?.aliasOf).toBe('typography.fontFamily.sansSerif');
    expect(fontSizeToken?.aliasOf).toBe('dimension.size.100');
  });

  it('appends property name when referencing typography token (JSON pointer to typography)', () => {
    const ctx = createContext({
      partialAliasOf: {
        fontFamily: 'typography.base',
        fontSize: 'typography.base',
        lineHeight: 'typography.base',
      },
      allTokens: {
        'typography.base': { $type: 'typography' } as TokenNormalized,
      },
    });
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        fontSize: { value: 16, unit: 'px' },
        lineHeight: 1.5,
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const fontFamilyToken = result.subTokens?.find((t) => t.idSuffix === 'fontFamily');
    const fontSizeToken = result.subTokens?.find((t) => t.idSuffix === 'fontSize');
    const lineHeightToken = result.subTokens?.find((t) => t.idSuffix === 'lineHeight');
    // Typography references get the property name appended
    expect(fontFamilyToken?.aliasOf).toBe('typography.base.fontFamily');
    expect(fontSizeToken?.aliasOf).toBe('typography.base.fontSize');
    // lineHeight loses its alias because we compute an absolute value (multiplier × fontSize)
    expect(lineHeightToken?.aliasOf).toBeUndefined();
    expect(lineHeightToken?.value).toEqual({ value: 24, unit: 'px' }); // 1.5 × 16px
  });

  it('handles mixed references (some to typography, some to primitives)', () => {
    const ctx = createContext({
      partialAliasOf: {
        fontFamily: 'typography.base', // typography token
        fontSize: 'dimension.size.100', // primitive token
        fontWeight: 'typography.weight.bold', // primitive (fontWeight type)
      },
      allTokens: {
        'typography.base': { $type: 'typography' } as TokenNormalized,
        'dimension.size.100': { $type: 'dimension' } as TokenNormalized,
        'typography.weight.bold': { $type: 'fontWeight' } as TokenNormalized,
      },
    });
    const result = convertTypography(
      {
        fontFamily: 'Inter',
        fontSize: { value: 16, unit: 'px' },
        fontWeight: 700,
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const fontFamilyToken = result.subTokens?.find((t) => t.idSuffix === 'fontFamily');
    const fontSizeToken = result.subTokens?.find((t) => t.idSuffix === 'fontSize');
    const fontWeightToken = result.subTokens?.find((t) => t.idSuffix === 'fontWeight');
    // Typography reference gets property appended
    expect(fontFamilyToken?.aliasOf).toBe('typography.base.fontFamily');
    // Primitive references stay as-is
    expect(fontSizeToken?.aliasOf).toBe('dimension.size.100');
    expect(fontWeightToken?.aliasOf).toBe('typography.weight.bold');
  });
});

describe('convertShadow', () => {
  it('splits single shadow object into sub-tokens', () => {
    const ctx = createContext();
    const result = convertShadow(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 },
        offsetX: { value: 0, unit: 'px' },
        offsetY: { value: 4, unit: 'px' },
        blur: { value: 8, unit: 'px' },
        spread: { value: 0, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(5);

    const colorToken = result.subTokens?.find((t) => t.idSuffix === 'color');
    expect(colorToken?.$type).toBe('color');
    expect(colorToken?.value).toHaveProperty('colorSpace', 'srgb');

    const offsetXToken = result.subTokens?.find((t) => t.idSuffix === 'offsetX');
    expect(offsetXToken?.$type).toBe('dimension');
    expect(offsetXToken?.value).toEqual({ value: 0, unit: 'px' });

    const offsetYToken = result.subTokens?.find((t) => t.idSuffix === 'offsetY');
    expect(offsetYToken?.value).toEqual({ value: 4, unit: 'px' });

    const blurToken = result.subTokens?.find((t) => t.idSuffix === 'blur');
    expect(blurToken?.value).toEqual({ value: 8, unit: 'px' });

    const spreadToken = result.subTokens?.find((t) => t.idSuffix === 'spread');
    expect(spreadToken?.value).toEqual({ value: 0, unit: 'px' });
  });

  it('splits array of shadows into indexed sub-tokens', () => {
    const ctx = createContext();
    const result = convertShadow(
      [
        {
          color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.1 },
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 2, unit: 'px' },
          blur: { value: 4, unit: 'px' },
          spread: { value: 0, unit: 'px' },
        },
        {
          color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 },
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 8, unit: 'px' },
          blur: { value: 16, unit: 'px' },
          spread: { value: 0, unit: 'px' },
        },
      ],
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(10);

    // First layer
    expect(result.subTokens?.find((t) => t.idSuffix === '0.color')?.$type).toBe('color');
    expect(result.subTokens?.find((t) => t.idSuffix === '0.offsetY')?.value).toEqual({ value: 2, unit: 'px' });
    expect(result.subTokens?.find((t) => t.idSuffix === '0.blur')?.value).toEqual({ value: 4, unit: 'px' });

    // Second layer
    expect(result.subTokens?.find((t) => t.idSuffix === '1.color')?.$type).toBe('color');
    expect(result.subTokens?.find((t) => t.idSuffix === '1.offsetY')?.value).toEqual({ value: 8, unit: 'px' });
    expect(result.subTokens?.find((t) => t.idSuffix === '1.blur')?.value).toEqual({ value: 16, unit: 'px' });
  });

  it('drops inset property and logs info', () => {
    const ctx = createContext();
    const result = convertShadow(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 },
        offsetX: { value: 0, unit: 'px' },
        offsetY: { value: 4, unit: 'px' },
        blur: { value: 8, unit: 'px' },
        spread: { value: 0, unit: 'px' },
        inset: true,
      },
      ctx,
    );

    expect(result.split).toBe(true);
    // inset should not appear as a sub-token
    expect(result.subTokens?.find((t) => t.idSuffix === 'inset')).toBeUndefined();
    expect(ctx.logger.info).toHaveBeenCalled();
  });

  it('warns and skips invalid shadow value', () => {
    const ctx = createContext();
    const result = convertShadow('not an object', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips shadow with no valid sub-properties', () => {
    const ctx = createContext();
    const result = convertShadow({}, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('handles partial shadow properties', () => {
    const ctx = createContext();
    const result = convertShadow(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5 },
        blur: { value: 4, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(2);
    expect(result.subTokens?.map((t) => t.idSuffix)).toEqual(['color', 'blur']);
  });

  it('converts non-sRGB shadow colors', () => {
    const ctx = createContext();
    const result = convertShadow(
      {
        color: { colorSpace: 'oklch', components: [0.5, 0.1, 180] },
        offsetX: { value: 0, unit: 'px' },
        offsetY: { value: 4, unit: 'px' },
        blur: { value: 8, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    const colorToken = result.subTokens?.find((t) => t.idSuffix === 'color');
    expect(colorToken?.value).toHaveProperty('colorSpace', 'srgb');
  });

  it('converts rem dimensions in shadow', () => {
    const ctx = createContext();
    const result = convertShadow(
      {
        offsetX: { value: 0, unit: 'px' },
        offsetY: { value: 0.25, unit: 'rem' },
        blur: { value: 0.5, unit: 'rem' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens?.find((t) => t.idSuffix === 'offsetY')?.value).toEqual({ value: 4, unit: 'px' });
    expect(result.subTokens?.find((t) => t.idSuffix === 'blur')?.value).toEqual({ value: 8, unit: 'px' });
  });

  it('preserves aliasOf for primitive token references', () => {
    const ctx = createContext({
      partialAliasOf: {
        color: 'color.shadow-color',
        offsetY: 'dimension.shadow-offset',
      },
      allTokens: {
        'color.shadow-color': { $type: 'color' } as TokenNormalized,
        'dimension.shadow-offset': { $type: 'dimension' } as TokenNormalized,
      },
    });
    const result = convertShadow(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 },
        offsetY: { value: 4, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens?.find((t) => t.idSuffix === 'color')?.aliasOf).toBe('color.shadow-color');
    expect(result.subTokens?.find((t) => t.idSuffix === 'offsetY')?.aliasOf).toBe('dimension.shadow-offset');
  });
});

describe('convertBorder', () => {
  it('splits border into color and width sub-tokens', () => {
    const ctx = createContext();
    const result = convertBorder(
      {
        color: { colorSpace: 'srgb', components: [0.8, 0.8, 0.8] },
        width: { value: 1, unit: 'px' },
        style: 'solid',
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(2);

    const colorToken = result.subTokens?.find((t) => t.idSuffix === 'color');
    expect(colorToken?.$type).toBe('color');

    const widthToken = result.subTokens?.find((t) => t.idSuffix === 'width');
    expect(widthToken?.$type).toBe('dimension');
    expect(widthToken?.value).toEqual({ value: 1, unit: 'px' });
  });

  it('drops style property and logs info', () => {
    const ctx = createContext();
    convertBorder(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0] },
        width: { value: 1, unit: 'px' },
        style: 'dashed',
      },
      ctx,
    );

    expect(ctx.logger.info).toHaveBeenCalled();
  });

  it('handles border with only color', () => {
    const ctx = createContext();
    const result = convertBorder(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0] },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(1);
    expect(result.subTokens?.[0]?.idSuffix).toBe('color');
  });

  it('handles border with only width', () => {
    const ctx = createContext();
    const result = convertBorder(
      {
        width: { value: 2, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(1);
    expect(result.subTokens?.[0]?.idSuffix).toBe('width');
  });

  it('warns and skips invalid border value', () => {
    const ctx = createContext();
    const result = convertBorder('not an object', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips border with no valid sub-properties', () => {
    const ctx = createContext();
    const result = convertBorder({ style: 'solid' }, ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('preserves aliasOf for primitive token references', () => {
    const ctx = createContext({
      partialAliasOf: {
        color: 'color.border-color',
        width: 'dimension.border-width',
      },
      allTokens: {
        'color.border-color': { $type: 'color' } as TokenNormalized,
        'dimension.border-width': { $type: 'dimension' } as TokenNormalized,
      },
    });
    const result = convertBorder(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0] },
        width: { value: 1, unit: 'px' },
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens?.find((t) => t.idSuffix === 'color')?.aliasOf).toBe('color.border-color');
    expect(result.subTokens?.find((t) => t.idSuffix === 'width')?.aliasOf).toBe('dimension.border-width');
  });

  it('skips invalid sub-properties but includes valid ones', () => {
    const ctx = createContext();
    const result = convertBorder(
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0] },
        width: { value: Infinity, unit: 'px' }, // Invalid
      },
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(1);
    expect(result.subTokens?.[0]?.idSuffix).toBe('color');
  });
});

describe('convertGradient', () => {
  it('splits 2-stop gradient into indexed color sub-tokens', () => {
    const ctx = createContext();
    const result = convertGradient(
      [
        { color: { colorSpace: 'srgb', components: [1, 0, 0] }, position: 0 },
        { color: { colorSpace: 'srgb', components: [0, 0, 1] }, position: 1 },
      ],
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(2);

    expect(result.subTokens?.[0]?.idSuffix).toBe('0.color');
    expect(result.subTokens?.[0]?.$type).toBe('color');
    expect(result.subTokens?.[0]?.value).toHaveProperty('colorSpace', 'srgb');

    expect(result.subTokens?.[1]?.idSuffix).toBe('1.color');
    expect(result.subTokens?.[1]?.$type).toBe('color');
  });

  it('splits 3+-stop gradient into indexed color sub-tokens', () => {
    const ctx = createContext();
    const result = convertGradient(
      [
        { color: { colorSpace: 'srgb', components: [1, 0, 0] }, position: 0 },
        { color: { colorSpace: 'srgb', components: [0, 1, 0] }, position: 0.5 },
        { color: { colorSpace: 'srgb', components: [0, 0, 1] }, position: 1 },
      ],
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(3);
    expect(result.subTokens?.map((t) => t.idSuffix)).toEqual(['0.color', '1.color', '2.color']);
  });

  it('drops position values and logs info', () => {
    const ctx = createContext();
    convertGradient(
      [
        { color: { colorSpace: 'srgb', components: [1, 0, 0] }, position: 0 },
        { color: { colorSpace: 'srgb', components: [0, 0, 1] }, position: 1 },
      ],
      ctx,
    );

    expect(ctx.logger.info).toHaveBeenCalled();
  });

  it('warns and skips invalid gradient value', () => {
    const ctx = createContext();
    const result = convertGradient('not an array', ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('warns and skips empty gradient array', () => {
    const ctx = createContext();
    const result = convertGradient([], ctx);

    expect(result.skip).toBe(true);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it('handles gradient stops without position', () => {
    const ctx = createContext();
    const result = convertGradient(
      [
        { color: { colorSpace: 'srgb', components: [1, 0, 0] } },
        { color: { colorSpace: 'srgb', components: [0, 0, 1] } },
      ],
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens).toHaveLength(2);
    // No info log about positions being dropped since there are none
    expect(ctx.logger.info).not.toHaveBeenCalled();
  });

  it('converts non-sRGB gradient colors', () => {
    const ctx = createContext();
    const result = convertGradient(
      [
        { color: { colorSpace: 'oklch', components: [0.5, 0.1, 0] }, position: 0 },
        { color: { colorSpace: 'oklch', components: [0.8, 0.1, 180] }, position: 1 },
      ],
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens?.[0]?.value).toHaveProperty('colorSpace', 'srgb');
    expect(result.subTokens?.[1]?.value).toHaveProperty('colorSpace', 'srgb');
  });

  it('preserves aliasOf for primitive token references', () => {
    const ctx = createContext({
      partialAliasOf: {
        '0.color': 'color.start',
        '1.color': 'color.end',
      },
      allTokens: {
        'color.start': { $type: 'color' } as TokenNormalized,
        'color.end': { $type: 'color' } as TokenNormalized,
      },
    });
    const result = convertGradient(
      [
        { color: { colorSpace: 'srgb', components: [1, 0, 0] }, position: 0 },
        { color: { colorSpace: 'srgb', components: [0, 0, 1] }, position: 1 },
      ],
      ctx,
    );

    expect(result.split).toBe(true);
    expect(result.subTokens?.find((t) => t.idSuffix === '0.color')?.aliasOf).toBe('color.start');
    expect(result.subTokens?.find((t) => t.idSuffix === '1.color')?.aliasOf).toBe('color.end');
  });
});
