// Package patcher installs the built-in, versioned Antigravity localization.
package patcher

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"antigravity-zh-gui/internal/asar"
	"antigravity-zh-gui/internal/detector"
)

const (
	begin        = "/* === ANTIGRAVITY-ZH-GUI RUNTIME BEGIN === */"
	end          = "/* === ANTIGRAVITY-ZH-GUI RUNTIME END === */"
	member       = "dist/updater.js"
	backupSuffix = ".zh-gui.bak"
	mac234       = "8934adef0622c9271c92eea950a71848764a66f7b10023ccbd82e54b959adb0e"
)

type Options struct {
	BackupApp bool
}

// releaseHash identifies the exact distribution used to audit the source members.
// Add Windows hashes only after inspecting an original Windows distribution.
func releaseHash(i detector.Installation) string {
	if i.Platform == "darwin" && i.Version == "2.34.0" {
		return mac234
	}
	return ""
}

type engine struct {
	host       func(detector.Installation) error
	running    func(detector.Installation) (bool, error)
	official   func(detector.Installation) error
	baseline   func(detector.Installation) string
	sign       func(string) error
	copyBundle func(string, string) error
	exchange   func(string, string) error
	backupPath func() (string, error)
}

func defaults() engine {
	return engine{windowsHost, detector.Running, detector.VerifyOfficial, releaseHash, signBundle, copyApp, swapBundle, officialBackup}
}
func command(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %w: %s", filepath.Base(name), err, strings.TrimSpace(string(out)))
	}
	return nil
}
func signBundle(path string) error {
	if err := command("/usr/bin/xattr", "-cr", path); err != nil {
		return err
	}
	if err := command("/usr/bin/codesign", "--force", "--deep", "--sign", "-", path); err != nil {
		return err
	}
	return command("/usr/bin/codesign", "--verify", "--deep", "--strict", path)
}
func copyApp(src, dst string) error { return command("/usr/bin/ditto", src, dst) }
func officialBackup() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Documents", "Antigravity-Official-Backup.app"), nil
}
func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func regular(path string) error {
	s, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !s.Mode().IsRegular() {
		return fmt.Errorf("需要普通文件 %s", path)
	}
	return nil
}
func absentOrRegular(path string) error {
	err := regular(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
func copyFile(src, dst string) (err error) {
	if err = regular(src); err != nil {
		return err
	}
	from, err := os.Open(src)
	if err != nil {
		return err
	}
	defer from.Close()
	st, err := from.Stat()
	if err != nil {
		return err
	}
	to, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer func() {
		if e := to.Close(); err == nil {
			err = e
		}
		if err != nil {
			os.Remove(dst)
		}
	}()
	if _, err = io.Copy(to, from); err != nil {
		return err
	}
	if err = to.Chmod(st.Mode().Perm()); err != nil {
		return err
	}
	return to.Sync()
}
func checkDir(path string) error {
	st, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !st.IsDir() {
		return fmt.Errorf("需要实体目录 %s", path)
	}
	return nil
}
func validate(i detector.Installation) error {
	if !filepath.IsAbs(i.Root) || i.Root != filepath.Clean(i.Root) {
		return errors.New("安装目录必须是规范绝对路径")
	}
	if err := checkDir(i.Root); err != nil {
		return err
	}
	var resourceDir string
	switch i.Platform {
	case "darwin":
		if filepath.Ext(i.Root) != ".app" {
			return errors.New("无效的 macOS 包路径")
		}
		contents := filepath.Join(i.Root, "Contents")
		if err := checkDir(contents); err != nil {
			return err
		}
		if err := regular(filepath.Join(contents, "Info.plist")); err != nil {
			return err
		}
		resourceDir = filepath.Join(contents, "Resources")
	case "windows":
		resourceDir = filepath.Join(i.Root, "resources")
	default:
		return errors.New("不支持的安装平台")
	}
	if err := checkDir(resourceDir); err != nil {
		return err
	}
	if i.Archive != filepath.Join(resourceDir, "app.asar") {
		return errors.New("资源路径与安装目录不一致")
	}
	if err := regular(i.Archive); err != nil {
		return err
	}
	return absentOrRegular(i.Archive + backupSuffix)
}
func (e engine) idle(i detector.Installation) error {
	running, err := e.running(i)
	if err != nil {
		return fmt.Errorf("无法确认客户端已退出: %w", err)
	}
	if running {
		return errors.New("Antigravity 正在运行，请手动完全退出后重试")
	}
	return nil
}

type snapshot struct {
	original, liveHash, infoHash, bundleHash string
	patched                                  bool
}

// A valid repeat installation must both have an original of the pinned build
// and differ from it exclusively at the audited member.
func (e engine) inspect(i detector.Installation) (snapshot, *asar.AuditReport, error) {
	var s snapshot
	if err := validate(i); err != nil {
		return s, nil, err
	}
	expected := e.baseline(i)
	if expected == "" {
		return s, nil, errors.New("尚未核准此平台和版本的官方 ASAR 基线")
	}
	var err error
	s.liveHash, err = hashFile(i.Archive)
	if err != nil {
		return s, nil, err
	}
	s.original = i.Archive
	s.patched, err = marked(i.Archive)
	if err != nil {
		return s, nil, err
	}
	if s.patched {
		s.original = i.Archive + backupSuffix
		h, err := hashFile(s.original)
		if err != nil || h != expected {
			return s, nil, errors.New("缺失已验证的原始备份或备份摘要不符")
		}
	} else if s.liveHash != expected {
		return s, nil, errors.New("当前资源与已核准指纹不符")
	}
	changes, _ := plan(s.original, i.Platform)
	if s.patched {
		if len(changes) == 0 {
			return s, nil, errors.New("已标记的包没有可识别的界面文案")
		}
		for k, want := range changes {
			got, err := asar.ReadFile(i.Archive, k)
			if err != nil || !bytes.Equal(want, got) {
				return s, nil, errors.New("当前本地化成员含未知修改")
			}
		}
	}
	if i.Platform == "darwin" {
		path := filepath.Join(i.Root, "Contents", "Info.plist")
		s.infoHash, err = hashFile(path)
		if err != nil {
			return s, nil, err
		}
		header, err := asar.HeaderHash(i.Archive)
		if err != nil {
			return s, nil, err
		}
		if _, err = updatePlist(path, header, header); err != nil {
			return s, nil, err
		}
	}
	report, err := asar.VerifyCandidate(s.original, i.Archive, allowed(changes))
	return s, report, err
}
func Apply(target string, options Options) (*Result, error) {
	i, err := detector.Inspect(target)
	if err != nil {
		return nil, err
	}
	report, err := defaults().run(i, options, false)
	if err == nil && target == "" && report.Committed {
		appendCacheWarning(report, target)
	}
	return report, err
}
func Restore(target string) error {
	r, err := RestoreWithReport(target)
	if err != nil {
		return err
	}
	if !r.Committed && len(r.Warnings) > 0 {
		return &r.Warnings[0]
	}
	return nil
}
func RestoreWithReport(target string) (*Result, error) {
	i, err := detector.Inspect(target)
	if err != nil {
		return nil, err
	}
	result, err := defaults().run(i, Options{}, true)
	if err == nil && target == "" && result.Committed {
		appendCacheWarning(result, target)
	}
	return result, err
}
func Verify(target string) (*asar.AuditReport, error) {
	i, err := detector.Inspect(target)
	if err != nil {
		return nil, err
	}
	e, err := defaults().selectBuild(i, false)
	if err != nil {
		return nil, err
	}
	_, report, err := e.inspect(i)
	return report, err
}
func (e engine) unchanged(i detector.Installation, s snapshot) error {
	if err := e.idle(i); err != nil {
		return err
	}
	if err := validate(i); err != nil {
		return err
	}
	current, err := hashFile(i.Archive)
	if err != nil {
		return err
	}
	if current != s.liveHash {
		return errors.New("构建期间客户端资源已变化，请重新检查版本")
	}
	if s.patched {
		hash, err := hashFile(s.original)
		if err != nil || hash != e.baseline(i) {
			return errors.New("构建期间原始备份已变化")
		}
	}
	if i.Platform == "windows" {
		if err := e.host(i); err != nil {
			return err
		}
	}
	if i.Platform == "darwin" {
		if s.bundleHash != "" {
			tree, err := bundleDigest(i.Root)
			if err != nil {
				return err
			}
			if tree != s.bundleHash {
				return errors.New("构建期间应用包文件树已变化")
			}
		}
		cur, err := hashFile(filepath.Join(i.Root, "Contents", "Info.plist"))
		if err != nil {
			return err
		}
		if cur != s.infoHash {
			return errors.New("构建期间 Info.plist 已变化")
		}
	}
	return nil
}

func (e engine) run(i detector.Installation, opt Options, restore bool) (*Result, error) {
	if err := validate(i); err != nil {
		return nil, err
	}
	if err := e.protectBackup(i); err != nil {
		return nil, err
	}
	if err := e.idle(i); err != nil {
		return nil, err
	}
	unlock, err := lock(i.Root + ".zh-gui.lock")
	if err != nil {
		return nil, err
	}
	defer unlock()
	initialHash, err := hashFile(i.Archive)
	if err != nil {
		return nil, err
	}
	hasMarkers, err := marked(i.Archive)
	if err != nil {
		return nil, err
	}
	source := i.Archive
	if hasMarkers {
		source += backupSuffix
		if err := regular(source); err != nil {
			return nil, fmt.Errorf("缺少原始备份: %w", err)
		}
	}
	changes, warnings := plan(source, i.Platform)
	if !hasMarkers && len(changes) == 0 {
		audit, err := asar.VerifyCandidate(i.Archive, i.Archive, nil)
		if err != nil {
			return nil, err
		}
		return &Result{AuditReport: audit, Warnings: warnings}, nil
	}
	e, err = e.selectBuild(i, true)
	if err != nil {
		var w *Warning
		if errors.As(err, &w) {
			warnings = append(warnings, *w)
			return &Result{AuditReport: &asar.AuditReport{}, Warnings: warnings}, nil
		}
		return nil, err
	}
	s, report, err := e.inspect(i)
	if err != nil {
		return nil, err
	}
	if s.liveHash != initialHash {
		return nil, errors.New("预检期间安装内容变化")
	}
	if restore && !s.patched {
		return &Result{AuditReport: report, Warnings: warnings}, nil
	}
	if i.Platform == "darwin" {
		s.bundleHash, err = bundleDigest(i.Root)
		if err != nil {
			return nil, err
		}
	}
	if opt.BackupApp {
		if i.Platform != "darwin" {
			return nil, errors.New("整包备份仅适用于 macOS")
		}
		if err = e.backup(i, s); err != nil {
			return nil, err
		}
	}
	// A sibling temp directory keeps the commit on the same filesystem.
	work, err := os.MkdirTemp(filepath.Dir(i.Root), ".ag-zh-build-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(work)
	// Build only from a private immutable copy. The preliminary text match
	// is solely a no-write fast path and must never supply candidate bytes.
	original := filepath.Join(work, "baseline.asar")
	if err = copyFile(s.original, original); err != nil {
		return nil, err
	}
	if h, err := hashFile(original); err != nil || h != e.baseline(i) {
		return nil, errors.New("构建源与已确认基线不符")
	}
	changes, warnings = plan(original, i.Platform)
	if len(changes) == 0 {
		return nil, errors.New("构建时文案上下文已变化")
	}
	candidate := filepath.Join(work, "candidate.asar")
	if restore {
		err = copyFile(original, candidate)
	} else {
		err = asar.Rewrite(original, candidate, changes)
	}
	if err != nil {
		return nil, err
	}
	mode, err := os.Stat(i.Archive)
	if err != nil {
		return nil, err
	}
	if err = os.Chmod(candidate, mode.Mode().Perm()); err != nil {
		return nil, err
	}
	// Verify against the original to enforce the allowlist, then audit the
	// actual before/after pair so repeat applies and restores report correctly.
	if _, err = asar.VerifyCandidate(original, candidate, allowed(changes)); err != nil {
		return nil, err
	}
	if restore {
		raw, err := hashFile(candidate)
		if err != nil || raw != e.baseline(i) {
			return nil, errors.New("还原候选与原始备份不一致")
		}
		// The original may legitimately omit optional member integrity records.
		// The forward audit already verified original -> installed. Reverse its
		// size/hash observations once the complete original bytes are confirmed.
		for n := range report.Changes {
			ch := &report.Changes[n]
			ch.BeforeSize, ch.AfterSize = ch.AfterSize, ch.BeforeSize
			ch.BeforeSHA256, ch.AfterSHA256 = ch.AfterSHA256, ch.BeforeSHA256
		}
	} else {
		report, err = asar.VerifyCandidate(i.Archive, candidate, allowed(changes))
		if err != nil {
			return nil, err
		}
	}
	if err = e.unchanged(i, s); err != nil {
		return nil, err
	}
	if i.Platform == "darwin" {
		err = e.installMac(i, s, work, candidate)
	} else {
		err = e.installWindows(i, s, work, candidate)
	}
	if err != nil {
		return nil, err
	}
	return &Result{AuditReport: report, Committed: true, Warnings: warnings}, nil
}

func (e engine) installWindows(i detector.Installation, s snapshot, work, candidate string) (retErr error) {
	previous := filepath.Join(work, "previous-backup")
	dest := i.Archive + backupSuffix

	if !s.patched {
		bak := filepath.Join(work, "original.asar")
		if err := copyFile(i.Archive, bak); err != nil {
			return err
		}
		if h, err := hashFile(bak); err != nil || h != s.liveHash {
			return errors.New("复制原始备份时源包改变")
		}
		if err := e.unchanged(i, s); err != nil {
			return err
		}
		hadBackup := false
		if _, err := os.Lstat(dest); err == nil {
			if err := copyFile(dest, previous); err != nil {
				return err
			}
			hadBackup = true
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := os.Rename(bak, dest); err != nil {
			return err
		}
		defer func() {
			if retErr == nil {
				return
			}
			if err := regular(dest); err != nil {
				retErr = errors.Join(retErr, err)
				return
			}
			h, err := hashFile(dest)
			if err != nil || h != s.liveHash {
				retErr = errors.Join(retErr, errors.New("并发备份变更，保留现状"))
				return
			}
			if hadBackup {
				err = os.Rename(previous, dest)
			} else {
				err = os.Remove(dest)
			}
			retErr = errors.Join(retErr, err)
		}()
	}
	if err := e.unchanged(i, s); err != nil {
		return err
	}
	return os.Rename(candidate, i.Archive)
}

func (e engine) installMac(i detector.Installation, s snapshot, work, candidate string) error {
	staged := filepath.Join(work, "Antigravity.app")
	if err := safeBundle(i.Root); err != nil {
		return err
	}
	if err := e.copyBundle(i.Root, staged); err != nil {
		return err
	}
	if err := safeBundle(staged); err != nil {
		return err
	}
	clonedHash, err := bundleDigest(staged)
	if err != nil {
		return err
	}
	if clonedHash != s.bundleHash {
		return errors.New("复制所得整包与源快照不一致")
	}
	clone := relocate(i, staged)
	if err := validate(clone); err != nil {
		return err
	}
	if h, err := hashFile(clone.Archive); err != nil || h != s.liveHash {
		return errors.New("复制期间 ASAR 发生变化")
	}
	if !s.patched {
		bak := clone.Archive + backupSuffix
		if err := os.Remove(bak); err != nil && !os.IsNotExist(err) {
			return err
		}
		if err := copyFile(clone.Archive, bak); err != nil {
			return err
		}
	}
	if h, err := hashFile(clone.Archive + backupSuffix); err != nil || h != e.baseline(i) {
		return errors.New("副本内备份指纹不匹配")
	}
	info := filepath.Join(staged, "Contents", "Info.plist")
	if h, err := hashFile(info); err != nil || h != s.infoHash {
		return errors.New("复制期间 Info.plist 发生变化")
	}
	prev, err := asar.HeaderHash(clone.Archive)
	if err != nil {
		return err
	}
	next, err := asar.HeaderHash(candidate)
	if err != nil {
		return err
	}
	updated, err := updatePlist(info, prev, next)
	if err != nil {
		return err
	}
	if err = os.Rename(candidate, clone.Archive); err != nil {
		return err
	}
	if err = os.WriteFile(info, updated, 0600); err != nil {
		return err
	}
	if err = e.sign(staged); err != nil {
		return fmt.Errorf("副本签名未完成，原安装完整保留: %w", err)
	}
	if err = e.unchanged(i, s); err != nil {
		return err
	}
	// The old bundle moves into the private temp directory only upon success.
	return e.exchange(staged, i.Root)
}
func relocate(i detector.Installation, root string) detector.Installation {
	rel, _ := filepath.Rel(i.Root, i.Archive)
	i.Root = root
	i.Archive = filepath.Join(root, rel)
	return i
}
func safeBundle(root string) error {
	return filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type()&os.ModeSymlink != 0 {
			dest, err := filepath.EvalSymlinks(p)
			if err != nil {
				return err
			}
			r, err := filepath.Rel(root, dest)
			if err != nil || !filepath.IsLocal(r) {
				return fmt.Errorf("包内链接越界 %s", p)
			}
			// Absolute links may point back into the installed bundle after copying.
			link, err := os.Readlink(p)
			if err != nil {
				return err
			}
			if filepath.IsAbs(link) {
				return fmt.Errorf("包内绝对链接 %s", p)
			}
		} else if !d.IsDir() && !d.Type().IsRegular() {
			return fmt.Errorf("包内特殊文件 %s", p)
		}
		return nil
	})
}
func (e engine) backup(i detector.Installation, s snapshot) error {
	dst, err := e.backupPath()
	if err != nil {
		return err
	}
	if err = checkDir(filepath.Dir(dst)); err != nil {
		return err
	}
	if filepath.Clean(dst) == filepath.Clean(i.Root) {
		return errors.New("备份路径与当前安装相同")
	}
	// An existing verified, matching backup can be reused even after patching.
	if rel, err := filepath.Rel(i.Root, dst); err == nil && filepath.IsLocal(rel) {
		return errors.New("备份目的地位于安装目录内")
	}
	if _, err = os.Lstat(dst); err == nil {
		existing := relocate(i, dst)
		if err := validate(existing); err != nil {
			return err
		}
		if err := e.official(existing); err != nil {
			return err
		}
		if h, err := hashFile(existing.Archive); err != nil || h != e.baseline(i) {
			return errors.New("备份位置已存在其他版本")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if s.patched {
		return errors.New("汉化后的安装不能用作官方签名备份")
	}
	if err = e.official(i); err != nil {
		return err
	}
	if err = safeBundle(i.Root); err != nil {
		return err
	}
	temp, err := os.MkdirTemp(filepath.Dir(dst), ".ag-zh-backup-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temp)
	stage := filepath.Join(temp, "Antigravity.app")
	if err = e.copyBundle(i.Root, stage); err != nil {
		return err
	}
	copy := relocate(i, stage)
	if err = e.official(copy); err != nil {
		return err
	}
	if h, err := hashFile(copy.Archive); err != nil || h != s.liveHash {
		return errors.New("整包备份版本变化")
	}
	if err = e.unchanged(i, s); err != nil {
		return err
	}
	return os.Rename(stage, dst)
}
func RestoreOfficialApp(target string) error {
	if runtime.GOOS != "darwin" {
		return errors.New("整包还原仅适用于 macOS")
	}
	i, err := detector.Inspect(target)
	if err != nil {
		return err
	}
	return defaults().restoreOfficial(i)
}
func (e engine) restoreOfficial(i detector.Installation) error {
	if err := validate(i); err != nil {
		return err
	}
	if err := e.idle(i); err != nil {
		return err
	}
	unlock, err := lock(i.Root + ".zh-gui.lock")
	if err != nil {
		return err
	}
	defer unlock()
	var s snapshot
	var err2 error
	s.bundleHash, err2 = bundleDigest(i.Root)
	if err2 != nil {
		return err2
	}
	s.liveHash, err2 = hashFile(i.Archive)
	if err2 != nil {
		return err2
	}
	s.infoHash, err2 = hashFile(filepath.Join(i.Root, "Contents", "Info.plist"))
	if err2 != nil {
		return err2
	}
	backup, err := e.backupPath()
	if err != nil {
		return err
	}
	if backup == i.Root {
		return errors.New("备份与安装路径相同")
	}
	src := relocate(i, backup)
	if err = validate(src); err != nil {
		return err
	}
	if err = safeBundle(backup); err != nil {
		return err
	}
	if err = e.official(src); err != nil {
		return err
	}
	ver, err := packageVersion(src.Archive)
	if err != nil || ver != i.Version {
		return errors.New("整包备份版本不匹配")
	}
	expected, err := hashFile(src.Archive)
	if err != nil {
		return err
	}
	tmp, err := os.MkdirTemp(filepath.Dir(i.Root), ".ag-zh-restore-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	stage := filepath.Join(tmp, "Antigravity.app")
	if err = e.copyBundle(backup, stage); err != nil {
		return err
	}
	clone := relocate(i, stage)
	if err = validate(clone); err != nil {
		return err
	}
	if err = e.official(clone); err != nil {
		return err
	}
	if h, err := hashFile(clone.Archive); err != nil || h != expected {
		return errors.New("备份复制结果不符")
	}
	if err = e.unchanged(i, s); err != nil {
		return err
	}
	return e.exchange(stage, i.Root)
}

func (e engine) protectBackup(i detector.Installation) error {
	if i.Platform != "darwin" {
		return nil
	}
	dst, err := e.backupPath()
	if err != nil {
		return err
	}
	if strings.EqualFold(filepath.Clean(dst), filepath.Clean(i.Root)) {
		return errors.New("官方备份路径不可用作补丁目标")
	}
	info, err := os.Stat(dst)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	live, err := os.Stat(i.Root)
	if err != nil {
		return err
	}
	if os.SameFile(live, info) {
		return errors.New("安装目标与官方备份是同一文件")
	}
	return nil
}
