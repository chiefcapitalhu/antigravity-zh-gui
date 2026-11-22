package patcher

import (
	"antigravity-zh-gui/internal/asar"
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
)

type Warning struct {
	Code   string `json:"code"`
	Member string `json:"member,omitempty"`
	Detail string `json:"detail"`
}

func (w *Warning) Error() string { return w.Code + ": " + w.Detail }

type Result struct {
	*asar.AuditReport
	Committed bool      `json:"committed"`
	Warnings  []Warning `json:"warnings,omitempty"`
}

type copyRule struct{ member, context, old, new string }

var updateDialog = regexp.MustCompile(`const options = \{\s*type: 'info',\s*title: 'Check for Updates',\s*message: 'No updates available',\s*buttons: \['OK'\],\s*\};\s*if \(win\) \{\s*electron_1\.dialog\.showMessageBox\(win, options\);\s*\}\s*else \{\s*electron_1\.dialog\.showMessageBox\(options\);\s*\}`)

func plan(source, platform string) (map[string][]byte, []Warning) {
	rules := []copyRule{{member, "autoUpdater.on('update-not-available'", "message: 'No updates available',", begin + " message: '已是最新版本', " + end}}
	if platform == "windows" {
		rules = append(rules, copyRule{"dist/main.js", "ensureServerInstalled)(WSL_DISTRO", "await electron_1.dialog.showErrorBox('WSL setup failed', msg);", "await electron_1.dialog.showErrorBox(" + begin + " 'WSL 初始化失败' " + end + ", msg);"})
	}
	out := map[string][]byte{}
	var warnings []Warning
	for _, rule := range rules {
		sourceBytes, err := asar.ReadFile(source, rule.member)
		if err != nil {
			warnings = append(warnings, Warning{"member_unavailable", rule.member, err.Error()})
			continue
		}
		count := bytes.Count(sourceBytes, []byte(rule.old))
		ctx := bytes.Count(sourceBytes, []byte(rule.context))
		prefix := bytes.Index(sourceBytes, []byte(rule.context))
		position := bytes.Index(sourceBytes, []byte(rule.old))
		validDialog := rule.member != member || len(updateDialog.FindAllIndex(sourceBytes, 2)) == 1
		if !validDialog || count != 1 || ctx != 1 || position <= prefix || position-prefix > 8192 {
			warnings = append(warnings, Warning{"anchor_mismatch", rule.member, fmt.Sprintf("固定上下文 %d 处，展示文案 %d 处，已保留原文件", ctx, count)})
			continue
		}
		out[rule.member] = bytes.Replace(sourceBytes, []byte(rule.old), []byte(rule.new), 1)
	}
	return out, warnings
}
func allowed(replacements map[string][]byte) map[string]bool {
	out := make(map[string]bool, len(replacements))
	for name := range replacements {
		out[name] = true
	}
	return out
}
func marked(path string) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer f.Close()
	tail := max(len(begin), len(end)) - 1
	buf := make([]byte, 64*1024+tail)
	carry := 0
	for {
		n, err := f.Read(buf[carry:])
		window := buf[:carry+n]
		if bytes.Contains(window, []byte(begin)) || bytes.Contains(window, []byte(end)) {
			return true, nil
		}
		if errors.Is(err, io.EOF) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		carry = min(tail, len(window))
		copy(buf, window[len(window)-carry:])
	}
}
