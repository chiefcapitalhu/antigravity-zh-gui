package asar

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Construct fixtures independently of the production writer.
func fixture(t *testing.T, header string, body []byte) string {
	t.Helper()
	n := len(header)
	padding := (4 - n%4) % 4
	data := make([]byte, 16+n+padding)
	binary.LittleEndian.PutUint32(data, 4)
	binary.LittleEndian.PutUint32(data[4:], uint32(n+padding+8))
	binary.LittleEndian.PutUint32(data[8:], uint32(n+padding+4))
	binary.LittleEndian.PutUint32(data[12:], uint32(n))
	copy(data[16:], header)
	path := filepath.Join(t.TempDir(), "sample.asar")
	if err := os.WriteFile(path, append(data, body...), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func read(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func sum(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

const recipe = `{
  "files": {
    "dist": {"files":{"label.js":{"size":2,"offset":"1","executable":true},"empty":{"size":0,"offset":"3"}}},
    "kept":{"size":4,"offset":"5","project-tag":"keep"},
    "outside":{"unpacked":true,"size":71,"executable":true},
    "alias":{"link":"dist/label.js"},
    "empty-dir":{"files":{},"unpacked":true}
  },
  "build":"unit fixture"
}`

func TestRoundTripAndLimits(t *testing.T) {
	path := fixture(t, recipe, []byte(".OK__keep!"))
	candidate := filepath.Join(t.TempDir(), "candidate")
	h, err := HeaderHash(path)
	if err != nil || h != sum([]byte(recipe)) {
		t.Fatalf("header hash %q: %v", h, err)
	}
	if err := Rewrite(path, candidate, nil); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(read(t, path), read(t, candidate)) {
		t.Fatal("identity rewrite lost original bytes")
	}
	audit, err := VerifyCandidate(path, candidate, nil)
	if err != nil || len(audit.Changes) != 0 || audit.FileCount != 5 {
		t.Fatalf("identity audit %+v: %v", audit, err)
	}
	for _, name := range []string{"outside", "alias", "dist", "../kept", "dist/./label.js", "unknown"} {
		if _, err := ReadFile(path, name); err == nil {
			t.Errorf("read %q", name)
		}
		bad := filepath.Join(t.TempDir(), "bad.asar")
		if err := Rewrite(path, bad, map[string][]byte{name: nil}); err == nil {
			t.Errorf("rewrote %q", name)
		}
		if _, err := os.Stat(bad); !os.IsNotExist(err) {
			t.Errorf("failed rewrite left %q", bad)
		}
	}
	if err := Rewrite(path, candidate, nil); err == nil {
		t.Fatal("overwrote an existing candidate")
	}
	if err := Rewrite(path, path, nil); err == nil {
		t.Fatal("overwrote source")
	}
}

func TestRewriteAndVerify(t *testing.T) {
	path := fixture(t, recipe, []byte(".OK__keep!"))
	old := read(t, path)
	candidate := filepath.Join(t.TempDir(), "candidate")
	value := bytes.Repeat([]byte{42}, blockSize+6)
	if err := Rewrite(path, candidate, map[string][]byte{"dist/label.js": value}); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(old, read(t, path)) {
		t.Fatal("source changed")
	}
	got, err := ReadFile(candidate, "dist/label.js")
	if err != nil || !bytes.Equal(got, value) {
		t.Fatal("incorrect replaced bytes", err)
	}
	// Check offsets, alignment and hash block boundaries directly on raw bytes.
	data := read(t, candidate)
	headerSize := binary.LittleEndian.Uint32(data[12:])
	end := 16 + headerSize
	start := 8 + binary.LittleEndian.Uint32(data[4:])
	if start < end || start-end > 3 || start%4 != 0 {
		t.Fatal("bad output pickle")
	}
	wantPayload := append(append([]byte("."), value...), []byte("__keep!")...)
	if !bytes.Equal(data[start:], wantPayload) {
		t.Fatal("payload changed outside member")
	}
	var header struct {
		Files map[string]struct {
			Files map[string]struct {
				Integrity struct {
					Hash      string
					BlockSize int
					Blocks    []string
				}
			}
		}
	}
	if err := json.Unmarshal(data[16:end], &header); err != nil {
		t.Fatal(err)
	}
	meta := header.Files["dist"].Files["label.js"].Integrity
	if meta.BlockSize != blockSize || meta.Hash != sum(value) || len(meta.Blocks) != 2 ||
		meta.Blocks[0] != sum(value[:blockSize]) || meta.Blocks[1] != sum(value[blockSize:]) {
		t.Fatal("wrong member integrity")
	}
	allowed := map[string]bool{"dist/label.js": true}
	report, err := VerifyCandidate(path, candidate, allowed)
	if err != nil || len(report.Changes) != 1 {
		t.Fatalf("audit %+v: %v", report, err)
	}
	want := Change{"dist/label.js", 2, int64(len(value)), sum([]byte("OK")), sum(value)}
	if report.Changes[0] != want {
		t.Fatalf("change %+v, want %+v", report.Changes[0], want)
	}
	for _, denied := range []map[string]bool{nil, {"dist/label.js": false}, {"missing": true}} {
		if _, err := VerifyCandidate(path, candidate, denied); err == nil {
			t.Fatal("unexpected allowlist success", denied)
		}
	}
	if err := os.WriteFile(candidate, bytes.Replace(data, []byte(meta.Blocks[1]), []byte(strings.Repeat("0", 64)), 1), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyCandidate(path, candidate, allowed); err == nil {
		t.Fatal("stale block hash accepted")
	}
}

func TestTreeAndHiddenData(t *testing.T) {
	body := []byte(".OK__keep!")
	path := fixture(t, recipe, body)
	for _, pair := range [][2]string{
		{`"build":"unit fixture"`, `"build":"fake"`},
		{`"link":"dist/label.js"`, `"link":"kept"`},
		{`"size":71`, `"size":72`},
		{`"executable":true`, `"executable":false`},
		{`"project-tag":"keep"`, `"project-tag":"other"`},
		{`"empty-dir"`, `"different-dir"`},
		{`"empty-dir":{"files":{},"unpacked":true}`, `"empty-dir":{"files":{},"unpacked":false}`},
	} {
		candidate := fixture(t, strings.Replace(recipe, pair[0], pair[1], 1), body)
		if _, err := VerifyCandidate(path, candidate, map[string]bool{"dist/label.js": true}); err == nil {
			t.Errorf("accepted metadata mutation %v", pair)
		}
	}
	for _, payload := range []string{"?OK__keep!", ".OK_Akeep!", ".OK__keep?", ".OK__keep!extra", ".OK__KEEP!"} {
		if _, err := VerifyCandidate(path, fixture(t, recipe, []byte(payload)), nil); err == nil {
			t.Errorf("accepted changed bytes %s", payload)
		}
	}
}

func TestMalformed(t *testing.T) {
	for _, name := range []string{"", ".", "..", "../x", `a\b`, "a\x00b"} {
		key, err := json.Marshal(name)
		if err != nil {
			t.Fatal(err)
		}
		h := `{"files":{` + string(key) + `:{"size":0,"offset":"0"}}}`
		if _, err := HeaderHash(fixture(t, h, nil)); err == nil {
			t.Errorf("accepted name %q", name)
		}
	}
	for _, bad := range []string{
		`{"files":{"a":{"size":1,"offset":"9223372036854775807"}}}`,
		`{"files":{"a":{"size":9223372036854775808,"offset":"0"}}}`,
		`{"files":{"a":{"size":-1,"offset":"0"}}}`,
		`{"files":{"a":{"size":1,"offset":0}}}`,
		`{"files":{"a":{"size":2,"offset":"0"},"b":{"size":1,"offset":"1"}}}`,
		`{"files":{"a":{"size":0,"offset":"0"},"\u0061":{"link":"a"}}}`,
		`{"files":{"a":{"files":{},"link":"b"}}}`,
		`{"files":{},"files":{}}`,
		`{"files":{}}[]`,
	} {
		if _, err := HeaderHash(fixture(t, bad, []byte("xx"))); err == nil {
			t.Errorf("accepted malformed header %s", bad)
		}
	}
	for _, offset := range []int{0, 4, 8, 12, 29} {
		path := fixture(t, `{"files":{} }`, nil)
		raw := read(t, path)
		raw[offset] ^= 0xff
		if err := os.WriteFile(path, raw, 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := HeaderHash(path); err == nil {
			t.Errorf("accepted damaged pickle at %d", offset)
		}
	}
}

func TestEmptyAndExactBlock(t *testing.T) {
	for _, size := range []int{0, blockSize} {
		path := fixture(t, recipe, []byte(".OK__keep!"))
		candidate := filepath.Join(t.TempDir(), "empty-or-exact.asar")
		if err := Rewrite(path, candidate, map[string][]byte{"dist/label.js": make([]byte, size)}); err != nil {
			t.Fatal(err)
		}
		if _, err := VerifyCandidate(path, candidate, map[string]bool{"dist/label.js": true}); err != nil {
			t.Fatal(err)
		}
		got, err := ReadFile(candidate, "dist/empty")
		if err != nil || len(got) != 0 {
			t.Fatal("empty file at neighbouring boundary", err)
		}
	}
}

func TestIntegrityExtrasAndDeterministicReports(t *testing.T) {
	h := `{"files":{"a":{"size":2,"offset":"2","integrity":{"writer":{"id":"test"}}},"b":{"size":2,"offset":"0"}}}`
	source := fixture(t, h, []byte("bbaa"))
	candidate := filepath.Join(t.TempDir(), "candidate")
	repl := map[string][]byte{"a": []byte("BB"), "b": []byte("AA")}
	allow := map[string]bool{"a": true, "b": true}
	if err := Rewrite(source, candidate, repl); err != nil {
		t.Fatal(err)
	}
	report, err := VerifyCandidate(source, candidate, allow)
	if err != nil || len(report.Changes) != 2 || report.Changes[0].Path != "a" || report.Changes[1].Path != "b" {
		t.Fatalf("unexpected changes %+v %v", report, err)
	}
	second := filepath.Join(t.TempDir(), "again")
	if err := Rewrite(candidate, second, repl); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(read(t, candidate), read(t, second)) {
		t.Fatal("identical replacements yielded different candidate bytes")
	}
	data := read(t, candidate)
	if !bytes.Contains(data, []byte(`"writer":{"id":"test"}`)) {
		t.Fatal("lost original integrity attribute")
	}
	if err := os.WriteFile(candidate, bytes.Replace(data, []byte(`"id":"test"`), []byte(`"id":"evil"`), 1), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyCandidate(source, candidate, allow); err == nil {
		t.Fatal("accepted changed secondary integrity attributes")
	}
}

func FuzzArchiveStructure(f *testing.F) {
	f.Add([]byte(recipe), []byte(".OK__keep!"))
	f.Add([]byte(`{"files":{"empty":{"size":0,"offset":"0"}}}`), []byte{})
	f.Add([]byte(`{"files":{"k":{"files":{"..":{"link":"x"}}}}}`), []byte{})
	f.Fuzz(func(t *testing.T, header, payload []byte) {
		if len(header) > 16<<10 || len(payload) > 16<<10 {
			t.Skip()
		}
		path := fixture(t, string(header), payload)
		hash, err := HeaderHash(path)
		if err != nil {
			return
		}
		if hash != sum(header) {
			t.Fatal("header hash read outside the JSON field")
		}
		dst := filepath.Join(t.TempDir(), "roundtrip")
		if err := Rewrite(path, dst, nil); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(read(t, dst), read(t, path)) {
			t.Fatal("identity rewrite changed bytes")
		}
	})
}
