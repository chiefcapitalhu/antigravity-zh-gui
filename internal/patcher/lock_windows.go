//go:build windows

package patcher

import (
	"fmt"
	"syscall"
)

func lock(path string) (func(), error) {
	if err := absentOrRegular(path); err != nil {
		return nil, err
	}
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	h, err := syscall.CreateFile(name, syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL|syscall.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return nil, fmt.Errorf("无法锁定安装目录: %w", err)
	}
	return func() { syscall.CloseHandle(h) }, nil
}
