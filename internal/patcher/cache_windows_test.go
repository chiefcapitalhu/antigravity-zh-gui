//go:build windows

package patcher

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
)

func TestNTFSCacheJunctionPreservesExternalData(t *testing.T) {
	for _, name := range []string{"Cache", filepath.Join("Partitions", "default"), filepath.Join("Cache", "nested")} {
		t.Run(filepath.ToSlash(name), func(t *testing.T) {
			profile := t.TempDir()
			outside := t.TempDir()
			writeFixture(t, filepath.Join(outside, "Cache", "session"), []byte("keep"))
			link := filepath.Join(profile, name)
			if err := os.MkdirAll(filepath.Dir(link), 0755); err != nil {
				t.Fatal(err)
			}
			// A directory junction does not require symlink privileges on windows-latest.
			// Pass paths via environment variables in a fixed cmd script, with delayed
			// expansion disabled so test paths are kept literal.
			cmd := exec.Command(filepath.Join(os.Getenv("SystemRoot"), "System32", "cmd.exe"), "/d", "/v:off", "/c", `mklink /J "%AG_LINK%" "%AG_DST%"`)
			cmd.Env = append(os.Environ(), "AG_LINK="+link, "AG_DST="+outside)
			// Go normally escapes quotes for CommandLineToArgvW, while cmd has a
			// different parser. Supply a literal command line with fixed arguments.
			cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `cmd.exe /d /v:off /c mklink /J "%AG_LINK%" "%AG_DST%"`}
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("create fixture junction: %v %s", err, out)
			}
			if cleanCache(profile) == nil {
				t.Fatal("junction cache cleanup did not fail closed")
			}
			if string(fileBytes(t, filepath.Join(outside, "Cache", "session"))) != "keep" {
				t.Fatal("outside data changed")
			}
			if err := os.Remove(link); err != nil {
				t.Fatal(err)
			}
		})
	}
}
