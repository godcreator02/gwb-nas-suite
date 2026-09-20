import { useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * 浏览器半——一格窗格：你好 + 计数按钮。
 *
 * 类名一律带 `newslinks:` 前缀：围栏来自名字唯一，不靠 DOM 祖先关系（弹层 portal 到
 * 哪都有样式）。样式入口在 `styles.css`，这五行 import 每一条都不能省，注释在那边。
 * react 走页面的共享表（importmap 解析到 gwb-shared-react），构建时外置——见 build.ts。
 */

/** 外壳调 mountPane 时给的那几样。按形状收，不牵 shell 的包——那是 node 半的 */
interface PaneArgs {
  pane: { id: string; instance: string }
}

function Pane(): ReactElement {
  const [count, setCount] = useState(0)
  return (
    <div className="newslinks:h-full newslinks:space-y-4 newslinks:p-8">
      <h1 className="newslinks:text-2xl newslinks:font-semibold">你好，资讯精选阅读器</h1>
      <p className="newslinks:text-sm newslinks:text-muted-foreground">
        模板窗格。这颗按钮走本地状态；命令面那条 news-links.ping 在 node 半，经命令总线调。
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

/**
 * 窗格件浏览器半的入口。导出名是 `mountPane`——外壳占整页那个根，窗格占井里一格，
 * 两个角色各用各的动词。回一个 `{ dispose }`：关格时外壳调它，这棵 React 树得有人拆。
 */
export function mountPane(_args: PaneArgs, container: HTMLElement): { dispose(): void } {
  const root = createRoot(container)
  root.render(<Pane />)
  return {
    dispose() {
      root.unmount()
      container.textContent = ''
    },
  }
}
