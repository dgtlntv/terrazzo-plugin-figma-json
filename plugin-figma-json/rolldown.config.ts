import { defineConfig } from 'rolldown';

export default defineConfig({
  input: {
    index: './src/index.ts',
  },
  platform: 'node',
  external: [
    '@terrazzo/cli',
    '@terrazzo/parser',
    /^@terrazzo\//,
    'wildcard-match',
    'colorjs.io',
    /^node:/,
  ],
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
  },
});
