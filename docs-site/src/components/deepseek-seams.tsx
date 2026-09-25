'use client'
import { useState, type ReactNode } from 'react'

type ModuleId = 'commands' | 'deepseek' | 'settings' | 'skills' | 'data' | 'outside'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface ModuleFrame extends Box {
  id: Exclude<ModuleId, 'outside'>
  packageName: string
  role: string
  optional?: boolean
}

interface Capability extends Box {
  id: string
  module: ModuleId
  name: string
  code: string
}

interface Seam {
  n: number
  kind: 'call' | 'disk'
  ends: string[]
  path: string
  badge: [number, number]
  title: string
  contract: ReactNode
  owner: ReactNode
  tests: ReactNode
}

const MODULES: ModuleFrame[] = [
  { id: 'commands', packageName: '@godcreator/gwb-commands', role: '命令总线', x: 270, y: 8, w: 330, h: 90 },
  { id: 'deepseek', packageName: '@godcreator/gwb-deepseek', role: '本仓：哑管道 + 记账', x: 190, y: 140, w: 400, h: 196 },
  { id: 'settings', packageName: '@godcreator/gwb-settings', role: '设置', x: 10, y: 128, w: 150, h: 104 },
  { id: 'skills', packageName: '@godcreator/gwb-skills', role: '说明书（可选）', x: 10, y: 246, w: 150, h: 104, optional: true },
  { id: 'data', packageName: '@godcreator/gwb-data', role: '数据', x: 260, y: 384, w: 240, h: 100 },
]

const CAPABILITIES: Capability[] = [
  { id: 'caller', module: 'outside', name: 'agent · 别的插件', code: "run('deepseek.chat', …)", x: 20, y: 28, w: 210, h: 48 },
  { id: 'bus', module: 'commands', name: '命令表', code: 'register · run', x: 288, y: 40, w: 294, h: 46 },
  { id: 'apply', module: 'deepseek', name: '接线', code: 'apply()', x: 206, y: 174, w: 110, h: 62 },
  { id: 'usage', module: 'deepseek', name: 'deepseek.usage', code: 'usageHandler', x: 326, y: 174, w: 118, h: 62 },
  { id: 'chat', module: 'deepseek', name: 'deepseek.chat', code: 'requestCompletion', x: 454, y: 174, w: 120, h: 62 },
  { id: 'core', module: 'deepseek', name: '纯函数 core.ts', code: 'parseChatArgs · buildBody · classifyStatus · aggregateUsage', x: 206, y: 250, w: 368, h: 70 },
  { id: 'settingStore', module: 'settings', name: '设置项', code: 'define · get', x: 22, y: 160, w: 126, h: 62 },
  { id: 'skillTable', module: 'skills', name: '说明书表', code: 'register(dir)', x: 22, y: 278, w: 126, h: 62 },
  { id: 'docStore', module: 'data', name: '文档存取', code: "readDoc · writeDoc", x: 276, y: 416, w: 208, h: 56 },
  { id: 'api', module: 'outside', name: 'DeepSeek 开放平台', code: 'POST /chat/completions', x: 612, y: 170, w: 140, h: 70 },
  { id: 'journal', module: 'outside', name: '磁盘上的 journal.json', code: '记账数组，最多 500 条', x: 556, y: 414, w: 196, h: 56 },
]

