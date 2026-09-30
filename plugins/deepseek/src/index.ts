import type { GwbContext } from '@godcreator/gwb-kernel-desktop'
import type { GwbDataApi } from '@godcreator/gwb-data'
import type { GwbSettingsApi } from '@godcreator/gwb-settings'
// 空的类型 import 让这两个包的 `declare module 'cordis'` 生效，ctx 上才有 gwbCommands / gwbSkills 的类型
import type {} from '@godcreator/gwb-commands'
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
  type ChatArgs,
  type ChatErrorKind,
  type JournalEntry,
  type TokenUsage,
} from './core.js'

export const name = 'gwb-deepseek'

const PACKAGE_NAME = '@godcreator/gwb-deepseek'

export const inject = ['gwbCommands', 'gwbSettings', 'gwbData']

const SETTING_API_KEY = 'api-key'
const SETTING_MODEL = 'model'
const SETTING_BASE_URL = 'base-url'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
/** 数据插件只收 kebab-case 的文档名（`.json` 后缀它自己补），带点号的直接拒 */
const JOURNAL_DOC_NAME = 'journal'
/** 说明书随包发布在 `skills/` 下，产物 `dist/index.js` 的上一级就是它 */
const SKILLS_DIR = new URL('../skills/', import.meta.url)

type PluginLogger = ReturnType<GwbContext['logger']>

/** 一次请求的结果：成功带正文与 token，失败带四类错误之一 */
type CompletionOutcome = { ok: true; text: string; usage: TokenUsage } | { ok: false; kind: ChatErrorKind; detail: string }

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 记账写不进去只写一条警告日志，不改回执：调用本身已经成功或失败，结果不能因为记账变 */
async function appendToJournal(store: GwbDataApi, warn: (message: string) => void, entry: JournalEntry): Promise<void> {
  try {
    const current = await store.readDoc(JOURNAL_DOC_NAME)
    await store.writeDoc(JOURNAL_DOC_NAME, appendJournal(current, entry))
  } catch (err) {
    warn(`记账落盘失败（调用结果不受影响）：${String(err)}`)
  }
}

function defineSettings(settings: GwbSettingsApi): void {
  settings.define({
    key: SETTING_API_KEY,
    title: 'DeepSeek API key',
    type: 'secret',
    description: 'DeepSeek 开放平台的 key（sk- 开头）；不随包发、不进日志',
    default: '',
  })
  settings.define({
    key: SETTING_MODEL,
    title: '模型',
    type: 'string',
    description: '缺省 deepseek-chat；要推理模型填 deepseek-reasoner',
    default: DEFAULT_MODEL,
  })
  settings.define({
    key: SETTING_BASE_URL,
    title: 'API 地址',
    type: 'string',
    description: '协议://主机[:端口]，不带路径；官方就是 https://api.deepseek.com',
    default: DEFAULT_BASE_URL,
  })
}

async function requestCompletion(baseUrl: string, apiKey: string, chatArgs: ChatArgs, model: string): Promise<CompletionOutcome> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildBody(chatArgs, model)),
      signal: AbortSignal.timeout(chatArgs.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
    const responseText = await response.text()
    if (!response.ok) {
      const classified = classifyStatus(response.status, responseText)
      return { ok: false, kind: classified.kind, detail: classified.detail }
    }
    let payload: unknown
    try {
      payload = JSON.parse(responseText)
    } catch {
      return { ok: false, kind: 'bad_response', detail: `应答不是 JSON：${responseText.slice(0, 300)}` }
    }
    const completion = parseCompletion(payload)
    if (!completion.ok) return { ok: false, kind: 'bad_response', detail: completion.error }
    return { ok: true, text: completion.value.text, usage: completion.value.usage }
  } catch (err) {
    const classified = classifyException(err)
    return { ok: false, kind: classified.kind, detail: classified.detail }
  }
}

