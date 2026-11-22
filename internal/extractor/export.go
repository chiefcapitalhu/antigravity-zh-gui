package extractor

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func inside(root, path string) bool {
	if root == "" {
		return false
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && (rel == "." || filepath.IsLocal(rel))
}

// Export claims a fresh directory and creates only named report files.
// Resolve the existing parent before checking containment to catch aliases.
func Export(out, installRoot string, c *Catalog, delta *Delta) (err error) {
	abs, err := filepath.Abs(out)
	if err != nil {
		return err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(abs))
	if err != nil {
		return err
	}
	dst := filepath.Join(parent, filepath.Base(abs))
	install, err := filepath.EvalSymlinks(installRoot)
	if err != nil {
		return err
	}
	if inside(install, dst) {
		return errors.New("不能向客户端目录导出")
	}
	for p := dst; ; p = filepath.Dir(p) {
		base := strings.ToLower(filepath.Base(p))
		if strings.HasSuffix(base, ".app") || base == ".gemini" {
			return errors.New("不能向应用包或用户会话目录导出")
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	if err = os.Mkdir(dst, 0700); err != nil {
		return fmt.Errorf("导出需要尚不存在的目录（上级须已存在）: %w", err)
	}
	var created []string
	defer func() {
		if err != nil {
			for _, p := range created {
				os.Remove(p)
			}
			os.Remove(dst)
		}
	}()
	write := func(name string, v any) error {
		path := filepath.Join(dst, name)
		f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		created = append(created, path)
		encoder := json.NewEncoder(f)
		encoder.SetIndent("", "  ")
		err = encoder.Encode(v)
		if err == nil {
			err = f.Sync()
		}
		return errors.Join(err, f.Close())
	}
	if err = write("candidates.json", c); err != nil {
		return err
	}
	if delta != nil {
		err = write("diff.json", delta)
	}
	return err
}
