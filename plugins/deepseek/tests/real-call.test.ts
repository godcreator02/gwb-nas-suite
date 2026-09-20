import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

/**
 * 真调 DeepSeek 一次（slow 档，`pnpm test` 不跑、`pnpm test:all` 才跑）。
 * key 从环境变量 DEEPSEEK_API_KEY 来——不在源码、不进日志、不进命令行；
 * 没给环境变量就整组跳过。这测的是 node 半全链路（组请求、鉴权、解析、记账），
 * 不起 home、不开窗。
 */
const KEY = process.env['DEEPSEEK_API_KEY'] ?? ''

describe.skipIf(KEY === '')('真调（slow）', { tags: 'slow' }, () => {
  it('chat 真跑一程：有正文、有 token、记账落盘', { tags: 'slow', timeout: 120_000 }, async () => {
    const commands: Array<{ def: { name: string }; handler: (args: unknown) => Promise<unknown> }> = []
    const docs = new Map<string, unknown>()
    const ctx = {
      logger: () => ({ info() {}, warn() {}, error() {} }),
      effect: (fn: () => unknown) => {
        fn()
        return () => {}
      },
      inject: (_n: string[], fn: (c: unknown) => unknown) => {
        fn(ctx)
        return () => {}
      },
      gwbCommands: {
        register: (def: { name: string }, handler: (args: unknown) => Promise<unknown>) => {
          commands.push({ def, handler })
          return () => {}
        },
      },
      gwbSettings: {
        define: () => () => {},
        get: (key: string) => (key === 'api-key' ? KEY : undefined),
      },
      gwbData: {
        readDoc: async (doc: string) => docs.get(doc),
        writeDoc: async (doc: string, value: unknown) => {
          docs.set(doc, value)
        },
      },
      gwbSkills: { register: () => () => {} },
    }
    apply(ctx as never)

    const chat = commands.find((c) => c.def.name === 'deepseek.chat')!
    const r = (await chat.handler({ prompt: '只回一个字：好', caller: 'selftest' })) as {
      ok: boolean
      data?: { text: string; usage: { totalTokens: number } }
      detail?: string
    }
    expect(r.ok).toBe(true)
    expect(r.data?.text?.trim().length ?? 0).toBeGreaterThan(0)
    expect(r.data?.usage.totalTokens ?? 0).toBeGreaterThan(0)

    const usage = commands.find((c) => c.def.name === 'deepseek.usage')!
    const u = (await usage.handler({ days: 1 })) as {
      ok: boolean
      data?: { byCaller: Array<{ caller: string; calls: number }> }
    }
    const row = u.data?.byCaller.find((x) => x.caller === 'selftest')
    expect(row?.calls).toBe(1)
  })
})
