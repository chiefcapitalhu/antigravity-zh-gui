// Package locales embeds and validates the original Simplified Chinese catalog.
package locales

import (
	"bytes"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"antigravity-zh-gui/internal/config"
	l10n "antigravity-zh-gui/runtime"
)

//go:embed zh-CN/*.json
var files embed.FS

var modules = []string{"core", "workspace", "settings", "agents", "menus_dialogs"}

type entry struct {
	EN, ZH, Source, Scope, ID string
	Offset                    *int64
}

type catalog struct {
	Schema                   int
	Module, Version          string
	Sources                  map[string]string
	Exact, Scoped, Templates []json.RawMessage
}

var versionPattern = regexp.MustCompile(`^2\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.-]+)?$`)
var sourcePattern = regexp.MustCompile(`^(hub:main\.js|asar:dist/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.js)$`)

// encoding/json normally accepts duplicate object fields and folds case when
// decoding into structs. Check the token stream and exact schema first.
func uniqueJSON(d *json.Decoder, depth int) error {
	if depth > 12 {
		return errors.New("excessive dictionary nesting")
	}
	t, err := d.Token()
	if err != nil {
		return err
	}
	switch t {
	case json.Delim('{'):
		seen := map[string]bool{}
		for d.More() {
			t, err = d.Token()
			if err != nil {
				return err
			}
			k, ok := t.(string)
			if !ok || seen[k] {
				return fmt.Errorf("duplicate or invalid key %q", k)
			}
			seen[k] = true
			if err = uniqueJSON(d, depth+1); err != nil {
				return err
			}
		}
		_, err = d.Token()
	case json.Delim('['):
		for d.More() {
			if err = uniqueJSON(d, depth+1); err != nil {
				return err
			}
		}
		_, err = d.Token()
	}
	return err
}

func shape(raw []byte, fields ...string) error {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return err
	}
	if len(obj) != len(fields) {
		return errors.New("missing or unexpected field")
	}
	for _, key := range fields {
		v, ok := obj[key]
		if !ok || bytes.Equal(v, []byte("null")) {
			return fmt.Errorf("missing or null field %s", key)
		}
	}
	return nil
}

