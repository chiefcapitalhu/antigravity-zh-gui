package detector

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var processImage = syscall.NewLazyDLL("kernel32.dll").NewProc("QueryFullProcessImageNameW")

func platformRunning(install Installation) (bool, error) {
	h, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return false, err
	}
	defer syscall.CloseHandle(h)
	var p syscall.ProcessEntry32
	p.Size = uint32(unsafe.Sizeof(p))
	if err := syscall.Process32First(h, &p); err != nil {
		return false, err
	}
	for {
		name := strings.ToLower(syscall.UTF16ToString(p.ExeFile[:]))
		if isProductProcess(name) {
			return true, nil
		}
		// A language server may briefly outlive the Electron process.
		// Match its install directory since other editors use similar names.
		if name == "language_server.exe" || strings.HasPrefix(name, "language_server_windows_") {
			running, err := belongsToRoot(p.ProcessID, install.Root)
			if running || err != nil {
				return running, err
			}
		}
		err = syscall.Process32Next(h, &p)
		if errors.Is(err, syscall.ERROR_NO_MORE_FILES) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
	}
}

func belongsToRoot(pid uint32, root string) (bool, error) {
	h, err := syscall.OpenProcess(0x1000, false, pid) // PROCESS_QUERY_LIMITED_INFORMATION
	if err != nil {
		// The snapshot can contain a process that just exited.
		if errors.Is(err, syscall.Errno(87)) {
			return false, nil
		}
		return false, err
	}
	defer syscall.CloseHandle(h)
	var buf [32768]uint16
	n := uint32(len(buf))
	ok, _, err := processImage.Call(uintptr(h), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&n)))
	if ok == 0 {
		return false, fmt.Errorf("identify language server: %w", err)
	}
	image := filepath.Clean(syscall.UTF16ToString(buf[:n]))
	root = filepath.Clean(root) + string(filepath.Separator)
	return len(image) > len(root) && strings.EqualFold(root, image[:len(root)]), nil
}
