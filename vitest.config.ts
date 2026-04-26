import { defineConfig, defineProject } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const alias = { '@': resolve(__dirname, './src') }

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      defineProject({
        plugins: [react()],
        test: {
          name: 'send',
          include: ['tests/api/send.test.ts'],
          environment: 'node',
          globals: true,
          mockReset: true,
        },
        resolve: { alias },
      }),
      defineProject({
        plugins: [react()],
        test: {
          name: 'default',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/api/send.test.ts'],
          environment: 'node',
          globals: true,
        },
        resolve: { alias },
      }),
    ],
  },
})
