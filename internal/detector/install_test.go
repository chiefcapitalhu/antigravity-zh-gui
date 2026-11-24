package detector

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func fakeInstall(t *testing.T, platform, version string) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "Antigravity Copy.app")
	arc, exe := "resources/app.asar", "Antigravity.exe"
	write := func(rel string, b []byte) {
		path := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, b, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if platform == "darwin" {
		arc, exe = "Contents/Resources/app.asar", "Contents/MacOS/Antigravity"
		write("Contents/Info.plist", []byte(`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Antigravity</string><key>CFBundleIdentifier</key><string>com.google.antigravity</string><key>CFBundleShortVersionString</key><string>`+version+`</string></dict></plist>`))
	}
	pkg := fmt.Sprintf(`{"name":"antigravity","main":"dist/main.js","productName":"Antigravity","version":%q}`, version)
	h := fmt.Sprintf(`{"files":{"package.json":{"size":%d,"offset":"0"}}}`, len(pkg))
	pad := (len(h) + 3) &^ 3
	out := make([]byte, 16+pad)
	for i, n := range []int{4, pad + 8, pad + 4, len(h)} {
		binary.LittleEndian.PutUint32(out[4*i:], uint32(n))
	}
	copy(out[16:], h)
	write(arc, append(out, pkg...))
	write(exe, []byte("synthetic file"))
	return root
}

func TestInspectWindowsLayout(t *testing.T) {
	root := fakeInstall(t, "windows", "2.34.0")
	want, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{root, filepath.Join(root, "Antigravity.exe"), filepath.Join(root, "resources", "app.asar")} {
		i, err := inspectAt("windows", target)
		if err != nil || i.Root != want || i.Version != "2.34.0" || i.Archive != filepath.Join(want, "resources", "app.asar") || i.Platform != "windows" {
			t.Fatal(i, err)
		}
	}
	if _, err := inspectAt("windows", fakeInstall(t, "windows", "2.bad")); err == nil {
		t.Fatal("accepted malformed version")
	}
	if _, err := inspectAt("windows", fakeInstall(t, "windows", "1.34.0")); err == nil {
		t.Fatal("accepted unsupported version")
	}
}

func TestInspectMacLayout(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("uses system plutil")
	}
	root := fakeInstall(t, "darwin", "2.34.0")
	i, err := Inspect(root)
	if err != nil || i.Version != "2.34.0" {
		t.Fatal(i, err)
	}
	if err := VerifyOfficial(i); err == nil {
		t.Fatal("unsigned fixture trusted")
	}
	path := filepath.Join(root, "Contents", "Info.plist")
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, []byte(strings.Replace(string(b), "2.34.0", "1.23.4", 1)), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(root); err == nil {
		t.Fatal("accepted different bundle and archive versions")
	}
}

func TestInspectRejectRedirectedMember(t *testing.T) {
	root := fakeInstall(t, "windows", "2.34.0")
	exe := filepath.Join(root, "Antigravity.exe")
	sibling := filepath.Join(filepath.Dir(root), "foreign.exe")
	if err := os.Rename(exe, sibling); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(sibling, exe); err != nil {
		t.Skipf("symlink unavailable: %s", err)
	}
	if _, err := inspectAt("windows", root); err == nil {
		t.Fatal("accepted symlink")
	}
}

func TestRunningNamesAndPlatform(t *testing.T) {
	for _, name := range []string{"Antigravity", "ANTIGRAVITY.EXE", "Antigravity Helper (Renderer)", "Antigravity Helper"} {
		if !isProductProcess(name) {
			t.Errorf("missed %q", name)
		}
	}
	for _, name := range []string{"antigravity-zh-gui.exe", "antigravityctl", "antigravity-helper-test"} {
		if isProductProcess(name) {
			t.Errorf("unexpected match %q", name)
		}
	}
	if _, err := Running(Installation{Platform: "unsupported"}); err == nil {
		t.Fatal("missing error")
	}
	if err := VerifyOfficial(Installation{Platform: "windows"}); err == nil {
		t.Fatal("EXE signature cannot attest whole install")
	}
}

func TestInspectMalformedArchive(t *testing.T) {
	root := fakeInstall(t, "windows", "2.34.0")
	if err := os.WriteFile(filepath.Join(root, "resources", "app.asar"), []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectAt("windows", root); err == nil {
		t.Fatal("invalid archive accepted")
	}
}

func TestInspectCandidatesSkipsResidualInvalidDir(t *testing.T) {
	stale := filepath.Join(t.TempDir(), "Antigravity")
	bakPath := filepath.Join(stale, "resources", "app.asar.zh-gui.bak")
	if err := os.MkdirAll(filepath.Dir(bakPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bakPath, []byte("leftover backup"), 0600); err != nil {
		t.Fatal(err)
	}
	valid := fakeInstall(t, "windows", "2.34.0")
	want, err := filepath.EvalSymlinks(valid)
	if err != nil {
		t.Fatal(err)
	}
	got, err := inspectCandidates("windows", []string{stale, valid})
	if err != nil {
		t.Fatalf("expected second candidate to match, got err=%v", err)
	}
	if got.Root != want || got.Version != "2.34.0" {
		t.Fatalf("got %+v, want root %s", got, want)
	}
	if _, err := inspectCandidates("windows", []string{stale}); err == nil {
		t.Fatal("expected error when all existing candidates are invalid")
	}
	if _, err := inspectCandidates("windows", []string{filepath.Join(t.TempDir(), "absent")}); err == nil || !strings.Contains(err.Error(), "未找到") {
		t.Fatalf("expected not-found error, got %v", err)
	}
}