const SEAMS: Seam[] = [
  {
    n: 1,
    kind: 'call',
    ends: ['bus', 'apply', 'chat', 'usage'],
    path: 'M435 86 L435 158 L385 174 M435 158 L514 174',
    badge: [435, 122],
    title: '命令总线 ↔ 两条命令',
    contract: (
      <>
        加载时 <code>register({'{'} name, description, usage, plugin {'}'}, handler)</code> 登记 <code>deepseek.chat</code> 与{' '}
        <code>deepseek.usage</code>；调用时总线把参数原样交给 <code>handler(args)</code>，拿回{' '}
        <code>{'{ ok: true, data }'}</code> 或 <code>{'{ ok: false, error, detail }'}</code>。
      </>
    ),
    owner: '参数校验与回执形状归本插件；按名字转发、核对登记方包名、卸载时注销归命令总线。',
    tests: 'plugin.test.ts 断言两条命令的名字、归属与 usage；chat-request.test.ts 断言各种回执。',
  },
  {
    n: 2,
    kind: 'call',
    ends: ['apply', 'chat', 'settingStore'],
    path: 'M206 196 L148 192',
    badge: [177, 194],
    title: '本插件 → 设置',
    contract: (
      <>
        加载时 <code>define</code> 三项：<code>api-key</code>（secret）、<code>model</code>、<code>base-url</code>；每次{' '}
        <code>deepseek.chat</code> 都现读 <code>get(key)</code>，改了设置下一次调用就生效。
      </>
    ),
    owner: 'key 名与缺省值归本插件：key 为空直接回 bad_key、不发请求；model、base-url 为空用 deepseek-chat 与官方地址。存储与设置界面归设置插件。',
    tests: 'plugin.test.ts 断言三项定义与 key 没配回 bad_key；chat-request.test.ts 断言两个缺省值。',
  },
  {
    n: 3,
    kind: 'call',
    ends: ['chat', 'api'],
    path: 'M574 205 L612 205',
    badge: [593, 190],
    title: '本插件 → DeepSeek 开放平台',
    contract: (
      <>
        <code>POST {'{base-url}'}/chat/completions</code>，头 <code>authorization: Bearer &lt;key&gt;</code>，体{' '}
        <code>{'{ model, messages, stream: false, response_format? }'}</code>；超时缺省 60 秒、上限 110 秒。应答取{' '}
        <code>choices[0].message.content</code> 与 <code>usage.*_tokens</code>。
      </>
    ),
    owner: '失败归类归本插件：401/403 → bad_key，429 → rate_limit，超时 → timeout，其余 → bad_response。不重试、不缓存，要不要再调由调用方决定。',
    tests: 'core.test.ts 测归类与解析；chat-request.test.ts 把 fetch 换成替身测整条路径；real-call.test.ts 真调一次（slow）。',
  },
  {
    n: 4,
    kind: 'call',
    ends: ['chat', 'usage', 'docStore'],
    path: 'M385 336 L385 416',
    badge: [385, 366],
    title: '本插件 → 数据插件',
    contract: (
      <>
        <code>deepseek.chat</code> 每次发出请求后 <code>readDoc('journal')</code>、追加一条、<code>writeDoc('journal', entries)</code>；
        <code>deepseek.usage</code> 只读同一份，按天过滤、按调用方汇总。
      </>
    ),
    owner: '记账写不进去只写一条警告日志，回执不变。参数不合法、key 没配的调用不记账。',
    tests: 'chat-request.test.ts 断言每种结果记下的条目与写失败时的回执；core.test.ts 测裁剪与汇总。',
  },
  {
    n: 5,
    kind: 'disk',
    ends: ['docStore', 'journal'],
    path: 'M484 444 L556 442',
    badge: [520, 428],
    title: '数据插件 → 磁盘',
    contract: (
      <>
        数据插件把文档 <code>journal</code> 存成 <code>journal.json</code>：一个数组，每条{' '}
        <code>{'{ at, caller, model, ok, error?, usage? }'}</code>，满 500 条从最老的删。
      </>
    ),
    owner: '条目的形状与条数上限归本插件（core.ts 的 JournalEntry、JOURNAL_KEEP）；文件放在哪、怎么读写归数据插件。',
    tests: '本仓没有测试直接读这个文件；条目形状由 core.test.ts 与 chat-request.test.ts 覆盖。',
  },
  {
    n: 6,
    kind: 'call',
    ends: ['apply', 'skillTable'],
    path: 'M206 224 L178 224 L178 309 L148 309',
    badge: [178, 266],
    title: '本插件 → 说明书插件（可选）',
    contract: (
      <>
        局部注入 <code>ctx.inject(['gwbSkills'], …)</code>，在里面 <code>register(new URL('../skills/', import.meta.url))</code>，
        登记随包发布的说明书 <code>deepseek</code>。
      </>
    ),
    owner: '说明书插件没装，两条命令照常可用，只是 agent 读不到说明书。说明书的正文归本仓文档站的生成正本。',
    tests: 'plugin.test.ts 断言登记了一个 skills 目录。',
  },
]

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥']

