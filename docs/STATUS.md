# 当前状态

阶段 1 的只读调研确定了 2.34.0 的资源布局。阶段 2 提供 ASAR、环境检测、配置与事务模块，阶段 3 提供可嵌入的双语运行时。阶段 4 交付只读提取器和五个简体中文词典模块。

| 验收项 | 证据 |
|---|---|
| ASAR、环境和事务 | 合成归档、临时模拟安装及独立复核记录见 prd/回执 |
| 本地竞态检查 | Go 1.26.11 在 macOS arm64 上执行 go test -race -count=1 -cover ./...；四包通过 |
| Windows 与 macOS 原生 CI | 每次推送在 GitHub 托管运行器执行 Go 1.22 的 vet、测试与构建。实现提交 82dc2a2 在 [Windows](https://github.com/chiefcapitalhu/antigravity-zh-gui/actions/runs/45050532005/job/137294425094) 与 [macOS](https://github.com/chiefcapitalhu/antigravity-zh-gui/actions/runs/45050532005/job/137294424667) 均通过 |
| Windows 验收样本 | 临时安装和模拟进程；真实客户端显示效果留待副本端到端验收 |
| 双语运行时 | 本地 Chrome 的 15 组回归验证受保护区域、快捷键、Shadow DOM、输入框选区与无损恢复。5 项 Node 测试覆盖原生菜单与脚本约束。每次提交会在 [双平台 CI](https://github.com/chiefcapitalhu/antigravity-zh-gui/actions/workflows/ci.yml) 复跑 |
| 运行时接口 | 见 [阶段 3 约定](contracts/阶段3.md)。Go 将固定程序作为资源嵌入，个人译文只作为 JSON 数据传入。独立跨进程的 Electron 接线须在客户端副本验收 |

## 阶段 4

| 模块 | 条数 | 取材范围 |
|---|---:|---|
| core | 40 | 常用导航、工具栏和新手引导 |
| workspace | 48 | 工作目录、侧栏、会话和文件操作 |
| settings | 63 | 设置导航、权限与确认对话框 |
| agents | 72 | AI 助手、技能、MCP、模型和伴生侧栏 |
| menus_dialogs | 72 | 右键菜单、应用菜单、系统弹窗、Dock 和托盘 |

295 条译文分别对应 295 个可重放的原文位置。独立核对资源 SHA-256 和 UTF-8 字节位置后，284 条可直接比较原始字节，11 条需解码 JavaScript 字符串的转义。再次提取同一版本得到逐字节相同的清单。把一条词的起始位置移动一个字节后，工具报错并中止导出。

21 组离线 Chrome 回归在模拟客户端结构上逐一验证了 223 条界面译文的显示路径。6 项 Node 测试覆盖脚本约束和原生展示工厂，其中 72 条菜单、托盘或弹窗文案均通过逐条检查。模型配额标题目前仅在能确认身份的空配额面板显示中文。真实客户端副本的全界面覆盖率仍待验收。

静态扫描在 8 个资源中自动找到 2,815 个候选位置。加入词典中人工定位的出处后，证据清单有 2,897 个位置，含同一英文的多次出现。逐条来源重放的命令见[阶段 4 接口与派单](contracts/阶段4.md)。

另用临时回环 HTTP 服务验证了开发者选项 `extract --live`。成功时仅接收指定本机端口上的 `/main.js`，请求中没有 Cookie 或 Authorization。服务返回重定向时，命令在第二次请求和写出报告之前中止。

运行器每次推送都用 Go 1.22 执行全量测试（含词典完整性校验）、构建、原生菜单及离线 Chrome 回归。Windows 使用模拟安装目录。具体提交的两个平台结果见[持续集成记录](https://github.com/chiefcapitalhu/antigravity-zh-gui/actions/workflows/ci.yml)。独审的三个修复及其复现结果见[阶段 4 独审](prd/回执/阶段4独审.md)。

阶段 5 待用户确认。该阶段负责本地控制台、完整 CLI、发布配置与客户端副本端到端验收。
