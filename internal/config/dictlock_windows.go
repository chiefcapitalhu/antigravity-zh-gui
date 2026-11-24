package config

import (
	"errors"
	"syscall"
	"unsafe"
)

var lockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")

func acquireDictionaryLock(path string) (func(), error) {
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	// Sharing the handle lets other panels wait on the same byte-range lock.
	// Denying delete sharing keeps that lock at the same path until all close.
	h, err := syscall.CreateFile(name, syscall.GENERIC_READ|syscall.GENERIC_WRITE, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL|syscall.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return nil, err
	}
	var info syscall.ByHandleFileInformation
	if err = syscall.GetFileInformationByHandle(h, &info); err == nil && info.FileAttributes&(syscall.FILE_ATTRIBUTE_DIRECTORY|syscall.FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
		err = errors.New("词典锁不是普通文件")
	}
	if err == nil {
		const exclusive = 2
		var offset syscall.Overlapped
		ok, _, callErr := lockFileEx.Call(uintptr(h), exclusive, 0, 1, 0, uintptr(unsafe.Pointer(&offset)))
		if ok == 0 {
			err = callErr
		}
	}
	if err != nil {
		syscall.CloseHandle(h)
		return nil, err
	}
	return func() { syscall.CloseHandle(h) }, nil
}
