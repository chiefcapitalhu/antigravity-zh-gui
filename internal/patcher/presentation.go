// The main-process additions are compiled from fixed sources. Only validated
// preferences and JSON dictionary data can vary between installations.
package patcher

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/locales"
	l10n "antigravity-zh-gui/runtime"
)

//go:embed native_host.js
var nativeHost string

//go:embed hub_host.js
var hubHost string

const mainMember = "dist/main.js"
const menuMember = "dist/menu.js"
const preloadMember = "dist/preload.js"
const trayMember = "dist/tray.js"
const ipcMember = "dist/ipcHandlers.js"
const remoteManagerMember = "dist/remote/remoteManager.js"
const sshPromptsMember = "dist/remote/sshPrompts.js"
const deviceChooserMember = "dist/deviceChooser.js"
const webauthnMember = "dist/webauthn.js"
const popupSecurityMember = "dist/webviewPopupSecurity.js"
const provisionSplashMember = "dist/provisionSplash.js"
const wizardHtmlMember = "dist/ideInstall/wizardHtml.js"

// These digests cover main-process control flow as well as the anchors,
// including the component that authenticates IPC sender/renderer identity.
// Each member accepts all audited release digests (2.34.0 and 2.35.0).
var reviewed = map[string][]string{
	mainMember: {
		"383fcb66595c57b4d9efacdc7b11e3a2a334cb825b254d922cd4fe40455831bd", // 2.34.0
		"e4dd0d71d96f7fdcb5af5b86395cebac8d2367812604fa331429570a442fed69", // 2.35.0
	},
	preloadMember: {
		"d9641f990029ef095b6e93e76579b59de67c1ba56ba4ce84cb0429ecc9b6556a", // 2.34.0
		"2973a6bfd3154fd20c58cbb6643dbf0a5e0cc4fd8a5894c4496f3db5c6231475", // 2.35.0
	},
	menuMember:            {"a6cde959efd16f0c99bdcb66d2228445bb7b2f00d0cb5a51aa1df6a8d933db13"},
	trayMember:            {"6c6b0968b45a1c7088e459657d57a9efd72d3733614349095f17b6ee94b47135"},
	member:                {"6f8dbba51f45894e06903f9a030ff6c292df6563573750fc1f777bed4238a429"},
	ipcMember: {
		"a87ac1cd19ab946ccac8ed4c885db1057e897cc45fe4be97600912a89ea59a2e", // 2.34.0
		"cd1c04e713e7e55312b95a381f54b03706c549d3a893bfcc3d1d24b22a09f3bd", // 2.35.0
	},
	remoteManagerMember:   {"0d3ffc7a698f302ddaf71857871e3f9c2adfdd12ca55279e6a093873fbfef7ff"},
	sshPromptsMember:      {"4ec996aab572a3c68fed5ca23f46eaf7b99c511bd662d4a0eb320bc150a3c848"},
	deviceChooserMember:   {"2a1ea396868055a9024201e9702fddfd65805cd12230520d67dabb0e110cf113"},
	webauthnMember:        {"006f2e03302059a6c6155b2e94405976df697bc488775dd9a7869fecb05828cf"},
	popupSecurityMember:   {"d5a01ab622eebe65dba00ca1b276dc8842c7f2f0c435f354738ea31492c5c26d"},
	provisionSplashMember: {"737f40f02130440a9ec9a3fed83c2e62290029aece6d0ad558136fa510c45f35"},
	wizardHtmlMember:      {"5eff5a777d5cfc26877ee1ea7889310c2afe0aa66d596f87f9bdc57ed41264b9"},
}

type edit struct{ anchor, replacement string }

func renderEdits(input string, edits []edit) (string, error) {
	out := input
	for _, rule := range edits {
		if strings.Count(out, rule.anchor) != 1 {
			return "", fmt.Errorf("展示位置未唯一匹配")
		}
		out = strings.Replace(out, rule.anchor, begin+"\n"+rule.replacement+"\n"+end, 1)
	}
	return out, nil
}

