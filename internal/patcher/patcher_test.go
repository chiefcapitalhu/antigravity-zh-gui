package patcher

import (
	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/detector"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
)

const updateFixture = `autoUpdater.on('update-not-available', () => {
  const options = {
    type: 'info', title: 'Check for Updates', message: 'No updates available', buttons: ['OK'],
  };
  if (win) { electron_1.dialog.showMessageBox(win, options); }
  else { electron_1.dialog.showMessageBox(options); }
});`
const wslFixture = `(0, wsl_1.ensureServerInstalled)(WSL_DISTRO, version);
await electron_1.dialog.showErrorBox('WSL setup failed', msg);`

func writeFixture(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
func fileBytes(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func makeArchive(t *testing.T, path, update, wsl string) {
	t.Helper()
	var body []byte
	desc := func(s string) map[string]any {
		h := fmt.Sprintf("%x", sha256.Sum256([]byte(s)))
		n := map[string]any{"size": len(s), "offset": fmt.Sprint(len(body)), "integrity": map[string]any{"hash": h, "algorithm": "SHA256", "blockSize": 4194304, "blocks": []string{h}}}
		body = append(body, []byte(s)...)
		return n
	}
	dist := map[string]any{}
	if update != "" {
		dist["updater.js"] = desc(update)
	}
	if wsl != "" {
		dist["main.js"] = desc(wsl)
	}
	nodes := map[string]any{"dist": map[string]any{"files": dist}, "package.json": desc(`{"version":"2.34.0"}`), "untouched": desc("unchanged")}
	tree, err := json.Marshal(map[string]any{"files": nodes})
	if err != nil {
		t.Fatal(err)
	}
	n := (len(tree) + 3) &^ 3
	buf := make([]byte, 16+n)
	for i, x := range []int{4, n + 8, n + 4, len(tree)} {
		binary.LittleEndian.PutUint32(buf[4*i:], uint32(x))
	}
	copy(buf[16:], tree)
	writeFixture(t, path, append(buf, body...))
}

func testClone(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		r, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		p := filepath.Join(dst, r)
		if d.IsDir() {
			return os.Mkdir(p, 0755)
		}
		return copyFile(path, p)
	})
}
func testSwap(a, b string) error {
	if runtime.GOOS == "darwin" {
		return swapBundle(a, b)
	}
	tmp := a + ".old"
	if err := os.Rename(b, tmp); err != nil {
		return err
	}
	if err := os.Rename(a, b); err != nil {
		return err
	}
	return os.Rename(tmp, a)
}
func sample(t *testing.T, p, update, wsl string) (engine, detector.Installation) {
	t.Helper()
	sandbox := t.TempDir()
	home := filepath.Join(sandbox, "home")
	conf := filepath.Join(home, "AppData", "Roaming")
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("APPDATA", conf)
	root := filepath.Join(sandbox, "Antigravity")
	rel := "resources"
	if p == "darwin" {
		root += ".app"
		rel = filepath.Join("Contents", "Resources")
	}
	i := detector.Installation{Root: root, Archive: filepath.Join(root, rel, "app.asar"), Version: "2.34.0", Platform: p}
	makeArchive(t, i.Archive, update, wsl)
	if p == "darwin" {
		h, err := asar.HeaderHash(i.Archive)
		if err != nil {
			t.Fatal(err)
		}
		xml := `<plist><dict><key>ElectronAsarIntegrity</key><dict><key>Resources/default_app.asar</key><dict><key>hash</key><string>` + h + `</string></dict><key>Resources/app.asar</key><dict><key>algorithm</key><string>SHA256</string><key>hash</key><string>` + h + `</string></dict></dict></dict></plist>`
		writeFixture(t, filepath.Join(root, "Contents", "Info.plist"), []byte(xml))
	}
	e := defaults()
	e.running = func(detector.Installation) (bool, error) { return false, nil }
	e.official = func(detector.Installation) error { return nil }
	e.host = func(detector.Installation) error { return nil }
	e.copyBundle = testClone
	e.exchange = testSwap
	e.sign = func(string) error { return nil }
	return e, i
}
func TestWindowsAllowlistAndRestore(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	original := fileBytes(t, i.Archive)
	res, err := e.run(i, Options{}, false)
	if err != nil || !res.Committed || len(res.Changes) != 2 || len(res.Warnings) != 0 {
		t.Fatalf("%+v %v", res, err)
	}
	if !bytes.Equal(original, fileBytes(t, i.Archive+backupSuffix)) {
		t.Fatal("bad backup")
	}
	r, err := e.run(i, Options{}, false)
	if err != nil || len(r.Changes) != 0 {
		t.Fatalf("repeat %+v %v", r, err)
	}
	if _, err = e.run(i, Options{}, true); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(original, fileBytes(t, i.Archive)) {
		t.Fatal("restore")
	}
}
func TestWindowsPartialAndSkip(t *testing.T) {
	for _, tc := range []struct {
		name, u, w   string
		count, warns int
	}{
		{"both absent", "", "", 0, 2}, {"WSL absent", updateFixture, "", 1, 1}, {"ambiguous title", updateFixture, wslFixture + wslFixture, 1, 1},
		{"wrong dialog context", strings.Replace(updateFixture, "Check for Updates", "Other", 1), "", 0, 2},
		{"only WSL", "", wslFixture, 1, 1}, {"duplicate update", updateFixture + updateFixture, "", 0, 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e, i := sample(t, "windows", tc.u, tc.w)
			old := fileBytes(t, i.Archive)
			r, err := e.run(i, Options{}, false)
			if err != nil || r.Committed != (tc.count > 0) || len(r.Changes) != tc.count || len(r.Warnings) != tc.warns {
				t.Fatalf("%+v %v", r, err)
			}
			if tc.count == 0 {
				if !bytes.Equal(old, fileBytes(t, i.Archive)) {
					t.Fatal("skipped archive modified")
				}
				if _, err := os.Lstat(i.Archive + backupSuffix); !os.IsNotExist(err) {
					t.Fatal("backup created")
				}
			}
		})
	}
}
func TestMacDialogContext(t *testing.T) {
	e, i := sample(t, "darwin", strings.Replace(updateFixture, "Check for Updates", "Other", 1), "")
	e.sign = func(string) error { t.Fatal("must not sign"); return nil }
	r, err := e.run(i, Options{}, false)
	if err != nil || r.Committed || len(r.Warnings) != 1 {
		t.Fatalf("%+v %v", r, err)
	}
}
func TestHostPolicy(t *testing.T) {
	sentinel := "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX"
	off := sentinel + string([]byte{1, 8}) + "11110111"
	for _, s := range []string{"", sentinel, off + off, strings.Replace(off, "11110111", "11111111", 1)} {
		if hostPolicy([]io.Reader{strings.NewReader(s)}) == nil {
			t.Fatal("unsafe host accepted")
		}
	}
	if err := hostPolicy([]io.Reader{strings.NewReader(strings.Repeat("z", 65520) + off)}); err != nil {
		t.Fatal(err)
	}
	e, i := sample(t, "windows", updateFixture, wslFixture)
	e.host = func(detector.Installation) error { return &Warning{"host_unverified", "exe", "test"} }
	r, err := e.run(i, Options{}, false)
	if err != nil || r.Committed || len(r.Warnings) != 1 {
		t.Fatalf("%+v %v", r, err)
	}
}
func TestRejectMissingOrCorruptedBackup(t *testing.T) {
	for _, p := range []string{"darwin", "windows"} {
		t.Run(p, func(t *testing.T) {
			e, i := sample(t, p, updateFixture, wslFixture)
			if _, err := e.run(i, Options{}, false); err != nil {
				t.Fatal(err)
			}
			patched := fileBytes(t, i.Archive)
			b := i.Archive + backupSuffix
			if err := os.Remove(b); err != nil {
				t.Fatal(err)
			}
			if _, err := e.run(i, Options{}, false); err == nil {
				t.Fatal("missing backup accepted")
			}
			if _, err := os.Stat(b); !os.IsNotExist(err) {
				t.Fatal("backup recreated")
			}
			writeFixture(t, b, []byte("bad"))
			if _, err := e.run(i, Options{}, true); err == nil {
				t.Fatal("bad backup accepted")
			}
			if !bytes.Equal(patched, fileBytes(t, i.Archive)) {
				t.Fatal("live file changed")
			}
		})
	}
}
func TestRollbackAndRaces(t *testing.T) {
	for _, scenario := range []string{"running", "check-error", "sign-error", "concurrent-other", "concurrent-archive"} {
		t.Run(scenario, func(t *testing.T) {
			e, i := sample(t, "darwin", updateFixture, wslFixture)
			old := fileBytes(t, i.Archive)
			info := filepath.Join(i.Root, "Contents", "Info.plist")
			oldInfo := fileBytes(t, info)
			other := filepath.Join(i.Root, "icon")
			writeFixture(t, other, []byte("A"))
			switch scenario {
			case "running", "check-error":
				e.running = func(detector.Installation) (bool, error) {
					if scenario == "running" {
						return true, nil
					}
					return false, errors.New("unknown")
				}
			case "sign-error":
				e.sign = func(stage string) error {
					writeFixture(t, filepath.Join(stage, "Contents", "Info.plist"), []byte("broken"))
					return errors.New("sign")
				}
			case "concurrent-other":
				e.sign = func(string) error { writeFixture(t, other, []byte("B")); return nil }
			case "concurrent-archive":
				e.sign = func(string) error { writeFixture(t, i.Archive, []byte("new official")); return nil }
			}
			if _, err := e.run(i, Options{}, false); err == nil {
				t.Fatal("expected refusal")
			}
			if scenario == "concurrent-archive" {
				old = []byte("new official")
			}
			if !bytes.Equal(old, fileBytes(t, i.Archive)) || !bytes.Equal(oldInfo, fileBytes(t, info)) {
				t.Fatal("lost original or concurrent changes")
			}
			if scenario == "concurrent-other" && string(fileBytes(t, other)) != "B" {
				t.Fatal("bundle update lost")
			}
			if _, err := os.Stat(i.Archive + backupSuffix); !os.IsNotExist(err) {
				t.Fatal("backup leaked into bundle")
			}
		})
	}
}
func TestMacBackupRecoveryAndPlist(t *testing.T) {
	e, i := sample(t, "darwin", updateFixture, wslFixture)
	old := fileBytes(t, i.Archive)
	info := filepath.Join(i.Root, "Contents", "Info.plist")
	oldInfo := fileBytes(t, info)
	oldHash, _ := asar.HeaderHash(i.Archive)
	r, err := e.run(i, Options{BackupApp: true}, false)
	if err != nil || !r.Committed {
		t.Fatalf("%+v %v", r, err)
	}
	if len(r.Changes) != 1 || r.Changes[0].Path != member {
		t.Fatal(r.Changes)
	}
	afterHash, _ := asar.HeaderHash(i.Archive)
	newInfo := fileBytes(t, info)
	if bytes.Count(newInfo, []byte(afterHash)) != 1 || bytes.Count(newInfo, []byte(oldHash)) != 1 {
		t.Fatal("wrong plist update")
	}
	st, _ := os.Stat(i.Archive)
	if runtime.GOOS != "windows" && st.Mode().Perm() != 0644 {
		t.Fatal("archive permissions changed")
	}
	b, _ := OfficialBackupPath()
	if _, err = e.run(relocate(i, b), Options{}, false); err == nil {
		t.Fatal("modified official backup")
	}
	if err = os.Remove(i.Archive + backupSuffix); err != nil {
		t.Fatal(err)
	}
	if err = e.restoreOfficial(i); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(old, fileBytes(t, i.Archive)) || !bytes.Equal(oldInfo, fileBytes(t, info)) {
		t.Fatal("full restore failed")
	}
}
func TestOfficialBackupLocationsAndRestore(t *testing.T) {
	e, i := sample(t, "darwin", updateFixture, wslFixture)
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(home, "Library", "Application Support", "antigravity-zh-gui", "Antigravity-Official-Backup.app")
	legacy := filepath.Join(home, "Documents", "Antigravity-Official-Backup.app")
	expectPath := func(want string) {
		t.Helper()
		if got, err := OfficialBackupPath(); err != nil || got != want {
			t.Fatalf("backup lookup = %q, %v; want %q", got, err, want)
		}
	}
	expectPath(current)
	if _, err := os.Stat(filepath.Dir(current)); !os.IsNotExist(err) {
		t.Fatalf("lookup created a backup directory: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(legacy), 0755); err != nil {
		t.Fatal(err)
	}
	if err := testClone(i.Root, legacy); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join("Contents", "Resources", "legacy-marker")
	writeFixture(t, filepath.Join(legacy, marker), []byte("legacy"))
	expectPath(legacy)

	// A fresh backup must stage and publish under Application Support even
	// when there is an older backup available in Documents.
	copyParents := []string{}
	e.copyBundle = func(src, dst string) error {
		copyParents = append(copyParents, filepath.Dir(filepath.Dir(dst)))
		return testClone(src, dst)
	}
	if _, err := e.run(i, Options{BackupApp: true}, false); err != nil {
		t.Fatal(err)
	}
	if len(copyParents) == 0 || copyParents[0] != filepath.Dir(current) {
		t.Fatalf("unexpected backup staging directories %v", copyParents)
	}
	st, err := os.Stat(filepath.Dir(current))
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && st.Mode().Perm() != 0700 {
		t.Fatalf("backup directory permissions %v", st.Mode().Perm())
	}
	expectPath(current)
	if err := e.restoreOfficial(relocate(i, legacy)); err == nil {
		t.Fatal("legacy backup accepted as restore target with both backups present")
	}
	if err := e.restoreOfficial(i); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(i.Root, marker)); !os.IsNotExist(err) {
		t.Fatalf("restored from the wrong backup: %v", err)
	}

	// An invalid new backup must surface an error instead of silently choosing the old one.
	if err := os.RemoveAll(current); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, current, []byte("invalid"))
	expectPath(current)
	if err := e.restoreOfficial(i); err == nil {
		t.Fatal("restored despite invalid preferred backup")
	}
	if err := os.Remove(current); err != nil {
		t.Fatal(err)
	}
	expectPath(legacy)
	badSignature := errors.New("invalid staged signature")
	e.official = func(detector.Installation) error { return badSignature }
	if err := e.restoreOfficial(i); !errors.Is(err, badSignature) {
		t.Fatalf("expected signature failure, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(i.Root, marker)); !os.IsNotExist(err) {
		t.Fatalf("failed verification replaced the installation: %v", err)
	}
	e.official = func(copy detector.Installation) error {
		if copy.Root == legacy {
			return errors.New("Finder metadata on legacy source")
		}
		return nil
	}
	if err := e.restoreOfficial(i); err != nil {
		t.Fatal(err)
	}
	if got := string(fileBytes(t, filepath.Join(i.Root, marker))); got != "legacy" {
		t.Fatalf("legacy restore marker = %q", got)
	}
}

