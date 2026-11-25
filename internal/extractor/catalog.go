package extractor

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"antigravity-zh-gui/locales"
)

type Entry struct {
	En     string `json:"en"`
	Source string `json:"source"`
	Offset int    `json:"offset"`
}
type Catalog struct {
	Version  string            `json:"version"`
	Sources  map[string]string `json:"sources"`
	Entries  []Entry           `json:"entries"`
	Warnings []string          `json:"warnings,omitempty"`
}

func sortEntries(entries []Entry) {
	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.Source != b.Source {
			return a.Source < b.Source
		}
		return a.Offset < b.Offset
	})
}
func (s *SourceSet) Candidates() (*Catalog, error) {
	c := &Catalog{Version: s.Version, Sources: maps.Clone(s.hashes), Entries: []Entry{}, Warnings: s.warnings}
	for offset, field := range s.binaryFields {
		c.Entries = append(c.Entries, Entry{field.text, serverSource, offset})
	}
	for name, src := range s.scripts {
		err := staticLiterals(src, func(start, end int, context string) {
			switch {
			case uiProperty(context) || context == "child" || context == "ternary":
			default:
				return
			}
			if end-start > 1600 {
				return
			}
			en, ok := decode(src[start:end])
			if !ok || !displayText(en) {
				return
			}
			c.Entries = append(c.Entries, Entry{en, name, start})
		})
		if err != nil {
			return nil, err
		}
	}
	sortEntries(c.Entries)
	return c, nil
}

var modules = []string{"core", "workspace", "settings", "agents", "menus_dialogs"}