function chatHandler(settings: GwbSettingsApi, data: GwbDataApi, log: PluginLogger) {
  return async (args: unknown) => {
    const parsed = parseChatArgs(args)
    if (!parsed.ok) return { ok: false as const, error: 'bad_args' as const, detail: parsed.error }
    const chatArgs = parsed.value

    const apiKey = stringOrEmpty(settings.get(SETTING_API_KEY))
    if (apiKey === '') {
      return { ok: false as const, error: 'bad_key' as const, detail: 'deepseek 的 api-key 没配——到「设置」里填上再调' }
    }
    const model = chatArgs.model ?? (stringOrEmpty(settings.get(SETTING_MODEL)) || DEFAULT_MODEL)
    const baseUrl = stringOrEmpty(settings.get(SETTING_BASE_URL)) || DEFAULT_BASE_URL

    const startedAt = new Date().toISOString()
    const outcome = await requestCompletion(baseUrl, apiKey, chatArgs, model)
    const journalEntry: JournalEntry = outcome.ok
      ? { at: startedAt, caller: chatArgs.caller, model, ok: true, usage: outcome.usage }
      : { at: startedAt, caller: chatArgs.caller, model, ok: false, error: outcome.kind }
    await appendToJournal(data, (message) => log.warn(message), journalEntry)

    if (!outcome.ok) return { ok: false as const, error: outcome.kind, detail: outcome.detail }
    log.info(`${chatArgs.caller} → ${model} tokens=${outcome.usage.totalTokens}${chatArgs.jsonMode === true ? '（json）' : ''}`)
    return { ok: true as const, data: { text: outcome.text, usage: outcome.usage, model, caller: chatArgs.caller } }
  }
}

function usageHandler(data: GwbDataApi) {
  return async (args: unknown) => {
    const days = parseUsageArgs(args)
    const journal = await data.readDoc(JOURNAL_DOC_NAME)
    return { ok: true as const, data: { days, ...aggregateUsage(journal, days) } }
  }
}

export function apply(ctx: GwbContext): void {
  const log = ctx.logger(name)
  const commands = ctx.gwbCommands
  const settings = ctx.gwbSettings
  const data = ctx.gwbData
  // 命令总线在类型上是可选的（内核也声明了它）；inject 保证了它在，不在就是加载顺序出了错，直接报
  if (commands === undefined) throw new Error('ctx.gwbCommands 不在：inject 里写了它，cordis 本不该调用 apply')
  log.info('DeepSeek 命令插件已加载')

  // 局部注入：说明书插件没装，命令照常可用
  ctx.inject(['gwbSkills'], (c) => {
    c.effect(() => c.gwbSkills.register(SKILLS_DIR))
  })

  defineSettings(settings)

  commands.register(
    {
      name: 'deepseek.chat',
      description:
        '把一次 DeepSeek 调用原样发出去、把结果原样带回。哑管道：不重试不缓存，降级策略在调用方；caller 写明调用方、进记账。见 skill「deepseek」',
      usage:
        '{ prompt 必给（非空字符串）, system?, jsonMode?（布尔；DeepSeek 要求 prompt 里出现 json 字样）, timeoutMs?（正数毫秒，缺省 60000，超过 110000 按 110000）, caller?（非空字符串，截到 64 字，缺省 adhoc）, model?（非空字符串，缺省取设置 model）}。' +
        '成功回 { ok: true, data: { text, usage: { promptTokens, completionTokens, totalTokens }, model, caller } }；' +
        '失败回 { ok: false, error: "timeout" | "rate_limit" | "bad_key" | "bad_response" | "bad_args"（参数不合法）, detail }',
      effect: 'external',
      plugin: PACKAGE_NAME,
    },
    chatHandler(settings, data, log),
  )

  commands.register(
    {
      name: 'deepseek.usage',
      description: '按调用方汇总 DeepSeek 调用的记账：调用次数、成功与失败数、token 总数',
      usage:
        '{ days?（正整数，缺省 30，上限 3650；不是正整数按 30）}，不给参数也行。' +
        '回 { ok: true, data: { days, byCaller: [{ caller, calls, ok, failed, totalTokens }]（按 totalTokens 降序）, total: { caller: "全部", calls, ok, failed, totalTokens } } }',
      effect: 'read',
      plugin: PACKAGE_NAME,
    },
    usageHandler(data),
  )
}
