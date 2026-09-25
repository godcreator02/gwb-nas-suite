import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
// 只为激活这几个插件的 `declare module 'cordis'`——它们给 ctx 加上 gwbCommands / gwbSettings / gwbData / gwbSkills
import type {} from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-settings'
import type {} from '@godcreator/gwb-data'
import type {} from '@godcreator/gwb-skills'
import {
  DEFAULT_TIMEOUT_MS,
  aggregateUsage,
  appendJournal,
  buildBody,
  classifyException,
  classifyStatus,
  parseChatArgs,
  parseCompletion,
  parseUsageArgs,
  type JournalEntry,
} from './core.js'

/**
 * DeepSeek 命令插件（只有 node 侧）：**哑管道 + 记账**。
 * `deepseek.chat` 把调用原样发给 DeepSeek、把结果原样带回——不重试、不熔断、不缓存，
 * 降级策略全在调用方；每次调用（含失败）记账落 gwbData，`deepseek.usage` 按调用方汇总。
 * key / model / base-url 住 gwbSettings，key 是 secret 型、不随包发、不进日志。
 */
export const name = 'gwb-deepseek'

/** 命令登记的 plugin 字段写包名——index 回执按它归属 */
const PKG = '@godcreator/gwb-deepseek'

/** 缺哪个服务，插件都不加载——inject 是 cordis 的等待机制，不是建议 */
export const inject = ['gwbCommands', 'gwbSettings', 'gwbData']

const API_KEY = 'api-key'
const MODEL = 'model'
const BASE_URL = 'base-url'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
/** gwbData 文档名一律 kebab-case（后缀 .json 由 data 插件自己补）——带点号会被直接拒绝 */
const JOURNAL_DOC = 'journal'

/** 说明书随包发，从产物位置反推：dist/index.js 的上一级就是 skills/ */
const SKILLS_DIR = new URL('../skills/', import.meta.url)

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 记账落盘用到的 gwbData 方法——结构类型，不为它引入包 */
interface DocStore {
  readDoc(doc: string): Promise<unknown>
  writeDoc(doc: string, value: unknown): Promise<void>
}

/** 记账失败只写一条警告日志、不改动回执——成功的调用不能因为记账没写上变成失败 */
async function record(store: DocStore, warn: (message: string) => void, entry: JournalEntry): Promise<void> {
  try {
    const current = await store.readDoc(JOURNAL_DOC)
    await store.writeDoc(JOURNAL_DOC, appendJournal(current, entry))
  } catch (err) {
    warn(`记账落盘失败（调用结果不受影响）：${String(err)}`)
  }
}

