import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

const files = ['dist/index.dev.mjs', 'dist/index.prod.mjs']

console.log('react-perf-scan bundle sizes (bytes, gzip):\n')

for (const rel of files) {
  const abs = join(root, '..', rel)
  const buf = readFileSync(abs)
  const gz = gzipSync(buf).length
  console.log(`${rel}\n  raw: ${buf.length}\n  gzip: ${gz}\n`)
}

console.log('Note: Req 7.5 targets <5KB gzip (dev) — track over time as the implementation is optimized.')
