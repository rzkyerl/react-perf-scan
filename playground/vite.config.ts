import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-perf-scan': path.resolve(__dirname, '../packages/react-perf-scan/src/index.ts'),
    },
  },
})
