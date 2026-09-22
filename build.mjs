/**
 * Bundle the client half.
 *
 * The client requires modules the host page provides from its frozen platform
 * table (see `PLATFORM_MODULES` in the shell): react, react-dom, and the
 * design-system atoms. They stay EXTERNAL so the bundle shares the shell's
 * single instance and its already-loaded styles rather than shipping a second
 * copy. The module-loader banner/footer wrap the bundle so DSH can load it as a
 * plugin module rather than as a standalone script.
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
  external: [
    'react',
    'react-dom',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-loom', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
});
