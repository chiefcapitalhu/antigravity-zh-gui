package config

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
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

// Open the destination independently, deliberately denying delete sharing as
// a short-lived external reader might. Releasing the handle must let save win.
func TestWindowsSaveWithReader(t *testing.T) {
	s := tempStore(t)
	if err := s.SaveDictionary(map[string]string{"Status": "状态"}); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(s.dir, dictionaryFile)
	wide, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		t.Fatal(err)
	}
	h, err := syscall.CreateFile(wide, syscall.GENERIC_READ, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatal(err)
	}
	closed := make(chan error, 1)
	time.AfterFunc(90*time.Millisecond, func() { closed <- syscall.CloseHandle(h) })
	err = s.SaveDictionary(map[string]string{"Status": "已更新"})
	if closeErr := <-closed; closeErr != nil {
		t.Fatal(closeErr)
	}
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadDictionary()
	if err != nil || got["Status"] != "已更新" {
		t.Fatal(got, err)
	}
}
