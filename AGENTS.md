# 协作约定

本仓按阶段验收。编排负责接口、派单、独立复核和验收记录。每位工人只编辑自己负责的模块及回执。跨模块问题登记在 docs/prd/跨模块请求.md。

ASAR 工人负责 internal/asar。环境工人负责 internal/detector 与 internal/config。事务工人负责 internal/patcher。开发仅依赖 Go 标准库。测试使用临时目录中的合成样例，不操作真实安装，不读取用户会话或凭据，不发送网络请求。开发过程中只提交确切路径。提交、测试和未验证项应可追溯到本轮回执。

界面工人负责 runtime/ui_translator.js。原生文案工人负责 runtime/main_hooks.js 及固定资源的 Go 打包。浏览器验收工人使用临时 Chrome 配置运行 tests/browser.cjs，检查真实 DOM、受保护内容和双语恢复。编排依据回执和具体提交的 CI 作业核验。
