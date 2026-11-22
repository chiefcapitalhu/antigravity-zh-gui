//go:build windows

package detector

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestWindowsAutodetect(t *testing.T) {
	base := t.TempDir()
	t.Setenv("LOCALAPPDATA", filepath.Join(base, "Local"))
	for _, key := range []string{"ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"} {
		t.Setenv(key, filepath.Join(base, "PF"))
	}
	root := filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Antigravity")
	if err := os.MkdirAll(filepath.Dir(root), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(fakeInstall(t, "windows", "2.34.0"), root); err != nil {
		t.Fatal(err)
	}
	want, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"", root, filepath.Join(root, "Antigravity.exe"), filepath.Join(root, "resources", "app.asar")} {
		i, err := Inspect(target)
		if err != nil || i.Root != want || i.Version != "2.34.0" || i.Platform != "windows" {
			t.Fatalf("%q -> %+v, %v", target, i, err)
		}
		if err := VerifyExecutableSignature(i); err == nil {
			t.Fatal("unsigned fake executable trusted")
		}
	}
	if err := os.Rename(root, filepath.Join(base, "retired")); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(""); err == nil {
		t.Fatal("missing install reported as installed")
	}
}

// This synthetic child is a copy of the test binary. Closing its stdin lets
// it return normally, including when the parent test exits through t.Fatal.
func TestSyntheticProcess(t *testing.T) {
	if os.Getenv("ZH_GUI_SYNTHETIC_PROCESS") != "1" {
		t.Skip("child process entry")
	}
	fmt.Fprintln(os.Stdout, "ready")
	if _, err := io.Copy(io.Discard, os.Stdin); err != nil {
		t.Fatal(err)
	}
}

func startFakeProcess(t *testing.T, root, name string) uint32 {
	t.Helper()
	source, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, name)
	if err = os.WriteFile(path, payload, 0700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(path, "-test.run=^TestSyntheticProcess$")
	cmd.Env = append(os.Environ(), "ZH_GUI_SYNTHETIC_PROCESS=1")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := stdin.Close(); err != nil {
			t.Error(err)
		}
		if err := cmd.Wait(); err != nil {
			t.Error(err)
		}
	})
	ready := make(chan bool, 1)
	go func() {
		scan := bufio.NewScanner(stdout)
		for scan.Scan() {
			if scan.Text() == "ready" {
				ready <- true
				return
			}
		}
		ready <- false
	}()
	select {
	case ok := <-ready:
		if !ok {
			t.Fatal("fixture exited before ready")
		}
	case <-time.After(15 * time.Second):
		t.Fatal("synthetic process startup timed out")
	}
	return uint32(cmd.Process.Pid)
}

func TestWindowsProcessSnapshot(t *testing.T) {
	root := t.TempDir()
	pid := startFakeProcess(t, root, "Antigravity.exe")
	match, err := belongsToRoot(pid, root)
	if err != nil || !match {
		t.Fatal("fixture path lookup", match, err)
	}
	running, err := Running(Installation{Root: root, Platform: "windows"})
	if err != nil || !running {
		t.Fatal("snapshot missed running fixture", running, err)
	}
}

func TestWindowsOrphanLanguageServer(t *testing.T) {
	root := t.TempDir()
	pid := startFakeProcess(t, root, "language_server_windows_x64.exe")
	other := t.TempDir()
	if match, err := belongsToRoot(pid, other); err != nil || match {
		t.Fatal("unrelated install", match, err)
	}
	if running, err := Running(Installation{Root: root, Platform: "windows"}); err != nil || !running {
		t.Fatal("orphan language server", running, err)
	}
}