func parseModule(name string, raw []byte) (catalog, error) {
	var m catalog
	if !utf8.Valid(raw) {
		return m, errors.New("invalid UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	if err := uniqueJSON(d, 0); err != nil {
		return m, err
	}
	if _, err := d.Token(); err != io.EOF {
		return m, errors.New("extra data after dictionary")
	}
	if err := shape(raw, "schema", "module", "version", "sources", "exact", "scoped", "templates"); err != nil {
		return m, err
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, err
	}
	if m.Schema != 1 || m.Module != name || !versionPattern.MatchString(m.Version) {
		return m, errors.New("invalid module identity, schema or version")
	}
	if len(m.Exact)+len(m.Scoped)+len(m.Templates) == 0 {
		return m, errors.New("empty module")
	}
	for source, hash := range m.Sources {
		digest, err := hex.DecodeString(hash)
		if !sourcePattern.MatchString(source) || err != nil || len(digest) != 32 || hash != strings.ToLower(hash) {
			return m, fmt.Errorf("invalid source or SHA-256 for %q", source)
		}
	}
	return m, nil
}

var termForms = map[string][]string{
	"antigravity": {"Antigravity"}, "agent": {"AI 助手", "助手"}, "subagent": {"子助手"}, "swarm": {"多助手协作"},
	"sidecar": {"伴生侧栏"}, "artifact": {"生成文档"}, "workspace": {"工作目录"}, "skill": {"技能"},
	"rule": {"规则"}, "workflow": {"工作流"}, "prompt": {"提示词"}, "mcp server": {"MCP 服务"},
	"browser agent": {"浏览器助手"}, "token": {"Token"},
}

func parseEntry(raw json.RawMessage, layer string, sources map[string]string) (entry, error) {
	var e entry
	fields := []string{"en", "zh", "source", "offset"}
	switch layer {
	case "scoped":
		fields = append(fields, "scope")
	case "templates":
		fields = append(fields, "id")
	}
	if err := shape(raw, fields...); err != nil {
		return e, err
	}
	if err := json.Unmarshal(raw, &e); err != nil {
		return e, err
	}
	if sources[e.Source] == "" || e.Offset == nil || *e.Offset < 0 {
		return e, errors.New("invalid evidence location")
	}
	for _, v := range []string{e.EN, e.ZH} {
		if strings.TrimSpace(v) != v || v == "" || strings.IndexFunc(v, unicode.IsControl) >= 0 {
			return e, errors.New("blank, padded or control-bearing translation")
		}
	}
	if options := termForms[strings.TrimSuffix(strings.ToLower(e.EN), "s")]; options != nil {
		ok := false
		for _, v := range options {
			if e.ZH == v {
				ok = true
				break
			}
		}
		if !ok {
			return e, fmt.Errorf("unexpected terminology for %q", e.EN)
		}
	}
	if layer == "scoped" && e.Scope == "" || layer == "templates" && e.ID == "" {
		return e, errors.New("empty scope or template id")
	}
	return e, nil
}

// Load returns a fresh catalog on each call. Personal translations stay in
// their own higher-priority layer and never mutate the embedded dictionaries.
func Load(custom map[string]string) (l10n.Dictionary, error) {
	return load(func(name string) ([]byte, error) { return files.ReadFile("zh-CN/" + name) }, custom)
}

// ValidateCatalogBytes validates the five files read by the extraction tool.
// Reusing its bounded snapshots ensures validation refers to the same bytes
// as the subsequent source-hash and string-offset checks.
func ValidateCatalogBytes(payloads map[string][]byte) error {
	if len(payloads) != len(modules) {
		return errors.New("expected five dictionary modules")
	}
	_, err := load(func(name string) ([]byte, error) {
		raw, ok := payloads[name]
		if !ok {
			return nil, fmt.Errorf("missing dictionary file %q", name)
		}
		return raw, nil
	}, nil)
	return err
}

var exactScopedOnly = map[string]bool{
	"on": true, "in": true, "to": true, "by": true, "for": true,
	"run": true, "open": true, "file": true, "type": true, "use": true,
	"plan": true, "code": true, "new": true, "edit": true, "all": true,
	"add": true, "view": true, "back": true, "next": true, "done": true,
	"stop": true, "send": true, "copy": true, "save": true, "close": true,
	"delete": true, "reset": true, "search": true, "active": true,
}

func load(readFile func(string) ([]byte, error), custom map[string]string) (l10n.Dictionary, error) {
	out := l10n.Dictionary{Exact: map[string]string{}, Custom: map[string]string{}}
	for en, zh := range custom {
		if err := config.ValidateGlobalEntry(en, zh); err != nil {
			return l10n.Dictionary{}, err
		}
		out.Custom[en] = zh
	}
	scopes := map[string]map[string]string{}
	used := map[[3]string]bool{}
	sourceHashes := map[string]string{}
	version := ""
	for _, name := range modules {
		raw, err := readFile(name + ".json")
		if err != nil {
			return l10n.Dictionary{}, err
		}
		m, err := parseModule(name, raw)
		if err != nil {
			return l10n.Dictionary{}, fmt.Errorf("%s: %w", name, err)
		}
		if version != "" && version != m.Version {
			return l10n.Dictionary{}, fmt.Errorf("%s: mixed client versions", name)
		}
		version = m.Version
		referenced := map[string]bool{}
		for path, h := range m.Sources {
			if prev := sourceHashes[path]; prev != "" && prev != h {
				return l10n.Dictionary{}, fmt.Errorf("%s: conflicting source hash for %s", name, path)
			}
			sourceHashes[path] = h
		}
		for _, layer := range []struct {
			name string
			rows []json.RawMessage
		}{{"exact", m.Exact}, {"scoped", m.Scoped}, {"templates", m.Templates}} {
			for i, data := range layer.rows {
				e, err := parseEntry(data, layer.name, m.Sources)
				if err != nil {
					return l10n.Dictionary{}, fmt.Errorf("%s.%s[%d]: %w", name, layer.name, i, err)
				}
				referenced[e.Source] = true
				key := [3]string{layer.name, e.Scope, e.EN}
				if layer.name == "templates" {
					key[2] = e.ID
				}
				if used[key] {
					return l10n.Dictionary{}, fmt.Errorf("%s: duplicate matching key %v", name, key)
				}
				used[key] = true
				switch layer.name {
				case "exact":
					if exactScopedOnly[strings.ToLower(e.EN)] {
						return l10n.Dictionary{}, fmt.Errorf("%s: ambiguous short word %q must be placed in scoped", name, e.EN)
					}
					out.Exact[e.EN] = e.ZH
				case "scoped":
					if scopes[e.Scope] == nil {
						scopes[e.Scope] = map[string]string{}
					}
					scopes[e.Scope][e.EN] = e.ZH
				case "templates":
					out.Templates = append(out.Templates, l10n.Template{ID: e.ID, Format: e.ZH})
				}
			}
		}
		if len(referenced) != len(m.Sources) {
			return l10n.Dictionary{}, fmt.Errorf("%s: unreferenced source digest", name)
		}
	}
	for scope, entries := range scopes {
		for en, zh := range entries {
			if global, ok := out.Exact[en]; ok && global != zh {
				return l10n.Dictionary{}, fmt.Errorf("%s: scoped term %q is masked by a different exact translation", scope, en)
			}
		}
		out.Scoped = append(out.Scoped, l10n.Scope{Scope: scope, Entries: entries})
	}
	sort.Slice(out.Scoped, func(i, j int) bool { return out.Scoped[i].Scope < out.Scoped[j].Scope })
	if err := out.Validate(); err != nil {
		return l10n.Dictionary{}, err
	}
	return out, nil
}

// Build combines the five reviewed modules with user preferences for the
// renderer and native-menu factories consumed by the desktop host.
func Build(platform string, prefs config.Preferences, custom map[string]string) (l10n.Bundle, error) {
	d, err := Load(custom)
	if err != nil {
		return l10n.Bundle{}, err
	}
	return l10n.Build(platform, prefs, d)
}
