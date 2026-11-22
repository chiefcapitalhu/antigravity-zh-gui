// Package config persists user-owned preferences and exact-match translations.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"
)

const (
	prefsFile      = "preferences.json"
	dictionaryFile = "custom_dict.json"
	maxFileSize    = 2 << 20
)

type Preferences struct {
	Target      string `json:"target"`
	Hotkey      bool   `json:"hotkey"`
	DefaultLang string `json:"defaultLang"`
	Brand       string `json:"brand"`
	BackupApp   bool   `json:"backupApp"`
}

func Defaults() Preferences { return Preferences{Hotkey: true, DefaultLang: "zh", Brand: "keep"} }

func (p Preferences) Validate() error {
	if p.DefaultLang != "zh" && p.DefaultLang != "en" {
		return errors.New("界面语言必须为 zh 或 en")
	}
	if p.Brand != "keep" && p.Brand != "hide" {
		return errors.New("品牌选项必须为 keep 或 hide")
	}
	if p.Target != "" && (!filepath.IsAbs(p.Target) || strings.IndexFunc(p.Target, unicode.IsControl) >= 0 || !utf8.ValidString(p.Target)) {
		return errors.New("安装路径必须是有效的绝对路径")
	}
	return nil
}

// Stores can be opened independently by different handlers. Coordinate all
// in-process config file handles, including inspection of a target before
// replacing it. Windows can deny replacement while a reader holds the file.
var fileIO sync.RWMutex

type Store struct{ dir string }

func Open(dir string) (Store, error) {
	if dir == "" {
		var parent string
		if runtime.GOOS == "windows" {
			parent = os.Getenv("APPDATA")
		} else {
			home, err := os.UserHomeDir()
			if err != nil {
				return Store{}, err
			}
			parent = filepath.Join(home, ".config")
		}
		if !filepath.IsAbs(parent) {
			return Store{}, errors.New("无法确定用户配置目录")
		}
		dir = filepath.Join(parent, "antigravity-zh-gui")
	}
	if !filepath.IsAbs(dir) {
		return Store{}, errors.New("配置目录需要绝对路径")
	}
	return Store{dir: filepath.Clean(dir)}, nil
}

func (s Store) path(name string) (string, error) {
	if s.dir == "" {
		return "", errors.New("请先打开配置目录")
	}
	dirInfo, err := os.Lstat(s.dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if err == nil && !dirInfo.IsDir() {
		return "", fmt.Errorf("配置目录类型异常 %s", s.dir)
	}
	path := filepath.Join(s.dir, name)
	info, err := os.Lstat(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if err == nil && !info.Mode().IsRegular() {
		return "", fmt.Errorf("配置文件类型异常 %s", path)
	}
	return path, nil
}

func (s Store) read(name string) ([]byte, error) {
	fileIO.RLock()
	defer fileIO.RUnlock()
	path, err := s.path(name)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, maxFileSize+1))
	if err != nil {
		return nil, err
	}
	if len(b) > maxFileSize || !utf8.Valid(b) {
		return nil, errors.New("配置文件过大或编码无效")
	}
	return b, nil
}

func (s Store) save(name string, value any) error {
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	if len(b) > maxFileSize {
		return errors.New("配置文件过大")
	}
	fileIO.Lock()
	defer fileIO.Unlock()
	path, err := s.path(name)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(s.dir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.dir, ".zh-gui-")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	_, err = tmp.Write(b)
	if err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return replaceConfig(tmpName, path)
}

// object handles flat, typed config objects, including duplicate-key rejection.
func object(b []byte, entry func(string, *json.Decoder) error) error {
	d := json.NewDecoder(bytes.NewReader(b))
	t, err := d.Token()
	if err != nil {
		return err
	}
	if t != json.Delim('{') {
		return errors.New("配置必须为 JSON 对象")
	}
	seen := make(map[string]bool)
	for d.More() {
		key, err := d.Token()
		if err != nil {
			return err
		}
		k, ok := key.(string)
		if !ok || seen[k] {
			return errors.New("配置含有无效或重复的键")
		}
		seen[k] = true
		if err := entry(k, d); err != nil {
			return err
		}
	}
	if _, err := d.Token(); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return errors.New("配置对象后存在额外内容")
	}
	return nil
}

func (s Store) LoadPreferences() (Preferences, error) {
	p := Defaults()
	b, err := s.read(prefsFile)
	if err != nil || b == nil {
		return p, err
	}
	fields := map[string]any{"target": &p.Target, "hotkey": &p.Hotkey, "defaultLang": &p.DefaultLang, "brand": &p.Brand, "backupApp": &p.BackupApp}
	err = object(b, func(k string, d *json.Decoder) error {
		dst, ok := fields[k]
		if !ok {
			return fmt.Errorf("未知偏好项 %q", k)
		}
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return err
		}
		if bytes.Equal(raw, []byte("null")) {
			return fmt.Errorf("偏好项 %s 为空", k)
		}
		return json.Unmarshal(raw, dst)
	})
	if err == nil {
		err = p.Validate()
	}
	if err != nil {
		return Preferences{}, err
	}
	return p, nil
}

func (s Store) SavePreferences(p Preferences) error {
	if err := p.Validate(); err != nil {
		return err
	}
	return s.save(prefsFile, p)
}

var scopedOnly = map[string]bool{"on": true, "in": true, "run": true, "open": true, "file": true, "type": true, "use": true, "plan": true, "code": true}

// ValidateGlobalEntry checks an unscoped translation before storage or embedding.
func ValidateGlobalEntry(en, zh string) error {
	for _, v := range []string{en, zh} {
		if strings.TrimSpace(v) == "" || strings.TrimSpace(v) != v || !utf8.ValidString(v) || strings.IndexFunc(v, unicode.IsControl) >= 0 {
			return errors.New("词条需要有效文本，且不能含首尾空白或控制字符")
		}
	}
	if scopedOnly[strings.ToLower(en)] {
		return fmt.Errorf("通用词 %q 需要指定界面作用域", en)
	}
	return nil
}

func (s Store) LoadDictionary() (map[string]string, error) {
	entries := make(map[string]string)
	b, err := s.read(dictionaryFile)
	if err != nil || b == nil {
		return entries, err
	}
	err = object(b, func(k string, d *json.Decoder) error {
		var v string
		if err := d.Decode(&v); err != nil {
			return err
		}
		if err := ValidateGlobalEntry(k, v); err != nil {
			return err
		}
		entries[k] = v
		return nil
	})
	if err != nil {
		return nil, err
	}
	return entries, nil
}

// SaveDictionary atomically publishes the complete dictionary supplied by the user.
func (s Store) SaveDictionary(entries map[string]string) error {
	if entries == nil {
		entries = map[string]string{}
	}
	for en, zh := range entries {
		if err := ValidateGlobalEntry(en, zh); err != nil {
			return err
		}
	}
	return s.save(dictionaryFile, entries)
}
