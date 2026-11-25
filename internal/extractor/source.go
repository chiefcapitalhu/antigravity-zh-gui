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
	Version      string
	scripts      map[string][]byte
	hashes       map[string]string
	warnings     []string
	binaryFields map[int]binaryLiteral
}

func (s *SourceSet) add(name string, data []byte) error {
	if len(data) == 0 || len(data) > maxScript || !utf8.Valid(data) {
		return fmt.Errorf("无效的 UTF-8 界面资源 %s", name)
	}
	s.scripts[name] = data
	s.hashes[name] = fmt.Sprintf("%x", sha256.Sum256(data))
	return nil
}

func hasPatchMarker(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	marker := []byte("/* === ANTIGRAVITY-ZH-GUI RUNTIME BEGIN === */")
	tail := len(marker) - 1
	buf := make([]byte, 64*1024+tail)
	carry := 0
	for {
		n, err := f.Read(buf[carry:])
		window := buf[:carry+n]
		if bytes.Contains(window, marker) {
			return true
		}
		if errors.Is(err, io.EOF) || err != nil {
			return false
		}
		carry = min(tail, len(window))
		copy(buf, window[len(window)-carry:])
	}
}

var asarMembers = []string{
	"dist/main.js",
	"dist/menu.js",
	"dist/tray.js",
	"dist/updater.js",
	"dist/loadingOverlay.js",
	"dist/ipcHandlers.js",
	"dist/remote/remoteManager.js",
	"dist/remote/sshPrompts.js",
	"dist/deviceChooser.js",
	"dist/webauthn.js",
	"dist/webviewPopupSecurity.js",
	"dist/provisionSplash.js",
	"dist/ideInstall/wizardHtml.js",
}

func Load(i detector.Installation) (*SourceSet, error) {
	archive := i.Archive
	if bak := i.Archive + ".zh-gui.bak"; hasPatchMarker(i.Archive) {
		if st, err := os.Lstat(bak); err == nil && st.Mode().IsRegular() {
			archive = bak
		}
	}
	if _, err := asar.HeaderHash(archive); err != nil {
		return nil, err
	}
	s := &SourceSet{Version: i.Version, scripts: map[string][]byte{}, hashes: map[string]string{}}
	for _, name := range asarMembers {
		data, err := asar.ReadFile(archive, name)
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
		if err == nil && i.Platform == "darwin" && i.Version == "2.35.0" && st.Size() == reviewedServerSize {
			// embeddedHub uses ReadAt, so f still starts at byte zero.
			var digest string
			s.binaryFields, digest, err = readBinaryFields(f, st.Size(), serverFields)
			if err == nil && digest == reviewedServerSHA {
				s.hashes[serverSource] = digest
			} else {
				s.binaryFields = nil
			}
		}
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
var nativeModules = map[string]bool{
	"asar:dist/main.js":                 true,
	"asar:dist/menu.js":                 true,
	"asar:dist/tray.js":                 true,
	"asar:dist/updater.js":              true,
	"asar:dist/loadingOverlay.js":       true,
	"asar:dist/ipcHandlers.js":          true,
	"asar:dist/remote/remoteManager.js": true,
	"asar:dist/remote/sshPrompts.js":    true,
	"asar:dist/deviceChooser.js":        true,
	"asar:dist/webauthn.js":             true,
	"asar:dist/webviewPopupSecurity.js": true,
	"asar:dist/provisionSplash.js":      true,
	"asar:dist/ideInstall/wizardHtml.js": true,
}

func displayText(text string) bool {
	if strings.TrimSpace(text) != text || len(text) == 0 || len(text) > 400 || !strings.ContainsAny(text, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") {
		return false
	}
	if strings.ContainsAny(text, "\r\n\t{}\\" ) || strings.Contains(text, "${") || strings.HasPrefix(text, "--") {
		return false
	}
	lower := strings.ToLower(text)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") ||
		strings.HasPrefix(lower, "file://") || strings.HasPrefix(lower, "mailto:") ||
		strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "ws://") || strings.HasPrefix(lower, "wss://") {
		return false
	}
	if strings.HasPrefix(text, "/") || strings.HasPrefix(text, "./") || strings.HasPrefix(text, "../") || strings.HasPrefix(text, "~/") {
		return false
	}
	// Reject HTML tags/fragments, while allowing UI copy like "Resets in <1m" or "A -> B".
	if strings.Contains(text, "</") || strings.Contains(text, "/>") {
		return false
	}
	if idx := strings.IndexByte(text, '<'); idx >= 0 && idx+1 < len(text) {
		next := text[idx+1]
		if (next >= 'a' && next <= 'z') || (next >= 'A' && next <= 'Z') || next == '!' {
			return false
		}
	}
	// Reject single-token identifiers (snake_case, kebab-case, camelCase, dot.paths) and CSS utility lists.
	fields := strings.Fields(text)
	if len(fields) == 1 {
		tok := fields[0]
		if strings.Contains(tok, "_") || strings.Contains(tok, "::") {
			return false
		}
		if strings.Contains(tok, "/") && !strings.ContainsAny(tok, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
			return false
		}
		// Reject lowercase kebab-case or camelCase single identifiers (e.g. "aria-label", "fooBar", "model.id").
		if tok[0] >= 'a' && tok[0] <= 'z' {
			if strings.ContainsAny(tok, "-.") {
				return false
			}
			for i := 1; i < len(tok); i++ {
				if tok[i] >= 'A' && tok[i] <= 'Z' {
					return false
				}
			}
		}
		// Reject ALL_CAPS identifiers or codes longer than 4 chars without spaces unless common acronyms.
		if len(tok) > 5 && tok == strings.ToUpper(tok) && !strings.ContainsAny(tok, " .,!?") {
			return false
		}
	} else {
		// Reject Tailwind/CSS utility class lists: e.g. "flex items-center gap-2 text-sm"
		cssLike := 0
		for _, f := range fields {
			if strings.ContainsAny(f, "-:[]") && f == strings.ToLower(f) {
				cssLike++
			}
		}
		if len(fields) >= 2 && cssLike*2 >= len(fields) && text == strings.ToLower(text) {
			return false
		}
	}
	return true
}