const localUIHandler = `electron_1.ipcMain.handle("agzh:local-ui", (event, mode) => {
    if (DEV_URL || !(0, utils_1.isLocalHubTopFrame)(event)) return null;
    const url = resolveLocalHubEntryUrl();
    if (!url) return null;
    const origin = new URL(url).origin;
    if (!/^https:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin) ||
        new URL(event.senderFrame.url).origin !== origin) return null;
    if (mode !== undefined) {
        if (mode !== "zh" && mode !== "en") return null;
        menu_1.agZhLabels.presenter.setMode(mode);
    }
    return origin;
});`

func moduleEdits(name string, bundle l10n.Bundle, translateUpdateStep bool) []edit {
	switch name {
	case preloadMember:
		return []edit{
			{"const updaterAPI = {", "let agZhContext = null;\nconst updaterAPI = {"},
			{"showContextMenu: (items) => electron_1.ipcRenderer.invoke('window:show-context-menu', items),",
				"showContextMenu: (items) => electron_1.ipcRenderer.invoke('window:show-context-menu', agZhContext ? agZhContext.present('context', items) : items),"},
			{"electron_1.contextBridge.exposeInMainWorld('nativeStorage', storageAPI);",
				"electron_1.contextBridge.exposeInMainWorld('nativeStorage', storageAPI);\n(" + hubHost + ")(" + bundle.HubFactory + ", " + bundle.NativeFactory + ");"},
		}
	case menuMember:
		a := []edit{
			{"function createHubZoomMenuItem(options) {", "const agZhLabels = exports.agZhLabels = (" + nativeHost + ")(" + bundle.NativeFactory + ", electron_1.Menu, " + strconv.FormatBool(translateUpdateStep) + ");\nfunction createHubZoomMenuItem(options) {"},
			{"label: 'New Window',", "id: 'agzh-file-new', label: 'New Window',"},
			{"label: 'Docs',", "id: 'agzh-help-docs', label: 'Docs',"},
			{"return { label: 'Connect to WSL', submenu };", "return { id:'agzh-connect-wsl', label:'Connect to WSL', submenu };"},
			{"return { label: 'Reopen Locally', click:", "return { id:'agzh-reopen-local', label:'Reopen Locally', click:"},
			{"updater_1.updateActions[menuItem.label]", "updater_1.updateActions[agZhLabels.english(menuItem)]"},
			{"item.label === submenuLabel", "agZhLabels.english(item) === submenuLabel"},
			{"item.label === 'View'", "agZhLabels.english(item) === 'View'"},
		}
		for _, context := range []string{"// Re-apply the menu so the change takes effect.", "new electron_1.MenuItem(reopen));\n    }"} {
			a = append(a, edit{context + "\n    electron_1.Menu.setApplicationMenu(menu);", context + "\n    agZhLabels.application(menu);"})
		}
		return a
	case mainMember:
		a := []edit{
			{"let isQuitting = false;", "let isQuitting = false;\n" + localUIHandler},
			{"label: 'New Window',", "id:'agzh-dock-new', label:'New Window',"},
			{"electron_1.app.dock.setMenu(dockMenu);", "menu_1.agZhLabels.track('dock', dockMenu, m => electron_1.app.dock.setMenu(m));"},
			{"label: 'Quit',", "id:'agzh-tray-quit', label:'Quit',"},
			{"electron_1.dialog.showMessageBox(win, options).then", "electron_1.dialog.showMessageBox(win, menu_1.agZhLabels.presenter.dialog('quit', options)).then"},
			{"void electron_1.dialog.showMessageBox({\n                type: 'warning',",
				"void electron_1.dialog.showMessageBox(menu_1.agZhLabels.presenter.dialog('missingWSL', {\n                type: 'warning',"},
			{"detail: 'Antigravity opened on Windows instead.',\n            });", "detail: 'Antigravity opened on Windows instead.',\n            }));"},
		}
		for _, v := range [][2]string{{"Startup failed", "startupTitle"}, {"WSL setup failed", "wslSetupTitle"}, {"Binary not found", "missingBinaryTitle"}} {
			a = append(a, edit{"electron_1.dialog.showErrorBox('" + v[0] + "', msg)", "electron_1.dialog.showErrorBox(menu_1.agZhLabels.presenter.siteLabel('" + v[1] + "', '" + v[0] + "'), msg)"})
		}
		return a
	case trayMember:
		return []edit{
			{"tray.setContextMenu(contextMenu);\n    if (onClick", "require('./menu').agZhLabels.track('tray', contextMenu, m => tray.setContextMenu(m));\n    if (onClick"},
			{"contextMenu.insert(Math.min(position, contextMenu.items.length), new electron_1.MenuItem(options));",
				"contextMenu.insert(Math.min(position, contextMenu.items.length), new electron_1.MenuItem(options));\n    require('./menu').agZhLabels.track('tray', contextMenu, m => tray.setContextMenu(m));"},
			{"countItem.label =", "const englishCount ="},
			{"' running';\n            tray.setContextMenu", "' running';\n            require('./menu').agZhLabels.current(countItem, englishCount, 'tray');\n            tray.setContextMenu"},
		}
	case member:
		return []edit{
			{"item.label = step;", "require('./menu').agZhLabels.current(item, step, 'application');"},
			{"electron_1.dialog.showMessageBox(win, options);", "electron_1.dialog.showMessageBox(win, require('./menu').agZhLabels.presenter.dialog('update', options));"},
			{"electron_1.dialog.showMessageBox(options);", "electron_1.dialog.showMessageBox(require('./menu').agZhLabels.presenter.dialog('update', options));"},
		}
	case ipcMember:
		return []edit{
			{"electron_1.dialog.showErrorBox('Cannot open folder', t.error);",
				"electron_1.dialog.showErrorBox(require('./menu').agZhLabels.presenter.siteLabel('cannotOpenFolder', 'Cannot open folder'), t.error);"},
			{"message: 'Folder is on the Windows filesystem',",
				"message: require('./menu').agZhLabels.presenter.siteLabel('windowsFolderMsg', 'Folder is on the Windows filesystem'),"},
			{"title: 'Open workspace',",
				"title: require('./menu').agZhLabels.presenter.siteLabel('openWorkspace', 'Open workspace'),"},
			{"title: 'Open workspaces',",
				"title: require('./menu').agZhLabels.presenter.siteLabel('openWorkspaces', 'Open workspaces'),"},
			{"title: 'Select Download Folder',",
				"title: require('./menu').agZhLabels.presenter.siteLabel('selectDownloadFolder', 'Select Download Folder'),"},
		}
	case remoteManagerMember:
		return []edit{
			{"title: 'Choose an SSH config file',",
				"title: require('../menu').agZhLabels.presenter.siteLabel('chooseSshConfig', 'Choose an SSH config file'),"},
			{"const { response } = await electron_1.dialog.showMessageBox(parent, {\n                type: 'warning',\n                title: 'Choose another SSH config file',\n                ...refusal,\n                buttons: ['Choose Another File…', 'Cancel'],\n                defaultId: 0,\n                cancelId: 1,\n                noLink: true,\n            });",
				"const { response } = await electron_1.dialog.showMessageBox(parent, require('../menu').agZhLabels.presenter.dialog('chooseAnotherSshConfig', {\n                type: 'warning',\n                title: 'Choose another SSH config file',\n                ...refusal,\n                buttons: ['Choose Another File…', 'Cancel'],\n                defaultId: 0,\n                cancelId: 1,\n                noLink: true,\n            }));"},
			{"return electron_1.dialog.showMessageBox(win, {\n                    type: 'warning',\n                    buttons: ['Stop Server', 'Cancel'],\n                    defaultId: 1,\n                    cancelId: 1,\n                    title: 'Stop SSH server',\n                    message: `Stop the Antigravity server on ${entry.label}?`,\n                    detail: 'Agents running on this host will stop and its window will close. ' +\n                        'The server starts again the next time you connect.',\n                    // A drop closes it as Cancel.\n                    signal: conn.closedSignal,\n                });",
				"return electron_1.dialog.showMessageBox(win, require('../menu').agZhLabels.presenter.dialog('stopSshServer', {\n                    type: 'warning',\n                    buttons: ['Stop Server', 'Cancel'],\n                    defaultId: 1,\n                    cancelId: 1,\n                    title: 'Stop SSH server',\n                    message: `Stop the Antigravity server on ${entry.label}?`,\n                    detail: 'Agents running on this host will stop and its window will close. ' +\n                        'The server starts again the next time you connect.',\n                    // A drop closes it as Cancel.\n                    signal: conn.closedSignal,\n                }));"},
			{"await electron_1.dialog.showMessageBox(parent, options);",
				"await electron_1.dialog.showMessageBox(parent, require('../menu').agZhLabels.presenter.dialog('sshSheet', options));"},
		}
	case sshPromptsMember:
		return []edit{
			{"const { response } = await electron_1.dialog.showMessageBox(parent, {\n            type: confirm ? 'question' : 'info',\n            title: `SSH: ${label}`,\n            message: title,\n            detail: text,\n            buttons: confirm ? ['Yes', 'No'] : ['Cancel'],\n            defaultId: confirm ? 1 : 0,\n            cancelId: confirm ? 1 : 0,\n            // Also closes it once ssh no longer waits (e.g. after the touch).\n            signal: stop.signal,\n        });",
				"const { response } = await electron_1.dialog.showMessageBox(parent, require('../menu').agZhLabels.presenter.dialog('sshPrompt', {\n            type: confirm ? 'question' : 'info',\n            title: `SSH: ${label}`,\n            message: title,\n            detail: text,\n            buttons: confirm ? ['Yes', 'No'] : ['Cancel'],\n            defaultId: confirm ? 1 : 0,\n            cancelId: confirm ? 1 : 0,\n            // Also closes it once ssh no longer waits (e.g. after the touch).\n            signal: stop.signal,\n        }));"},
		}
	case deviceChooserMember:
		return []edit{
			{"const { response } = await showMessageBox(win, {\n                        type: 'question',\n                        title: 'Connect a device',\n                        message: `${origin} wants to connect to a ${KIND_NOUNS[kind]}`,\n                        detail: cancelId\n                            ? 'Select a device:'\n                            : 'No compatible devices found.',\n                        buttons: [...snapshot.map(({ label }) => label), 'Cancel'],\n                        cancelId,\n                        defaultId: cancelId,\n                        signal: fallbackController.signal,\n                    });",
				"const { response } = await showMessageBox(win, require('./menu').agZhLabels.presenter.dialog('deviceChooser', {\n                        type: 'question',\n                        title: 'Connect a device',\n                        message: `${origin} wants to connect to a ${KIND_NOUNS[kind]}`,\n                        detail: cancelId\n                            ? 'Select a device:'\n                            : 'No compatible devices found.',\n                        buttons: [...snapshot.map(({ label }) => label), 'Cancel'],\n                        cancelId,\n                        defaultId: cancelId,\n                        signal: fallbackController.signal,\n                    }));"},
		}
	case webauthnMember:
		return []edit{
			{"const result = await showMessageBox(win, {\n                        type: 'question',\n                        title: 'Choose a Passkey',\n                        message: `Sign in to ${rpLabel}`,\n                        detail: 'Select a passkey account to continue:',\n                        buttons: [...accountLabels, 'Cancel'],\n                        defaultId: 0,\n                        cancelId: cancelIndex,\n                    });",
				"const result = await showMessageBox(win, require('./menu').agZhLabels.presenter.dialog('passkeyChooser', {\n                        type: 'question',\n                        title: 'Choose a Passkey',\n                        message: `Sign in to ${rpLabel}`,\n                        detail: 'Select a passkey account to continue:',\n                        buttons: [...accountLabels, 'Cancel'],\n                        defaultId: 0,\n                        cancelId: cancelIndex,\n                    }));"},
		}
	case popupSecurityMember:
		return []edit{
			{"label: 'Connection info…',",
				"label: require('./menu').agZhLabels.presenter.siteLabel('connectionInfoMenu', 'Connection info…'),"},
			{".showMessageBox(window, {\n                        type: state.level === 'secure' ? 'info' : 'warning',\n                        title: 'Connection info',\n                        message,\n                        detail,\n                        buttons: ['OK'],\n                    })",
				".showMessageBox(window, require('./menu').agZhLabels.presenter.dialog('connectionInfo', {\n                        type: state.level === 'secure' ? 'info' : 'warning',\n                        title: 'Connection info',\n                        message,\n                        detail,\n                        buttons: ['OK'],\n                    }))"},
		}
	case provisionSplashMember:
		return []edit{
			{"void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);",
				"const agZhHtml = require('./menu').agZhLabels?.presenter?.getMode() === 'zh' ? html.replace('<div>Setting up WSL: ', '<div>正在配置 WSL：') : html;\n    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(agZhHtml)}`);"},
		}
	case wizardHtmlMember:
		return []edit{
			{"exports.getWizardHtml = getWizardHtml;",
				"exports.getWizardHtml = function getLocalizedWizardHtml(iconBase64) {\n" +
					"    let html = getWizardHtml(iconBase64);\n" +
					"    if (require('../menu').agZhLabels?.presenter?.getMode() === 'zh') {\n" +
					"        html = html\n" +
					"            .replace('<title>Welcome to Antigravity</title>', '<title>欢迎使用 Antigravity</title>')\n" +
					"            .replace('>Setting up…</div>', '>正在准备环境…</div>')\n" +
					"            .replace('<h1>Welcome to the new Antigravity!</h1>', '<h1>欢迎体验全新 Antigravity！</h1>')\n" +
					"            .replace(\"<p>Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.</p>\", '<p>Antigravity 已全面重构，以 AI 助手为核心并带来全新能力。如果你仍需要代码编辑器，可以单独下载名为 <b>Antigravity IDE</b> 的应用。</p>')\n" +
					"            .replace('<span>Download the Antigravity IDE</span>', '<span>下载 Antigravity IDE</span>')\n" +
					"            .replace('id=\"btn-skip\">Explore the new Antigravity</button>', 'id=\"btn-skip\">开始探索新版 Antigravity</button>');\n" +
					"    }\n" +
					"    return html;\n" +
					"};"},
		}
	}
	return nil
}

