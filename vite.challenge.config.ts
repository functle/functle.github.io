import { defineConfig } from 'vite';

// Both the Pages export and the standalone Worker serve this static directory.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'public/challenge/game',
    rolldownOptions: {
      input: 'src/challenge/client.ts',
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: 'match.js',
        assetFileNames: asset => asset.names.some(name => name.endsWith('.css'))
          ? 'match.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
