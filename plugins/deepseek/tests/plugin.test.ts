import { describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.js'

/**
 * 挂载与命令面——替身自己搭（repo-kit 的正本守卫是给「带窗格的模板件」定死的，
 * 本件无窗格；它家 mountHarness 也不给 gwbSettings / gwbData / handler，不够用）。
 * 多给三张脸：gwbSettings（define 记录器 + get 回 undefined）、gwbData（文档存取）、
 * gwbSkills（register 记录器）；命令的 handler 留下来，好真调 bad_key 路径。
 */
function harness() {
  const commands: Array<{ def: { name: string; plugin: string; description: string }; handler: (args: unknown) => Promise<unknown> }> = []
  const defines: Array<{ key: string; type: string }> = []
  const skills: string[] = []
  const docs = new Map<string, unknown>()
  const ctx = {
    logger: () => ({ info() {}, warn() {}, error() {} }),
    effect: (fn: () => unknown) => {
      fn()
      return () => {}
    },
    inject: (_names: string[], fn: (c: unknown) => unknown) => {
      fn(ctx)
      return () => {}
    },
    gwbCommands: {
      register: (def: { name: string; plugin: string; description: string }, handler: (args: unknown) => Promise<unknown>) => {
        commands.push({ def, handler })
        return () => {}
      },
    },
    gwbSettings: {
      define: (def: { key: string; type: string }) => {
        defines.push(def)
        return () => {}
      },
      get: (_key: string) => undefined,
    },
    gwbData: {
      readDoc: async (doc: string) => docs.get(doc),
      writeDoc: async (doc: string, value: unknown) => {
        docs.set(doc, value)
      },
    },
    gwbSkills: {
      register: (dir: unknown) => {
        skills.push(String(dir))
        return () => {}
      },
    },
  }
  return { ctx, commands, defines, skills, docs }
}

describe('gwb-deepseek 挂载', () => {
  it('插件名跟包名派生自同一个短名', () => {
    expect(name).toBe('gwb-deepseek')
  })

  it('两条命令 deepseek.chat / deepseek.usage：归属本包、描述带参数形状', () => {
    const h = harness()
    apply(h.ctx as never)
    expect(h.commands.map((c) => c.def.name)).toEqual(['deepseek.chat', 'deepseek.usage'])
    for (const c of h.commands) {
      expect(c.def.plugin).toBe('@godcreator/gwb-deepseek')
      expect(c.def.description.length).toBeGreaterThan(10)
    }
    expect(h.commands[0]!.def.description).toContain('{ prompt')
    expect(h.commands[1]!.def.description).toContain('days')
  })

  it('声明三项设置：api-key（secret）、model、base-url；说明书目录登记一份', () => {
    const h = harness()
    apply(h.ctx as never)
    expect(h.defines.map((d) => `${d.key}:${d.type}`)).toEqual(['api-key:secret', 'model:string', 'base-url:string'])
    expect(h.skills).toHaveLength(1)
    expect(h.skills[0]).toContain('skills')
  })

  it('key 没配时 chat 直接回结构化 bad_key——不打网络、也不落记账', async () => {
    const h = harness()
    apply(h.ctx as never)
    const r = (await h.commands[0]!.handler({ prompt: '你好' })) as { ok: boolean; error: string; detail: string }
    expect(r).toMatchObject({ ok: false, error: 'bad_key' })
    expect(r.detail).toContain('api-key')
    expect(h.docs.has('journal')).toBe(false)
  })

  it('参数不合法回 bad_args，detail 说清原因', async () => {
    const h = harness()
    apply(h.ctx as never)
    const r = (await h.commands[0]!.handler({})) as { ok: boolean; error: string }
    expect(r).toMatchObject({ ok: false, error: 'bad_args' })
  })
})