func regularBytes(path string, limit int64) ([]byte, error) {
	st, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !st.Mode().IsRegular() || st.Size() > limit {
		return nil, fmt.Errorf("文件类型或大小异常 %s", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, fmt.Errorf("文件过大 %s", path)
	}
	return b, nil
}

// In 2.35.0 the Hub constructs /btw locally alongside the RPC-supplied rows.
var sideQuestionDescription = Entry{
	En:     "Ask a quick question without interrupting the main conversation.",
	Source: "hub:main.js",
	Offset: 8456040,
}

// VerifyLocales replays each offset against the tokenizer, including strings
// missed by automatic UI classification. Locale files cannot request new
// source paths. Replayed entries carry the actual decoded source text.
func (s *SourceSet) VerifyLocales(dir string) ([]Entry, error) {
	wanted := map[string]map[int]string{}
	files := map[string][]byte{}
	for _, module := range modules {
		filename := module + ".json"
		raw, err := regularBytes(filepath.Join(dir, filename), 4<<20)
		if err != nil {
			return nil, err
		}
		files[filename] = raw
	}
	if err := locales.ValidateCatalogBytes(files); err != nil {
		return nil, err
	}
	type localeEntry struct {
		Entry
		Scope, ZH string
	}
	for _, module := range modules {
		data := files[module+".json"]
		var doc struct {
			Schema                   int
			Module, Version          string
			Sources                  map[string]string
			Exact, Scoped, Templates []localeEntry
		}
		if err := json.Unmarshal(data, &doc); err != nil {
			return nil, err
		}
		if doc.Version != s.Version || doc.Module != module || doc.Schema != 1 {
			return nil, fmt.Errorf("%s: 词典版本或模块不符", module)
		}
		for name, hash := range doc.Sources {
			if h, ok := s.hashes[name]; !ok || h != hash {
				return nil, fmt.Errorf("%s: 成员摘要不符 %s", module, name)
			}
		}
		for _, group := range [][]localeEntry{doc.Exact, doc.Scoped, doc.Templates} {
			for _, e := range group {
				if site, ok := reviewedHubTemplates[e.En]; ok {
					if module != site.module || e.Scope != site.scope || e.Source != "hub:main.js" {
						return nil, fmt.Errorf("%s: 模板只适用于 Hub 的 %s/%s 作用域", module, site.module, site.scope)
					}
					for _, token := range site.placeholders {
						if strings.Count(e.ZH, token) != 1 {
							return nil, fmt.Errorf("%s:%d: 译文必须保留一个 %s", e.Source, e.Offset, token)
						}
					}
				}
				if e.Scope == "marketplace-notice" && (!strings.HasSuffix(e.ZH, "{privacyPolicyLink}") || strings.Count(e.ZH, "{privacyPolicyLink}") != 1) {
					return nil, fmt.Errorf("%s:%d: 市场声明译文必须保留末尾的隐私政策链接", e.Source, e.Offset)
				}
				if e.Source == serverSource {
					field, ok := s.binaryFields[e.Offset]
					if !ok || field.text != e.En || field.scope != e.Scope || field.module() != module {
						return nil, fmt.Errorf("%s: 未通过语言服务字段校验 %s:%d", module, e.Source, e.Offset)
					}
				} else if strings.HasPrefix(e.Scope, "marketplace-shelf/") || e.Scope == "marketplace-notice" {
					return nil, fmt.Errorf("%s: 市场文案缺少对应的语言服务证据 %s:%d", module, e.Source, e.Offset)
				} else if strings.HasPrefix(e.Scope, "slash-command/") &&
					(module != "agents" || e.Scope != "slash-command/btw" || e.Entry != sideQuestionDescription) {
					return nil, fmt.Errorf("%s: 斜杠命令说明缺少对应的原文证据 %s:%d", module, e.Source, e.Offset)
				}
				if _, ok := doc.Sources[e.Source]; !ok || e.Offset < 0 || e.En == "" {
					return nil, fmt.Errorf("%s: 证据不完整 %+v", module, e)
				}
				if wanted[e.Source] == nil {
					wanted[e.Source] = map[int]string{}
				}
				if old, ok := wanted[e.Source][e.Offset]; ok && old != e.En {
					return nil, fmt.Errorf("证据冲突 %s:%d", e.Source, e.Offset)
				}
				wanted[e.Source][e.Offset] = e.En
			}
		}
	}
	var verified []Entry
	for name, positions := range wanted {
		if name == serverSource {
			for pos := range positions {
				verified = append(verified, Entry{s.binaryFields[pos].text, name, pos})
			}
			continue
		}
		src := s.scripts[name]
		err := staticLiterals(src, func(start, end int, context string) {
			expected, ok := positions[start]
			// Static quoted copies cannot stand in for the official template.
			_, reviewed := reviewedHubTemplates[expected]
			if !ok || reviewed != (context == reviewedTemplateContext) {
				return
			}
			if en, ok := decode(src[start:end]); ok && en == expected {
				verified = append(verified, Entry{en, name, start})
				delete(positions, start)
			}
		})
		if err != nil {
			return nil, err
		}
		if len(positions) > 0 {
			var offsets []int
			for offset := range positions {
				offsets = append(offsets, offset)
			}
			sort.Ints(offsets)
			var missing []string
			for _, offset := range offsets[:min(len(offsets), 8)] {
				missing = append(missing, fmt.Sprintf("%d %q", offset, positions[offset]))
			}
			return nil, fmt.Errorf("%s: %d 条位置或 JS 原文不符: %s", name, len(offsets), strings.Join(missing, ", "))
		}
	}
	sortEntries(verified)
	return verified, nil
}

func (c *Catalog) Include(entries []Entry) {
	seen := map[Entry]bool{}
	for _, e := range c.Entries {
		seen[e] = true
	}
	for _, e := range entries {
		if !seen[e] {
			c.Entries = append(c.Entries, e)
			seen[e] = true
		}
	}
	sortEntries(c.Entries)
}

type Key struct {
	Source string `json:"source"`
	En     string `json:"en"`
}
type Delta struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Added   []Key  `json:"added"`
	Removed []Key  `json:"removed"`
}

func Compare(old, next *Catalog) Delta {
	keys := func(c *Catalog) map[Key]bool {
		m := map[Key]bool{}
		for _, e := range c.Entries {
			m[Key{e.Source, e.En}] = true
		}
		return m
	}
	diff := func(a, b map[Key]bool) []Key {
		out := []Key{}
		for k := range a {
			if !b[k] {
				out = append(out, k)
			}
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i].Source != out[j].Source {
				return out[i].Source < out[j].Source
			}
			return out[i].En < out[j].En
		})
		return out
	}
	before, after := keys(old), keys(next)
	return Delta{old.Version, next.Version, diff(after, before), diff(before, after)}
}
func ReadCatalog(path string) (*Catalog, error) {
	data, err := regularBytes(path, 48<<20)
	if err != nil {
		return nil, err
	}
	var c Catalog
	d := json.NewDecoder(bytes.NewReader(data))
	if err := d.Decode(&c); err != nil {
		return nil, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return nil, errors.New("候选清单含多余内容")
	}
	if c.Version == "" || c.Sources == nil || c.Entries == nil {
		return nil, errors.New("不是有效的候选清单")
	}
	for _, e := range c.Entries {
		if _, ok := c.Sources[e.Source]; !ok || e.En == "" || e.Offset < 0 {
			return nil, errors.New("候选清单包含无效条目")
		}
	}
	return &c, nil
}
