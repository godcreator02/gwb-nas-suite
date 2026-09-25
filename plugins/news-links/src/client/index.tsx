import type { PaneArgs, PaneHandle } from '@godcreator/gwb-shell/pane'
import { useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

/** 类名一律带 `newslinks:` 前缀：样式只作用于本插件靠的是类名前缀，不靠 DOM 祖先关系（弹层挂到 body 上也有样式） */
function Pane(): ReactElement {
  const [count, setCount] = useState(0)
  return (
    <div className="newslinks:h-full newslinks:space-y-4 newslinks:p-8">
      <h1 className="newslinks:text-2xl newslinks:font-semibold">你好，资讯精选阅读器</h1>
      <p className="newslinks:text-sm newslinks:text-muted-foreground">
        模板窗格。按钮只改本地状态；命令 news-links.ping 在 node 侧，经命令总线调用。
      </p>
      <div className="newslinks:flex newslinks:items-center newslinks:gap-3">
        <button
          data-probe="bump"
          className="newslinks:rounded newslinks:bg-primary newslinks:px-3 newslinks:py-1.5 newslinks:text-sm newslinks:text-primary-foreground"
          onClick={() => setCount((n) => n + 1)}
        >
          +1
        </button>
        <span className="newslinks:font-mono newslinks:text-2xl" data-probe="count">
          {count}
        </span>
      </div>
    </div>
  )
}

/** 外壳按固定的导出名 `mountPane` 挂载窗格，关窗格时调返回的 `dispose` */
export function mountPane(_args: PaneArgs, container: HTMLElement): PaneHandle {
  const root = createRoot(container)
  root.render(<Pane />)
  return {
    dispose() {
      root.unmount()
      container.textContent = ''
    },
  }
}
