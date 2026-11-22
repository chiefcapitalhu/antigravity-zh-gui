//go:build darwin || linux

package patcher

import (
	"fmt"
	"os"
	"syscall"
)

func lock(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, fmt.Errorf("无效的锁文件 %s", path)
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("安装目录正由另一事务使用: %w", err)
	}
	return func() { f.Close() }, nil
}
