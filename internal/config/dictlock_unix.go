//go:build darwin || linux

package config

import (
	"errors"
	"os"
	"syscall"
)

// Keep the lock file at a stable path even between runs. Closing the descriptor
// releases the kernel lock, including when a process exits unexpectedly.
func acquireDictionaryLock(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0600)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err == nil && !st.Mode().IsRegular() {
		err = errors.New("词典锁不是普通文件")
	}
	if err == nil {
		for {
			err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX)
			if !errors.Is(err, syscall.EINTR) {
				break
			}
		}
	}
	if err != nil {
		f.Close()
		return nil, err
	}
	return func() { f.Close() }, nil
}
