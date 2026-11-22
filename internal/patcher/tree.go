package patcher

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
)

// Fingerprint the complete bundle being replaced, including link targets,
// file modes and bytes. A concurrent update to an unrelated asset must also
// prevent swapping an older staged copy over the newer bundle.
func bundleDigest(root string) (string, error) {
	h := sha256.New()
	field := func(v string) {
		var l [8]byte
		binary.BigEndian.PutUint64(l[:], uint64(len(v)))
		h.Write(l[:])
		h.Write([]byte(v))
	}
	err := filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		st, err := os.Lstat(p)
		if err != nil {
			return err
		}
		field(filepath.ToSlash(rel))
		field(fmt.Sprintf("%o", st.Mode()))
		switch {
		case st.IsDir():
			return nil
		case st.Mode()&os.ModeSymlink != 0:
			link, err := os.Readlink(p)
			if err != nil {
				return err
			}
			field(link)
		case st.Mode().IsRegular():
			sum, err := hashFile(p)
			if err != nil {
				return err
			}
			field(sum)
		default:
			return fmt.Errorf("包内出现特殊文件 %s", p)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