export function apply(ctx: GwbContext): void {
  // 插件输出日志的正规途径：logger 的输出进日志窗格，console 的不进
  const log = ctx.logger(name)
  const commands = ctx.gwbCommands
  const settings = ctx.gwbSettings
  const data = ctx.gwbData
  // 命令总线在类型上是可选的（内核也声明了它）；inject 保证了它在，不在就是加载顺序出了错，直接报
  if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用 apply')
  log.info('DeepSeek 命令插件已加载')

  // 说明书：一份说明书一个子目录（skills/deepseek/）。局部注入——说明书插件没装，命令照常可用
  ctx.inject(['gwbSkills'], (c) => {
    c.effect(() => c.gwbSkills.register(SKILLS_DIR))
  })

  settings.define({
    key: API_KEY,
    title: 'DeepSeek API key',
    type: 'secret',
    description: 'DeepSeek 开放平台的 key（sk- 开头）；不随包发、不进日志',
    default: '',
  })
  settings.define({
    key: MODEL,
    title: '模型',
    type: 'string',
    description: '缺省 deepseek-chat；要推理模型填 deepseek-reasoner',
    default: DEFAULT_MODEL,
  })
  settings.define({
    key: BASE_URL,
    title: 'API 地址',
    type: 'string',
    description: '协议://主机[:口]，不带路径；官方就是 https://api.deepseek.com',
    default: DEFAULT_BASE_URL,
  })

  // 命令总线继承 cordis 的 Service：本插件卸载时，命令自动注销
  commands.register(
    {
      name: 'deepseek.chat',
      description:
        '把一次 DeepSeek 调用原样发出去、把结果原样带回。哑管道：不重试不缓存，降级策略在调用方；caller 写明调用方、进记账。见 skill「deepseek」',
      usage:
        '{ prompt 必给（非空字符串）, system?, jsonMode?（布尔；DeepSeek 要求 prompt 里出现 json 字样）, timeoutMs?（正数毫秒，缺省 60000，超过 110000 按 110000）, caller?（非空字符串，截到 64 字，缺省 adhoc）, model?（非空字符串，缺省取设置 model）}。' +
        '成功回 { ok: true, data: { text, usage: { promptTokens, completionTokens, totalTokens }, model, caller } }；' +
        '失败回 { ok: false, error: "timeout" | "rate_limit" | "bad_key" | "bad_response" | "bad_args"（参数不合法）, detail }',
      plugin: PKG,
    },
    async (args: unknown) => {
      const parsed = parseChatArgs(args)
      if (!parsed.ok) return { ok: false as const, error: 'bad_args' as const, detail: parsed.error }
      const a = parsed.value

      const key = asString(settings.get(API_KEY))
      if (key === '') {
        return { ok: false as const, error: 'bad_key' as const, detail: 'deepseek 的 api-key 没配——到「设置」里填上再调' }
      }
      const model = a.model ?? (asString(settings.get(MODEL)) || DEFAULT_MODEL)
      const baseUrl = asString(settings.get(BASE_URL)) || DEFAULT_BASE_URL

      const entry: JournalEntry = { at: new Date().toISOString(), caller: a.caller, model, ok: false }
      try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify(buildBody(a, model)),
          signal: AbortSignal.timeout(a.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        })
        const text = await res.text()
        if (!res.ok) {
          const c = classifyStatus(res.status, text)
          entry.error = c.kind
          await record(data, (m) => log.warn(m), entry)
          return { ok: false as const, error: c.kind, detail: c.detail }
        }
        let payload: unknown
        try {
          payload = JSON.parse(text)
        } catch {
          entry.error = 'bad_response'
          await record(data, (m) => log.warn(m), entry)
          return { ok: false as const, error: 'bad_response' as const, detail: `应答不是 JSON：${text.slice(0, 300)}` }
        }
        const completion = parseCompletion(payload)
        if (!completion.ok) {
          entry.error = 'bad_response'
          await record(data, (m) => log.warn(m), entry)
          return { ok: false as const, error: 'bad_response' as const, detail: completion.error }
        }
        entry.ok = true
        entry.usage = completion.value.usage
        await record(data, (m) => log.warn(m), entry)
        log.info(
          `${a.caller} → ${model} tokens=${completion.value.usage.totalTokens}${a.jsonMode === true ? '（json）' : ''}`,
        )
        return {
          ok: true as const,
          data: { text: completion.value.text, usage: completion.value.usage, model, caller: a.caller },
        }
      } catch (err) {
        const c = classifyException(err)
        entry.error = c.kind
        await record(data, (m) => log.warn(m), entry)
        return { ok: false as const, error: c.kind, detail: c.detail }
      }
    },
  )

  commands.register(
    {
      name: 'deepseek.usage',
      description: '按调用方汇总 DeepSeek 调用的记账：调用次数、成功与失败数、token 总数',
      usage:
        '{ days?（正整数，缺省 30，上限 3650；不是正整数按 30）}，不给参数也行。' +
        '回 { ok: true, data: { days, byCaller: [{ caller, calls, ok, failed, totalTokens }]（按 totalTokens 降序）, total: { caller: "全部", calls, ok, failed, totalTokens } } }',
      plugin: PKG,
    },
    async (args: unknown) => {
      const days = parseUsageArgs(args)
      const entries = await data.readDoc(JOURNAL_DOC)
      return { ok: true as const, data: { days, ...aggregateUsage(entries, days) } }
    },
  )
}
