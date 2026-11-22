//go:build darwin

package patcher

import (
	"runtime"
	"syscall"
	"unsafe"
)

// macOS renameatx_np with RENAME_SWAP exchanges both directories in one
// filesystem transaction. An unsupported volume returns an error before commit.
func swapBundle(stage, live string) error {
	a, err := syscall.BytePtrFromString(stage)
	if err != nil {
		return err
	}
	b, err := syscall.BytePtrFromString(live)
	if err != nil {
		return err
	}
	const sysRenameatxNP = 488
	const swap = 2
	var cwd = int(-2)
	_, _, errno := syscall.Syscall6(sysRenameatxNP, uintptr(cwd), uintptr(unsafe.Pointer(a)), uintptr(cwd), uintptr(unsafe.Pointer(b)), swap, 0)
	runtime.KeepAlive(a)
	runtime.KeepAlive(b)
	if errno != 0 {
		return errno
	}
	return nil
}
