import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 空的类型 import 只为让两个包的 `declare module 'cordis'` 生效，ctx 上才有 gwbCommands / gwbShell 的类型
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-shell'

/** 还是 devkit 模板的形状：一个窗格、一条 ping 命令。要做成什么见文档站 `content/future/spec/nas-board.mdx` */
export const name = 'gwb-nas-board'

/** 构建后浏览器侧脚本、样式表与 index.js 同在 dist/，地址按本模块的地址算 */
const CLIENT_URL = new URL('./client.js', import.meta.url).href
const STYLE_URL = new URL('./style.css', import.meta.url).href

export const inject = ['gwbCommands', 'gwbShell']

export function apply(ctx: GwbContext): void {
  const log = ctx.logger(name)
  const shell = ctx.gwbShell
  const commands = ctx.gwbCommands
  // 命令总线在类型上是可选的（内核也声明了它）；inject 保证了它在，不在就是加载顺序出了错，直接报
  if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用 apply')
  log.info('NAS 体检看板已加载')

  // 窗格与命令都随本插件卸载自动注销
  shell.registerPane({ id: 'main', title: 'NAS 体检看板', client: CLIENT_URL, style: STYLE_URL })

  commands.register(
    {
      name: 'nas-board.ping',
      description: '模板自带的命令：返回插件名与当前时间，用来确认插件已加载',
      usage: '无参数。返回 { plugin, time }：插件名与 ISO 时刻',
      effect: 'read',
      plugin: '@godcreator/gwb-nas-board',
    },
    async () => ({ ok: true, data: { plugin: name, time: new Date().toISOString() } }),
  )
}
