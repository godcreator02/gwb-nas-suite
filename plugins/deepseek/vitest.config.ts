import { defineConfig } from 'vitest/config'

/** 打了 slow 标签的用例真打网络，`pnpm test` 跳过，`pnpm test:all` 才跑 */
export default defineConfig({
  test: {
    include: ['tests/**/*.{spec,test}.{ts,tsx}'],
    testTimeout: 20_000,
    fileParallelism: false,
    tags: [
      {
        name: 'slow',
        description: '真打网络的用例',
        timeout: 300_000,
      },
    ],
  },
})
