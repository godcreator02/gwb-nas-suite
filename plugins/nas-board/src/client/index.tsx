import type { PaneArgs, PaneHandle } from '@godcreator/gwb-shell/pane'
import { useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

/** 类名一律带 `nasboard:` 前缀：样式只作用于本插件靠的是类名前缀，不靠 DOM 祖先关系（弹层挂到 body 上也有样式） */
function Pane(): ReactElement {
  const [count, setCount] = useState(0)
  return (
    <div className="nasboard:h-full nasboard:space-y-4 nasboard:p-8">
      <h1 className="nasboard:text-2xl nasboard:font-semibold">你好，NAS 体检看板</h1>
      <p className="nasboard:text-sm nasboard:text-muted-foreground">
        模板窗格。按钮只改本地状态；命令 nas-board.ping 在 node 侧，经命令总线调用。
      </p>
      <div className="nasboard:flex nasboard:items-center nasboard:gap-3">
        <button
          data-probe="bump"
          className="nasboard:rounded nasboard:bg-primary nasboard:px-3 nasboard:py-1.5 nasboard:text-sm nasboard:text-primary-foreground"
          onClick={() => setCount((n) => n + 1)}
        >
          +1
        </button>
        <span className="nasboard:font-mono nasboard:text-2xl" data-probe="count">
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
