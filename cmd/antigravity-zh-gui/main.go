package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"antigravity-zh-gui/internal/detector"
	"antigravity-zh-gui/internal/extractor"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run(args []string, out, diagnostics io.Writer) error {
	if len(args) == 0 || args[0] != "extract" {
		return errors.New("用法: antigravity-zh-gui extract [--target 安装路径] [--out 新目录] [--verify 词典目录] [--diff 旧版候选清单] [--live --live-origin 本机地址]")
	}
	f := flag.NewFlagSet("extract", flag.ContinueOnError)
	f.SetOutput(diagnostics)
	target := f.String("target", "", "本机安装路径，缺省自动探测")
	dest := f.String("out", "antigravity-strings", "新建导出目录（上级目录须已存在）")
	verify := f.String("verify", "", "重放五个词典模块中的来源证据")
	diff := f.String("diff", "", "与指定的旧版 candidates.json 比较")
	live := f.Bool("live", false, "额外只读获取本机 Hub 的静态 main.js")
	origin := f.String("live-origin", "", "明确指定 http(s)://127.0.0.1:端口，仅与 --live 同用")
	if err := f.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if f.NArg() != 0 {
		return errors.New("extract 不接受额外的位置参数")
	}
	if *live != (*origin != "") {
		return errors.New("--live 需要 --live-origin 指定本机地址")
	}
	i, err := detector.Inspect(*target)
	if err != nil {
		return err
	}
	sources, err := extractor.Load(i)
	if err != nil {
		return err
	}
	if *live {
		if err := sources.Live(context.Background(), *origin); err != nil {
			return err
		}
	}
	c, err := sources.Candidates()
	if err != nil {
		return err
	}
	if *verify != "" {
		entries, err := sources.VerifyLocales(*verify)
		if err != nil {
			return err
		}
		c.Include(entries)
		fmt.Fprintf(out, "已重放五个模块的 %d 个独立原文位置\n", len(entries))
	}
	var delta *extractor.Delta
	if *diff != "" {
		old, err := extractor.ReadCatalog(*diff)
		if err != nil {
			return err
		}
		d := extractor.Compare(old, c)
		delta = &d
	}
	if err := extractor.Export(*dest, i.Root, c, delta); err != nil {
		return err
	}
	for _, w := range c.Warnings {
		fmt.Fprintln(diagnostics, "资源提示:", w)
	}
	fmt.Fprintf(out, "Antigravity %s，%d 个来源，%d 个候选位置。输出 %s\n", c.Version, len(c.Sources), len(c.Entries), filepath.Join(*dest, "candidates.json"))
	return nil
}