func planWithSources(source, platform string, opt Options) (map[string][]byte, []Warning, error) {
	if opt.Preferences == nil {
		changes, warnings := plan(source, platform)
		return changes, warnings, nil
	}
	bundle, err := locales.Build(platform, *opt.Preferences, opt.Custom)
	if err != nil {
		return nil, nil, err
	}
	out := map[string][]byte{}
	var warnings []Warning
	for _, name := range []string{
		member, preloadMember, menuMember, mainMember, trayMember,
		ipcMember, remoteManagerMember, sshPromptsMember, deviceChooserMember,
		webauthnMember, popupSecurityMember, provisionSplashMember, wizardHtmlMember,
	} {
		data, err := asar.ReadFile(source, name)
		crlf := bytes.Contains(data, []byte("\r\n"))
		text := strings.ReplaceAll(string(data), "\r\n", "\n")
		if err != nil || !slices.Contains(reviewed[name], fmt.Sprintf("%x", sha256.Sum256([]byte(text)))) {
			warnings = append(warnings, Warning{"unrecognized_ui_member", name, "成员内容与已复核的界面版本不同，已跳过"})
			continue
		}
		rendered, err := renderEdits(text, moduleEdits(name, bundle, out[member] != nil))
		if err != nil {
			warnings = append(warnings, Warning{"anchor_mismatch", name, err.Error()})
			continue
		}
		if crlf {
			rendered = strings.ReplaceAll(rendered, "\n", "\r\n")
		}
		out[name] = []byte(rendered)
	}
	// Sender authentication uses the host's local-window registry. Only use
	// it when the implementation and all three mutually dependent modules match.
	for _, identity := range identityMembers {
		data, err := asar.ReadFile(source, identity.member)
		if err != nil || !slices.Contains(identity.hashes, fmt.Sprintf("%x", sha256.Sum256(bytes.ReplaceAll(data, []byte("\r\n"), []byte("\n"))))) {
			warnings = append(warnings, Warning{"unknown_hub_identity", identity.member, "本地窗口身份校验组件版本未知"})
			delete(out, preloadMember)
			break
		}
	}
	if out[preloadMember] == nil || out[mainMember] == nil || out[menuMember] == nil {
		// These three modules cooperate on sender authentication and mode.
		// Independent literal dialogs can still be used on another build.
		warnings = append(warnings, Warning{"hub_skipped", preloadMember, "当前版本不能完整接入本地 Hub 与菜单，保留热切换入口原样"})
		fallback, misses := plan(source, platform)
		for path, data := range fallback {
			en, zh := "No updates available", "已是最新版本"
			if path == mainMember {
				en, zh = "WSL setup failed", "WSL 初始化失败"
			}
			display := zh
			if custom, ok := opt.Custom[en]; ok {
				display = custom
			}
			if opt.Preferences.DefaultLang == "en" {
				display = en
			}
			literal, err := json.Marshal(display)
			if err != nil {
				return nil, nil, err
			}
			// Replace only the literal inside the generated marker pair.
			start := bytes.Index(data, []byte(begin))
			stop := bytes.Index(data[start:], []byte(end)) + start
			fragment := bytes.Replace(data[start:stop], []byte("'"+zh+"'"), literal, 1)
			updated := append([]byte(nil), data[:start]...)
			updated = append(updated, fragment...)
			fallback[path] = append(updated, data[stop:]...)
		}
		return fallback, append(warnings, misses...), nil
	}
	return out, warnings, nil
}

