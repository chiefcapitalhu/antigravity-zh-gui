package main

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestReadOnlyExtractCLI(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "windows" {
		t.Skip("desktop command supports macOS and Windows")
	}
	root := filepath.Join(t.TempDir(), "Fake.app")
	var resources, exe, ls string
	write := func(p string, b []byte) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, b, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if runtime.GOOS == "windows" {
		resources = filepath.Join(root, "resources")
		exe = filepath.Join(root, "Antigravity.exe")
		ls = "language_server_windows_x64.exe"
	} else {
		resources = filepath.Join(root, "Contents", "Resources")
		exe = filepath.Join(root, "Contents", "MacOS", "Antigravity")
		ls = "language_server"
		write(filepath.Join(root, "Contents", "Info.plist"), []byte(`<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.google.antigravity</string><key>CFBundleExecutable</key><string>Antigravity</string><key>CFBundleShortVersionString</key><string>2.34.0</string></dict></plist>`))
	}
	write(exe, []byte("fixture never executed"))
	pkg := `{"name":"antigravity","productName":"Antigravity","main":"dist/main.js","version":"2.34.0"}`
	h, _ := json.Marshal(map[string]any{"files": map[string]any{"package.json": map[string]any{"size": len(pkg), "offset": "0"}}})
	n := (len(h) + 3) &^ 3
	archive := make([]byte, 16+n)
	for j, v := range []int{4, n + 8, n + 4, len(h)} {
		binary.LittleEndian.PutUint32(archive[4*j:], uint32(v))
	}
	copy(archive[16:], h)
	archive = append(archive, pkg...)
	path := filepath.Join(resources, "app.asar")
	write(path, archive)
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for _, name := range []string{"index.html", "main.js"} {
		f, _ := z.Create(name)
		f.Write([]byte(`item={label:"Models"}`))
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(resources, "bin", ls), buf.Bytes())
	dest := filepath.Join(t.TempDir(), "report")
	var out, diag bytes.Buffer
	flags := []string{"extract", "--target", root, "--out", dest}
	if err := run(flags, &out, &diag); err != nil {
		t.Fatal(err)
	}
	found, err := os.ReadFile(filepath.Join(dest, "candidates.json"))
	if err != nil || !strings.Contains(string(found), `"Models"`) {
		t.Fatalf("%s %v", found, err)
	}
	if err := run(flags, &out, &diag); err == nil {
		t.Fatal("overwrote existing output")
	}
	before, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, archive) {
		t.Fatal("changed installation")
	}
}
