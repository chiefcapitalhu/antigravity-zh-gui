package detector

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func run(path string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	out, err := exec.CommandContext(ctx, path, args...).Output()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return nil, fmt.Errorf("%s: %w: %.500s", filepath.Base(path), err, strings.TrimSpace(string(exit.Stderr)))
		}
		return nil, err
	}
	return out, nil
}

func isProductProcess(name string) bool {
	name = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(name)), ".exe")
	return name == "antigravity" || name == "antigravity helper" || strings.HasPrefix(name, "antigravity helper (") && strings.HasSuffix(name, ")")
}

// Running conservatively blocks all copies while an Antigravity process is alive.
func Running(installation Installation) (bool, error) {
	if installation.Platform != runtime.GOOS {
		return false, errors.New("无法检查此平台的进程")
	}
	return platformRunning(installation)
}

const officialRequirement = `anchor apple generic and identifier "com.google.antigravity" and certificate leaf[subject.OU] = "EQHXZ8M8AV" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`

// VerifyOfficial checks the macOS resource seal and the Google Developer ID.
// On Windows an executable signature does not attest the adjacent app.asar.
func VerifyOfficial(installation Installation) error {
	if installation.Platform != "darwin" || runtime.GOOS != "darwin" {
		return errors.New("此平台不支持 macOS 整包签名验证")
	}
	if !filepath.IsAbs(installation.Root) {
		return errors.New("需要绝对应用路径")
	}
	_, err := run("/usr/bin/codesign", "--verify", "--strict", "--deep", "--all-architectures", "-R="+officialRequirement, installation.Root)
	return err
}

// SignatureDescription describes the local signing state for the status panel.
// An invalid signature is also returned as a warning so status remains usable.
func SignatureDescription(i Installation) (string, error) {
	if i.Platform == "windows" {
		if err := VerifyExecutableSignature(i); err != nil {
			return "可执行文件签名未通过", err
		}
		return "Google 可执行文件签名有效", nil
	}
	if i.Platform != "darwin" {
		return "未知平台", errors.New("无法验证此平台的签名")
	}
	if err := VerifyOfficial(i); err == nil {
		return "Google 官方整包签名有效", nil
	}
	if _, err := run("/usr/bin/codesign", "--verify", "--deep", "--strict", "--all-architectures", i.Root); err != nil {
		return "整包签名未通过", err
	}
	// The generic check above succeeds for valid ad-hoc and third-party
	// signatures as well. Only describe a specific kind when codesign says so.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/bin/codesign", "--display", "--verbose=2", i.Root).CombinedOutput()
	if err != nil {
		return "签名有效，未确认发行方", err
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.TrimSpace(line) == "Signature=adhoc" {
			return "本地临时签名有效", nil
		}
	}
	return "签名有效，未确认发行方", nil
}
