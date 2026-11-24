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

	"antigravity-zh-gui/internal/app"
	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/internal/detector"
	"antigravity-zh-gui/internal/patcher"
)

func fixtureInstall(t *testing.T) (string, string, []byte) {
	t.Helper()
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
	return root, path, archive
}

func TestReadOnlyExtractCLI(t *testing.T) {
	root, path, archive := fixtureInstall(t)
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

func isolateUser(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("USERPROFILE", tmp)
	t.Setenv("APPDATA", tmp)
}

func TestStatusAndRepairWithSyntheticInstallation(t *testing.T) {
	isolateUser(t)
	root, path, orig := fixtureInstall(t)
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	store, err := config.Open("")
	if err != nil {
		t.Fatal(err)
	}
	p := config.Defaults()
	p.Target = realRoot
	if err := store.SavePreferences(p); err != nil {
		t.Fatal(err)
	}
	var out, diag bytes.Buffer
	if err := run([]string{"status"}, &out, &diag); err != nil {
		t.Fatal(err)
	}
	var s app.Status
	if err := json.Unmarshal(out.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s.Target != realRoot || s.Version != "2.34.0" || s.Platform != runtime.GOOS || s.Localized == nil || *s.Localized || s.Backup || s.Signature == "" {
		t.Fatalf("status mismatch %+v", s)
	}
	// All mutations target the temporary fixture. Respect real process
	// detection: it may legitimately block changes on a developer's machine.
	installation, err := detector.Inspect(realRoot)
	if err != nil {
		t.Fatal(err)
	}
	running, probeErr := detector.Running(installation)
	for _, name := range []string{"apply", "restore"} {
		out.Reset()
		diag.Reset()
		args := []string{name, "--target", realRoot}
		if name == "apply" {
			args = append(args, "--hotkey=false", "--default-lang=en", "--brand=hide")
		}
		err := run(args, &out, &diag)
		if running || probeErr != nil {
			if err == nil {
				t.Fatal("changed fixture when process state was not idle")
			}
		} else {
			if err != nil {
				t.Fatal(err)
			}
			var result patcher.Result
			if err := json.Unmarshal(out.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Committed {
				t.Fatalf("%s committed on an unsupported fixture: %+v", name, result)
			}
			// apply must report why it skipped; restoring an untouched
			// installation is a read-only no-op and must not warn.
			if name == "apply" && len(result.Warnings) == 0 {
				t.Fatalf("expected a reported skip, got %+v", result)
			}
			if name == "restore" && len(result.Warnings) != 0 {
				t.Fatalf("restore of an untouched fixture warned: %+v", result)
			}
		}
	}
	got, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(got, orig) {
		t.Fatal("fixture changed")
	}
	if _, err := os.Lstat(path + patcher.BackupSuffix); !os.IsNotExist(err) {
		t.Fatal("unexpected backup")
	}
	// Verifying this synthetic, unsigned, non-baseline archive must surface
	// the unsupported target instead of attributing it to an official build.
	if err := run([]string{"verify", "--target", path}, &out, &diag); err == nil {
		t.Fatal("unverified fixture accepted")
	}
}

func TestVersionHelpAndInvalidCLI(t *testing.T) {
	isolateUser(t)
	var out, diag bytes.Buffer
	if err := run([]string{"--version"}, &out, &diag); err != nil || strings.TrimSpace(out.String()) != app.Version {
		t.Fatalf("%s %v", out.String(), err)
	}
	for _, name := range []string{"apply", "restore", "status", "verify", "extract"} {
		if err := run([]string{name, "--help"}, &out, &diag); err != nil {
			t.Fatal(name, err)
		}
	}
	for _, args := range [][]string{{"unknown"}, {"verify", "--backup-app"}, {"status", "--missing"}, {"apply", "--default-lang=xx", "--target", t.TempDir()}, {"restore", "positional"}, {"apply", "--hotkey=bad"}} {
		if err := run(args, &out, &diag); err == nil {
			t.Fatalf("accepted %q", args)
		}
	}
}