func TestCopyAppOmitsMacMetadata(t *testing.T) {
	tmp := t.TempDir()
	src := filepath.Join(tmp, "Source Bundle.app")
	dst := filepath.Join(tmp, "Clean Copy.app")
	if got := dittoArgs(src, dst); !slices.Equal(got, []string{"--norsrc", "--noextattr", src, dst}) {
		t.Fatalf("ditto args = %q", got)
	}
	if runtime.GOOS != "darwin" {
		return
	}
	rel := filepath.Join("Contents", "_CodeSignature", "CodeResources")
	seal := filepath.Join(src, rel)
	writeFixture(t, seal, []byte("test seal"))
	if err := command("/usr/bin/xattr", "-wx", "com.apple.FinderInfo", "0000000000000000040000000000000000000000000000000000000000000000", seal); err != nil {
		t.Fatal(err)
	}
	if err := command("/usr/bin/xattr", "-w", "com.apple.quarantine", "0083;5f000000;Test;", seal); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(seal, "..namedfork", "rsrc"), []byte("test fork"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := copyApp(src, dst); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(fileBytes(t, filepath.Join(dst, rel)), fileBytes(t, seal)) {
		t.Fatal("signature resource changed in the copy")
	}
	for _, path := range []string{seal, filepath.Join(dst, rel)} {
		attrs, err := exec.Command("/usr/bin/xattr", path).Output()
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range []string{"com.apple.FinderInfo", "com.apple.quarantine", "com.apple.ResourceFork"} {
			if slices.Contains(strings.Fields(string(attrs)), name) != (path == seal) {
				t.Fatalf("unexpected attributes on %s: %s", path, attrs)
			}
		}
	}
}

func TestWindowsUpdaterRestartsDuringBuild(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	old := fileBytes(t, i.Archive)
	count := 0
	e.running = func(detector.Installation) (bool, error) { count++; return count >= 2, nil }
	if _, err := e.run(i, Options{}, false); err == nil {
		t.Fatal("running process ignored")
	}
	if !bytes.Equal(old, fileBytes(t, i.Archive)) {
		t.Fatal("modified live archive")
	}
}
func TestConcurrentLock(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	unlock, err := lock(i.Root + ".zh-gui.lock")
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if _, err = e.run(i, Options{}, false); err == nil {
		t.Fatal("concurrent write allowed")
	}
}
func TestCacheBoundary(t *testing.T) {
	dir := t.TempDir()
	paths := []string{"Cache/x", "Partitions/default/Code Cache/x", "Partitions/default/database", "User/Cache/x", "settings.json", "Sessions/db-wal"}
	for _, p := range paths {
		writeFixture(t, filepath.Join(dir, p), []byte("data"))
	}
	if err := cleanCache(dir); err != nil {
		t.Fatal(err)
	}
	for j, p := range paths {
		_, err := os.Lstat(filepath.Join(dir, p))
		if (j < 2) != os.IsNotExist(err) {
			t.Fatalf("%s: %v", p, err)
		}
	}
	if runtime.GOOS == "windows" {
		return
	}
	other := t.TempDir()
	writeFixture(t, filepath.Join(other, "live"), []byte("keep"))
	if err := os.Symlink(other, filepath.Join(dir, "Cache")); err != nil {
		t.Fatal(err)
	}
	if cleanCache(dir) == nil {
		t.Fatal("removed cache link")
	}
	if string(fileBytes(t, filepath.Join(other, "live"))) != "keep" {
		t.Fatal("followed link")
	}
}

func TestConcurrentUpdateDuringPreflight(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	once := true
	e.host = func(detector.Installation) error {
		if once {
			once = false
			makeArchive(t, i.Archive, updateFixture+"\nreleaseChanged();", wslFixture)
		}
		return nil
	}
	if _, err := e.run(i, Options{}, false); err == nil {
		t.Fatal("preflight race accepted")
	}
	got, err := asar.ReadFile(i.Archive, member)
	if err != nil || !strings.HasSuffix(string(got), "releaseChanged();") {
		t.Fatalf("concurrent update lost: %v", err)
	}
	if _, err := os.Lstat(i.Archive + backupSuffix); !os.IsNotExist(err) {
		t.Fatal("stale backup")
	}
}
func TestWindowsFailedCommitRecoversPriorBackup(t *testing.T) {
	for _, existing := range []bool{false, true} {
		t.Run(fmt.Sprint(existing), func(t *testing.T) {
			e, i := sample(t, "windows", updateFixture, wslFixture)
			old := fileBytes(t, i.Archive)
			backup := i.Archive + backupSuffix
			if existing {
				writeFixture(t, backup, []byte("older update"))
			}
			count := 0
			e.running = func(detector.Installation) (bool, error) { count++; return count == 4, nil }
			if _, err := e.run(i, Options{}, false); err == nil {
				t.Fatal("commit should have stopped")
			}
			if !bytes.Equal(fileBytes(t, i.Archive), old) {
				t.Fatal("live changed")
			}
			if existing {
				if string(fileBytes(t, backup)) != "older update" {
					t.Fatal("previous backup lost")
				}
			} else if _, err := os.Lstat(backup); !os.IsNotExist(err) {
				t.Fatal("unexpected backup")
			}
		})
	}
}

func TestRestoreOriginalWithoutOptionalIntegrity(t *testing.T) {
	e, i := sample(t, "windows", updateFixture, wslFixture)
	data := fileBytes(t, i.Archive)
	n := binary.LittleEndian.Uint32(data[12:])
	var header map[string]any
	if err := json.Unmarshal(data[16:16+n], &header); err != nil {
		t.Fatal(err)
	}
	files := header["files"].(map[string]any)["dist"].(map[string]any)["files"].(map[string]any)
	for _, n := range files {
		delete(n.(map[string]any), "integrity")
	}
	raw, err := json.Marshal(header)
	if err != nil {
		t.Fatal(err)
	}
	align := (len(raw) + 3) &^ 3
	out := make([]byte, 16+align)
	for j, n := range []int{4, align + 8, align + 4, len(raw)} {
		binary.LittleEndian.PutUint32(out[4*j:], uint32(n))
	}
	copy(out[16:], raw)
	out = append(out, data[8+binary.LittleEndian.Uint32(data[4:]):]...)
	writeFixture(t, i.Archive, out)
	forward, err := e.run(i, Options{}, false)
	if err != nil {
		t.Fatal(err)
	}
	reverse, err := e.run(i, Options{}, true)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(fileBytes(t, i.Archive), out) || len(reverse.Changes) != 2 || reverse.Changes[0].BeforeSHA256 != forward.Changes[0].AfterSHA256 {
		t.Fatal("restore audit mismatch")
	}
}

func TestMacBackupConflictMessageAndOfficialRestoreCacheCleanup(t *testing.T) {
	e, i := sample(t, "darwin", updateFixture, wslFixture)
	old := fileBytes(t, i.Archive)
	// Create a valid official backup first.
	if _, err := e.run(i, Options{BackupApp: true}, false); err != nil {
		t.Fatal(err)
	}
	backupDir, _ := OfficialBackupPath()

	// Replace backup's archive with an older version to trigger conflict during apply with BackupApp=true.
	makeArchive(t, filepath.Join(backupDir, "Contents", "Resources", "app.asar"), updateFixture+"\n// older", wslFixture)
	_, err := e.run(i, Options{BackupApp: true}, false)
	if err == nil {
		t.Fatal("expected backup version conflict")
	}
	if !strings.Contains(err.Error(), backupDir) || !strings.Contains(err.Error(), "取消勾选") || !strings.Contains(err.Error(), "移走") {
		t.Fatalf("conflict error missing path or guidance: %v", err)
	}

	// Restore matching official backup so restoreOfficialWithReport succeeds.
	writeFixture(t, filepath.Join(backupDir, "Contents", "Resources", "app.asar"), old)

	// Explicit target: does NOT clear cache.
	cleared := 0
	e.clearCache = func(string) error { cleared++; return errors.New("cache locked") }
	res, err := e.restoreOfficialWithReport(i, i.Root)
	if err != nil || !res.Committed || len(res.Warnings) != 0 || cleared != 0 {
		t.Fatalf("explicit target restore: res=%+v cleared=%d err=%v", res, cleared, err)
	}

	// Default target (""): attempts cache cleanup; failure is recorded as warning without failing commit.
	res, err = e.restoreOfficialWithReport(i, "")
	if err != nil || !res.Committed || cleared != 1 || len(res.Warnings) != 1 || res.Warnings[0].Code != "cache_cleanup_incomplete" {
		t.Fatalf("default target restore: res=%+v cleared=%d err=%v", res, cleared, err)
	}
}
