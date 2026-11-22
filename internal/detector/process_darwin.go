package detector

import (
	"errors"
	"path/filepath"
	"strings"
)

func platformRunning(installation Installation) (bool, error) {
	out, err := run("/bin/ps", "-Aww", "-o", "comm=")
	if err != nil {
		return false, err
	}
	return parseMacProcesses(string(out), installation.Root)
}

func parseMacProcesses(output, root string) (bool, error) {
	if strings.TrimSpace(output) == "" {
		return false, errors.New("系统未返回进程清单")
	}
	for _, line := range strings.Split(output, "\n") {
		path := strings.TrimSpace(line)
		if isProductProcess(filepath.Base(path)) || (root != "" && strings.HasPrefix(path, filepath.Join(root, "Contents")+"/")) {
			return true, nil
		}
	}
	return false, nil
}
