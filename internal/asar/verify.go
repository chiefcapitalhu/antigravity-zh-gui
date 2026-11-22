package asar

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"reflect"
	"sort"
)

type Change struct {
	Path         string `json:"path"`
	BeforeSize   int64  `json:"beforeSize"`
	AfterSize    int64  `json:"afterSize"`
	BeforeSHA256 string `json:"beforeSHA256"`
	AfterSHA256  string `json:"afterSHA256"`
}

type AuditReport struct {
	FileCount int      `json:"fileCount"`
	Changes   []Change `json:"changes"`
}

func stableFields(e *entry) map[string]any {
	fields := maps.Clone(e.fields)
	switch e.kind {
	case "dir":
		delete(fields, "files")
	case "packed":
		delete(fields, "offset")
		delete(fields, "size")
		delete(fields, "integrity")
		if extra := integrityExtras(e.fields["integrity"]); len(extra) > 0 {
			fields["integrity"] = extra
		}
	}
	return fields
}

// Additional integrity attributes are not part of the rewrite contract.
func integrityExtras(value any) map[string]any {
	m, _ := value.(map[string]any)
	extra := maps.Clone(m)
	for _, name := range []string{"algorithm", "hash", "blockSize", "blocks"} {
		delete(extra, name)
	}
	return extra
}

func contentsEqual(a, b *archive, x, y *entry, left, right []byte) (bool, error) {
	if x.size != y.size {
		return false, nil
	}
	old, next := a.content(x), b.content(y)
	for remaining := x.size; remaining > 0; {
		n := min(remaining, int64(len(left)))
		if _, err := io.ReadFull(old, left[:n]); err != nil {
			return false, err
		}
		if _, err := io.ReadFull(next, right[:n]); err != nil {
			return false, err
		}
		if !bytes.Equal(left[:n], right[:n]) {
			return false, nil
		}
		remaining -= n
	}
	return true, nil
}

func hashMember(a *archive, e *entry) (string, error) {
	hash := sha256.New()
	if _, err := io.CopyN(hash, a.content(e), e.size); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// checkIntegrity validates recorded digests against the candidate. Original
// archives may omit integrity; every changed file must carry fresh 4 MiB blocks.
func checkIntegrity(a *archive, e *entry, changed bool) (string, error) {
	value, exists := e.fields["integrity"]
	if !exists && !changed {
		return "", nil
	}
	m, ok := value.(map[string]any)
	if !ok || m["algorithm"] != "SHA256" {
		return "", errors.New("invalid integrity algorithm")
	}
	number, ok := m["blockSize"].(json.Number)
	block, err := number.Int64()
	if !ok || err != nil || block < 1 || (changed && block != blockSize) {
		return "", errors.New("invalid integrity block size")
	}
	parts, ok := m["blocks"].([]any)
	wantCount := e.size / block
	if e.size%block != 0 {
		wantCount++
	}
	if e.size == 0 && len(parts) == 1 {
		wantCount = 1
	}
	if !ok || int64(len(parts)) != wantCount {
		return "", errors.New("invalid integrity block count")
	}
	data, err := digestContents(a.content(e), e.size, block)
	if err != nil {
		return "", err
	}
	sum := data["hash"].(string)
	if m["hash"] != sum {
		return "", errors.New("whole-file digest mismatch")
	}
	hashes := data["blocks"].([]string)
	for i, v := range parts {
		if v != hashes[i] {
			return "", fmt.Errorf("block %d digest mismatch", i)
		}
	}
	return sum, nil
}

// gapHash accounts for bytes not referenced by a file, including trailing
// padding. They may move when a file grows, but must not change.
func gapHash(a *archive) (string, error) {
	hash := sha256.New()
	cursor := a.start
	for _, e := range a.packed {
		start := a.start + e.offset
		if err := copyRange(hash, a.file, cursor, start-cursor); err != nil {
			return "", err
		}
		cursor = start + e.size
	}
	if err := copyRange(hash, a.file, cursor, a.length-cursor); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// VerifyCandidate compares packed bytes, tree shape, member attributes and
// integrity records. Unpacked files and symlinks have no payload in the ASAR:
// their complete descriptors are compared without accessing external files.
func VerifyCandidate(sourcePath, candidatePath string, allowlist map[string]bool) (*AuditReport, error) {
	old, err := openArchive(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("source: %w", err)
	}
	defer old.file.Close()
	next, err := openArchive(candidatePath)
	if err != nil {
		return nil, fmt.Errorf("candidate: %w", err)
	}
	defer next.file.Close()
	if len(old.entries) != len(next.entries) {
		return nil, errors.New("ASAR tree size changed")
	}
	for name, allowed := range allowlist {
		if allowed && (old.entries[name] == nil || old.entries[name].kind != "packed") {
			return nil, fmt.Errorf("invalid allowlisted member %q", name)
		}
	}
	report := &AuditReport{Changes: []Change{}}
	left, right := make([]byte, 32<<10), make([]byte, 32<<10)
	for name, x := range old.entries {
		y := next.entries[name]
		if y == nil || x.kind != y.kind || !reflect.DeepEqual(stableFields(x), stableFields(y)) {
			return nil, fmt.Errorf("ASAR member or metadata changed: %q", name)
		}
		if x.kind == "dir" {
			continue
		}
		report.FileCount++
		if x.kind != "packed" {
			continue
		}
		same, err := contentsEqual(old, next, x, y, left, right)
		if err != nil {
			return nil, err
		}
		beforeIntegrity, hadIntegrity := x.fields["integrity"]
		afterIntegrity, hasIntegrity := y.fields["integrity"]
		changed := !same || hadIntegrity != hasIntegrity || !reflect.DeepEqual(beforeIntegrity, afterIntegrity)
		if changed && !allowlist[name] {
			return nil, fmt.Errorf("unexpected change outside allowlist: %q", name)
		}
		after, err := checkIntegrity(next, y, changed)
		if err != nil {
			return nil, fmt.Errorf("%q: %w", name, err)
		}
		if changed {
			before, err := hashMember(old, x)
			if err != nil {
				return nil, err
			}
			report.Changes = append(report.Changes, Change{
				Path: name, BeforeSize: x.size, AfterSize: y.size,
				BeforeSHA256: before, AfterSHA256: after,
			})
		}
	}
	oldGap, err := gapHash(old)
	if err != nil {
		return nil, err
	}
	newGap, err := gapHash(next)
	if err != nil {
		return nil, err
	}
	if oldGap != newGap {
		return nil, errors.New("unreferenced ASAR payload changed")
	}
	sort.Slice(report.Changes, func(i, j int) bool { return report.Changes[i].Path < report.Changes[j].Path })
	return report, nil
}
