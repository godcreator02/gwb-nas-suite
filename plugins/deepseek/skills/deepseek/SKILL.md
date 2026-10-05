---
name: deepseek
description: 要在这个工作台里调 DeepSeek 时读——deepseek.chat 的参数形状、四类错误怎么读、调用方该自带什么降级策略、deepseek.usage 怎么按调用方查账；key / model / base-url 存在设置里。
---

# DeepSeek 命令插件

**哑管道**：把调用原样发给 DeepSeek、把结果原样带回，不重试、不熔断、不缓存。
降级策略全在调用方，插件不会替你重试。

## deepseek.chat

`{ prompt, system?, jsonMode?, timeoutMs?, caller?, model? }` → 成功回
`{ text, usage:{ promptTokens, completionTokens, totalTokens }, model, caller }`。

- **caller 写明调用方**（如 `"news-links"`、agent 自己的名字），记进账里，缺省 `adhoc`
- `jsonMode: true` 要求 prompt 里出现 `json` 字样（DeepSeek 的要求，否则回 400）
- `timeoutMs` 缺省 60000，上限 110000（命令总线等一条命令最多 120 秒）
- `model` 缺省取设置里的值（出厂是 `deepseek-chat`）；要推理模型传 `deepseek-reasoner`

失败回 `{ ok: false, error: <kind>, detail }`，四类：

| error | 意思 | 调用方该做什么 |
| --- | --- | --- |
| `timeout` | 等到超时上限还没回 | 大 prompt 拆小或调大 timeoutMs，别马上连着再发 |
| `rate_limit` | 429 限流 | 自己退避，插件不管 |
| `bad_key` | 401/403，或 key 没配 | 查设置，别循环重试 |
| `bad_response` | 5xx、应答格式不对、网络不通 | 看 detail；偶发可以重试一次，连续出现是环境问题 |

另有 `bad_args`：参数本身不合法，detail 里说原因。

## deepseek.usage

`{ days? }`（缺省 30）→ `{ byCaller:[{ caller, calls, ok, failed, totalTokens }], total }`。
真正发出去的调用都记账，失败的也记（计入 `failed`、没有 token），「模型连续降级 N 轮」这类判断可以从这里取数；
参数不合法、key 没配的调用没发出去，不记账。账最多留 500 条，满了先删最老的。

## 设置

`api-key`（secret，必填）、`model`（缺省 `deepseek-chat`）、`base-url`（缺省 `https://api.deepseek.com`）。
key 不随包发布、不进日志；换 key 不用动插件。查是否已配置用 `credentials.status { "section": "deepseek", "key": "api-key" }`；授权后的复制、文件导入分别用 `credentials.copy` / `credentials.import`，完整参数读说明书 `gwb-settings`，目标是 `deepseek.api-key`。本地设置界面也可输入，agent 只核对状态、不回显原文；随机生成值不能代替 DeepSeek 签发的 key。

## 调用方要知道的

- 记账写不进去时插件只写一条警告日志、不改回执：调用成功的结果不会因为记账失败而丢
- prompt 与应答正文都不进日志，日志里只有 caller、model 与 token 数
