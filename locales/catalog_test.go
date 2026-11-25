package locales

import (
	"bytes"
	"encoding/json"
	"os/exec"
	"strings"
	"testing"

	"antigravity-zh-gui/internal/config"
)

func TestCatalogAndNativePresentation(t *testing.T) {
	dict, err := Load(nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, platform := range []string{"darwin", "windows"} {
		prefs := config.Defaults()
		custom := map[string]string{"Copy": "按我的说法复制"}
		b, err := Build(platform, prefs, custom)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(b.NativeFactory, "永久删除") || !strings.Contains(b.HubFactory, "按我的说法复制") {
			t.Fatal("factory lacks embedded catalog")
		}
	}
	if len(dict.Custom) != 0 {
		t.Fatal("custom translations leaked into base dictionary")
	}
	b, err := Build("darwin", config.Defaults(), map[string]string{"Copy": "按我的说法复制"})
	if err != nil {
		t.Fatal(err)
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node needed for JS presentation checks")
	}
	input, err := json.Marshal(b.NativeFactory)
	if err != nil {
		t.Fatal(err)
	}
	// The bundled, fixed JS is evaluated solely inside this local test fixture.
	cmd := exec.Command(node, "-e", `const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const factory = new vm.Script(JSON.parse(fs.readFileSync(0, 'utf8'))).runInNewContext();
const menu = factory();
assert.equal(menu.label('context','copy','Copy'),'按我的说法复制');
assert.equal(menu.label('context','delete','Delete Permanently'),'永久删除');
assert.equal(menu.label('context','cmi-0','Delete Permanently'),'Delete Permanently');
assert.equal(menu.label('tray','running-agents','12 agents running'),'12 个 AI 助手运行中');
assert.equal(menu.siteLabel('fileMenu','File'),'文件');
const original={title:'Confirm Quit',message:'Are you sure you want to quit?',buttons:['Cancel','Quit'],defaultId:0,cancelId:0};
const out=menu.dialog('quit',original);
assert.equal(out.title,'确认退出'); assert.equal(out.message,'确定要退出吗？');
assert.equal(out.buttons.join('/'),'取消/退出'); assert.equal(out.cancelId,0); assert.equal(original.buttons[0],'Cancel');
const unknown={...original,message:'Project name',buttons:['User name','Quit']};
assert.equal(menu.dialog('quit',unknown).buttons,unknown.buttons); assert.equal(menu.dialog('quit',unknown).message,'Project name');
menu.setMode('en'); assert.equal(menu.dialog('quit',original),original); assert.equal(menu.label('tray','running-agents','1 agent running'),'1 agent running');`)
	cmd.Stdin = bytes.NewReader(input)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%s: %v", output, err)
	}
}

func example(t *testing.T) map[string][]byte {
	t.Helper()
	f := map[string][]byte{}
	for _, k := range modules {
		h := strings.Repeat("0", 64)
		src := "hub:main.js"
		e := map[string]any{"en": "Label " + k, "zh": "示例", "source": src, "offset": 0}
		m := map[string]any{"schema": 1, "module": k, "version": "2.34.0", "sources": map[string]string{src: h}, "exact": []any{e}, "templates": []any{}, "scoped": []any{}}
		raw, err := json.Marshal(m)
		if err != nil {
			t.Fatal(err)
		}
		f[k+".json"] = raw
	}
	return f
}

func TestRejectCatalogCorruption(t *testing.T) {
	for _, test := range []struct{ name, from, to string }{
		{"duplicate field", `"schema":1`, `"schema":1,"schema":1`},
		{"escaped duplicate", `"zh":"示例"`, `"zh":"示例","\u007a\u0068":"另译"`},
		{"duplicate across modules", "Label core", "Label agents"},
		{"unscoped short word", "Label core", "Open"},
		{"wrong terminology", "Label core", "Artifact"},
		{"wrong plural terminology", "Label core", "Skills"},
		{"unsupported version", "2.34.0", "1.34.0"},
		{"mixed version", "2.34.0", "2.34.1"},
		{"wrong module", `"module":"core"`, `"module":"x"`},
		{"missing byte offset", `"offset":0`, `"offset":null`},
		{"negative byte offset", `"offset":0`, `"offset":-1`},
		{"unknown field", `"scope`, `"Scope`},
		{"unreferenced source", `"source":"hub:main.js"`, `"source":"asar:dist/menu.js"`},
		{"conflicting evidence hashes", strings.Repeat("0", 64), strings.Repeat("b", 64)},
		{"invalid digest", strings.Repeat("0", 64), "abc"},
		{"non array", `"scoped":[]`, `"scoped":{}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			f := example(t)
			if err := ValidateCatalogBytes(f); err != nil {
				t.Fatalf("invalid fixture: %v", err)
			}
			file := f["core.json"]
			s := strings.Replace(string(file), test.from, test.to, 1)
			if s == string(file) {
				t.Fatal("invalid corruption fixture")
			}
			f["core.json"] = []byte(s)
			if err := ValidateCatalogBytes(f); err == nil {
				t.Fatal("invalid catalog accepted")
			}
		})
	}
}

func TestExactEntryCannotMaskAConflictingScopedEntry(t *testing.T) {
	files := example(t)
	body := string(files["workspace.json"])
	for _, test := range []struct {
		zh string
		ok bool
	}{{"示例", true}, {"另一种译法", false}} {
		row := `"scoped":[{"scope":"toolbar","en":"Label core","zh":"` + test.zh + `","source":"hub:main.js","offset":0}]`
		files["workspace.json"] = []byte(strings.Replace(body, `"scoped":[]`, row, 1))
		err := ValidateCatalogBytes(files)
		if (err == nil) != test.ok {
			t.Fatalf("scoped translation %q: %v", test.zh, err)
		}
	}
}

func TestFeedbackSenderEvidencePreservesLiteralSpace(t *testing.T) {
	const row = `{"en":"Send feedback as ","zh":"以 {email} 身份发送反馈","source":"hub:main.js","scope":"feedback","offset":5430943}`
	module := catalog{Module: "core", Sources: map[string]string{"hub:main.js": strings.Repeat("0", 64)}}
	got, err := parseEntry([]byte(row), "scoped", module)
	if err != nil || got.EN != "Send feedback as " {
		t.Fatalf("literal %q, err %v", got.EN, err)
	}
	for _, invalid := range []string{
		strings.Replace(row, "as ", "as  ", 1),
		strings.Replace(row, "5430943", "5430944", 1),
		strings.Replace(row, `"feedback"`, `"settings"`, 1),
		strings.Replace(row, "{email}", "", 1),
		strings.Replace(row, "{email}", "{email}{email}", 1),
	} {
		if _, err := parseEntry([]byte(invalid), "scoped", module); err == nil {
			t.Fatalf("accepted %s", invalid)
		}
	}
}

func TestUserDictionaryIsIndependent(t *testing.T) {
	custom := map[string]string{"A label": "个人译文"}
	first, err := Load(custom)
	if err != nil {
		t.Fatal(err)
	}
	custom["A label"] = "外部修改"
	if first.Custom["A label"] != "个人译文" {
		t.Fatal("shared caller map")
	}
	first.Scoped[0].Entries["another key"] = "私有值"
	second, err := Load(nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := second.Scoped[0].Entries["another key"]; ok {
		t.Fatal("shared scope table")
	}
	if _, err := Load(map[string]string{"Code": "代码"}); err == nil {
		t.Fatal("unscoped short word accepted")
	}
}