function capabilityById(id: string): Capability {
  const found = CAPABILITIES.find((capability) => capability.id === id)
  if (found === undefined) throw new Error(`接缝图里没有能力 ${id}`)
  return found
}

function seamsTouchingModule(moduleId: ModuleId): Seam[] {
  return SEAMS.filter((seam) => seam.ends.some((end) => capabilityById(end).module === moduleId))
}

export function DeepseekSeams() {
  const [activeSeamNumber, setActiveSeamNumber] = useState<number | null>(null)
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null)

  const activeSeam = SEAMS.find((seam) => seam.n === activeSeamNumber)
  const litSeams: Seam[] = activeSeam !== undefined ? [activeSeam] : activeModule !== null ? seamsTouchingModule(activeModule) : []
  const litCapabilityIds = new Set(litSeams.flatMap((seam) => seam.ends))
  if (activeModule !== null && activeSeam === undefined) {
    for (const capability of CAPABILITIES) if (capability.module === activeModule) litCapabilityIds.add(capability.id)
  }
  const somethingSelected = activeSeam !== undefined || activeModule !== null

  const pickSeam = (n: number) => {
    setActiveModule(null)
    setActiveSeamNumber((current) => (current === n ? null : n))
  }
  const pickModule = (moduleId: ModuleId) => {
    setActiveSeamNumber(null)
    setActiveModule((current) => (current === moduleId ? null : moduleId))
  }

  return (
    <figure className="not-prose deepseek-seams my-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <svg viewBox="0 0 760 496" className="block h-auto w-full" role="img" aria-label="deepseek 插件的接缝图">
        <defs>
          <marker id="deepseek-seams-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" className="fill-fd-muted-foreground" />
          </marker>
        </defs>

        {MODULES.map((module) => {
          const dimmed = somethingSelected && !CAPABILITIES.some((c) => c.module === module.id && litCapabilityIds.has(c.id))
          return (
            <g
              key={module.id}
              className="cursor-pointer"
              style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 200ms' }}
              onClick={() => pickModule(module.id)}
            >
              <rect
                x={module.x}
                y={module.y}
                width={module.w}
                height={module.h}
                rx={10}
                className="fill-transparent"
                style={{
                  stroke: activeModule === module.id ? 'var(--seam-hot)' : 'var(--seam-frame)',
                  strokeDasharray: module.optional === true ? '3 5' : '7 5',
                  strokeWidth: 1.4,
                  transition: 'stroke 200ms',
                }}
              />
              <text x={module.x + 10} y={module.y + 17} className="fill-fd-foreground" fontSize={11.5} fontWeight={600}>
                {module.role}
              </text>
              <text x={module.x + 10} y={module.y + 29} className="fill-fd-muted-foreground" fontSize={9.5}>
                {module.packageName}
              </text>
            </g>
          )
        })}

        <path d="M230 52 L288 60" markerEnd="url(#deepseek-seams-arrow)" className="stroke-fd-muted-foreground" strokeWidth={1.2} fill="none" />

        {SEAMS.map((seam) => {
          const lit = litSeams.includes(seam)
          return (
            <path
              key={seam.n}
              d={seam.path}
              fill="none"
              style={{
                stroke: lit ? 'var(--seam-hot)' : seam.kind === 'disk' ? 'var(--seam-disk)' : 'var(--seam-line)',
                strokeWidth: lit ? 2.6 : 1.6,
                strokeDasharray: seam.kind === 'disk' ? '5 4' : undefined,
                opacity: somethingSelected && !lit ? 0.25 : 1,
                transition: 'stroke 200ms, stroke-width 200ms, opacity 200ms',
              }}
            />
          )
        })}

        {CAPABILITIES.map((capability) => {
          const lit = litCapabilityIds.has(capability.id)
          const outside = capability.module === 'outside'
          return (
            <g key={capability.id} style={{ opacity: somethingSelected && !lit ? 0.3 : 1, transition: 'opacity 200ms' }}>
              <rect
                x={capability.x}
                y={capability.y}
                width={capability.w}
                height={capability.h}
                rx={outside ? 14 : 6}
                style={{
                  fill: lit ? 'var(--seam-hot-soft)' : 'var(--color-fd-background)',
                  stroke: lit ? 'var(--seam-hot)' : 'var(--color-fd-border)',
                  strokeWidth: lit ? 1.8 : 1,
                  transition: 'fill 200ms, stroke 200ms',
                }}
              />
              <text x={capability.x + 8} y={capability.y + 20} className="fill-fd-foreground" fontSize={12} fontWeight={600}>
                {capability.name}
              </text>
              <foreignObject x={capability.x + 6} y={capability.y + 26} width={capability.w - 12} height={capability.h - 28}>
                <div className="text-fd-muted-foreground" style={{ fontSize: 10, lineHeight: 1.35, fontFamily: 'var(--font-mono, monospace)' }}>
                  {capability.code}
                </div>
              </foreignObject>
            </g>
          )
        })}

        {SEAMS.map((seam) => {
          const lit = litSeams.includes(seam)
          return (
            <g
              key={`badge-${seam.n}`}
              className="cursor-pointer"
              onClick={() => pickSeam(seam.n)}
              role="button"
              aria-label={`接缝 ${seam.n}：${seam.title}`}
            >
              <circle
                cx={seam.badge[0]}
                cy={seam.badge[1]}
                r={10}
                style={{
                  fill: lit ? 'var(--seam-hot)' : 'var(--color-fd-card)',
                  stroke: seam.kind === 'disk' && !lit ? 'var(--seam-disk)' : 'var(--seam-hot)',
                  strokeWidth: 1.6,
                  transition: 'fill 200ms',
                }}
              />
              <text
                x={seam.badge[0]}
                y={seam.badge[1] + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                style={{ fill: lit ? 'var(--color-fd-card)' : 'var(--seam-hot)' }}
              >
                {seam.n}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="flex flex-wrap gap-2 border-t border-fd-border px-4 py-3">
        {SEAMS.map((seam) => (
          <button
            key={seam.n}
            type="button"
            onClick={() => pickSeam(seam.n)}
            aria-pressed={activeSeamNumber === seam.n}
            className="rounded-md border border-fd-border px-2.5 py-1 text-xs text-fd-foreground transition-colors aria-pressed:border-[var(--seam-hot)] aria-pressed:text-[var(--seam-hot)]"
          >
            {CIRCLED[seam.n - 1]} {seam.title}
          </button>
        ))}
      </div>

      <figcaption className="min-h-[7.5rem] border-t border-fd-border px-4 py-3 text-sm leading-relaxed text-fd-muted-foreground">
        {activeSeam !== undefined ? (
          <div className="space-y-1.5">
            <p className="font-semibold text-fd-foreground">
              {CIRCLED[activeSeam.n - 1]} {activeSeam.title}
            </p>
            <p>
              <span className="text-fd-foreground">传什么：</span>
              {activeSeam.contract}
            </p>
            <p>
              <span className="text-fd-foreground">谁负责：</span>
              {activeSeam.owner}
            </p>
            <p>
              <span className="text-fd-foreground">测试：</span>
              {activeSeam.tests}
            </p>
          </div>
        ) : activeModule !== null ? (
          <p>已淡化和这个模块无关的部分；再点一次模块框恢复。点编号看某一条接缝的契约。</p>
        ) : (
          <p>
            虚线框是插件，框里的方块是它对这张图有用的能力，圆角方块是插件之外的东西。实线是代码调用，虚线是读写磁盘。点编号看这条接缝两端是谁、传什么、谁负责；点一个虚线框，淡化和它无关的部分。
          </p>
        )}
      </figcaption>
    </figure>
  )
}
