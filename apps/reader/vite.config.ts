import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const packageRoot = fileURLToPath(new URL('../../packages', import.meta.url));
const waSqlitePublic = fileURLToPath(new URL('./public/wa-sqlite', import.meta.url));
const require = createRequire(import.meta.url);

function prepareWaSqlite(): void {
  const packageDirectory = dirname(require.resolve('wa-sqlite/package.json'));
  mkdirSync(waSqlitePublic, { recursive: true });
  for (const file of ['wa-sqlite.mjs', 'wa-sqlite.wasm']) {
    copyFileSync(join(packageDirectory, 'dist', file), join(waSqlitePublic, file));
  }
}

prepareWaSqlite();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@garagara/storage/browser',
        replacement: `${packageRoot}/storage/src/browser-adapter.ts`,
      },
      { find: '@garagara/storage', replacement: `${packageRoot}/storage/src/index.ts` },
      { find: '@garagara/lang-en', replacement: `${packageRoot}/lang-en/src/index.ts` },
      { find: '@garagara/llm', replacement: `${packageRoot}/llm/src/index.ts` },
      { find: '@garagara/core', replacement: `${packageRoot}/core/src/index.ts` },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