const optionsLine = "// ANTIGRAVITY-ZH-GUI OPTIONS "

type recordedOptions struct {
	Hotkey      bool              `json:"hotkey"`
	DefaultLang string            `json:"defaultLang"`
	Brand       string            `json:"brand"`
	Custom      map[string]string `json:"custom,omitempty"`
}

func presentationPlan(source, platform string, opt Options) (map[string][]byte, []Warning, error) {
	out, warnings, err := planWithSources(source, platform, opt)
	if err != nil || opt.Preferences == nil {
		return out, warnings, err
	}
	meta := recordedOptions{opt.Preferences.Hotkey, opt.Preferences.DefaultLang, opt.Preferences.Brand, opt.Custom}
	data, err := json.Marshal(meta)
	if err != nil {
		return nil, nil, err
	}
	for _, key := range []string{preloadMember, member, mainMember} {
		if out[key] != nil {
			// Keep only JSON display data. A reconstruction on a moved copy can
			// independently verify every modified byte without a per-path receipt.
			out[key] = append(out[key], []byte("\n"+begin+"\n"+optionsLine+string(data)+"\n"+end+"\n")...)
			break
		}
	}
	return out, warnings, nil
}

func reconstructPlan(original, installed, platform string) (map[string][]byte, error) {
	for _, key := range []string{preloadMember, member, mainMember} {
		data, err := asar.ReadFile(installed, key)
		if err != nil {
			continue
		}
		marker := []byte("\n" + begin + "\n" + optionsLine)
		ix := bytes.LastIndex(data, marker)
		if ix < 0 {
			continue
		}
		line, ok := bytes.CutSuffix(data[ix+len(marker):], []byte("\n"+end+"\n"))
		if !ok || len(line) > 8<<20 {
			return nil, fmt.Errorf("本地化参数记录无效")
		}
		var meta recordedOptions
		if err := json.Unmarshal(line, &meta); err != nil {
			return nil, err
		}
		p := config.Preferences{Hotkey: meta.Hotkey, DefaultLang: meta.DefaultLang, Brand: meta.Brand}
		changes, _, err := presentationPlan(original, platform, Options{Preferences: &p, Custom: meta.Custom})
		return changes, err
	}
	changes, _ := plan(original, platform)
	return changes, nil
}
func presentationDefaults(opt Options) Options {
	if opt.Preferences == nil {
		p := config.Defaults()
		opt.Preferences = &p
	}
	return opt
}

var identityMembers = []struct {
	member string
	hashes []string
}{
	{"dist/utils.js", []string{
		"b1a56e70e747389ee1143faba202ec4302fe6855cb77bc97d2c3a7fbbf372d1c", // 2.34.0
		"2caca4881cf1ea461bc67fbdde0d88240ae308a39c8e1744a9f6db1207ab8def", // 2.35.0
	}},
	{"dist/remote/windowBackends.js", []string{
		"282f47b80da9cd10b956eb754814cd025089cab0e4bef162ddc1f1d29b9e9957",
	}},
	{"dist/constants.js", []string{
		"7d9c173e44e461ebd7d8b8316565fe2ebf59425ccbdc55eb940aa178c6d78dce", // 2.34.0
		"b36cc05a0fdc43fe9149e3278adb9e83aff3e46d7e9114e7d4f6ca32f8e0a6ba", // 2.35.0
	}},
	{"dist/languageServer.js", []string{
		"a6cd83287d7d1eaeab7af450e5af3eff960a2869e7eabd5ce1d8ce8459e87dcd",
	}},
}
