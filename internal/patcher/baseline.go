package patcher

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/detector"
)

// For a new macOS distribution, a strictly verified official app establishes
// the hash. Keep per-install receipt files outside the subsequently re-signed
// bundle. Each receipt is bound to one version, path and SHA-256 value.
func receiptPath(i detector.Installation, h string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	id := sha256.Sum256([]byte(i.Root + "\x00" + i.Version + "\x00" + h))
	base := filepath.Join(home, ".config")
	if i.Platform == "windows" {
		base, err = os.UserConfigDir()
		if err != nil {
			return "", err
		}
	}
	return filepath.Join(base, "antigravity-zh-gui", "baselines", fmt.Sprintf("%x", id)), nil
}
func pin(e engine, h string) engine {
	e.baseline = func(detector.Installation) string { return h }
	return e
}
func (e engine) selectBuild(i detector.Installation, persist bool) (engine, error) {
	if err := validate(i); err != nil {
		return e, err
	}
	known := e.baseline(i)
	live, err := hashFile(i.Archive)
	if err != nil {
		return e, err
	}
	if i.Platform == "windows" {
		if err := e.host(i); err != nil {
			return e, err
		}
	}
	if live == known {
		return e, nil
	}
	patched, err := marked(i.Archive)
	if err != nil {
		return e, err
	}
	hash := live
	if patched {
		hash, err = hashFile(i.Archive + backupSuffix)
		if err != nil {
			return e, fmt.Errorf("缺少可信备份: %w", err)
		}
	}
	if hash == known {
		return e, nil
	}

	path, err := receiptPath(i, hash)
	if err != nil {
		return e, err
	}
	// Project-owned receipt directories and their files must not be links.
	base := filepath.Dir(filepath.Dir(path))
	records := filepath.Dir(path)
	for _, p := range []string{base, records} {
		if err := checkDir(p); err != nil && !os.IsNotExist(err) {
			return e, err
		}
	}
	if err := regular(path); err == nil {
		stat, err := os.Stat(path)
		if err != nil {
			return e, err
		}
		if stat.Size() != 64 {
			return e, errors.New("本地基线回执无效")
		}
		fingerprint, err := os.ReadFile(path)
		if err != nil {
			return e, err
		}
		if string(fingerprint) != hash {
			return e, errors.New("本地基线回执损坏")
		}
		return pin(e, hash), nil
	} else if !os.IsNotExist(err) {
		return e, err
	}
	if patched {
		return e, errors.New("备份与已验证的安装基线不匹配")
	}
	if i.Platform == "darwin" {
		if err = e.official(i); err != nil {
			return e, fmt.Errorf("新构建未通过发行方整包验签: %w", err)
		}
	}
	// The Windows receipt records observed clean ASAR bytes, not an assertion
	// that Authenticode signed the adjacent archive.
	matches, _ := plan(i.Archive, i.Platform)
	if len(matches) == 0 {
		return e, &Warning{"no_anchors", "", "未找到固定界面文案"}
	}
	if current, err := hashFile(i.Archive); err != nil || current != hash {
		return e, errors.New("建立基线时安装内容变化")
	}
	if persist {
		if err = os.MkdirAll(records, 0700); err != nil {
			return e, err
		}
		f, err := os.CreateTemp(records, ".attest-")
		if err != nil {
			return e, err
		}
		defer os.Remove(f.Name())
		if _, err = f.WriteString(hash); err == nil {
			err = f.Sync()
		}
		closeErr := f.Close()
		if err != nil {
			return e, err
		}
		if closeErr != nil {
			return e, closeErr
		}
		if err = os.Rename(f.Name(), path); err != nil {
			return e, err
		}
	}
	return pin(e, hash), nil
}

func packageVersion(path string) (string, error) {
	data, err := asar.ReadFile(path, "package.json")
	if err != nil {
		return "", err
	}
	var info struct{ Version string }
	err = json.Unmarshal(data, &info)
	return info.Version, err
}
