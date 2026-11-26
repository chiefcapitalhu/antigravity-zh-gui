// Package app exposes the same local operations to the browser and CLI.
package app

import (
	"errors"
	"os"

	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/internal/detector"
	"antigravity-zh-gui/internal/patcher"
)

// Version may be set from the release tag at link time.
var Version = "0.2.4"

type Service struct {
	store config.Store
}

func New() (*Service, error) {
	store, err := config.Open("")
	if err != nil {
		return nil, err
	}
	return &Service{store: store}, nil
}

func (s *Service) Preferences() (config.Preferences, error)   { return s.store.LoadPreferences() }
func (s *Service) SavePreferences(p config.Preferences) error { return s.store.SavePreferences(p) }
func (s *Service) Dictionary() (map[string]string, error)     { return s.store.LoadDictionary() }
func (s *Service) SaveDictionary(d map[string]string) error   { return s.store.SaveDictionary(d) }

func (s *Service) EditDictionary(en string, zh *string) (map[string]string, error) {
	return s.store.EditDictionary(en, zh)
}

// Status reports observable state. A nil running or localized field means
// that its probe failed. Backup flags describe presence, not authentication.
type Status struct {
	Target    string   `json:"target"`
	Version   string   `json:"version"`
	Platform  string   `json:"platform"`
	Running   *bool    `json:"running"`
	Localized *bool    `json:"localized"`
	Degraded  bool     `json:"degraded,omitempty"`
	Backup    bool     `json:"backup"`
	BackupApp bool     `json:"backupApp"`
	Signature string   `json:"signature"`
	Warnings  []string `json:"warnings"`
}

func (s *Service) Status(target string) (*Status, error) {
	if err := config.ValidateTarget(target); err != nil {
		return nil, err
	}
	i, err := detector.Inspect(target)
	if err != nil {
		return nil, err
	}
	status := &Status{Target: i.Root, Version: i.Version, Platform: i.Platform, Warnings: []string{}}
	running, err := detector.Running(i)
	if err != nil {
		status.Warnings = append(status.Warnings, "进程检测失败："+err.Error())
	} else {
		status.Running = &running
	}
	localized, degraded, err := patcher.LocalizedDetail(i)
	if err != nil {
		status.Warnings = append(status.Warnings, "读取汉化标记失败："+err.Error())
	} else {
		status.Localized = &localized
		status.Degraded = degraded
		if degraded {
			status.Warnings = append(status.Warnings, "当前客户端（"+i.Version+"）仅处于降级部分汉化状态：主界面汉化、菜单与快捷键热切换未注入（仅修改了少量原生弹窗），请更新汉化工具以完整适配该版本。")
		}
	}
	present := func(path string, dir bool) bool {
		st, err := os.Lstat(path)
		if errors.Is(err, os.ErrNotExist) {
			return false
		}
		if err != nil {
			status.Warnings = append(status.Warnings, err.Error())
			return false
		}
		if (dir && st.IsDir()) || (!dir && st.Mode().IsRegular()) {
			return true
		}
		status.Warnings = append(status.Warnings, "备份类型异常："+path)
		return false
	}
	status.Backup = present(i.Archive+patcher.BackupSuffix, false)
	if i.Platform == "darwin" {
		path, err := patcher.OfficialBackupPath()
		if err != nil {
			status.Warnings = append(status.Warnings, err.Error())
		} else {
			status.BackupApp = present(path, true)
		}
	}
	status.Signature, err = detector.SignatureDescription(i)
	if err != nil {
		status.Warnings = append(status.Warnings, err.Error())
	}
	return status, nil
}

// Execute accepts a fixed action name. Keep an empty target intact so the
// patcher distinguishes default installs from explicitly selected copies.
func (s *Service) Execute(action string, p config.Preferences, progress func(string)) (*patcher.Result, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}
	if progress == nil {
		progress = func(string) {}
	}
	switch action {
	case "apply":
		progress("读取本地词典及界面偏好")
		dict, err := s.Dictionary()
		if err != nil {
			return nil, err
		}
		return patcher.Apply(p.Target, patcher.Options{BackupApp: p.BackupApp, Preferences: &p, Custom: dict, Progress: progress})
	case "restore":
		return patcher.RestoreWithProgress(p.Target, progress)
	case "verify":
		progress("核对安装基线、归档目录和文件摘要")
		report, err := patcher.Verify(p.Target)
		if err != nil {
			return nil, err
		}
		return &patcher.Result{AuditReport: report}, nil
	case "restore-app":
		progress("核对整包备份的发行方签名和版本并还原")
		return patcher.RestoreOfficialAppWithReport(p.Target)
	default:
		return nil, errors.New("未知操作")
	}
}
