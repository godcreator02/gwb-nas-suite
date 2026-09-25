export interface ChatArgs {
  prompt: string
  system?: string
  jsonMode?: boolean
  timeoutMs?: number
  /** 由 parseChatArgs 填上（缺省 adhoc），所以不是可选；这个类型只从 parseChatArgs 得到 */
  caller: string
  model?: string
}

/** 四类结构化失败。网络层面的异常（DNS 解析失败、连接被拒）归 bad_response，detail 里带原文 */
export type ChatErrorKind = 'timeout' | 'rate_limit' | 'bad_key' | 'bad_response'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface JournalEntry {
  at: string
  caller: string
  model: string
  ok: boolean
  error?: ChatErrorKind
  usage?: TokenUsage
}

/** 命令总线等一条命令最多 120 秒，超时上限定在它之下留出余量 */
export const MAX_TIMEOUT_MS = 110_000
export const DEFAULT_TIMEOUT_MS = 60_000
/** 记账最多保留的条数，多出来的从最老的删 */
export const JOURNAL_KEEP = 500

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseChatArgs(args: unknown): Parsed<ChatArgs> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, error: '参数要是一个对象：{ prompt, system?, jsonMode?, timeoutMs?, caller?, model? }' }
  }
  const argsRecord = args as Record<string, unknown>

  const prompt = argsRecord['prompt']
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return { ok: false, error: 'prompt 要是非空字符串' }
  }

  const system = argsRecord['system']
  if (system !== undefined && typeof system !== 'string') {
    return { ok: false, error: 'system 要是字符串' }
  }

  const jsonMode = argsRecord['jsonMode']
  if (jsonMode !== undefined && typeof jsonMode !== 'boolean') {
    return { ok: false, error: 'jsonMode 要是布尔' }
  }

  const timeoutMs = argsRecord['timeoutMs']
  if (timeoutMs !== undefined) {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
      return { ok: false, error: `timeoutMs 要是正数（毫秒），上限 ${MAX_TIMEOUT_MS}` }
    }
  }

  const callerGiven = argsRecord['caller']
  let caller = 'adhoc'
  if (callerGiven !== undefined) {
    if (typeof callerGiven !== 'string' || callerGiven.trim() === '') {
      return { ok: false, error: 'caller 要是非空字符串——自报家门进记账' }
    }
    caller = callerGiven.trim().slice(0, 64)
  }

  const model = argsRecord['model']
  if (model !== undefined && (typeof model !== 'string' || model.trim() === '')) {
    return { ok: false, error: 'model 要是非空字符串（deepseek-chat / deepseek-reasoner）' }
  }

  return {
    ok: true,
    value: {
      prompt,
      ...(system !== undefined && system !== '' ? { system } : {}),
      ...(jsonMode === true ? { jsonMode: true } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs: Math.min(timeoutMs, MAX_TIMEOUT_MS) } : {}),
      caller,
      ...(model !== undefined && model.trim() !== '' ? { model: model.trim() } : {}),
    },
  }
}

export function buildBody(args: ChatArgs, model: string): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = []
  if (args.system !== undefined && args.system !== '') messages.push({ role: 'system', content: args.system })
  messages.push({ role: 'user', content: args.prompt })
  return {
    model,
    messages,
    stream: false,
    // DeepSeek 的 json 模式要求 prompt 里出现 "json" 字样，否则回 400；写不写由调用方负责
    ...(args.jsonMode === true ? { response_format: { type: 'json_object' } } : {}),
  }
}

export function classifyException(err: unknown): { kind: ChatErrorKind; detail: string } {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { kind: 'timeout', detail: `等到超时上限还没回：${err.message}` }
  }
  return { kind: 'bad_response', detail: err instanceof Error ? (err.stack ?? err.message) : String(err) }
}

export function classifyStatus(status: number, bodyText: string): { kind: ChatErrorKind; detail: string } {
  const snippet = bodyText.slice(0, 300)
  if (status === 401 || status === 403) {
    return { kind: 'bad_key', detail: `DeepSeek 回 ${status}：key 不对或没权限——${snippet}` }
  }
  if (status === 429) {
    return { kind: 'rate_limit', detail: `DeepSeek 回 429：限流——${snippet}` }
  }
  return { kind: 'bad_response', detail: `DeepSeek 回 ${status}：${snippet}` }
}

