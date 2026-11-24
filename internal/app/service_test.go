package app

import (
	"path/filepath"
	"reflect"
	"testing"

	"antigravity-zh-gui/internal/config"
)

func TestServiceConfigurationAndFixedActions(t *testing.T) {
	store, err := config.Open(filepath.Join(t.TempDir(), "settings"))
	if err != nil {
		t.Fatal(err)
	}
	s := &Service{store: store}
	p, err := s.Preferences()
	if err != nil || p != config.Defaults() {
		t.Fatal(p, err)
	}
	p.Hotkey = false
	p.DefaultLang = "en"
	p.Target = filepath.Join(t.TempDir(), "no-such-app")
	if err := s.SavePreferences(p); err != nil {
		t.Fatal(err)
	}
	if got, err := s.Preferences(); err != nil || got != p {
		t.Fatal(got, err)
	}
	entries := map[string]string{"Open Settings": "打开设置"}
	if err := s.SaveDictionary(entries); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveDictionary(map[string]string{"open": "打开"}); err == nil {
		t.Fatal("accepted disallowed global entry")
	}
	if got, err := s.Dictionary(); err != nil || !reflect.DeepEqual(got, entries) {
		t.Fatal(got, err)
	}
	if _, err := s.Status(p.Target); err == nil {
		t.Fatal("missing installation")
	}
	for _, act := range []string{"verify", "apply", "restore", "restore-app", "unknown"} {
		if _, err := s.Execute(act, p, nil); err == nil {
			t.Fatal(act)
		}
	}
}
