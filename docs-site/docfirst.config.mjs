/**
 * 这个站的 docfirst 配置：用哪个格式包、生成物写到哪、组件规则表是什么。命令行和站读的是同一份。
 *
 * 项目根是这个站目录，钉的代码在仓根的 `plugins/<短名>/` 下——引用里写 `../plugins/…`，读取器按项目根拼路径。
 * 分区按约定：`content/` 下 `trajectory/` 与 `future/` 两个名字固定，其余目录都是现状区、都进 check；
 * 本站的现状区只有 `content/docs`。
 *
 * 生成物的正本都在 `content/docs/outputs/`：仓根的 AGENTS.md / CLAUDE.md / README.md，外加 deepseek 随包发布的
 * 说明书 `plugins/deepseek/skills/deepseek/SKILL.md`。改正本后运行 `pnpm doc:render`，两份一起提交；check 检查生成物跟正本是否一致。
 * SKILL.md 要保留 frontmatter 的 `name` 与 `description`（说明书插件登记时读它们），所以目标写成对象形式。
 * CLAUDE.md 第一行固定是 `@AGENTS.md`，只给 Claude 的指令写在它后面。生成正本按原文渲染，里面不能用 JSX 组件。
 */
import * as fumadocs from '@godcreator/docfirst-workflow/fumadocs'

export default {
  formats: [fumadocs],
  outputs: {
    'content/docs/outputs/agents.mdx': ['../AGENTS.md'],
    'content/docs/outputs/claude.mdx': ['../CLAUDE.md'],
    'content/docs/outputs/readme.mdx': ['../README.md'],
    'content/docs/outputs/skills/deepseek.mdx': [
      { to: '../plugins/deepseek/skills/deepseek/SKILL.md', frontmatter: ['name', 'description'] },
    ],
  },
  components: {
    ...fumadocs.defaultRoster,
  },
}
