import { describe, expect, it } from 'vitest'
import {
  aggregateUsage,
  appendJournal,
  buildBody,
  classifyException,
  classifyStatus,
  parseChatArgs,
  parseCompletion,
  parseUsageArgs,
  JOURNAL_KEEP,
} from '../src/core.js'

/** 纯逻辑层：喂输入看输出，不碰网络、不碰 cordis */
describe('parseChatArgs', () => {
  it('最小参数过关，caller 缺省 adhoc', () => {
    const r = parseChatArgs({ prompt: '你好' })
    expect(r).toEqual({ ok: true, value: { prompt: '你好', caller: 'adhoc' } })
  })

  it('全参数过关，timeoutMs 超上限被夹住', () => {
    const r = parseChatArgs({ prompt: 'a', system: 's', jsonMode: true, timeoutMs: 999_999, caller: 'x', model: 'deepseek-reasoner' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.timeoutMs).toBe(110_000)
      expect(r.value.jsonMode).toBe(true)
      expect(r.value.model).toBe('deepseek-reasoner')
    }
  })

  it('prompt 缺失 / 非对象 / caller 空串都要拒', () => {
    expect(parseChatArgs({}).ok).toBe(false)
    expect(parseChatArgs('x').ok).toBe(false)
    expect(parseChatArgs({ prompt: 'a', caller: '  ' }).ok).toBe(false)
  })
})

describe('buildBody', () => {
  it('system 进 messages 头一条；jsonMode 才带 response_format', () => {
    const withJson = buildBody({ prompt: 'p', system: 's', jsonMode: true, caller: 'c' }, 'deepseek-chat')
    expect(withJson['messages']).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'p' },
    ])
    expect(withJson['response_format']).toEqual({ type: 'json_object' })
    const plain = buildBody({ prompt: 'p', caller: 'c' }, 'deepseek-chat')
    expect(plain['response_format']).toBeUndefined()
    expect(plain['stream']).toBe(false)
  })
})

describe('错误归类', () => {
  it('TimeoutError / AbortError → timeout', () => {
    const err = new Error('x')
    err.name = 'TimeoutError'
    expect(classifyException(err).kind).toBe('timeout')
    expect(classifyException(new TypeError('fetch failed')).kind).toBe('bad_response')
  })

  it('状态码归类：401/403 → bad_key，429 → rate_limit，其余 bad_response', () => {
    expect(classifyStatus(401, 'x').kind).toBe('bad_key')
    expect(classifyStatus(403, 'x').kind).toBe('bad_key')
    expect(classifyStatus(429, 'x').kind).toBe('rate_limit')
    expect(classifyStatus(500, 'x').kind).toBe('bad_response')
    expect(classifyStatus(400, 'x').detail).toContain('400')
  })
})

describe('parseCompletion', () => {
  it('正常应答：正文与三段 token 都取到', () => {
    const r = parseCompletion({
      choices: [{ message: { content: '答' } }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    })
    expect(r).toEqual({
      ok: true,
      value: { text: '答', usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 } },
    })
  })

  it('畸形应答：没 choices / content 非串 / usage 缺席全兜住', () => {
    expect(parseCompletion({}).ok).toBe(false)
    expect(parseCompletion({ choices: [{ message: {} }] }).ok).toBe(false)
    const noUsage = parseCompletion({ choices: [{ message: { content: 'a' } }] })
    expect(noUsage.ok).toBe(true)
    if (noUsage.ok) expect(noUsage.value.usage.totalTokens).toBe(0)
  })
})

describe('记账', () => {
  it('appendJournal 裁尾：超 JOURNAL_KEEP 条滚掉最老的', () => {
    const entries = Array.from({ length: JOURNAL_KEEP }, (_, i) => ({
      at: `2026-01-01T00:00:0${i % 10}Z`,
      caller: 'a',
      model: 'm',
      ok: true,
    }))
    const out = appendJournal(entries, { at: '2026-01-02T00:00:00Z', caller: 'b', model: 'm', ok: false, error: 'timeout' })
    expect(out).toHaveLength(JOURNAL_KEEP)
    expect(out[0]!.caller).toBe('a')
    expect(out[out.length - 1]!.caller).toBe('b')
    expect(appendJournal(undefined, out[0]!)).toHaveLength(1)
  })

  it('aggregateUsage：按 caller 分组、按天过滤、失败计数不带 token', () => {
    const now = Date.parse('2026-09-20T12:00:00Z')
    const mk = (caller: string, hoursAgo: number, ok: boolean, tokens: number) => ({
      at: new Date(now - hoursAgo * 3_600_000).toISOString(),
      caller,
      model: 'm',
      ok,
      ...(ok ? { usage: { promptTokens: 1, completionTokens: 1, totalTokens: tokens } } : { error: 'rate_limit' as const }),
    })
    const { byCaller, total } = aggregateUsage(
      [mk('news-links', 1, true, 100), mk('news-links', 2, false, 0), mk('adhoc', 48, true, 50), mk('x', 24 * 40, true, 999)],
      30,
      now,
    )
    // 40 天前那条被 30 天窗滤掉
    expect(byCaller.map((r) => r.caller)).toEqual(['news-links', 'adhoc'])
    const news = byCaller[0]!
    expect(news).toMatchObject({ caller: 'news-links', calls: 2, ok: 1, failed: 1, totalTokens: 100 })
    expect(total).toMatchObject({ calls: 3, ok: 2, failed: 1, totalTokens: 150 })
  })
})

describe('parseUsageArgs', () => {
  it('不三不四一律回缺省 30；合法天数夹上限', () => {
    expect(parseUsageArgs(undefined)).toBe(30)
    expect(parseUsageArgs({ days: 'x' })).toBe(30)
    expect(parseUsageArgs({ days: 7 })).toBe(7)
    expect(parseUsageArgs({ days: 99_999 })).toBe(3650)
  })
})
