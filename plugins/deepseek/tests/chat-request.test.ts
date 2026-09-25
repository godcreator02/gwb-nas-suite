import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'

/**
 * deepseek.chat 从拿到参数到写完记账的整条路径：fetch 换成替身，看发出去的请求、回执与记账。
 * 不打网络；真调一次在 real-call.test.ts（slow）。
 */
interface Harness {
  chat: (args: unknown) => Promise<unknown>
  journal: () => unknown
  warnings: string[]
}

function mount(settings: Record<string, string>, options: { journalWriteFails?: boolean } = {}): Harness {
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>()
  const docs = new Map<string, unknown>()
  const warnings: string[] = []
  const ctx = {
    logger: () => ({ info() {}, warn: (message: string) => warnings.push(message), error() {} }),
    effect: (fn: () => unknown) => {
      fn()
      return () => {}
    },
    inject: (_names: string[], fn: (c: unknown) => unknown) => {
      fn(ctx)
      return () => {}
    },
    gwbCommands: {
      register: (def: { name: string }, handler: (args: unknown) => Promise<unknown>) => {
        handlers.set(def.name, handler)
        return () => {}
      },
    },
    gwbSettings: {
      define: () => () => {},
      get: (key: string) => settings[key],
    },
    gwbData: {
      readDoc: async (doc: string) => docs.get(doc),
      writeDoc: async (doc: string, value: unknown) => {
        if (options.journalWriteFails === true) throw new Error('磁盘满了')
        docs.set(doc, value)
      },
    },
    gwbSkills: { register: () => () => {} },
  }
  apply(ctx as never)
  return { chat: handlers.get('deepseek.chat')!, journal: () => docs.get('journal'), warnings }
}

function respondWith(status: number, body: string) {
  const fetchStub = vi.fn(async (_url: string, _init: RequestInit) => new Response(body, { status }))
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

const COMPLETION = JSON.stringify({
  choices: [{ message: { content: '好' } }],
  usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deepseek.chat 发出去的请求', () => {
  it('地址是 base-url 去掉末尾斜杠再接 /chat/completions，带 Bearer key，模型缺省取设置', async () => {
    const fetchStub = respondWith(200, COMPLETION)
    const h = mount({ 'api-key': 'sk-test', model: 'deepseek-reasoner', 'base-url': 'https://example.test//' })
    await h.chat({ prompt: '你好', system: '简短' })
    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0]!
    expect(url).toBe('https://example.test/chat/completions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test')
    const body = JSON.parse(String(init.body)) as { model: string; messages: unknown[] }
    expect(body.model).toBe('deepseek-reasoner')
    expect(body.messages).toHaveLength(2)
  })

  it('设置里 model 与 base-url 为空时用 deepseek-chat 与官方地址；参数里的 model 优先', async () => {
    const fetchStub = respondWith(200, COMPLETION)
    const h = mount({ 'api-key': 'sk-test', model: '', 'base-url': '' })
    await h.chat({ prompt: 'a' })
    await h.chat({ prompt: 'a', model: 'deepseek-reasoner' })
    expect(fetchStub.mock.calls[0]![0]).toBe('https://api.deepseek.com/chat/completions')
    expect((JSON.parse(String(fetchStub.mock.calls[0]![1].body)) as { model: string }).model).toBe('deepseek-chat')
    expect((JSON.parse(String(fetchStub.mock.calls[1]![1].body)) as { model: string }).model).toBe('deepseek-reasoner')
  })
})

describe('deepseek.chat 的回执与记账', () => {
  it('成功：回正文、token、模型与调用方，记账一条 ok 且带 usage', async () => {
    respondWith(200, COMPLETION)
    const h = mount({ 'api-key': 'sk-test' })
    const result = await h.chat({ prompt: 'a', caller: 'news-links' })
    expect(result).toEqual({
      ok: true,
      data: { text: '好', usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 }, model: 'deepseek-chat', caller: 'news-links' },
    })
    const journal = h.journal() as Array<Record<string, unknown>>
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ caller: 'news-links', model: 'deepseek-chat', ok: true, usage: { totalTokens: 4 } })
  })

  it('HTTP 429：回 rate_limit，记账一条失败', async () => {
    respondWith(429, 'too many')
    const h = mount({ 'api-key': 'sk-test' })
    const result = (await h.chat({ prompt: 'a' })) as { ok: boolean; error: string; detail: string }
    expect(result).toMatchObject({ ok: false, error: 'rate_limit' })
    expect(result.detail).toContain('too many')
    expect(h.journal()).toEqual([expect.objectContaining({ ok: false, error: 'rate_limit', caller: 'adhoc' })])
  })

  it('HTTP 200 但应答不是 JSON：回 bad_response，detail 带原文开头', async () => {
    respondWith(200, '<html>')
    const h = mount({ 'api-key': 'sk-test' })
    const result = (await h.chat({ prompt: 'a' })) as { ok: boolean; error: string; detail: string }
    expect(result).toMatchObject({ ok: false, error: 'bad_response' })
    expect(result.detail).toBe('应答不是 JSON：<html>')
    expect(h.journal()).toEqual([expect.objectContaining({ ok: false, error: 'bad_response' })])
  })

  it('应答是 JSON 但没有 choices：回 bad_response，detail 是解析层的原因', async () => {
    respondWith(200, '{}')
    const h = mount({ 'api-key': 'sk-test' })
    const result = (await h.chat({ prompt: 'a' })) as { ok: boolean; error: string; detail: string }
    expect(result).toEqual({ ok: false, error: 'bad_response', detail: '应答里没有 choices' })
    expect(h.journal()).toEqual([expect.objectContaining({ ok: false, error: 'bad_response' })])
  })

  it('fetch 抛 TimeoutError：回 timeout，记账一条失败', async () => {
    vi.stubGlobal('fetch', async () => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'TimeoutError'
      throw err
    })
    const h = mount({ 'api-key': 'sk-test' })
    const result = await h.chat({ prompt: 'a' })
    expect(result).toMatchObject({ ok: false, error: 'timeout' })
    expect(h.journal()).toEqual([expect.objectContaining({ ok: false, error: 'timeout' })])
  })

  it('记账写不进去：回执照常成功，只多一条警告日志', async () => {
    respondWith(200, COMPLETION)
    const h = mount({ 'api-key': 'sk-test' }, { journalWriteFails: true })
    const result = await h.chat({ prompt: 'a' })
    expect(result).toMatchObject({ ok: true })
    expect(h.warnings).toHaveLength(1)
    expect(h.warnings[0]).toContain('磁盘满了')
  })
})
