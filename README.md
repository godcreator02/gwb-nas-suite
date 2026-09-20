# gwb-nas-suite

**本页回答**：`gwb-nas-suite` 是什么、怎么装、怎么用、文档在哪。

## 是什么

NAS 监控与资讯消费的 gwb 件仓（薄壳 workspace，三件住 `plugins/`）：

| 件          | 包名                           | 干什么                                                    |
| ---------- | ---------------------------- | ------------------------------------------------------ |
| deepseek   | `@godcreator/gwb-deepseek`   | DeepSeek 命令管道——一条 `deepseek.chat` 给全工作台，key 正本在这件，调用记账 |
| news-links | `@godcreator/gwb-news-links` | 资讯精选阅读器——FreshRSS/邮件增量，DeepSeek 选链接，打开即拉               |
| nas-board  | `@godcreator/gwb-nas-board`  | NAS 体检看板——SMB 拉绿联 NAS 每日定案 JSON，gwb 原生画                |

NAS 侧数据生产与部署正本在 ugreen-nas-config（单元 26091409bfn）；三件目前在途，设计与验收清单见文档站交接区。

## 怎么装

发版后逐件装进 home：`plugin-manager.install {"pkg":"<上表包名>"}`；开发期间走 `devkit.dev`（隔离 home）。

## 怎么跑（仓根）

```powershell
pnpm install
pnpm build          # 根壳递归（tsc + esbuild + tailwindcss）
pnpm check          # typecheck + oxlint + vitest
```

## 怎么确认在干活

deepseek 件装上后 `deepseek.chat {prompt:"…"}` 有回执；news-links / nas-board 的验收见各自 spec 页。

## 文档

`docs-site/` 是六区文档站：`cd docs-site && pnpm install && pnpm dev`，看 `http://localhost:4327`。
现状钉在源码上，`pnpm doc` 核对。这份 README 是生成物，正本是 `docs-site/content/outputs/readme.mdx`。
