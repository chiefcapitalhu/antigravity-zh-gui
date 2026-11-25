package extractor

import (
	"bytes"
	"errors"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// Only these complete Hub template literals have reviewed display sites.
// Replay their original bytes without evaluating interpolation expressions.
const welcomeText = "Welcome to ${a}!"
const reviewedTemplateContext = "#reviewed-hub-template"

type templateSite struct {
	module, scope string
	placeholders  []string
}

var reviewedHubTemplates = map[string]templateSite{
	welcomeText: {"core", "onboarding", nil},
	"When toggled on, ${f.product.nameShort} collects usage data to help Google enhance performance and features.": {"settings", "settings-detail", []string{"{value}"}},
	"Receive product updates, tips, and promotions from Google ${f.product.nameShort} via email.":                  {"settings", "settings-detail", []string{"{value}"}},
	"Your plan: ${I}": {"settings", "settings-detail", []string{"{value}"}},
	"When toggled on, ${g} will use your AI credits to fulfill model requests once you're out of model quota. ${g} will always use your model quota first before using AI credits.": {"settings", "settings-detail", []string{"{value}"}},
	`Manage ${A.lowercase} ${Ea?"resources":"folders"} and settings.`: {"settings", "settings-detail", []string{"{kind}", "{resource}"}},
	`Show ${A.length} breakdown${A.length===1?"":"s"}`:                {"settings", "settings-detail", []string{"{n}"}},
}

func ident(c byte) bool {
	return c == '_' || c == '$' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= 128
}
func white(c byte) bool {
	return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == '\v'
}

func uiProperty(name string) bool {
	switch name {
	case "label", "sublabel", "title", "placeholder", "description", "shortDescription",
		"tooltip", "tooltipText", "tooltipContent", "aria-label", "ariaLabel",
		"emptyMessage", "emptyText", "errorMessage", "helperText",
		"confirmText", "cancelText", "buttonText",
		"heading", "subheading", "subtitle", "header", "content", "message", "detail":
		return true
	}
	return false
}

// Return the decoded complete static literal. Unsupported or invalid escapes
// are not evidence. Strings inside comments, regexps and template raw sections
// are excluded by the scanner.
func decode(raw []byte) (string, bool) {
	if len(raw) < 2 || raw[0] != raw[len(raw)-1] {
		return "", false
	}
	chars := raw[1 : len(raw)-1]
	if !strings.ContainsRune(string(chars), '\\') {
		return string(chars), utf8.Valid(chars)
	}
	var out strings.Builder
	for i := 0; i < len(chars); i++ {
		c := chars[i]
		if c != '\\' {
			out.WriteByte(c)
			continue
		}
		i++
		if i >= len(chars) {
			return "", false
		}
		c = chars[i]
		switch c {
		case '\n':
			continue
		case '\r':
			if i+1 < len(chars) && chars[i+1] == '\n' {
				i++
			}
		case 'b':
			out.WriteByte('\b')
		case 'f':
			out.WriteByte('\f')
		case 'n':
			out.WriteByte('\n')
		case 'r':
			out.WriteByte('\r')
		case 't':
			out.WriteByte('\t')
		case 'v':
			out.WriteByte('\v')
		case 'x', 'u':
			start, end := i+1, i+3
			braces := false
			if c == 'u' {
				end = i + 5
				if start < len(chars) && chars[start] == '{' {
					braces = true
					start++
					end = start
					for end < len(chars) && chars[end] != '}' {
						end++
					}
					if end >= len(chars) || end-start > 6 {
						return "", false
					}
				}
			}
			if end > len(chars) {
				return "", false
			}
			v, err := strconv.ParseUint(string(chars[start:end]), 16, 32)
			if err != nil {
				return "", false
			}
			ch := rune(v)
			i = end - 1
			if braces {
				i++
			}
			if utf16.IsSurrogate(ch) {
				if braces || i+7 > len(chars) || string(chars[i+1:i+3]) != "\\u" {
					return "", false
				}
				v, err := strconv.ParseUint(string(chars[i+3:i+7]), 16, 16)
				if err != nil {
					return "", false
				}
				ch = utf16.DecodeRune(ch, rune(v))
				if ch == utf8.RuneError {
					return "", false
				}
				i += 6
			}
			if !utf8.ValidRune(ch) {
				return "", false
			}
			out.WriteRune(ch)
		default:
			if c >= '0' && c <= '9' {
				return "", false
			}
			out.WriteByte(c)
		}
	}
	return out.String(), utf8.ValidString(out.String())
}

type frame struct {
	key           string
	delim         byte
	commas        int
	interpolation bool
	statementBody bool
	classHead     string
	ternaryDepth  int
	inChild       bool
	propContext   string
}

// Uncertain starts are treated as declarations. This can omit a candidate
// in a chained division, but avoids accepting quotes inside a following regexp.
func declarationStart(previous string) bool {
	switch previous {
	case "=", "(", "[", ",", ":", "#ternary-colon", "?", "??", "!", "~", "+", "-", "*", "/", "%", "<", ">", "|", "||", "^", "&", "&&", "return", "throw", "yield", "await", "void", "typeof", "new", "=>":
		return false
	}
	return true
}

func staticLiterals(src []byte, visit func(start, end int, context string)) error {
	i := 0
	last, before := "", ""
	canRegex := true
	frames := []frame{{}} // root lexical level
	template := false
	set := func(s string, regex bool) { before, last = last, s; canRegex = regex }
	for i < len(src) {
		if len(frames) > 4096 {
			return errors.New("JS 嵌套超过限制")
		}
		if template {
			for i < len(src) {
				c := src[i]
				i++
				if c == '\\' && i < len(src) {
					i++
					continue
				}
				if c == 0x60 {
					template = false
					set("#", false)
					break
				}
				if c == '$' && i < len(src) && src[i] == '{' {
					i++
					frames = append(frames, frame{delim: '{', interpolation: true})
					template = false
					set("{", true)
					break
				}
			}
			continue
		}
		c := src[i]
		if white(c) {
			i++
			continue
		}
		if c == '/' && i+1 < len(src) {
			if src[i+1] == '/' {
				i += 2
				for i < len(src) && src[i] != '\n' && src[i] != '\r' {
					i++
				}
				continue
			}
			if src[i+1] == '*' {
				i += 2
				for i+1 < len(src) && (src[i] != '*' || src[i+1] != '/') {
					i++
				}
				i = min(len(src), i+2)
				continue
			}
			if canRegex {
				j := i + 1
				cls := false
				for j < len(src) && src[j] != '\n' && src[j] != '\r' {
					x := src[j]
					j++
					if x == '\\' && j < len(src) {
						j++
						continue
					}
					if x == '[' {
						cls = true
					}
					if x == ']' {
						cls = false
					}
					if x == '/' && !cls {
						for j < len(src) && ident(src[j]) {
							j++
						}
						i = j
						set("#", false)
						break
					}
				}
				if i == j {
					continue
				}
			}
		}
		if c == '"' || c == '\'' || c == 0x60 {
			start := i
			if c == '`' {
				if n := bytes.IndexByte(src[start+1:], '`'); n >= 0 {
					end := start + 1 + n
					if _, ok := reviewedHubTemplates[string(src[start+1:end])]; ok {
						i = end + 1
						visit(start, i, reviewedTemplateContext)
						set("#", false)
						continue
					}
				}
			}
			i++
			finished := false
			for i < len(src) {
				x := src[i]
				i++
				if x == '\\' && i < len(src) {
					if src[i] == '\r' && i+1 < len(src) && src[i+1] == '\n' {
						i++
					}
					i++
					continue
				}
				if x == c {
					finished = true
					break
				}
				if c == 0x60 && x == '$' && i < len(src) && src[i] == '{' {
					i++
					frames = append(frames, frame{delim: '{', interpolation: true})
					set("{", true)
					break
				}
				if c != 0x60 && (x == '\n' || x == '\r') {
					break
				}
			}
			if !finished {
				continue
			}
			context := ""
			top := &frames[len(frames)-1]
			if last == "?" || last == "#ternary-colon" {
				context = "ternary"
			} else if last == ":" {
				context = before
			} else if top.propContext != "" && (last == "||" || last == "&&" || last == "??" || last == "(" || last == "[" || last == ",") {
				context = top.propContext
			}
			if top.delim == '(' && top.key == "createElement" && top.commas >= 2 {
				context = "child"
			} else if top.inChild {
				context = "child"
			}
			if top.delim == '[' && top.propContext == "buttons" {
				context = "buttonText"
			}
			if top.key == "showErrorBox" && last == "(" {
				context = "title"
			}
			visit(start, i, context)
			// A quoted property key is useful only for the bounded presentation fields.
			property := "#"
			if i-start < 32 {
				v, ok := decode(src[start:i])
				if ok && uiProperty(v) {
					property = v
				}
			}
			set(property, false)
			continue
		}
		if ident(c) || c >= '0' && c <= '9' {
			j := i
			i++
			for i < len(src) && (ident(src[i]) || src[i] >= '0' && src[i] <= '9') {
				i++
			}
			token := string(src[j:i])
			previous := last
			if previous == "async" {
				previous = before
			}
			// Carry a function's role across its optional generator star and
			// name, then across the parameter list in that delimiter's frame.
			if token == "function" && last != "." {
				if declarationStart(previous) {
					token = "#function-declaration"
				} else {
					token = "#function-expression"
				}
			} else if last == "#function-declaration" || last == "#function-expression" {
				token = last
			} else if token == "class" && last != "." {
				head := "#class-expression"
				if declarationStart(previous) {
					head = "#class-declaration"
				}
				frames[len(frames)-1].classHead = head
			}
			regex := false
			switch token {
			case "return", "case", "throw", "void", "typeof", "delete", "instanceof", "in", "of", "new", "yield", "await", "else", "do":
				regex = true
			}
			set(token, regex)
			continue
		}
		i++
		switch c {
		case '(', '[', '{':
			statementBody := false
			parentFrame := &frames[len(frames)-1]
			if c == '{' {
				switch {
				case parentFrame.classHead != "":
					statementBody = parentFrame.classHead == "#class-declaration"
					parentFrame.classHead = ""
				case last == "#function-expression", last == "=>":
				case last == "#function-declaration", last == ")", last == "else", last == "do", last == "try", last == "finally":
					statementBody = true
				default:
					statementBody = declarationStart(last)
				}
			}
			childCtx := parentFrame.inChild || (parentFrame.delim == '(' && parentFrame.key == "createElement" && parentFrame.commas >= 2)
			propCtx := ""
			if c == '[' || c == '(' {
				if last == ":" && parentFrame.ternaryDepth == 0 && (uiProperty(before) || before == "buttons") {
					propCtx = before
				} else if parentFrame.propContext != "" {
					propCtx = parentFrame.propContext
				}
			}
			frames = append(frames, frame{key: last, delim: c, statementBody: statementBody, inChild: childCtx && c != '{', propContext: propCtx})
			set(string(c), true)
		case ')', ']', '}':
			regex := false
			if n := len(frames); n > 1 {
				f := frames[n-1]
				frames = frames[:n-1]
				if f.interpolation && c == '}' {
					template = true
				}
				if f.statementBody && c == '}' {
					regex = true
				}
				if c == ')' {
					switch f.key {
					case "#function-declaration", "#function-expression":
						set(f.key, false)
						continue
					case "if", "while", "for", "with", "switch", "catch":
						regex = true
					}
				}
			}
			set(string(c), regex)
		case ',':
			top := &frames[len(frames)-1]
			top.classHead = ""
			top.commas++
			if top.delim == '{' {
				top.propContext = ""
				top.ternaryDepth = 0
			}
			set(",", true)
		case '?':
			if i < len(src) && src[i] == '?' {
				i++
				set("??", true)
			} else if i < len(src) && src[i] == '.' {
				i++
				set("?.", false)
			} else {
				frames[len(frames)-1].ternaryDepth++
				set("?", true)
			}
		case '&', '|':
			if i < len(src) && src[i] == c {
				i++
				set(string([]byte{c, c}), true)
			} else {
				set(string(c), true)
			}
		case ':':
			top := &frames[len(frames)-1]
			top.classHead = ""
			if top.ternaryDepth > 0 {
				top.ternaryDepth--
				set("#ternary-colon", true)
			} else {
				if uiProperty(last) || last == "buttons" {
					top.propContext = last
				}
				set(":", true)
			}
		case ';':
			top := &frames[len(frames)-1]
			top.classHead = ""
			top.propContext = ""
			top.ternaryDepth = 0
			set(";", true)
		case '=':
			if i < len(src) && src[i] == '>' {
				i++
				set("=>", true)
			} else {
				frames[len(frames)-1].classHead = ""
				set("=", true)
			}
		case '*':
			if last != "#function-declaration" && last != "#function-expression" {
				set("*", true)
			}
		case '+', '-':
			if i < len(src) && src[i] == c {
				i++
				set("#", false)
			} else {
				set(string(c), true)
			}
		default:
			set(string(c), c != '.')
		}
	}
	return nil
}
