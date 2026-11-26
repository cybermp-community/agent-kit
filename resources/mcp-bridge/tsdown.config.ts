import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/index.ts',
  format: 'cjs',
  outDir: 'server/dist',
  deps: {
    alwaysBundle: [/.*/s],
  },
  clean: false,
  outputOptions: {
    cleanDir: false,
    entryFileNames: 'index.js',
  },
});
