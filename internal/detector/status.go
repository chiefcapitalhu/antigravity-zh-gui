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
