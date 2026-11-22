package patcher

import (
	"errors"

	"os"
	"path/filepath"
	"runtime"

	"antigravity-zh-gui/internal/detector"
)

var cacheNames = []string{"Cache", "Code Cache", "GPUCache", "DawnWebGPUCache", "DawnGraphiteCache"}

// ClearCaches is separate from signing and never runs implicitly for a test copy.
func ClearCaches(target string) error {
	i, err := detector.Inspect(target)
	if err != nil {
		return err
	}
	if err = validate(i); err != nil {
		return err
	}
	unlock, err := lock(i.Root + ".zh-gui.lock")
	if err != nil {
		return err
	}
	defer unlock()
	e := defaults()
	if err = e.idle(i); err != nil {
		return err
	}
	var root string
	switch runtime.GOOS {
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		root = filepath.Join(home, "Library", "Application Support", "Antigravity")
	case "windows":
		config, err := os.UserConfigDir()
		if err != nil {
			return err
		}
		root = filepath.Join(config, "Antigravity")
	default:
		return errors.New("此平台未配置渲染缓存")
	}
	// A redirected ancestor can point into another user-data tree even
	// when the cache directory itself is a plain directory.
	canonical, err := filepath.EvalSymlinks(root)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if filepath.Clean(root) != canonical {
		return errors.New("拒绝清理重定向的缓存根路径")
	}
	return cleanCache(root)
}
func cleanCache(root string) error {
	if err := checkDir(root); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := checkCacheEntry(root); err != nil {
		return err
	}
	dirs := []string{root}
	partitions := filepath.Join(root, "Partitions")
	if err := checkDir(partitions); err == nil {
		if err := checkCacheEntry(partitions); err != nil {
			return err
		}
		items, err := os.ReadDir(partitions)
		if err != nil {
			return err
		}
		for _, d := range items {
			if err := checkCacheEntry(filepath.Join(partitions, d.Name())); err != nil {
				return err
			}
			if d.IsDir() {
				dirs = append(dirs, filepath.Join(partitions, d.Name()))
			}
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	// Preflight all cache paths before removing any. Nested symbolic links are
	// removed as directory entries by RemoveAll and never followed.
	var selected []string
	for _, dir := range dirs {
		for _, name := range cacheNames {
			p := filepath.Join(dir, name)
			err := checkDir(p)
			if os.IsNotExist(err) {
				continue
			}
			if err != nil {
				return err
			}
			if err := checkCacheTree(p); err != nil {
				return err
			}
			selected = append(selected, p)
		}
	}
	for _, p := range selected {
		if err := os.RemoveAll(p); err != nil {
			return err
		}
	}
	return nil
}

func appendCacheWarning(result *Result, target string) {
	if err := ClearCaches(target); err != nil {
		result.Warnings = append(result.Warnings, Warning{"cache_cleanup_incomplete", "", err.Error()})
	}
}
