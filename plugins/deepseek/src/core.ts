/**
 * 纯逻辑层：参数收窄、请求组装、错误归类、应答解析、记账的裁剪与汇总。
 * 不碰网络、不碰 cordis——测试只喂输入看输出（分层判例：gwb-gitea 的 core.ts）。
 */

export interface ChatArgs {
  prompt: string
  system?: string
  jsonMode?: boolean
  timeoutMs?: number
  /** 解析层必给（缺省 adhoc）——不是可选，别从外头直接构造这个类型 */
  caller: string
  model?: string
}

/** 四类结构化失败。网络层面的异常（DNS / 拒连）归 bad_response，detail 里带原文 */
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

/** 总线 120s 红线之内留头——超时上限钉在它下面 */
export const MAX_TIMEOUT_MS = 110_000
export const DEFAULT_TIMEOUT_MS = 60_000
/** 记账最多留这么多条，旧的先滚出去 */
export const JOURNAL_KEEP = 500

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseChatArgs(args: unknown): Parsed<ChatArgs> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { ok: false, error: '参数要是一个对象：{ prompt, system?, jsonMode?, timeoutMs?, caller?, model? }' }
  }
  const raw = args as Record<string, unknown>

  const prompt = raw['prompt']
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return { ok: false, error: 'prompt 要是非空字符串' }
  }

  const system = raw['system']
  if (system !== undefined && typeof system !== 'string') {
    return { ok: false, error: 'system 要是字符串' }
  }

  const jsonMode = raw['jsonMode']
  if (jsonMode !== undefined && typeof jsonMode !== 'boolean') {
    return { ok: false, error: 'jsonMode 要是布尔' }
  }

  const timeoutMs = raw['timeoutMs']
  if (timeoutMs !== undefined) {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
      return { ok: false, error: `timeoutMs 要是正数（毫秒），上限 ${MAX_TIMEOUT_MS}` }
    }
  }

  const callerRaw = raw['caller']
  let caller = 'adhoc'
  if (callerRaw !== undefined) {
    if (typeof callerRaw !== 'string' || callerRaw.trim() === '') {
      return { ok: false, error: 'caller 要是非空字符串——自报家门进记账' }
    }
    caller = callerRaw.trim().slice(0, 64)
  }

  const model = raw['model']
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
    // json 模式是 DeepSeek 官方约束：prompt 里得出现 "json" 字样，否则它回 400——这是调用方的事
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
  const p = payload as Record<string, unknown>
  const choices = p['choices']
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, error: '应答里没有 choices' }
  }
  const first: unknown = choices[0]
  if (typeof first !== 'object' || first === null) {
    return { ok: false, error: 'choices[0] 不是对象' }
  }
  const message = (first as Record<string, unknown>)['message']
  const content =
    typeof message === 'object' && message !== null ? (message as Record<string, unknown>)['content'] : undefined
  if (typeof content !== 'string') {
    return { ok: false, error: 'choices[0].message.content 不是字符串' }
  }
  const usageRaw = p['usage']
  const usage = typeof usageRaw === 'object' && usageRaw !== null ? (usageRaw as Record<string, unknown>) : {}
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    ok: true,
    value: {
      text: content,
      usage: {
        promptTokens: num(usage['prompt_tokens']),
        completionTokens: num(usage['completion_tokens']),
        totalTokens: num(usage['total_tokens']),
      },
    },
  }
}

/** 记账尾巴裁剪：满 JOURNAL_KEEP 条就把最老的滚出去 */
export function appendJournal(entries: unknown, entry: JournalEntry): JournalEntry[] {
  const list = Array.isArray(entries) ? (entries as JournalEntry[]) : []
  return [...list, entry].slice(-JOURNAL_KEEP)
}

export interface CallerUsage {
  caller: string
  calls: number
  ok: number
  failed: number
  totalTokens: number
}

export function aggregateUsage(
  entries: unknown,
  days: number,
  now = Date.now(),
): { byCaller: CallerUsage[]; total: CallerUsage } {
  const cutoff = now - days * 86_400_000
  const map = new Map<string, CallerUsage>()
  const touch = (caller: string): CallerUsage => {
    const existing = map.get(caller)
    if (existing !== undefined) return existing
    const fresh: CallerUsage = { caller, calls: 0, ok: 0, failed: 0, totalTokens: 0 }
    map.set(caller, fresh)
    return fresh
  }
  const list = Array.isArray(entries) ? (entries as JournalEntry[]) : []
  for (const e of list) {
    const t = Date.parse(typeof e.at === 'string' ? e.at : '')
    if (!Number.isFinite(t) || t < cutoff) continue
    const row = touch(typeof e.caller === 'string' && e.caller !== '' ? e.caller : 'adhoc')
    row.calls += 1
    if (e.ok) row.ok += 1
    else row.failed += 1
    row.totalTokens += e.usage?.totalTokens ?? 0
  }
  const byCaller = [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls)
  const total: CallerUsage = { caller: '全部', calls: 0, ok: 0, failed: 0, totalTokens: 0 }
  for (const row of byCaller) {
    total.calls += row.calls
    total.ok += row.ok
    total.failed += row.failed
    total.totalTokens += row.totalTokens
  }
  return { byCaller, total }
}

/** usage 命令的参数：给了不三不四的就回缺省，不跟调用方纠缠 */
export function parseUsageArgs(args: unknown): number {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 30
  const raw = (args as Record<string, unknown>)['days']
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return 30
  return Math.min(raw, 3650)
}
