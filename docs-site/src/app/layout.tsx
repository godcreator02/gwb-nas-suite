import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'
import './global.css'

// 带侧栏的布局在 src/app/docs/layout.tsx，现状、未来与轨迹卡页共用；整页星轨盘不套侧栏
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
