# Antigravity 可视化汉化工具

`antigravity-zh-gui` 为 macOS 和 Windows 上的 Antigravity 2.x 提供简体中文界面。双击一个文件即可在默认浏览器打开本地控制台。翻译、个人词条、备份和审计都在自己的电脑上处理。首版内置 299 条原创译文，原文来自 2.34.0 的界面资源。

## 第一次使用

1. 在构建产物中选择与你的电脑对应的文件。Mac 的「关于本机」显示 Apple 芯片时选 `darwin-arm64`，Intel 芯片选 `darwin-amd64`。Windows 的「设置 → 系统 → 系统信息」显示 x64 时选 `windows-amd64.exe`，ARM64 时选 `windows-arm64.exe`。
2. 保存 Antigravity 中的工作，然后完全退出。macOS 可按 **Cmd+Q**。双击汉化工具，查看「环境体检」显示的安装路径、版本、进程和签名状态。可在路径框中输入自己的应用副本，再点击「重新检测」。
3. 选好默认语言、快捷键和品牌显示方式，点击「一键汉化 / 更新」。首次在 Mac 使用时，若希望以后恢复 Google 原签名，请勾选整包备份并预留一份应用大小的空间。操作日志会显示进度，「安全透明审计」可展开查看每个改动成员的前后大小和 SHA-256。
4. 启动刚才选中的 Antigravity。在本地 Hub 窗口按 **Cmd+Shift+L**（Mac）或 **Ctrl+Shift+L**（Windows）切换中英文。快捷键与客户端自带的新建对话快捷键重合。关闭汉化工具的快捷键选项并重新汉化，即可交还给客户端。
5. 个人译文可在控制台底部添加或删除，保存后再点「一键汉化 / 更新」。例如把 `New Conversation` 改成「开始新对话」。个人词条只在已识别的界面控件中匹配。最后点击「退出工具」关闭本地服务。

可使用同一批产物中的 `SHA256SUMS.txt` 校验下载文件。macOS 在文件所在目录运行 `shasum -a 256 文件名`，Windows PowerShell 运行 `Get-FileHash 文件名 -Algorithm SHA256`，比较对应的一行。Mac 上传输后若丢失执行权限，可运行 `chmod u+x 文件名`。自行构建的方法见下文。

## 先在副本验收

在 Finder 的「应用程序」中拷贝 `Antigravity.app`，粘贴到一个自己可写的新文件夹。Windows 可复制包含 `Antigravity.exe` 和 `resources` 的完整安装目录。下列步骤都指向复制后的路径。

1. 所有 Antigravity 进程退出后，在控制台输入副本路径并重新检测，记下英文状态。
2. 点击「一键汉化 / 更新」，确认日志显示已提交，再点击「验证文件完整性」。展开审计，核对被修改的内部成员。有警告时，按成员名查看跳过了哪些功能。
3. 从副本所在文件夹启动客户端，在一个固定按钮或欢迎页上来回切换两次。检查中文、英文、再次中文时的实际文字和右下角提示。已登录的用户也可以对照会话正文和代码块，确认原文显示。使用同一系统账号启动客户端副本时，客户端可能沿用自己的登录和会话资料。
4. 正常退出副本，回到控制台点击「一键还原官方英文」，再执行一次完整性验证。macOS 的普通还原恢复原始 ASAR 并使用本地临时签名。要恢复真正的发行方签名，请使用「从整包备份还原官方签名」。这个选项要求先前的整包备份通过发行方及版本核验。

## 兼容性与备份

