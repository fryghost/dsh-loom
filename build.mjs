/**
 * Bundle the client half.
 *
 * The client is CommonJS requiring `react`/`react-dom`, which the host page
 * provides. The module-loader banner/footer wrap the bundle so DSH can load it
 * as a plugin module rather than as a standalone script.
 */

import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/client.cjs'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  external: ['react', 'react-dom'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-loom', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
});
