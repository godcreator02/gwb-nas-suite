import { describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.js'

interface RegisteredPane {
  id: string
  client?: string
  style?: string
}

interface RegisteredCommand {
  name: string
  description: string
  usage: string
  plugin: string
}

/** 挂载替身：logger、立即执行的 effect，外壳与命令总线各给一个记录器 */
function mountWithRecorders(): { panes: RegisteredPane[]; commands: RegisteredCommand[] } {
  const panes: RegisteredPane[] = []
  const commands: RegisteredCommand[] = []
  const ctx = {
    logger: () => ({ info() {}, warn() {}, error() {} }),
    effect: (fn: () => unknown) => {
      fn()
      return () => {}
    },
    gwbShell: {
      registerPane: (def: RegisteredPane) => {
        panes.push(def)
      },
    },
    gwbCommands: {
      register: (def: RegisteredCommand) => {
        commands.push(def)
        return () => {}
      },
    },
  }
  apply(ctx as unknown as Parameters<typeof apply>[0])
  return { panes, commands }
}

describe('gwb-nas-board', () => {
  it('插件名跟包名派生自同一个短名', () => {
    expect(name).toBe('gwb-nas-board')
  })

  it('挂载时登记了一格窗格，浏览器半与样式表都报了地址', () => {
    const { panes } = mountWithRecorders()
    expect(panes).toHaveLength(1)
    expect(panes[0]?.id).toBe('main')
    expect(panes[0]?.client).toMatch(/^file:\/\/.+\/client\.js$/)
    expect(panes[0]?.style).toMatch(/^file:\/\/.+\/style\.css$/)
  })

  it('登记了一条 ping 命令：名字、归属、description 与 usage', () => {
    const { commands } = mountWithRecorders()
    expect(commands).toHaveLength(1)
    const ping = commands[0]
    expect(ping?.name).toBe('nas-board.ping')
    expect(ping?.plugin).toBe('@godcreator/gwb-nas-board')
    expect(ping?.description.trim()).not.toBe('')
    expect(ping?.usage).toContain('无参数')
  })
})