package extractor

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"antigravity-zh-gui/internal/detector"
)

func fixtureZip(t *testing.T, script string, duplicate bool) []byte {
	t.Helper()
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	add := func(name, s string) {
		t.Helper()
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = io.WriteString(w, s); err != nil {
			t.Fatal(err)
		}
	}
	add("main.js", script)
	if duplicate {
		add("main.js", script)
	}
	add("index.html", "<main></main>")
	add("../never-written", "ignored")
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func fixtureAsar(t *testing.T, path string) {
	t.Helper()
	payload := "var menu={label:'Save'};"
	hdr, err := json.Marshal(map[string]any{"files": map[string]any{"dist": map[string]any{"files": map[string]any{"menu.js": map[string]any{"size": len(payload), "offset": "0"}}}}})
	if err != nil {
		t.Fatal(err)
	}
	n := (len(hdr) + 3) &^ 3
	b := make([]byte, 16+n)
	for j, v := range []int{4, 8 + n, 4 + n, len(hdr)} {
		binary.LittleEndian.PutUint32(b[4*j:], uint32(v))
	}
	copy(b[16:], hdr)
	if err := os.WriteFile(path, append(b, payload...), 0600); err != nil {
		t.Fatal(err)
	}
}
func fixtureInstall(t *testing.T, p string) detector.Installation {
	t.Helper()
	root := t.TempDir()
	res, name := "resources", "language_server_windows_x64.exe"
	if p == "darwin" {
		res = "Contents/Resources"
		name = "language_server"
	}
	resources := filepath.Join(root, res)
	dir := filepath.Join(resources, "bin")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	payload := append([]byte("prefix123"), fixtureZip(t, `E.createElement("button",null,"Start"); const x={placeholder:"Find"}; const hidden="UNSHOWN";`, false)...)
	if err := os.WriteFile(filepath.Join(dir, name), append(payload, []byte("trailer")...), 0600); err != nil {
		t.Fatal(err)
	}
	i := detector.Installation{Root: root, Archive: filepath.Join(resources, "app.asar"), Platform: p, Version: "2.34.0"}
	fixtureAsar(t, i.Archive)
	return i
}
func TestLoadAndCandidateEvidence(t *testing.T) {
	for _, p := range []string{"windows", "darwin"} {
		t.Run(p, func(t *testing.T) {
			i := fixtureInstall(t, p)
			s, err := Load(i)
			if err != nil {
				t.Fatal(err)
			}
			c, err := s.Candidates()
			if err != nil {
				t.Fatal(err)
			}
			if len(c.Sources) != 2 || len(c.Entries) != 3 || len(c.Warnings) == 0 {
				t.Fatalf("%+v", c)
			}
			for _, e := range c.Entries {
				if e.En == "UNSHOWN" || !strings.Contains("\"'", string(s.scripts[e.Source][e.Offset])) {
					t.Fatalf("unexpected evidence %+v", e)
				}
			}
			if _, err := os.Stat(filepath.Join(filepath.Dir(i.Archive), "never-written")); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("unexpected extracted file")
			}
		})
	}
}
func TestEmbeddedZIPBoundaries(t *testing.T) {
	valid := fixtureZip(t, "hello", false)
	end := bytes.LastIndex(valid, []byte{'P', 'K', 5, 6})
	pad := (1 << 20) - end - 2
	aligned := append(append(make([]byte, pad), valid...), make([]byte, 80000)...)
	data, err := embeddedHub(bytes.NewReader(aligned), int64(len(aligned)))
	if err != nil || string(data) != "hello" {
		t.Fatal(err)
	}
	for _, b := range [][]byte{fixtureZip(t, "x", true), append(append([]byte{}, valid...), valid...), valid[:end+3], bytes.Repeat([]byte("PKtt"), 120)} {
		if _, err := embeddedHub(bytes.NewReader(b), int64(len(b))); err == nil {
			t.Fatal("invalid archive accepted")
		}
	}
}
func TestLiteralProof(t *testing.T) {
	src := "// 'comment'\n/* \"block comment\" */\nif(x) /'regexp'/;\nconst tpl=" + string(byte(96)) + "raw 'ignore' ${{label:'Nested'}.label}" + string(byte(96)) + ";const u=\"Smile \\uD83D\\uDE00 \\x21\"; const app='it\\'s safe'; title:\"Save\";"
	var got []string
	err := staticLiterals([]byte(src), func(a, b int, _ string) {
		x, ok := decode([]byte(src)[a:b])
		if ok {
			got = append(got, x)
		}
	})
	if err != nil || !reflect.DeepEqual(got, []string{"Nested", "Smile 😀 !", "it's safe", "Save"}) {
		t.Fatalf("%q %v", got, err)
	}
	for _, raw := range []string{`'\xZZ'`, `'\uD800'`, `'\u{FFFFFF}'`, `'\u{1'`} {
		if _, ok := decode([]byte(raw)); ok {
			t.Fatal(raw)
		}
	}
}
func TestVerifyLocales(t *testing.T) {
	s := &SourceSet{"2.34.0", map[string][]byte{}, map[string]string{}, nil}
	src := "const x='inside \"Save\"'; // 'Save'\n const f={label:'Save'};"
	other := "const x='Save'"
	s.add("hub:main.js", []byte(src))
	s.add("asar:dist/menu.js", []byte(other))
	check := func(e Entry, hash string) error {
		dir := t.TempDir()
		for idx, module := range modules {
			cell := e
			if idx != 0 {
				cell = Entry{"Save", "hub:main.js", strings.LastIndex(src, "'Save'")}
			}
			scope := []string{"toolbar", "model", "sidecar", "context", "application"}[idx]
			digest := hash
			if cell.Source != "hub:main.js" {
				digest = s.hashes[cell.Source]
			}
			b, _ := json.Marshal(map[string]any{"schema": 1, "module": module, "version": s.Version, "sources": map[string]string{cell.Source: digest}, "exact": []any{}, "scoped": []any{map[string]any{"en": cell.En, "zh": "保存", "offset": cell.Offset, "source": cell.Source, "scope": scope}}, "templates": []any{}})
			if err := os.WriteFile(filepath.Join(dir, module+".json"), b, 0600); err != nil {
				t.Fatal(err)
			}
		}
		_, err := s.VerifyLocales(dir)
		return err
	}
	valid := Entry{"Save", "hub:main.js", strings.LastIndex(src, "'Save'")}
	h := s.hashes[valid.Source]
	if err := check(valid, h); err != nil {
		t.Fatal(err)
	}
	bad := []Entry{{"Sav", valid.Source, valid.Offset}, {"Save", valid.Source, valid.Offset + 1}, {"Save", valid.Source, strings.Index(src, "\"Save\"")}, {"Save", valid.Source, strings.Index(src, "'Save'")}, {"Save", "asar:dist/menu.js", valid.Offset}}
	for _, e := range bad {
		if err := check(e, h); err == nil {
			t.Fatalf("false proof %+v", e)
		}
	}
	if err := check(valid, strings.Repeat("0", 64)); err == nil {
		t.Fatal("wrong member hash accepted")
	}
}
func TestBlockRegexpAndLineContinuation(t *testing.T) {
	src := []byte("if(x){} /'hidden'/.test(x); const v=({}) / n; const s='multi\\\r\nline';")
	var got []string
	err := staticLiterals(src, func(start, end int, _ string) {
		text, ok := decode(src[start:end])
		if ok {
			got = append(got, text)
		}
	})
	if err != nil || !reflect.DeepEqual(got, []string{"multiline"}) {
		t.Fatalf("%q %v", got, err)
	}
}
func TestSlashesAfterFunctionAndClassBodies(t *testing.T) {
	tests := []struct {
		name, src string
		want      []string
	}{
		{"function declaration", `function closePopup() {} /"Close"/.test(text); const label = {title:"Open file"};`, []string{"Open file"}},
		{"generator declaration", `export default async function* run(x=()=>{}) {} /'ignore'/.test(x); show('Visible');`, []string{"Visible"}},
		{"function expression", `const n = function ratio() {} / '4' / 2; show('Visible');`, []string{"4", "Visible"}},
		{"async expression", `const n = async function* () {} / '3' / 2;`, []string{"3"}},
		{"class declaration", `class View extends mixin(Base) {} /'hidden'/.test(text); show('Visible');`, []string{"Visible"}},
		{"class expression", `const n = class View extends mixin(Base) {} / '4' / 2;`, []string{"4"}},
		{"arrow expression", `const n = (() => {}) / '4' / 2;`, []string{"4"}},
		{"object expression", `const n = {class: {}, fn: function(){}} / '4' / 2;`, []string{"4"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := []byte(tt.src)
			var got []string
			err := staticLiterals(src, func(a, b int, _ string) {
				if en, ok := decode(src[a:b]); ok {
					got = append(got, en)
				}
			})
			if err != nil || !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %q, want %q, err %v", got, tt.want, err)
			}
		})
	}
}
func TestExportAndDiff(t *testing.T) {
	i := fixtureInstall(t, "windows")
	s, err := Load(i)
	if err != nil {
		t.Fatal(err)
	}
	next, _ := s.Candidates()
	e := next.Entries[0]
	before := len(next.Entries)
	next.Include([]Entry{e})
	if len(next.Entries) != before {
		t.Fatal("duplicate")
	}
	old := &Catalog{Version: "previous", Entries: []Entry{{e.En, e.Source, e.Offset + 9}, {"gone", e.Source, 7}}}
	d := Compare(old, next)
	if len(d.Removed) != 1 || d.Removed[0].En != "gone" || len(d.Added) != 2 {
		t.Fatal(d)
	}
	dst := filepath.Join(t.TempDir(), "report")
	if err := Export(dst, i.Root, next, &d); err != nil {
		t.Fatal(err)
	}
	c, err := ReadCatalog(filepath.Join(dst, "candidates.json"))
	if err != nil || !reflect.DeepEqual(next, c) {
		t.Fatal(c, err)
	}
	if err := Export(dst, i.Root, next, nil); err == nil {
		t.Fatal("overwrote existing directory")
	}
	if err := Export(filepath.Join(i.Root, "report"), i.Root, next, nil); err == nil {
		t.Fatal("exported inside application")
	}
}
func TestLiveFilters(t *testing.T) {
	s := &SourceSet{scripts: map[string][]byte{}, hashes: map[string]string{}}
	for _, u := range []string{"http://localhost:90", "http://127.0.0.1", "https://127.0.0.1:65536", "http://127.0.0.1:90/path", "http://user@127.0.0.1:90", "https://example.com:99", "http://127.0.0.1:90?token=x"} {
		if err := s.Live(context.Background(), u); err == nil {
			t.Fatal(u)
		}
	}
	h := http.Header{}
	h.Set("Content-Type", "text/javascript; charset=utf-8")
	resp := &http.Response{StatusCode: 200, Header: h, Body: io.NopCloser(strings.NewReader("title:'Sample'"))}
	if err := s.addLive(resp); err != nil {
		t.Fatal(err)
	}
	for _, status := range []int{301, 403} {
		resp.StatusCode = status
		if err := s.addLive(resp); err == nil {
			t.Fatal(status)
		}
	}
}

func TestVerifyRejectsInvalidDocuments(t *testing.T) {
	s := &SourceSet{Version: "2.34.0", scripts: map[string][]byte{}, hashes: map[string]string{}}
	for _, bad := range []string{`{"schema":1,"module":"core","version":"2.34.0","sources":{},"exact":[],"scoped":[],"templates":[]}`, `{"schema":1,"schema":1,"module":"core","version":"2.34.0","sources":{}}`} {
		dir := t.TempDir()
		for _, name := range modules {
			if err := os.WriteFile(filepath.Join(dir, name+".json"), []byte(bad), 0600); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := s.VerifyLocales(dir); err == nil {
			t.Fatal("invalid module reported as verified")
		}
	}
}