- 已定位的完整界面基线为 **Antigravity 2.34.0**。应用更新后可重新汉化。只在已识别的资源和唯一匹配的位置写入。版本不同、Windows 宿主要求嵌入式 ASAR 校验，或无法确认进程状态时，请以工具的跳过或中止报告为准。
- 用户消息、代码、终端、文件路径、外部网页、插件内容和动态模型名保留原文。Electron 或系统自动提供的菜单，以及尚未识别的界面可能显示英文。快捷键偏好保存在本地 Hub 的当前浏览器来源下。客户端重启后若换用了另一个端口，会使用补丁所选的默认语言。
- 归档备份位于客户端的 `app.asar.zh-gui.bak`。有汉化标记却找不到可信备份时，操作中止。可选的官方整包备份位于 `~/Documents/Antigravity-Official-Backup.app`。工具先制作并验证候选文件，再提交替换；macOS 在临时同卷副本中完成 plist 更新、签名和校验。
- 个人配置与 `custom_dict.json` 位于 macOS 的 `~/.config/antigravity-zh-gui/` 或 Windows 的 `%APPDATA%\antigravity-zh-gui\`。默认探测安装成功更新后，仅清理预先列明的 Chromium 缓存。指定副本路径时保留真实用户缓存。
- 面板只监听随机的 `127.0.0.1` 端口。API 核对会话令牌、Host 与 Origin。工具没有外网下载、更新或遥测代码；客户端本身仍遵循原有网络设置。Windows 会验证宿主签名并检查其完整性策略，不分发 DLL。

## 命令行

以下示例使用已编译工具。在 Windows PowerShell 下可将命令名换为 `.\antigravity-zh-gui-windows-amd64.exe`，并以本机安装目录替换示例路径。省略目标时使用保存的目标偏好或自动探测。

```sh
./antigravity-zh-gui --version
./antigravity-zh-gui status --target "/path/to/Antigravity.app"
./antigravity-zh-gui apply --target "/path/to/Antigravity.app" --hotkey=true --default-lang=zh --brand=keep
./antigravity-zh-gui verify --target "/path/to/Antigravity.app"
./antigravity-zh-gui restore --target "/path/to/Antigravity.app"
```

`apply --backup-app` 请求 macOS 官方整包备份。`restore --backup-app` 请求从该备份还原。普通操作的审计结果输出为 JSON，进度写入标准错误。

开发者可只读提取固定界面资源，并重放原创词典的英文、偏移和成员摘要。输出目录须是新目录。

```sh
./antigravity-zh-gui extract --target "/path/to/Antigravity.app" --out ./report-v1
./antigravity-zh-gui extract --target "/path/to/Antigravity.app" --verify ./locales/zh-CN --out ./reviewed
./antigravity-zh-gui extract --target "/path/to/newer/Antigravity.app" --diff ./report-v1/candidates.json --out ./report-v2
```

`extract --live --live-origin http://127.0.0.1:端口` 可额外读取指定本机 Hub 的固定资源 `/main.js`。默认提取只读磁盘。词典的来源和编写方法记录在[词典验收回执](docs/prd/回执/界面词典.md)。

## 从源代码构建

在仓库根目录运行。主程序只使用 Go 标准库。Go 1.22.12 是 CI 的最低版本构建样本；使用 Go 1.22 系列在较新的 macOS 上构建时，命令中的链接参数会写入 Mach-O UUID。

```sh
# macOS
CGO_ENABLED=0 go build -ldflags=-B=gobuildid -o antigravity-zh-gui ./cmd/antigravity-zh-gui
./antigravity-zh-gui
```

```powershell
# Windows PowerShell
go build -o antigravity-zh-gui.exe ./cmd/antigravity-zh-gui
.\antigravity-zh-gui.exe
```

Go 测试使用 `go test ./...`（旧版 Go 在 macOS 可加 `-ldflags=-B=gobuildid`）。前端回归需要 Node 和 Chrome，执行 `node --test tests/native.test.cjs tests/runtime-policy.test.cjs`、`node tests/browser.cjs` 和 `node tests/panel.cjs`。正式程序已内嵌词典与面板，运行时无须安装 Node 或 Go。

在 Bash 中运行 `bash scripts/build-release.sh dist` 可在新的 `dist` 目录生成四个单文件程序和 `SHA256SUMS.txt`。GitHub 的手动构建可下载相同布局的工件；推送 `v0.1.0` 形式的版本标签会在双平台 CI 通过后创建 Release。

本项目按 MIT 协议授权。Antigravity 客户端及其官方安装文件由原发行方提供。[MIT 协议](LICENSE)
