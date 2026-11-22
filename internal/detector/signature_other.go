//go:build !windows

package detector

import "errors"

// VerifyExecutableSignature reports the Windows executable-only signature.
func VerifyExecutableSignature(Installation) error {
	return errors.New("此平台不支持 Windows 可执行文件验签")
}
