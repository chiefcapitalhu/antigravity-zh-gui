// Package asar reads and audits Electron archives without unpacking paths onto disk.
package asar

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxHeader = 64 << 20
const blockSize = 4 << 20

type entry struct {
	name   string
	fields map[string]any
	kind   string
	offset int64 // relative to the start of the payload
	size   int64
}

type archive struct {
	file      *os.File
	start     int64
	length    int64
	root      map[string]any
	header    []byte
	entries   map[string]*entry
	pathBytes int      // limit retained, fully qualified names even for deep trees
	packed    []*entry // in physical order, with empty files first at a shared offset
}

// decodeValue retains unknown attributes and rejects duplicate keys, including
// escaped equivalent names. A plain json.Unmarshal would silently take the last.
func decodeValue(d *json.Decoder, depth int, budget *int) (any, error) {
	*budget = *budget - 1
	if depth > 256 || *budget < 0 {
		return nil, errors.New("ASAR header exceeds structural limits")
	}
	token, err := d.Token()
	if err != nil {
		return nil, err
	}
	switch token {
	case json.Delim('{'):
		obj := make(map[string]any)
		for d.More() {
			key, err := d.Token()
			if err != nil {
				return nil, err
			}
			name, ok := key.(string)
			if !ok {
				return nil, errors.New("invalid JSON object key")
			}
			if _, exists := obj[name]; exists {
				return nil, fmt.Errorf("duplicate ASAR key %q", name)
			}
			obj[name], err = decodeValue(d, depth+1, budget)
			if err != nil {
				return nil, err
			}
		}
		end, err := d.Token()
		if err != nil || end != json.Delim('}') {
			return nil, errors.New("unterminated JSON object")
		}
		return obj, nil
	case json.Delim('['):
		var values []any
		for d.More() {
			value, err := decodeValue(d, depth+1, budget)
			if err != nil {
				return nil, err
			}
			values = append(values, value)
		}
		end, err := d.Token()
		if err != nil || end != json.Delim(']') {
			return nil, errors.New("unterminated JSON array")
		}
		if values == nil {
			values = []any{}
		}
		return values, nil
	default:
		return token, nil
	}
}

func openArchive(path string) (*archive, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	a, err := parse(f)
	if err != nil {
		f.Close()
	}
	return a, err
}

