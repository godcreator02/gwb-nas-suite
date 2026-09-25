# gwb-nas-suite

**本页回答**：在这个仓干活的 agent 先看什么、怎么跑、门禁是哪几条、什么碰不得。

## 先读

`docs-site/content/docs/`：[系统地图](docs-site/content/docs/system-map.mdx) → 要改的那块的页 →
[术语表](docs-site/content/docs/glossary.mdx)。在途的活在 `docs-site/content/spec/`。
写文档读 skill「docfirst-docs」，记轨迹卡读 skill「trajectory」，写插件、在隔离 home 里验证读 skill「gwb-devkit」，
升版本号、发版读 skill「gwb-release」。

## 怎么跑

```bash
pnpm install
pnpm build   # 先 build：check 里的产物守卫读 dist/
pnpm check
```

## 门禁

提交前都要绿：

```bash
pnpm check
cd docs-site && pnpm doc && pnpm build
```

## 红线

* 插件之间不 import：news-links 用 deepseek 只走命令总线，绝不 `import '@godcreator/gwb-deepseek'`
* deepseek 插件是哑管道：不往里加重试 / 熔断 / 缓存 / 消费方策略，降级决策全在调用方
* NAS 侧的 compose 与脚本改动去 ugreen-nas-config（单元 26091409bfn）做，这个仓只有消费端
* 这份 AGENTS.md 是生成物，正本是 `docs-site/content/outputs/agents.mdx`，改那边
