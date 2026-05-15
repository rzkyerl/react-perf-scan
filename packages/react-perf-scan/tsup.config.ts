import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { 'index.dev': 'src/index.ts' },
    format: ['esm', 'cjs'],
    outDir: 'dist',
    dts: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    target: 'es2022',
    external: ['react', 'react-dom', 'react-dom/client'],
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' }
    },
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        'process.env.NODE_ENV': JSON.stringify('development'),
      }
    },
  },
  {
    entry: { 'index.prod': 'src/index.prod.ts' },
    format: ['esm', 'cjs'],
    outDir: 'dist',
    clean: false,
    dts: false,
    sourcemap: true,
    treeshake: true,
    splitting: false,
    target: 'es2022',
    external: ['react', 'react-dom', 'react-dom/client'],
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' }
    },
    esbuildOptions(options) {
      options.define = {
        ...options.define,
        'process.env.NODE_ENV': JSON.stringify('production'),
      }
    },
  },
])
