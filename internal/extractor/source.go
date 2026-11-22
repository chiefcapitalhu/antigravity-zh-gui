// Package extractor reads fixed presentation resources without running target code.
package extractor

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/detector"
)

const maxScript = 32 << 20

type SourceSet struct {
	Version  string
	scripts  map[string][]byte
	hashes   map[string]string
	warnings []string
}

func (s *SourceSet) add(name string, data []byte) error {
	if len(data) == 0 || len(data) > maxScript || !utf8.Valid(data) {
		return fmt.Errorf("无效的 UTF-8 界面资源 %s", name)
	}
	s.scripts[name] = data
	s.hashes[name] = fmt.Sprintf("%x", sha256.Sum256(data))
	return nil
}

func Load(i detector.Installation) (*SourceSet, error) {
	if _, err := asar.HeaderHash(i.Archive); err != nil {
		return nil, err
	}
	s := &SourceSet{Version: i.Version, scripts: map[string][]byte{}, hashes: map[string]string{}}
	for _, name := range []string{"dist/main.js", "dist/menu.js", "dist/tray.js", "dist/updater.js", "dist/ipcHandlers.js", "dist/provisionSplash.js", "dist/ideInstall/wizardHtml.js"} {
		data, err := asar.ReadFile(i.Archive, name)
		if err != nil {
			s.warnings = append(s.warnings, fmt.Sprintf("%s: %v", name, err))
			continue
		}
		if err := s.add("asar:"+name, data); err != nil {
			return nil, err
		}
	}
	dir := filepath.Join(filepath.Dir(i.Archive), "bin")
	st, err := os.Lstat(dir)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		return nil, fmt.Errorf("无效资源目录 %s", dir)
	}
	names := []string{"language_server"}
	switch i.Platform {
	case "windows":
		names = []string{"language_server_windows_x64.exe", "language_server_windows_arm64.exe", "language_server.exe"}
	case "darwin":
	default:
		return nil, errors.New("未知安装平台")
	}
	var hub []byte
	for _, n := range names {
		path := filepath.Join(dir, n)
		st, err := os.Lstat(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if !st.Mode().IsRegular() {
			return nil, fmt.Errorf("不是普通资源文件 %s", path)
		}
		f, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		data, err := embeddedHub(f, st.Size())
		f.Close()
		if err != nil {
			return nil, fmt.Errorf("%s: %w", n, err)
		}
		if hub != nil && !bytes.Equal(data, hub) {
			return nil, errors.New("多个语言服务包含不同 Hub 资源")
		}
		hub = data
	}
	if hub == nil {
		return nil, errors.New("安装包缺少语言服务界面资源")
	}
	if err := s.add("hub:main.js", hub); err != nil {
		return nil, err
	}
	return s, nil
}

// Locate embedded classic ZIP central directories even when there is binary
// data after the ZIP. Only the exact Hub asset is inflated. No member paths
// are ever materialized on the filesystem.
func embeddedHub(r io.ReaderAt, size int64) ([]byte, error) {
	const chunk = 1 << 20
	if size < 22 || size > 1<<30 {
		return nil, errors.New("语言服务文件大小超出支持范围")
	}
	var found []byte
	buf := make([]byte, chunk+3)
	var candidates int
	for base := int64(0); base < size; base += chunk {
		n := min(int64(len(buf)), size-base)
		if _, err := r.ReadAt(buf[:n], base); err != nil {
			return nil, err
		}
		for j := 0; j < int(n); {
			k := bytes.Index(buf[j:n], []byte{'P', 'K', 5, 6})
			if k < 0 {
				break
			}
			j += k + 1
			candidates++
			if candidates > 2048 {
				return nil, errors.New("内嵌 ZIP 候选过多")
			}
			at := base + int64(j-1)
			var e [22]byte
			if _, err := r.ReadAt(e[:], at); err != nil {
				continue
			}
			le := binary.LittleEndian
			count := int(le.Uint16(e[10:]))
			cdSize := int64(le.Uint32(e[12:]))
			off := int64(le.Uint32(e[16:]))
			start := at - cdSize - off
			end := at + 22 + int64(le.Uint16(e[20:]))
			if le.Uint32(e[4:]) != 0 || count < 2 || count > 8192 || count != int(le.Uint16(e[8:])) || cdSize > 4<<20 || start < 0 || end > size {
				continue
			}
			var sig [4]byte
			if _, err := r.ReadAt(sig[:], start); err != nil || string(sig[:]) != "PK\x03\x04" {
				continue
			}
			zr, err := zip.NewReader(io.NewSectionReader(r, start, end-start), end-start)
			if err != nil && !errors.Is(err, zip.ErrInsecurePath) {
				continue
			}
			if zr == nil || len(zr.File) != count {
				continue
			}
			index := false
			var script *zip.File
			for _, f := range zr.File {
				switch f.Name {
				case "index.html":
					index = true
				case "main.js":
					if script != nil {
						return nil, errors.New("重复的 main.js")
					}
					script = f
				}
			}
			if !index || script == nil {
				continue
			}
			if found != nil {
				return nil, errors.New("多个 Hub ZIP 无法区分")
			}
			if !script.Mode().IsRegular() || script.UncompressedSize64 == 0 || script.UncompressedSize64 > maxScript {
				return nil, errors.New("Hub 脚本大小或类型异常")
			}
			rc, err := script.Open()
			if err != nil {
				return nil, err
			}
			found, err = io.ReadAll(io.LimitReader(rc, maxScript+1))
			rc.Close()
			if err != nil {
				return nil, err
			}
			if len(found) != int(script.UncompressedSize64) {
				return nil, errors.New("Hub 脚本大小不符")
			}
		}
	}
	if found == nil {
		return nil, errors.New("未找到包含 index.html 与 main.js 的内嵌 ZIP")
	}
	return found, nil
}

// Only direct, human-facing presentation fields are auto-selected; reviewed
// literals from other UI construction sites can be added by evidence replay.
var nativeModules = map[string]bool{"asar:dist/menu.js": true, "asar:dist/main.js": true, "asar:dist/tray.js": true, "asar:dist/updater.js": true}

func displayText(text string) bool {
	if strings.TrimSpace(text) != text || len(text) == 0 || len(text) > 400 || !strings.ContainsAny(text, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") {
		return false
	}
	if strings.ContainsAny(text, "\r\n\t{}<>/\\") || strings.Contains(text, "${") || strings.HasPrefix(text, "--") {
		return false
	}
	return true
}
