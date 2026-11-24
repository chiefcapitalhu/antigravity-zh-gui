# 贡献指南（Contributing）

感谢关注 `antigravity-zh-gui`！本项目坚持 **100% Clean-Room 原创、纯本地离线、零外部 Go 依赖、红线保护零误翻** 原则。

## 原则与底线

1. **原创与可追溯**：所有词条的英文原文必须以只读方式提取自官方 Antigravity 客户端，中文译文须 100% 原创，不抄袭或搬运第三方汉化包。每条词典条目都必须携带准确的 `source` 与 `offset`，并通过 `extract --verify` 重放检验。
2. **零外部依赖**：`go list -m all` 必须仅输出 `antigravity-zh-gui`，仅使用 Go 标准库。
3. **离线与安全策略**：`runtime/ui_translator.js` 与 `runtime/main_hooks.js` 禁止使用 `innerHTML` / `outerHTML` / `eval` / `new Function` / 任何网络请求。
4. **测试不碰真实安装**：所有写入类单元测试仅在 `t.TempDir()` 或合成样例中运行，绝不修改本机 `/Applications/Antigravity.app` 或读取真实会话与凭据。

## 术语规范

| 英文原文 | 统一译法 | 说明 |
|---|---|---|
| `Antigravity` | `Antigravity` | 品牌名保留原文 |
| `Agent` | `AI 助手` | 独立词条须使用 `AI 助手` |
| `Subagent` | `子助手` | — |
| `Swarm` | `多助手协作` | — |
| `Sidecar` | `伴生侧栏` | — |
| `Artifact` | `生成文档` | — |
| `Workspace` | `工作目录` | — |
| `Skill` / `Rule` / `Workflow` | `技能` / `规则` / `工作流` | — |
| `Prompt` | `提示词` | — |
| `MCP Server` | `MCP 服务` | — |
| `Browser Agent` | `浏览器助手` | — |
| `Token` | `Token` | 保留原文 |

表达风格应自然、口语化、简洁，适合普通用户理解。29 个易混淆泛用短词（如 `open`、`file`、`code`、`save`、`close`、`delete`、`copy`、`all`、`new` 等）禁止放入全局 `exact`，只能放在 `scoped` 中。

## 本地验证清单

提交 PR 前请确认以下检查全部通过：

```bash
# 1. 确认零外部依赖
go list -m all

# 2. Go 静态检查、构建与全量单测
go vet ./...
go test -count=1 ./...
go build ./...

# 3. 词典字节位置只读重放校验（本机装有对应官方版本时）
go run ./cmd/antigravity-zh-gui extract --verify ./locales/zh-CN --out /tmp/ag-zh-verify
rm -rf /tmp/ag-zh-verify

# 4. 前端策略、原生钩子与无头浏览器回归测试
node --test tests/native.test.cjs tests/runtime-policy.test.cjs
node tests/browser.cjs
node tests/panel.cjs
```