export function parseCompletion(payload: unknown): Parsed<{ text: string; usage: TokenUsage }> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: '应答不是对象' }
  }
  const payloadRecord = payload as Record<string, unknown>
  const choices = payloadRecord['choices']
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, error: '应答里没有 choices' }
  }
  const firstChoice: unknown = choices[0]
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    return { ok: false, error: 'choices[0] 不是对象' }
  }
  const message = (firstChoice as Record<string, unknown>)['message']
  const content =
    typeof message === 'object' && message !== null ? (message as Record<string, unknown>)['content'] : undefined
  if (typeof content !== 'string') {
    return { ok: false, error: 'choices[0].message.content 不是字符串' }
  }
  const usageGiven = payloadRecord['usage']
  const usage = typeof usageGiven === 'object' && usageGiven !== null ? (usageGiven as Record<string, unknown>) : {}
  const finiteOrZero = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return {
    ok: true,
    value: {
      text: content,
      usage: {
        promptTokens: finiteOrZero(usage['prompt_tokens']),
        completionTokens: finiteOrZero(usage['completion_tokens']),
        totalTokens: finiteOrZero(usage['total_tokens']),
      },
    },
  }
}

export function appendJournal(entries: unknown, entry: JournalEntry): JournalEntry[] {
  const journal = Array.isArray(entries) ? (entries as JournalEntry[]) : []
  return [...journal, entry].slice(-JOURNAL_KEEP)
}

export interface CallerUsage {
  caller: string
  calls: number
  ok: number
  failed: number
  totalTokens: number
}

const MS_PER_DAY = 86_400_000
const DEFAULT_USAGE_DAYS = 30
const MAX_USAGE_DAYS = 3650

/** 时刻不早于 oldestIncludedMs 的记账按调用方分组计数；caller 缺失或为空串记在 adhoc 名下 */
function usageRowsByCaller(entries: unknown, oldestIncludedMs: number): CallerUsage[] {
  const rowOfCaller = new Map<string, CallerUsage>()
  const rowFor = (caller: string): CallerUsage => {
    const existing = rowOfCaller.get(caller)
    if (existing !== undefined) return existing
    const created: CallerUsage = { caller, calls: 0, ok: 0, failed: 0, totalTokens: 0 }
    rowOfCaller.set(caller, created)
    return created
  }
  const journal = Array.isArray(entries) ? (entries as JournalEntry[]) : []
  for (const entry of journal) {
    const entryTimeMs = Date.parse(typeof entry.at === 'string' ? entry.at : '')
    if (!Number.isFinite(entryTimeMs) || entryTimeMs < oldestIncludedMs) continue
    const row = rowFor(typeof entry.caller === 'string' && entry.caller !== '' ? entry.caller : 'adhoc')
    row.calls += 1
    if (entry.ok) row.ok += 1
    else row.failed += 1
    row.totalTokens += entry.usage?.totalTokens ?? 0
  }
  return [...rowOfCaller.values()]
}

function totalOfRows(rows: CallerUsage[]): CallerUsage {
  const total: CallerUsage = { caller: '全部', calls: 0, ok: 0, failed: 0, totalTokens: 0 }
  for (const row of rows) {
    total.calls += row.calls
    total.ok += row.ok
    total.failed += row.failed
    total.totalTokens += row.totalTokens
  }
  return total
}

export function aggregateUsage(
  entries: unknown,
  days: number,
  now = Date.now(),
): { byCaller: CallerUsage[]; total: CallerUsage } {
  const byCaller = usageRowsByCaller(entries, now - days * MS_PER_DAY).sort(
    (a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls,
  )
  return { byCaller, total: totalOfRows(byCaller) }
}

/** days 不是正整数时按 30（命令的 usage 里写明了这条） */
export function parseUsageArgs(args: unknown): number {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return DEFAULT_USAGE_DAYS
  const days = (args as Record<string, unknown>)['days']
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) return DEFAULT_USAGE_DAYS
  return Math.min(days, MAX_USAGE_DAYS)
}
