import type { PaneArgs, PaneHandle } from '@godcreator/gwb-shell/pane'
import { useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * 浏览器侧：一个窗格，你好 + 计数按钮。
 *
 * 类名一律带 `nasboard:` 前缀：样式只作用于本插件，靠的是类名唯一，不靠 DOM 祖先关系（弹层
 * portal 到 body 也有样式）。样式入口在 `styles.css`，那几行 import 每一条都不能省，理由写在那边。
 * react 由页面的 importmap 提供（提供方是内核包），构建时不打包，见 build.ts。
 * 外壳传入的参数与要返回的句柄，类型从外壳的 `@godcreator/gwb-shell/pane` 取（只有类型，产物里不留 import）。
 */

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

/**
 * 窗格插件浏览器侧的入口，导出名固定是 `mountPane`。返回 `{ dispose }`：关闭窗格时外壳调用它，
 * 由它卸载这棵 React 树。
 */
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
