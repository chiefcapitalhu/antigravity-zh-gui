# 更新日志（Changelog）

本项目所有重要变更均记录于此文档。

## [0.2.0] - 2026-11-25

### 新增功能
- **四层安全 DOM 匹配引擎（`runtime/ui_translator.js`）**：
  - **第 1 层（严格红线保护区）**：保护用户消息、AI 回复、Markdown 正文、展开后的思考过程正文（放行外层折叠标题按钮）、代码块、Monaco/CodeMirror、终端、Diff、输入框、会话列表标题、Git 分支/项目名、PDF 文本层、网页弹窗与模型原始名称等全部用户/外部内容容器。
  - **第 2 层（全 UI 查表）**：保护区外自动查表，支持空白/弯引号/省略号归一化、多词大小写兼容（同时适配 2.34.0 Title Case 与 2.35.0 Sentence case）、快捷键后缀拆分与属性查表，保持 `WeakMap` 无损 `zh↔en` 热切换。
  - **第 3 层（短词作用域守卫）**：29 个泛用短词禁止进入全局 `exact`，仅在明确按钮/菜单/状态控件作用域内生效。
  - **第 4 层（完整动态模板与拆分节点）**：覆盖聊天思考/工作状态条、步骤与工具汇总、聊天内权限审批、模型配额/相对时间、列表计数及高频 React 相邻拆分文本节点。
- **原创简体中文词典大幅扩充**：由 299 条扩充至 **3,107 条**，全量通过 `extract --verify` 字节位置重放校验。
- **Antigravity 2.34.0 / 2.35.0 多版本支持**：`reviewed`、`identityMembers` 与 `releaseHash` 支持多版本哈希集合；审核覆盖的主进程白名单模块由 5 个扩展至 **13 个**（新增 `ipcHandlers.js`、`remoteManager.js`、`sshPrompts.js`、`deviceChooser.js`、`webauthn.js`、`webviewPopupSecurity.js`、`provisionSplash.js`、`wizardHtml.js`）。
- **降级部分汉化显式告警**：检测到 `hub_skipped` 降级（仅改写少量弹窗而未注入 `dist/preload.js`）时，`status` 返回 `degraded: true` 与明确告警，控制台界面红字显示「部分汉化（已降级）」。
- **提取器升级（`internal/extractor`）**：覆盖 13 个主进程 JS 模块、全部常用 UI 属性、三元表达式、JSX 文本子节点、按钮数组与噪声过滤，并支持从已汉化安装的 `.zh-gui.bak` 只读校验。

### 缺陷修复
- 修复普通还原（`restore`）误跑汉化规划导致在非适配/降级版本上弹出红框误报的问题。
- 修复自动探测遇残留无效目录（仅剩 `.zh-gui.bak`）即中止而不继续探测后续候选路径的问题。
- 统一 `/api/status`、`/api/preferences`、`/api/start` 对相对路径的校验策略（统一拒绝非空相对路径）。
- 优化 macOS 整包备份冲突错误信息（给出备份路径与处理建议），并让默认目标的 `RestoreOfficialApp("")` 在提交后同样尝试清理渲染缓存。

## [0.1.0] - 2026-11-24

- 首版发布：纯 Go 标准库单文件工具、本地 Web 控制台、ASAR 原子事务重写与 SHA-256 审计、macOS 整包备份与临时签名、299 条原创首版词条、`Cmd/Ctrl+Shift+L` 中英文切换。
