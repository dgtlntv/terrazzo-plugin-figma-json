import type { Resolver } from '@terrazzo/parser';
import { describe, expect, it, vi } from 'vitest';
import { getDefaultInput } from '../src/utils.js';

function createResolver(resolutionOrder: unknown[]) {
  const listPermutations = vi.fn(() => {
    throw new Error('listPermutations must not be called');
  });
  const resolver = {
    source: { resolutionOrder },
    listPermutations,
  } as unknown as Resolver;

  return { resolver, listPermutations };
}

describe('getDefaultInput', () => {
  it('reads explicit modifier defaults without listing permutations', () => {
    const { resolver, listPermutations } = createResolver([
      { type: 'set', name: 'foundation' },
      {
        type: 'modifier',
        name: 'colorScheme',
        contexts: { light: [], dark: [] },
        default: 'dark',
      },
    ]);

    expect(getDefaultInput(resolver)).toEqual({ colorScheme: 'dark' });
    expect(listPermutations).not.toHaveBeenCalled();
  });

  it('uses the first modifier context when no default is declared', () => {
    const { resolver, listPermutations } = createResolver([
      {
        type: 'modifier',
        name: 'density',
        contexts: { comfortable: [], compact: [] },
      },
    ]);

    expect(getDefaultInput(resolver)).toEqual({ density: 'comfortable' });
    expect(listPermutations).not.toHaveBeenCalled();
  });

  it('returns an empty input when there are no active modifiers', () => {
    const { resolver, listPermutations } = createResolver([{ type: 'set', name: 'foundation' }]);

    expect(getDefaultInput(resolver)).toEqual({});
    expect(listPermutations).not.toHaveBeenCalled();
  });
});
