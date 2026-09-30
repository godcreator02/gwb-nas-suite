import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // next dev 缺省会往站目录写一份 AGENTS.md 与 CLAUDE.md；这个仓给 agent 的说明只有仓根那一份生成物
  agentRules: false,
  /**
   * 故意留空：`@godcreator/docfirst-workflow` 不能放进来。它的 `./fumadocs/pre`（状态点）与 `./fumadocs/trajectory`（星轨盘）
   * 里有客户端组件，外置后 Next 用 Node 单独加载它们，和站打包的 React 不是同一份，预渲染报 `Cannot read properties of null (reading 'use')`。
   */
  serverExternalPackages: [],
  redirects: async () => [
    { source: '/', destination: '/docs', permanent: true },
    { source: '/outputs/:path*', destination: '/docs/outputs/:path*', permanent: false },
    { source: '/spec/:path*', destination: '/future/spec/:path*', permanent: false },
  ],
}

export default withMDX(config)
