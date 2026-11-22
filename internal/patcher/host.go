package patcher

import (
	"bytes"
	"debug/pe"
	"errors"
	"io"
	"path/filepath"

	"antigravity-zh-gui/internal/detector"
)

// Read only the signed Electron host. Any enabled, missing or ambiguous
// integrity policy leaves the installation untouched.
func windowsHost(i detector.Installation) error {
	if err := detector.VerifyExecutableSignature(i); err != nil {
		return &Warning{"host_unverified", "Antigravity.exe", err.Error()}
	}
	h, err := pe.Open(filepath.Join(i.Root, "Antigravity.exe"))
	if err != nil {
		return &Warning{"host_unrecognized", "Antigravity.exe", err.Error()}
	}
	defer h.Close()
	var sections []io.Reader
	for _, s := range h.Sections {
		if s.Name == ".rdata" || s.Name == ".data" {
			sections = append(sections, s.Open())
		}
	}
	return hostPolicy(sections)
}
func hostPolicy(sections []io.Reader) error {
	tag := []byte("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX")
	// Wire V1 stores the integrity flag at index four. No executable bytes
	// are rewritten, including when the installed version uses a different wire.
	record := len(tag) + 7
	seen := 0
	for _, s := range sections {
		buf := make([]byte, 64*1024+record)
		left := 0
		for {
			n, err := s.Read(buf[left:])
			window := buf[:left+n]
			start := 0
			for len(window)-start >= record {
				offset := bytes.Index(window[start:], tag)
				if offset < 0 {
					break
				}
				pos := start + offset
				if len(window)-pos < record {
					break
				}
				val := window[pos+len(tag):]
				seen++
				if val[0] != 1 || val[1] < 5 || val[6] != '0' {
					return &Warning{"integrity_required_or_unknown", "Antigravity.exe", "宿主需要嵌入式 ASAR 完整性或其策略未知，保留安装"}
				}
				start = pos + 1
			}
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return err
			}
			left = min(record-1, len(window))
			copy(buf, window[len(window)-left:])
		}
	}
	if seen != 1 {
		return &Warning{"host_policy_ambiguous", "Antigravity.exe", "未能唯一确认宿主允许更新独立 ASAR"}
	}
	return nil
}
