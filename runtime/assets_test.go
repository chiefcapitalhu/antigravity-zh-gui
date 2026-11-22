package l10nruntime

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"antigravity-zh-gui/internal/config"
)

func TestConfigurationBoundary(t *testing.T) {
	for _, d := range []Dictionary{
		{Custom: map[string]string{"Open": "打开"}},
		{Exact: map[string]string{"file": "文件"}},
		{Scoped: []Scope{{"body > button", map[string]string{"Open": "打开"}}}},
		{Scoped: []Scope{{"model", map[string]string{"X": "a"}}, {"model", map[string]string{"X": "b"}}}},
		{Templates: []Template{{"user-supplied pattern", "{n}"}}},
		{Templates: []Template{{"minutesAgo", "分钟"}}},
		{Templates: []Template{{"hoursAgo", "{n}"}, {"hoursAgo", "{n}"}}},
	} {
		if _, err := Build("windows", config.Defaults(), d); err == nil {
			t.Fatalf("invalid configuration accepted: %+v", d)
		}
	}
	p := config.Defaults()
	p.Target = filepath.Join(t.TempDir(), "private-install-path")
	d := Dictionary{Scoped: []Scope{{"toolbar", map[string]string{"Open": "打开"}}}}
	for _, platform := range []string{"darwin", "windows", "win32"} {
		b, err := Build(platform, p, d)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(b.HubFactory+b.NativeFactory, "private-install-path") {
			t.Fatal("install path leaked into presentation data")
		}
	}
	if _, err := Build("other", p, d); err == nil {
		t.Fatal("unsupported platform accepted")
	}
}

func TestEmbeddedFactoriesInHost(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		if os.Getenv("CI") == "true" {
			t.Fatal("CI requires Node for the JS host integration test")
		}
		t.Skip("Node unavailable for JS host integration")
	}
	const text = "原样输出：</script><script>throw Error(7)</script> \" ` ${x} \\  中"
	d := Dictionary{Custom: map[string]string{"Copy": text, "__proto__": "字面量"}}
	b, err := Build("windows", config.Defaults(), d)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(b.HubFactory+b.NativeFactory), "</script") {
		t.Fatal("HTML closing delimiter in embedded program")
	}
	input, err := json.Marshal(struct {
		Bundle Bundle
		Text   string
	}{b, text})
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(node, filepath.Join("..", "tests", "check-bundle.cjs"))
	cmd.Stdin = bytes.NewReader(input)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("host integration: %v\n%s", err, output)
	}
}