func parse(f *os.File) (*archive, error) {
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !st.Mode().IsRegular() {
		return nil, errors.New("ASAR source is not a regular file")
	}
	var prefix [16]byte
	if _, err := f.ReadAt(prefix[:], 0); err != nil {
		return nil, err
	}
	word := binary.LittleEndian.Uint32
	size := int64(word(prefix[12:]))
	aligned := (size + 3) &^ 3
	start := 16 + aligned
	if word(prefix[:]) != 4 || int64(word(prefix[4:])) != aligned+8 ||
		int64(word(prefix[8:])) != aligned+4 || size == 0 || size > maxHeader || start > st.Size() {
		return nil, errors.New("invalid ASAR pickle lengths")
	}
	padded := make([]byte, aligned)
	if _, err := f.ReadAt(padded, 16); err != nil {
		return nil, err
	}
	for _, v := range padded[size:] {
		if v != 0 {
			return nil, errors.New("nonzero ASAR padding")
		}
	}
	header := padded[:size]
	if !utf8.Valid(header) {
		return nil, errors.New("ASAR header is not UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(header))
	d.UseNumber()
	budget := 1_000_000
	value, err := decodeValue(d, 0, &budget)
	if err != nil {
		return nil, err
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, errors.New("extra ASAR header data")
	}
	root, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("invalid ASAR root")
	}
	a := &archive{file: f, start: start, length: st.Size(), header: header, root: root, entries: make(map[string]*entry)}
	rootEntry, err := a.index("", root)
	if err != nil {
		return nil, err
	}
	if rootEntry.kind != "dir" {
		return nil, errors.New("ASAR root is not a directory")
	}
	sort.Slice(a.packed, func(i, j int) bool {
		x, y := a.packed[i], a.packed[j]
		if x.offset != y.offset {
			return x.offset < y.offset
		}
		if x.size != y.size {
			return x.size < y.size
		}
		return x.name < y.name
	})
	var end int64
	for _, e := range a.packed {
		if e.offset < end {
			return nil, fmt.Errorf("overlapping ASAR extent at %q", e.name)
		}
		end = e.offset + e.size
	}
	return a, nil
}

func (a *archive) index(path string, fields map[string]any) (*entry, error) {
	if len(path) > 32<<10 || len(path) > maxHeader-a.pathBytes {
		return nil, errors.New("ASAR paths exceed structural limits")
	}
	a.pathBytes += len(path)
	e := &entry{name: path, fields: fields}
	a.entries[path] = e
	for _, attr := range []string{"unpacked", "executable"} {
		if value, exists := fields[attr]; exists {
			if _, ok := value.(bool); !ok {
				return nil, fmt.Errorf("invalid %s on %q", attr, path)
			}
		}
	}
	_, hasFiles := fields["files"]
	_, hasLink := fields["link"]
	_, hasOffset := fields["offset"]
	_, hasSize := fields["size"]
	switch {
	case hasFiles:
		children, ok := fields["files"].(map[string]any)
		if !ok || hasLink || hasOffset || hasSize {
			return nil, fmt.Errorf("invalid directory %q", path)
		}
		e.kind = "dir"
		for name, raw := range children {
			if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\\\x00") {
				return nil, fmt.Errorf("invalid ASAR name %q", name)
			}
			child, ok := raw.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("invalid ASAR member %q", name)
			}
			member := name
			if path != "" {
				member = path + "/" + name
			}
			if _, err := a.index(member, child); err != nil {
				return nil, err
			}
		}
	case hasLink:
		target, ok := fields["link"].(string)
		if !ok || target == "" || hasSize || hasOffset {
			return nil, fmt.Errorf("invalid ASAR link %q", path)
		}
		e.kind = "link"
	default:
		size, ok := fields["size"].(json.Number)
		n, err := size.Int64()
		if !ok || err != nil || n < 0 {
			return nil, fmt.Errorf("invalid size on %q", path)
		}
		e.size = n
		if fields["unpacked"] == true {
			if hasOffset {
				return nil, fmt.Errorf("unexpected offset on unpacked %q", path)
			}
			e.kind = "unpacked"
			break
		}
		offset, ok := fields["offset"].(string)
		u, err := strconv.ParseUint(offset, 10, 63)
		limit := a.length - a.start
		if !ok || err != nil || u > uint64(limit) || n > limit-int64(u) {
			return nil, fmt.Errorf("invalid payload extent on %q", path)
		}
		e.kind, e.offset = "packed", int64(u)
		a.packed = append(a.packed, e)
	}
	return e, nil
}

func (a *archive) content(e *entry) *io.SectionReader {
	return io.NewSectionReader(a.file, a.start+e.offset, e.size)
}

// HeaderHash returns the SHA-256 of the unpadded, original header JSON.
func HeaderHash(archivePath string) (string, error) {
	a, err := openArchive(archivePath)
	if err != nil {
		return "", err
	}
	defer a.file.Close()
	sum := sha256.Sum256(a.header)
	return hex.EncodeToString(sum[:]), nil
}

// ReadFile reads a named packed member; neither archive links nor external
// unpacked paths are resolved. This in-memory helper is limited to 256 MiB.
func ReadFile(archivePath, member string) ([]byte, error) {
	a, err := openArchive(archivePath)
	if err != nil {
		return nil, err
	}
	defer a.file.Close()
	e := a.entries[member]
	if e == nil || e.kind != "packed" || e.size > 256<<20 {
		return nil, fmt.Errorf("not a readable packed member: %q", member)
	}
	buf := make([]byte, e.size)
	_, err = io.ReadFull(a.content(e), buf)
	return buf, err
}
