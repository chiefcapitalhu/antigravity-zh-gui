package extractor

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
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

const welcomeLiteral = "`" + welcomeText + "`"

func TestVerifyLocales(t *testing.T) {
	s := &SourceSet{Version: "2.34.0", scripts: map[string][]byte{}, hashes: map[string]string{}}
	src := "const x='inside \"Save\"'; // 'Save'\n const f={label:'Save'};"
	src += "const plain='" + welcomeText + "'; /* " + welcomeLiteral + " */ const title=" + welcomeLiteral + ";"
	other := "const x='Save'"
	s.add("hub:main.js", []byte(src))
	s.add("asar:dist/menu.js", []byte(other))
	coreScope := "toolbar"
	check := func(e Entry, hash string) error {
		dir := t.TempDir()
		for idx, module := range modules {
			cell := e
			if idx != 0 {
				cell = Entry{"Save", "hub:main.js", strings.LastIndex(src, "'Save'")}
			}
			scope := []string{coreScope, "model", "sidecar", "context", "application"}[idx]
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
	welcome := Entry{welcomeText, "hub:main.js", strings.LastIndex(src, welcomeLiteral)}
	if err := check(welcome, h); err == nil {
		t.Fatal("accepted welcome template outside onboarding")
	}
	coreScope = "onboarding"
	if err := check(welcome, h); err != nil {
		t.Fatal(err)
	}
	for _, e := range []Entry{
		{welcomeText, welcome.Source, strings.Index(src, "'"+welcomeText+"'")},
		{welcomeText, welcome.Source, strings.Index(src, welcomeLiteral)},
		{welcomeText, welcome.Source, welcome.Offset + 1},
		{"Welcome to", welcome.Source, welcome.Offset},
	} {
		if err := check(e, h); err == nil {
			t.Fatalf("accepted invalid template evidence %+v", e)
		}
	}
}

func TestWelcomeTemplateIsReviewOnly(t *testing.T) {
	src := "// " + welcomeLiteral + "\n" +
		"const text='" + welcomeLiteral + "';const pattern=/" + welcomeLiteral + "/;" +
		"const similar=[`Welcome to ${b}!`,`Welcome to ${a}!!!`,`Hi Welcome to ${a}!`,`Welcome to ${a + 1}!`];" +
		"const ui={title:" + welcomeLiteral + "};"
	var positions []int
	err := staticLiterals([]byte(src), func(start, end int, context string) {
		if context == reviewedTemplateContext {
			if src[start:end] != welcomeLiteral {
				t.Errorf("unreviewed template %q", src[start:end])
			}
			positions = append(positions, start)
		}
	})
	if err != nil || !reflect.DeepEqual(positions, []int{strings.LastIndex(src, welcomeLiteral)}) {
		t.Fatalf("template locations %v, err %v", positions, err)
	}
	s := &SourceSet{Version: "2.34.0", scripts: map[string][]byte{"hub:main.js": []byte(src)}}
	c, err := s.Candidates()
	if err != nil || len(c.Entries) != 0 {
		t.Fatalf("unexpected automatic candidates %+v, err %v", c, err)
	}
}

func TestSettingsTemplatesRequireCompleteBacktickLiterals(t *testing.T) {
	for text, site := range reviewedHubTemplates {
		if site.module != "settings" {
			continue
		}
		t.Run(text, func(t *testing.T) {
			literal := "`" + text + "`"
			quoted, err := json.Marshal(text)
			if err != nil {
				t.Fatal(err)
			}
			src := "// " + literal + "\nconst copy=" + string(quoted) + "; const similar=" +
				strings.Replace(literal, "${", "${other.", 1) + "; const ui=" + literal + ";"
			var found []int
			err = staticLiterals([]byte(src), func(start, end int, context string) {
				if context == reviewedTemplateContext {
					found = append(found, start)
					if src[start:end] != literal {
						t.Errorf("unexpected template %q", src[start:end])
					}
				}
			})
			if err != nil || !reflect.DeepEqual(found, []int{strings.LastIndex(src, literal)}) {
				t.Fatalf("matched offsets %v, error %v", found, err)
			}
		})
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

func TestExpandedUIPropertiesTernaryAndNoiseFilter(t *testing.T) {
	src := `
const ui = {
  description: "Choose how agents handle commands.",
  shortDescription: "Short help",
  tooltipContent: "Hover tip",
  ariaLabel: "Close dialog",
  emptyMessage: "No items found",
  errorMessage: "Failed to connect",
  helperText: "Optional note",
  confirmText: "Confirm action",
  cancelText: "Keep editing",
  buttonText: "Continue",
  heading: "Workspace settings",
  subheading: "General options",
  subtitle: "Manage preferences",
  header: "Permissions",
  detail: "Antigravity opened on Windows instead.",
  buttons: ["Cancel", "Quit"],
  label: flag ? "Show Less" : "Show More",
  className: "flex items-center gap-2 text-sm",
  url: "https://example.invalid/docs",
  path: "/usr/local/bin/tool",
  ident: "some_snake_case"
};
E.createElement("button", null, ok ? "Retry Now" : "Try Later");
`
	s := &SourceSet{Version: "2.34.0", scripts: map[string][]byte{"hub:main.js": []byte(src)}, hashes: map[string]string{"hub:main.js": strings.Repeat("a", 64)}}
	c, err := s.Candidates()
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, e := range c.Entries {
		got[e.En] = true
	}
	for _, want := range []string{
		"Choose how agents handle commands.", "Short help", "Hover tip", "Close dialog",
		"No items found", "Failed to connect", "Optional note", "Confirm action",
		"Keep editing", "Continue", "Workspace settings", "General options",
		"Manage preferences", "Permissions", "Antigravity opened on Windows instead.",
		"Cancel", "Quit", "Show Less", "Show More", "Retry Now", "Try Later",
	} {
		if !got[want] {
			t.Errorf("missing expected UI candidate %q (got %v)", want, got)
		}
	}
	for _, noise := range []string{"flex items-center gap-2 text-sm", "https://example.invalid/docs", "/usr/local/bin/tool", "some_snake_case"} {
		if got[noise] {
			t.Errorf("noise string leaked into candidates: %q", noise)
		}
	}
}

func TestBinaryFieldReplay(t *testing.T) {
	// Go literals can touch on both ends. A SKILL.md folded description
	// displays on one line even though its byte length includes indentation.
	const shelfTitle = `Science \u0026 Design`
	const notice = "Privacy notice: {privacyPolicyLink}"
	const shelfOffset = len("leftAsk it.XXXRun a\n  swarm.\x00private")
	const noticeOffset = shelfOffset + len(shelfTitle)
	const data = "leftAsk it.XXXRun a\n  swarm.\x00private" + shelfTitle + notice
	fields := []binaryField{
		{"settings-detail", 4, len("Ask it.")},
		{"slash-command/swarm", 14, len("Run a\n  swarm.")},
		{"marketplace-shelf/science", shelfOffset, len(shelfTitle)},
		{"marketplace-notice", noticeOffset, len(notice)},
	}
	values, digest, err := readBinaryFields(strings.NewReader(data), int64(len(data)), fields)
	if err != nil || digest != fmt.Sprintf("%x", sha256.Sum256([]byte(data))) {
		t.Fatalf("digest %q, err %v", digest, err)
	}
	if values[14].text != "Run a swarm." || len(values) != len(fields) {
		t.Fatalf("unexpected evidence %#v", values)
	}
	if _, _, err := readBinaryFields(strings.NewReader(data[:10]), int64(len(data)), fields); err == nil {
		t.Fatal("accepted a truncated stream")
	}
	s := SourceSet{Version: "2.35.0", scripts: map[string][]byte{}, hashes: map[string]string{serverSource: digest}, binaryFields: values}
	js := "const title='Other label';"
	if err := s.add("hub:main.js", []byte(js)); err != nil {
		t.Fatal(err)
	}
	catalog, err := s.Candidates()
	if err != nil {
		t.Fatal(err)
	}
	want := []Entry{{"Ask it.", serverSource, 4}, {"Run a swarm.", serverSource, 14}, {"Science & Design", serverSource, shelfOffset}, {notice, serverSource, noticeOffset}}
	if !reflect.DeepEqual(catalog.Entries, want) {
		t.Fatalf("binary candidates: got %+v, want %+v", catalog.Entries, want)
	}
	translation := "示例"
	verify := func(module, scope, en, entrySource, sha string, offset int) error {
		t.Helper()
		dir := t.TempDir()
		for idx, name := range modules {
			source, hash, pos, text, group := "hub:main.js", s.hashes["hub:main.js"], strings.Index(js, "'"), "Other label", []string{"workspace", "agents", "settings", "model", "application"}[idx]
			if name == module {
				source, hash, pos, text, group = entrySource, sha, offset, en, scope
			}
			row := map[string]any{"source": source, "offset": pos, "en": text, "scope": group, "zh": translation}
			doc := map[string]any{"schema": 1, "module": name, "version": s.Version, "sources": map[string]string{source: hash}, "exact": []any{}, "scoped": []any{row}, "templates": []any{}}
			b, err := json.Marshal(doc)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, name+".json"), b, 0600); err != nil {
				t.Fatal(err)
			}
		}
		_, err := s.VerifyLocales(dir)
		return err
	}
	tests := []struct {
		module, scope, text, hash string
		offset                    int
		ok                        bool
	}{
		{"agents", "slash-command/swarm", "Run a swarm.", digest, 14, true},
		{"settings", "settings-detail", "Ask it.", digest, 4, true},
		{"agents", "marketplace-shelf/science", "Science & Design", digest, shelfOffset, true},
		{"agents", "marketplace-shelf/business", "Science & Design", digest, shelfOffset, false},
		{"agents", "marketplace-shelf/science", "Science", digest, shelfOffset, false},
		{"agents", "slash-command/swarm", "Run a swarm", digest, 14, false},
		{"agents", "slash-command/swarm", "un a swarm.", digest, 15, false},
		{"agents", "slash-command/goal", "Run a swarm.", digest, 14, false},
		{"core", "slash-command/swarm", "Run a swarm.", digest, 14, false},
		{"agents", "slash-command/swarm", "private", digest, strings.Index(data, "private"), false},
		{"agents", "slash-command/swarm", "Run a swarm.", strings.Repeat("a", 64), 14, false},
	}
	for _, tc := range tests {
		err := verify(tc.module, tc.scope, tc.text, serverSource, tc.hash, tc.offset)
		if (err == nil) != tc.ok {
			t.Errorf("case %+v: %v", tc, err)
		}
	}
	if err := verify("agents", "marketplace-notice", notice, serverSource, digest, noticeOffset); err == nil {
		t.Fatal("accepted a translated notice that lost the privacy link")
	}
	translation = "详见 {privacyPolicyLink}"
	if err := verify("agents", "marketplace-notice", notice, serverSource, digest, noticeOffset); err != nil {
		t.Fatal(err)
	}
	// Even a valid JS literal with a matching resource digest cannot prove
	// a shelf or RPC command. The local /btw description has one reviewed Hub site.
	jsPos := strings.Index(js, "'")
	for _, scope := range []string{"slash-command/swarm", "slash-command/btw", "marketplace-shelf/science", "marketplace-notice"} {
		if err := verify("agents", scope, "Other label", "hub:main.js", s.hashes["hub:main.js"], jsPos); err == nil {
			t.Fatalf("accepted unrelated JS literal in scope %q", scope)
		}
	}
	copyJS := "const copy='" + sideQuestionDescription.En + "';"
	if err := s.add("hub:main.js", []byte(js+copyJS)); err != nil {
		t.Fatal(err)
	}
	if err := verify("agents", "slash-command/btw", sideQuestionDescription.En, "hub:main.js",
		s.hashes["hub:main.js"], len(js)+strings.Index(copyJS, "'")); err == nil {
		t.Fatal("accepted a different copy of the /btw description")
	}
	const plan = "Your plan: ${I}"
	js += "const plan=`" + plan + "`;"
	if err := s.add("hub:main.js", []byte(js)); err != nil {
		t.Fatal(err)
	}
	pos := strings.Index(js, "`")
	for _, translation = range []string{"当前方案", "{value} / {value}", "当前方案：{value}"} {
		err := verify("settings", "settings-detail", plan, "hub:main.js", s.hashes["hub:main.js"], pos)
		if (err == nil) != (strings.Count(translation, "{value}") == 1) {
			t.Errorf("plan format %q: %v", translation, err)
		}
	}
}
