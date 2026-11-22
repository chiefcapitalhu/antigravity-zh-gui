package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWindowsRoamingConfig(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	store, err := Open("")
	if err != nil {
		t.Fatal(err)
	}
	if err = store.SaveDictionary(map[string]string{"Save Changes": "保存更改"}); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "antigravity-zh-gui", "custom_dict.json")
	if _, err = os.Stat(path); err != nil {
		t.Fatal(err)
	}
	got, err := store.LoadDictionary()
	if err != nil || got["Save Changes"] != "保存更改" {
		t.Fatal(got, err)
	}
}
