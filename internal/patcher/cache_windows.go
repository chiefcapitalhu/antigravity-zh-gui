//go:build windows

package patcher

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"syscall"
)

func reparse(path string) (bool, error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return false, err
	}
	attrs, err := syscall.GetFileAttributes(p)
	if err != nil {
		return false, err
	}
	return attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0, nil
}

// Older and newer Go runtimes present junctions differently. Use the native
// attribute at the deletion boundary, including nested cache entries.
func checkCacheEntry(path string) error {
	redirected, err := reparse(path)
	if err != nil {
		return err
	}
	if redirected {
		return fmt.Errorf("重解析点不可清理 %s", path)
	}
	return nil
}
func checkCacheTree(path string) error {
	return filepath.WalkDir(path, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		return checkCacheEntry(path)
	})
}
