// Package detector inspects local Antigravity installations without launching them.
package detector

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"antigravity-zh-gui/internal/asar"
)

type Installation struct {
	Root     string `json:"root"`
	Archive  string `json:"archive"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
}

var supportedVersion = regexp.MustCompile(`^2\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$`)

// Inspect accepts an install root, primary executable or app.asar.
// An empty target probes the platform's conventional installation locations.
func Inspect(target string) (Installation, error) {
	if target != "" {
		return inspectAt(runtime.GOOS, target)
	}
	return inspectCandidates(runtime.GOOS, defaultCandidates(runtime.GOOS))
}

func defaultCandidates(platform string) []string {
	home, _ := os.UserHomeDir()
	var candidates []string
	switch platform {
	case "darwin":
		candidates = []string{"/Applications/Antigravity.app"}
		if home != "" {
			candidates = append(candidates, filepath.Join(home, "Applications", "Antigravity.app"))
		}
	case "windows":
		for _, dir := range []string{"LOCALAPPDATA", "ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"} {
			if root := os.Getenv(dir); filepath.IsAbs(root) {
				if dir == "LOCALAPPDATA" {
					root = filepath.Join(root, "Programs")
				}
				candidates = append(candidates, filepath.Join(root, "Antigravity"))
			}
		}
	}
	return candidates
}

func inspectCandidates(platform string, candidates []string) (Installation, error) {
	if platform != "darwin" && platform != "windows" {
		return Installation{}, fmt.Errorf("unsupported platform %q", platform)
	}
	var firstErr error
	for _, root := range candidates {
		if _, err := os.Lstat(root); errors.Is(err, os.ErrNotExist) {
			continue
		}
		inst, err := inspectAt(platform, root)
		if err == nil {
			return inst, nil
		}
		if firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		return Installation{}, firstErr
	}
	return Installation{}, errors.New("未找到 Antigravity，请手动指定安装路径")
}

// Reject redirected bundle members before handing any paths to the patcher.
func member(root string, rel string) (string, error) {
	path := root
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for i, part := range parts {
		path = filepath.Join(path, part)
		info, err := os.Lstat(path)
		if err != nil {
			return "", err
		}
		if i < len(parts)-1 && !info.IsDir() || i == len(parts)-1 && !info.Mode().IsRegular() {
			return "", fmt.Errorf("unexpected file type at %s", path)
		}
	}
	return path, nil
}

func inspectAt(platform, target string) (Installation, error) {
	var archiveRel, exeRel string
	switch platform {
	case "darwin":
		archiveRel, exeRel = "Contents/Resources/app.asar", "Contents/MacOS/Antigravity"
	case "windows":
		archiveRel, exeRel = "resources/app.asar", "Antigravity.exe"
	default:
		return Installation{}, fmt.Errorf("unsupported platform %q", platform)
	}
	root, err := filepath.Abs(target)
	if err != nil {
		return Installation{}, err
	}
	info, err := os.Lstat(root)
	if err != nil {
		return Installation{}, err
	}
	if info.Mode().IsRegular() {
		found := false
		for _, rel := range []string{archiveRel, exeRel} {
			suffix := string(os.PathSeparator) + filepath.FromSlash(rel)
			if len(root) > len(suffix) && strings.EqualFold(root[len(root)-len(suffix):], suffix) {
				root = root[:len(root)-len(suffix)]
				found = true
				break
			}
		}
		if !found {
			return Installation{}, errors.New("指定文件不是 Antigravity 安装入口")
		}
	} else if !info.IsDir() {
		return Installation{}, fmt.Errorf("unexpected install root %s", root)
	}

	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return Installation{}, err
	}
	exe, err := member(root, exeRel)
	if err != nil {
		return Installation{}, err
	}
	archive, err := member(root, archiveRel)
	if err != nil {
		return Installation{}, err
	}
	data, err := asar.ReadFile(archive, "package.json")
	if err != nil {
		return Installation{}, fmt.Errorf("read package identity: %w", err)
	}
	var pkg struct{ Name, ProductName, Version, Main string }
	if err = json.Unmarshal(data, &pkg); err != nil {
		return Installation{}, err
	}
	if pkg.Name != "antigravity" || pkg.ProductName != "Antigravity" || pkg.Main != "dist/main.js" || !supportedVersion.MatchString(pkg.Version) {
		return Installation{}, errors.New("未识别的 Antigravity 2.x 客户端")
	}
	if platform == "darwin" {
		plist, err := member(root, "Contents/Info.plist")
		if err != nil {
			return Installation{}, err
		}
		b, err := run("/usr/bin/plutil", "-convert", "json", "-o", "-", "--", plist)
		if err != nil {
			return Installation{}, err
		}
		var id struct{ CFBundleIdentifier, CFBundleExecutable, CFBundleShortVersionString string }
		if err := json.Unmarshal(b, &id); err != nil {
			return Installation{}, err
		}
		if id.CFBundleIdentifier != "com.google.antigravity" || id.CFBundleExecutable != filepath.Base(exe) || id.CFBundleShortVersionString != pkg.Version {
			return Installation{}, errors.New("Info.plist 与归档的产品信息不匹配")
		}
	}
	return Installation{Root: root, Archive: archive, Platform: platform, Version: pkg.Version}, nil
}
