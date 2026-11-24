package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	"antigravity-zh-gui/internal/app"
	"antigravity-zh-gui/internal/config"
	"antigravity-zh-gui/internal/server"
)

const usage = `Antigravity 可视化汉化工具
双击或无参数运行可打开本地控制台。

  antigravity-zh-gui status  [--target 安装路径]
  antigravity-zh-gui apply   [--target 安装路径] [--hotkey=true] [--default-lang=zh|en] [--brand=keep|hide] [--backup-app]
  antigravity-zh-gui restore [--target 安装路径] [--backup-app]
  antigravity-zh-gui verify  [--target 安装路径]
  antigravity-zh-gui extract [--target 安装路径] [--out 新目录] [--verify 词典目录] [--diff 旧版清单] [--live --live-origin 本机地址]

restore 默认还原归档里的英文资源。macOS 的 restore --backup-app 从已验证的官方整包备份恢复。
`

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string, out, diagnostics io.Writer) error {
	if len(args) == 0 {
		svc, err := app.New()
		if err != nil {
			return err
		}
		ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
		defer cancel()
		return server.Run(ctx, svc, out)
	}
	action := args[0]
	switch action {
	case "-h", "--help", "help":
		_, err := io.WriteString(out, usage)
		return err
	case "--version", "-version", "version":
		_, err := fmt.Fprintln(out, app.Version)
		return err
	case "extract":
		return extract(args[1:], out, diagnostics)
	case "status", "apply", "restore", "verify":
	default:
		return fmt.Errorf("未知子命令 %q，可用 --help 查看用法", action)
	}
	f := flag.NewFlagSet(action, flag.ContinueOnError)
	f.SetOutput(diagnostics)
	target := f.String("target", "", "指定安装目录或 app.asar 的路径")
	defaults := config.Defaults()
	fullRestore := false
	if action == "apply" {
		f.BoolVar(&defaults.Hotkey, "hotkey", defaults.Hotkey, "启用中英文切换快捷键")
		f.StringVar(&defaults.DefaultLang, "default-lang", defaults.DefaultLang, "默认语言 zh 或 en")
		f.StringVar(&defaults.Brand, "brand", defaults.Brand, "品牌显示 keep 或 hide")
		f.BoolVar(&defaults.BackupApp, "backup-app", false, "保留官方签名的 macOS 整包备份")
	}
	if action == "restore" {
		f.BoolVar(&fullRestore, "backup-app", false, "从官方签名的 macOS 整包备份还原")
	}
	if err := f.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if f.NArg() != 0 {
		return fmt.Errorf("%s 不接受额外的位置参数", action)
	}
	svc, err := app.New()
	if err != nil {
		return err
	}
	// Only apply consumes saved presentation options. A restore or read-only
	// probe with an explicit target still works if preferences need repair.
	specified := map[string]bool{}
	f.Visit(func(opt *flag.Flag) { specified[opt.Name] = true })
	p := config.Defaults()
	if action == "apply" || !specified["target"] {
		p, err = svc.Preferences()
		if err != nil {
			return err
		}
	}
	if specified["target"] {
		p.Target = *target
		if p.Target != "" {
			p.Target, err = filepath.Abs(p.Target)
			if err != nil {
				return err
			}
		}
	}
	if specified["hotkey"] {
		p.Hotkey = defaults.Hotkey
	}
	if specified["default-lang"] {
		p.DefaultLang = defaults.DefaultLang
	}
	if specified["brand"] {
		p.Brand = defaults.Brand
	}
	if action == "apply" && specified["backup-app"] {
		p.BackupApp = defaults.BackupApp
	}
	if err := p.Validate(); err != nil {
		return err
	}

	encoder := json.NewEncoder(out)
	encoder.SetIndent("", "  ")
	if action == "status" {
		status, err := svc.Status(p.Target)
		if err != nil {
			return err
		}
		return encoder.Encode(status)
	}
	if fullRestore {
		action = "restore-app"
	}
	start := time.Now()
	result, err := svc.Execute(action, p, func(msg string) {
		fmt.Fprintf(diagnostics, "[%s] %s\n", time.Since(start).Round(time.Millisecond), msg)
	})
	if err != nil {
		return err
	}
	if result != nil {
		for _, warning := range result.Warnings {
			fmt.Fprintln(diagnostics, "提醒", warning.Error())
		}
	}
	return encoder.Encode(result)
}
