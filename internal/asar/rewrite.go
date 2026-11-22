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
	"math"
	"os"
	"strconv"
)

func digestContents(reader io.Reader, size, block int64) (map[string]any, error) {
	if block <= 0 {
		return nil, errors.New("invalid ASAR hash block size")
	}
	whole := sha256.New()
	parts := make([]string, 0)
	buffer := make([]byte, 32<<10)
	for remaining := size; ; {
		n := min(remaining, block)
		part := sha256.New()
		copied, err := io.CopyBuffer(io.MultiWriter(whole, part), io.LimitReader(reader, n), buffer)
		if err != nil {
			return nil, err
		}
		if copied != n {
			return nil, io.ErrUnexpectedEOF
		}
		parts = append(parts, hex.EncodeToString(part.Sum(nil)))
		remaining -= n
		if remaining == 0 {
			break
		}
	}
	return map[string]any{
		"algorithm": "SHA256", "blockSize": block,
		"hash": hex.EncodeToString(whole.Sum(nil)), "blocks": parts,
	}, nil
}

func copyRange(w io.Writer, f *os.File, offset, n int64) error {
	if n == 0 {
		return nil
	}
	_, err := io.CopyN(w, io.NewSectionReader(f, offset, n), n)
	return err
}

func (a *archive) makeHeader(replacements map[string][]byte) ([]byte, error) {
	for name := range replacements {
		e := a.entries[name]
		if e == nil || e.kind != "packed" {
			return nil, fmt.Errorf("cannot replace ASAR member %q", name)
		}
	}
	var cursor, oldEnd int64
	for _, e := range a.packed {
		gap := e.offset - oldEnd
		if gap > math.MaxInt64-cursor {
			return nil, errors.New("candidate offset overflow")
		}
		cursor += gap
		e.fields["offset"] = strconv.FormatInt(cursor, 10)
		nextSize := e.size
		if value, ok := replacements[e.name]; ok {
			nextSize = int64(len(value))
			integrity, err := digestContents(bytes.NewReader(value), nextSize, blockSize)
			if err != nil {
				return nil, err
			}
			for key, attr := range integrityExtras(e.fields["integrity"]) {
				integrity[key] = attr
			}
			e.fields["size"], e.fields["integrity"] = nextSize, integrity
		}
		if nextSize > math.MaxInt64-cursor {
			return nil, errors.New("candidate size overflow")
		}
		cursor += nextSize
		oldEnd = e.offset + e.size
	}
	header, err := json.Marshal(a.root)
	if err != nil {
		return nil, err
	}
	if len(header) > maxHeader {
		return nil, errors.New("candidate header exceeds limit")
	}
	return header, nil
}

func writeHeader(w io.Writer, header []byte) error {
	size := len(header)
	aligned := (size + 3) &^ 3
	var prefix [16]byte
	for i, value := range []int{4, aligned + 8, aligned + 4, size} {
		binary.LittleEndian.PutUint32(prefix[i*4:], uint32(value))
	}
	if _, err := w.Write(prefix[:]); err != nil {
		return err
	}
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(make([]byte, aligned-size))
	return err
}

// Rewrite creates a new candidate. Input paths inside the archive are looked up
// as exact keys. Existing filesystem destinations are never overwritten.
func Rewrite(sourcePath, candidatePath string, replacements map[string][]byte) (err error) {
	a, err := openArchive(sourcePath)
	if err != nil {
		return err
	}
	defer a.file.Close()
	var header []byte
	if len(replacements) > 0 {
		header, err = a.makeHeader(replacements)
		if err != nil {
			return err
		}
	}
	out, err := os.OpenFile(candidatePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer func() {
		closeErr := out.Close()
		if err == nil {
			err = closeErr
		}
		if err != nil {
			err = errors.Join(err, os.Remove(candidatePath))
		}
	}()
	if header == nil {
		return copyRange(out, a.file, 0, a.length)
	}
	if err := writeHeader(out, header); err != nil {
		return err
	}
	cursor := a.start
	for _, e := range a.packed {
		start := a.start + e.offset
		if err := copyRange(out, a.file, cursor, start-cursor); err != nil {
			return err
		}
		if value, ok := replacements[e.name]; ok {
			if _, err := out.Write(value); err != nil {
				return err
			}
		} else if err := copyRange(out, a.file, start, e.size); err != nil {
			return err
		}
		cursor = start + e.size
	}
	return copyRange(out, a.file, cursor, a.length-cursor)
}
