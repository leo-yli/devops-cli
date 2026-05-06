import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.tsx'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: true,
  outExtension: () => ({ js: '.js' }),
  esbuildOptions(options) {
    options.jsx = 'transform';
    options.jsxFactory = 'React.createElement';
    options.jsxFragment = 'React.Fragment';
  },
  external: [],
});
