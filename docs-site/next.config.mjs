import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  /**
   * 故意留空：`@godcreator/docfirst-workflow` 与 `@godcreator/docfirst-trajectory` 都不能放进来。
   * 两个包里都有客户端组件（前者 `/fumadocs/pre` 的状态点，后者 `./react` 的星轨盘），外置后 Next 用 Node 单独加载它们，
   * 和站打包的 React 不是同一份，预渲染报 `Cannot read properties of null (reading 'use')`。
   * trajectory 的 `./server` 还用包名引用自己的 `./react`，外置后 `"use client"` 指令被丢掉，星轨盘被当成服务端组件渲染，一用 hooks 就报错。
   */
  serverExternalPackages: [],
  redirects: async () => [
    { source: '/', destination: '/docs', permanent: true },
    { source: '/outputs/:path*', destination: '/docs/outputs/:path*', permanent: false },
    { source: '/spec/:path*', destination: '/future/spec/:path*', permanent: false },
  ],
}

export default withMDX(config)
