//go:build !darwin && !windows

package detector

import "errors"

func platformRunning(Installation) (bool, error) {
	return false, errors.New("不支持此平台的进程检测")
}
