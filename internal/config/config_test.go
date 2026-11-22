package config

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func tempStore(t *testing.T) Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "settings"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestPreferencesAndDictionary(t *testing.T) {
	s := tempStore(t)
	p, err := s.LoadPreferences()
	if err != nil || p != Defaults() {
		t.Fatal(p, err)
	}
	if _, err = os.Stat(s.dir); !os.IsNotExist(err) {
		t.Fatal("read created store", err)
	}
	p.Target = s.dir
	p.Brand = "hide"
	p.DefaultLang = "en"
	p.Hotkey = false
	p.BackupApp = true
	if err := s.SavePreferences(p); err != nil {
		t.Fatal(err)
	}
	if got, err := s.LoadPreferences(); err != nil || got != p {
		t.Fatal(got, err)
	}
	entries := map[string]string{"Start task": "开始任务", "<literal>": "<原样文本>"}
	if err := s.SaveDictionary(entries); err != nil {
		t.Fatal(err)
	}
	if got, err := s.LoadDictionary(); err != nil || !reflect.DeepEqual(got, entries) {
		t.Fatal(got, err)
	}
	if err := s.SaveDictionary(nil); err != nil {
		t.Fatal(err)
	}
	if got, err := s.LoadDictionary(); err != nil || len(got) != 0 {
		t.Fatal(got, err)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(filepath.Join(s.dir, dictionaryFile))
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0077 != 0 {
			t.Fatal("dictionary is not private")
		}
	}
}

func TestDictionaryRejectsAmbiguousData(t *testing.T) {
	s := tempStore(t)
	if err := s.SaveDictionary(map[string]string{"Save Changes": "保存更改"}); err != nil {
		t.Fatal(err)
	}
	for _, entry := range []map[string]string{
		{"Open": "开"}, {"on": "开"}, {"Good": " \n"}, {"": "空"}, {"ok\x00": "测试"},
		{"Long": strings.Repeat("a", maxFileSize)},
	} {
		if err := s.SaveDictionary(entry); err == nil {
			t.Fatal("accepted invalid entry")
		}
	}
	got, err := s.LoadDictionary()
	if err != nil || got["Save Changes"] != "保存更改" {
		t.Fatal(got, err)
	}
	for _, data := range []string{`{"Name":"名","Name":"称"}`, `{"x":true}`, `null`, `[]`, `{"x":"y"}{}`, "\xff", ""} {
		if err := os.WriteFile(filepath.Join(s.dir, dictionaryFile), []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := s.LoadDictionary(); err == nil {
			t.Errorf("accepted %q", data)
		}
	}
}

func TestPreferencesRejectMalformedAndPreserveDefaults(t *testing.T) {
	s := tempStore(t)
	if err := s.SavePreferences(Defaults()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(s.dir, prefsFile)
	for _, data := range []string{`{"defaultLang":"de"}`, `{"brand":"none"}`, `{"target":"relative"}`, `{"hotkey":null}`, `{"hotkey":0}`, `{"hotkey":true,"hotkey":false}`} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := s.LoadPreferences(); err == nil {
			t.Errorf("accepted %q", data)
		}
	}
	if err := os.WriteFile(path, []byte(`{"hotkey":false}`), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadPreferences()
	if err != nil || got.Hotkey || got.Brand != "keep" || got.DefaultLang != "zh" {
		t.Fatal(got, err)
	}
}

func TestConcurrentDictionarySaves(t *testing.T) {
	s := tempStore(t)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			if err := s.SaveDictionary(map[string]string{"The value": fmt.Sprint(n)}); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if got, err := s.LoadDictionary(); err != nil || got["The value"] == "" {
		t.Fatal(got, err)
	}
}

func TestRedirectedConfigFile(t *testing.T) {
	s := tempStore(t)
	if err := os.MkdirAll(s.dir, 0700); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, []byte("unchanged"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(s.dir, dictionaryFile)); err != nil {
		t.Skipf("symlink unavailable: %s", err)
	}
	if _, err := s.LoadDictionary(); err == nil {
		t.Fatal("symlink read")
	}
	if err := s.SaveDictionary(nil); err == nil {
		t.Fatal("symlink write")
	}
	if got, err := os.ReadFile(outside); err != nil || string(got) != "unchanged" {
		t.Fatal(err)
	}
}
